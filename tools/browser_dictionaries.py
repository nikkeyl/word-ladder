"""Build the versioned browser dictionaries and standalone offline download."""

import hashlib
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
SERVER_PREFIX = 'export const DICTIONARIES = '
ASSET_TAG = re.compile(r'(<script id="dictionary-assets" type="application/json">)[^<]*(</script>)')
OFFLINE_MARKER = '<!-- Bundled dictionaries -->'
OFFLINE_SCRIPTS = ('vendor/wanakana.min.js', 'rules-dialog.js', 'game.js')


def read_server_dictionaries():
    text = (ROOT / 'server/dictionaries.mjs').read_text(encoding='utf-8').strip()
    if not text.startswith(SERVER_PREFIX) or not text.endswith(';'):
        raise ValueError('Unexpected server dictionary format.')

    return json.loads(text[len(SERVER_PREFIX):-1])


def write_browser_dictionaries(grouped):
    index = ROOT / 'index.html'
    html = index.read_text(encoding='utf-8')
    asset_folder = ROOT / 'dictionaries'
    asset_folder.mkdir(exist_ok=True)
    assets = {}
    embedded = []

    for language, buckets in sorted(grouped.items()):
        assets[language] = {}
        for length, bucket in sorted(buckets.items(), key=lambda item: int(item[0])):
            if int(length) < 3:
                continue

            data = (bucket + '\n').encode('utf-8')
            revision = hashlib.sha256(data).hexdigest()[:16]
            name = f'{language}-{length}-{revision}.txt'
            (asset_folder / name).write_bytes(data)
            assets[language][length] = f'./dictionaries/{name}'

        words = sorted(word for bucket in buckets.values() for word in bucket.splitlines())
        text = '\n'.join(words) + '\n'
        embedded.append(f'<script id="dictionary-{language}" type="text/plain">\n{text}</script>')

    tags = json.dumps(assets, separators=(',', ':'))
    html, count = ASSET_TAG.subn(lambda match: match[1] + tags + match[2], html)
    if count != 1 or html.count(OFFLINE_MARKER) != 1:
        raise ValueError('Expected exactly one dictionary manifest and offline marker.')

    index.write_text(html, encoding='utf-8')
    standalone = html.replace(OFFLINE_MARKER, '\n  '.join(embedded))
    for path in OFFLINE_SCRIPTS:
        tag = f'<script defer src="./{path}"></script>'
        if standalone.count(tag) != 1:
            raise ValueError(f'Expected one script tag for {path}.')

        script = (ROOT / path).read_text(encoding='utf-8')
        standalone = standalone.replace(tag, f'<script>\n{script}</script>')

    offline_html = ZipInfo('word-ladder.html')
    with ZipFile(ROOT / 'word-ladder-offline.zip', 'w') as archive:
        archive.writestr(offline_html, standalone, compress_type=ZIP_DEFLATED, compresslevel=9)


if __name__ == '__main__':
    write_browser_dictionaries(read_server_dictionaries())
