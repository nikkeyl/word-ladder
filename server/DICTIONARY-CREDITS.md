# Dictionary credits

- Russian single-word lemmas and inflected forms of up to six characters are
  extracted from OpenCorpora through `pymorphy3-dicts-ru` 2.4.417150.4580142.
  Proper names, abbreviations, and entries marked as errors are excluded.
  [OpenCorpora downloads](https://opencorpora.org/?page=downloads) ·
  [Dictionary distribution](https://pypi.org/project/pymorphy3-dicts-ru/2.4.417150.4580142/) ·
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- Japanese single-word kana readings were extracted from the 2026-11-22 JMdict
  release by Jim Breen and the Electronic Dictionary Research and Development
  Group (EDRDG). They were normalized to hiragana. The derived readings are
  available under CC BY-SA 4.0.
  [JMdict documentation and downloads](https://www.edrdg.org/dokuwiki/doku.php?id=start) ·
  [EDRDG license](https://www.edrdg.org/edrdg/licence.html)
- English words from [word-list 4.1.0](https://github.com/sindresorhus/word-list),
  based on the [Letterpress word list](https://github.com/lorenbrichter/Words),
  supplement the existing Princeton WordNet 3.1 nouns. Only single lowercase
  ASCII words were included in the additions. See [the MIT notice](WORD-LIST-LICENSE.txt)
  and [the WordNet notice](WORDNET-LICENSE.txt).
  [Pinned jsDelivr word list](https://cdn.jsdelivr.net/npm/word-list@4.1.0/words.txt) ·
  [Princeton WordNet](https://wordnet.princeton.edu/)

## Refreshing the lists

Use Python with `pymorphy3==2.0.6` and `pymorphy3-dicts-ru==2.4.417150.4580142`.
Download the `JMdict.gz` XML archive from EDRDG. Run
`python tools/update-dictionaries.py /path/to/JMdict.gz` from the repository.
The tool loads the versioned English list from jsDelivr and accepts a local
copy via `--english-file`. It retains existing entries and writes the same
normalized word sets to `index.html` and `server/dictionaries.mjs`. Deploy
both generated artifacts together.
