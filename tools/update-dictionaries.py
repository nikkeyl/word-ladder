"""Normalize open word lists and update the browser and server dictionaries."""

import argparse
import gzip
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from urllib.request import urlopen

import pymorphy3

from browser_dictionaries import ROOT, SERVER_PREFIX, read_server_dictionaries, write_browser_dictionaries

ENGLISH_SOURCE = 'https://cdn.jsdelivr.net/npm/word-list@4.1.0/words.txt'
RUSSIAN_EXCLUDED = {'Abbr', 'Name', 'Surn', 'Patr', 'Geox', 'Orgn', 'Trad', 'Erro'}
RUSSIAN_SHORT_FORM_MAX_LENGTH = 6
KATAKANA_TO_HIRAGANA = {point: point - 0x60 for point in range(0x30A1, 0x30F7)}


def russian_words():
    dictionary = pymorphy3.MorphAnalyzer(lang='ru').dictionary
    is_word = re.compile(r'[а-яё]{3,32}').fullmatch
    tags = {}

    for word, (paradigm, index) in dictionary.words.iteritems():
        if (index != 0 and len(word) > RUSSIAN_SHORT_FORM_MAX_LENGTH) or not is_word(word):
            continue

        key = (paradigm, index)
        if key not in tags:
            tag = dictionary.build_tag_info(paradigm, index)
            tags[key] = not RUSSIAN_EXCLUDED.intersection(tag.grammemes)
        if tags[key]:
            yield word


def japanese_words(archive):
    is_word = re.compile(r'[ぁ-ゖー]{3,32}').fullmatch
    with gzip.open(archive) as source:
        events = ET.iterparse(source, events=('start', 'end'))
        _, root = next(events)

        for event, entry in events:
            if event != 'end' or entry.tag != 'entry':
                continue

            for reading in entry.iterfind('r_ele/reb'):
                word = unicodedata.normalize('NFKC', reading.text).translate(KATAKANA_TO_HIRAGANA)
                if is_word(word):
                    yield word

            root.clear()


def english_words(snapshot):
    if snapshot:
        contents = snapshot.read_text(encoding='utf-8')
    else:
        with urlopen(ENGLISH_SOURCE, timeout=30) as source:
            contents = source.read().decode('utf-8')

    is_word = re.compile(r'[a-z]{3,32}').fullmatch
    return filter(is_word, contents.splitlines())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('jmdict', type=Path, help='EDRDG JMdict XML gzip archive')
    parser.add_argument('--english-file', type=Path, help='A local copy of the pinned CDN list')
    args = parser.parse_args()

    server_path = ROOT / 'server/dictionaries.mjs'
    existing = read_server_dictionaries()
    grouped = {}
    sources = {
        'en': english_words(args.english_file),
        'ja': japanese_words(args.jmdict),
        'ru': russian_words(),
    }

    for language, source in sources.items():
        previous = {word for bucket in existing[language].values() for word in bucket.splitlines()}
        words = previous.union(source)

        by_length = defaultdict(list)
        for word in sorted(words):
            by_length[len(word)].append(word)
        grouped[language] = {
            size: '\n'.join(by_length[size]) for size in sorted(by_length)
        }
        print(f'{language}: {len(previous):,} → {len(words):,} entries', flush=True)

    server_data = json.dumps(grouped, ensure_ascii=False, separators=(',', ':'))
    server_path.write_text(SERVER_PREFIX + server_data + ';\n', encoding='utf-8')
    write_browser_dictionaries(grouped)


if __name__ == '__main__':
    main()
