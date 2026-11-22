# Word Ladder

![AI](https://img.shields.io/badge/AI-red)

A word ladder game in English, Russian and Japanese. Change one character
at a time to reach the target word. The code and original documentation
were generated with AI.

[Play Word Ladder](https://nikkeyl.github.io/word-ladder/).

## Open locally

Open `index.html` in a browser. Local two-player and bot games work offline
with the included dictionaries.

## Use

Choose a language and two words of the same length. Click a tile or use the
arrow keys to select it, then enter one character. A tile locks when its
character matches the target at that position. Japanese accepts kana and
romaji, with a choice of hiragana or katakana.

To play remotely, select **Play by link**, enter your name and share the
invite URL. Your opponent enters their name before joining.

The guest can reopen the invite in the same browser to return to their seat.
**Leave game** frees the seat so another player can continue from the
current word using the same invite. When the host selects **New game**,
the previous invite expires immediately.

## Host online games

The site is a single HTML file deployed on GitHub Pages. The WebSocket
backend uses Node.js and SQLite. Copy `.env.example` to `.env`, set
`ALLOWED_ORIGINS` to the exact origin of the frontend and run
`docker compose up -d --build`. The backend listens on VPS loopback port
`3003`.

Expose the backend behind an HTTPS reverse proxy. If publishing under a path
prefix, strip the prefix when proxying. Configure `word-ladder-server` in
`index.html` with the public endpoint, including the prefix. The included
Nginx location uses `/word-ladder-api/`. Its installer is specific to the
nikkeyl.com VPS configuration and validates Nginx before reload.

## License

The game code is [MIT](LICENSE). The bundled dictionaries retain
[their original licenses](server/DICTIONARY-CREDITS.md).
