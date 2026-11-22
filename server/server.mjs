import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket, WebSocketServer } from 'ws';

import {
  advanceRace,
  findNextStep,
  GAME_UUID,
  MAX_NAME_LENGTH,
  MAX_ONLINE_LENGTH,
  MIN_WORD_LENGTH,
  WORD_PATTERNS,
  WS_PROTOCOL,
} from './game-rules.mjs';
import { dictionaryFor } from './dictionary-lookup.mjs';

const ROOM_TTL = 24 * 60 * 60 * 1000;
const MAX_BODY = 2048;
const ROOM_ROUTE = /^\/games\/([^/]+)(\/socket)?$/;

const json = (data, status = 200) => Response.json(data, { status });
const error = (code, status) => json({ error: code }, status);
const isUuid = (value) => typeof value === 'string' && GAME_UUID.test(value);

const readBody = async (request) => {
  const reader = request.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder();
  let size = 0;
  let body = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      size += value.length;
      if (size > MAX_BODY) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
    const result = JSON.parse(body + decoder.decode());
    return result && typeof result === 'object' && !Array.isArray(result)
      ? result
      : null;
  } catch {
    return null;
  }
};

const validConfig = (config) => {
  if (!config || !Object.hasOwn(WORD_PATTERNS, config.language)) return false;

  const { goal, language, script, start } = config;
  const pattern = WORD_PATTERNS[language];
  return typeof start === 'string' && typeof goal === 'string'
    && start.length >= MIN_WORD_LENGTH && start.length <= MAX_ONLINE_LENGTH
    && start.length === goal.length && start !== goal
    && pattern.test(start) && pattern.test(goal)
    && (language === 'ja'
      ? ['hiragana', 'katakana'].includes(script)
      : script === '');
};

const playerName = (value) => {
  if (typeof value !== 'string') return '';
  const name = value.trim();
  return name.length <= MAX_NAME_LENGTH && !/[\x00-\x1f\x7f]/.test(name) ? name : '';
};

const newRaceBoards = (start) => [0, 1].map(() => ({
  changed: -1, status: 'playing', used: [start], word: start,
}));

const publicState = (game, seat) => ({
  boards: game.boards?.map((board, index) => {
    const visible = index === seat || game.phase === 'finished' || board.used.length === 1;

    return {
      changed: visible ? board.changed : -1,
      moves: board.used.length - 1,
      status: board.status,
      word: visible ? board.word : null,
    };
  }),
  changed: game.boards?.[seat].changed ?? game.changed,
  config: game.config,
  phase: game.phase,
  players: game.players.map((player) => player.name),
  revision: game.revision,
  roundWinners: game.roundWinners,
  turn: game.turn,
  winner: game.winner,
  word: game.boards?.[seat].word ?? game.word,
});

const databasePath = process.env.DATABASE_PATH ?? './data/games.sqlite';
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    expiresAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS games_expiry ON games (expiresAt);
`);
const loadGame = database.prepare('SELECT state FROM games WHERE id = ?');
const saveGame = database.prepare(`
  INSERT INTO games (id, state, expiresAt) VALUES (?, ?, ?)
  ON CONFLICT (id) DO UPDATE SET state = excluded.state, expiresAt = excluded.expiresAt
`);
const deleteExpired = database.prepare('DELETE FROM games WHERE expiresAt <= ?');
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? '')
  .split(',').map((item) => item.trim()).filter(Boolean));
const requestsAllowed = (request) => {
  const origin = request.headers.origin;
  return !origin || allowedOrigins.has(origin);
};

const rooms = new Map();
const roomFor = (id) => {
  let room = rooms.get(id);
  if (!room) {
    room = new GameRoom(id);
    rooms.set(id, room);
  }
  room.touchedAt = Date.now();
  return room;
};

class GameRoom {
  constructor(id) {
    this.id = id;
    this.sockets = new Set();
  }

  getGame() {
    const row = loadGame.get(this.id);
    return row ? JSON.parse(row.state) : null;
  }

  save(game) {
    saveGame.run(this.id, JSON.stringify(game), game.expiresAt);
  }

  session(game, seat, status = 200) {
    return json({ seat, state: publicState(game, seat) }, status);
  }

  broadcast(game) {
    for (const socket of this.sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ state: publicState(game, socket.seat), type: 'state' }));
      }
    }
  }

  async fetch(request) {
    if (request.method !== 'POST') return error('bad_request', 405);

    const body = await readBody(request);
    if (!body) return error('bad_request', 400);
    const { action, token } = body;
    if (action !== 'status' && !isUuid(token)) return error('bad_request', 400);
    const game = this.getGame();

    if (game?.phase === 'closed') return error('not_found', 404);

    if (action === 'create') {
      if (game) {
        return game.players[0].token === token && game.expiresAt > Date.now()
          ? this.session(game, 0)
          : error('room_unavailable', 409);
      }

      const name = playerName(body.name);
      if (!name) return error('invalid_name', 400);
      if (!validConfig(body.config)) return error('invalid_words', 400);

      const { goal, language, script, start } = body.config;
      const config = { goal, language, script, start };
      const { patterns } = dictionaryFor(config);
      if (!findNextStep(start, goal, patterns, [])) {
        return error('no_path', 422);
      }

      const fresh = {
        boards: body.race === true ? newRaceBoards(start) : undefined,
        changed: -1,
        config,
        expiresAt: Date.now() + ROOM_TTL,
        phase: 'waiting',
        players: [{ name, token }],
        revision: 0,
        roundWinners: body.rounds === 2 ? [] : undefined,
        turn: 0,
        used: [start],
        winner: null,
        word: start,
      };
      // Synchronous storage keeps the validation and seat write in one turn.
      this.save(fresh);
      return this.session(fresh, 0, 201);
    }

    if (!game || game.expiresAt <= Date.now()) return error('not_found', 404);
    if (action === 'status') return json({});
    const seat = game.players.findIndex((player) => player.token === token);
    if (action === 'resume') {
      return seat < 0 ? error('invalid_seat', 403) : this.session(game, seat);
    }
    if (action === 'end') {
      if (seat !== 0) return error('invalid_seat', 403);

      game.phase = 'closed';
      this.save(game);

      for (const socket of this.sockets) socket.close(4001, 'Game closed');
      this.sockets.clear();
      return json({});
    }
    if (action === 'leave') {
      if (seat !== 1) return error('invalid_seat', 403);
      if (game.phase !== 'playing') return error('game_ended', 409);

      game.players.pop();
      if (game.boards) {
        game.boards = newRaceBoards(game.config.start);
        game.turn = 0;
      }
      game.phase = 'waiting';
      game.revision += 1;
      this.save(game);

      for (const socket of this.sockets) {
        if (socket.seat !== seat) continue;

        this.sockets.delete(socket);
        socket.close(4002, 'Guest left');
      }

      this.broadcast(game);
      return json({});
    }
    if (action !== 'join') return error('bad_request', 400);
    if (seat >= 0) return this.session(game, seat);
    if (game.players.length >= 2) return error('room_full', 409);

    const name = playerName(body.name);
    if (!name) return error('invalid_name', 400);

    game.players.push({ name, token });
    game.phase = 'playing';
    game.revision += 1;
    this.save(game);
    this.broadcast(game);
    return this.session(game, 1);
  }

  connect(socket, seat, game) {
    socket.seat = seat;
    socket.alive = true;
    socket.on('error', () => socket.terminate());
    socket.on('pong', () => { socket.alive = true; });
    socket.on('close', () => { this.sockets.delete(socket); });
    socket.on('message', (data, binary) => {
      try {
        this.webSocketMessage(socket, binary ? null : data.toString('utf8'));
      } catch (cause) {
        console.error('Could not handle a move:', cause.message);
        socket.close(1011);
      }
    });
    this.sockets.add(socket);
    socket.send(JSON.stringify({ state: publicState(game, seat), type: 'state' }));
  }

  webSocketMessage(socket, message) {
    if (!this.sockets.has(socket)) return;

    const reject = (code, game) => {
      const state = game ? publicState(game, socket.seat) : undefined;
      socket.send(JSON.stringify({ code, state, type: 'error' }));
    };
    const game = this.getGame();
    if (!game || game.phase === 'closed' || game.expiresAt <= Date.now()) {
      socket.close(4001, 'Game expired');
      return;
    }

    let move;
    try {
      if (typeof message !== 'string' || message.length > MAX_BODY) {
        reject('invalid_move');
        return;
      }
      move = JSON.parse(message);
    } catch {
      reject('invalid_move');
      return;
    }

    if (!move || move.type !== 'move') return reject('invalid_move');
    if (move.revision !== game.revision) return reject('stale_move', game);
    const { seat } = socket;
    if (game.phase !== 'playing' || seat !== game.turn) return reject('not_your_turn', game);

    const { letter, position } = move;
    const { goal, language } = game.config;
    const board = game.boards?.[seat] ?? game;
    if (!Number.isInteger(position) || position < 0 || position >= board.word.length
      || typeof letter !== 'string' || letter.length !== 1
      || !WORD_PATTERNS[language].test(letter) || letter === board.word[position]) {
      return reject('invalid_move');
    }
    if (board.word[position] === goal[position]) return reject('locked_tile');

    const word = board.word.slice(0, position) + letter + board.word.slice(position + 1);
    const { hasWord, patterns } = dictionaryFor(game.config);
    if (!hasWord(word)) return reject('unknown_word');
    if (board.used.includes(word)) return reject('repeated_word');

    board.word = word;
    board.changed = position;
    board.used.push(word);
    game.revision += 1;
    const reachedGoal = word === goal;
    const canContinue = !reachedGoal && findNextStep(word, goal, patterns, board.used);

    if (game.boards) {
      board.status = reachedGoal ? 'solved' : canContinue ? 'playing' : 'blocked';
      const { turn, winner } = advanceRace(game.boards, seat);
      game.turn = turn;
      game.winner = winner;
      if (turn === null) game.phase = 'finished';
    } else if (canContinue) {
      game.turn = 1 - game.turn;
    } else if (game.roundWinners) {
      game.roundWinners.push(reachedGoal ? seat : 1 - seat);

      if (game.roundWinners.length === 1) {
        const { start } = game.config;
        board.word = start;
        game.changed = -1;
        board.used = [start];
        game.turn = 1;
      } else {
        const [first, second] = game.roundWinners;
        game.winner = first === second ? first : null;
        game.phase = 'finished';
      }
    } else {
      game.phase = reachedGoal ? 'finished' : 'blocked';
      game.winner = reachedGoal ? seat : null;
    }
    this.save(game);
    this.broadcast(game);
  }

}

const socketServer = new WebSocketServer({
  handleProtocols: (offered) => offered.has(WS_PROTOCOL) ? WS_PROTOCOL : false,
  maxPayload: MAX_BODY,
  noServer: true,
});

const sendResponse = async (target, result, origin) => {
  const headers = Object.fromEntries(result.headers);
  headers['Cache-Control'] = 'no-store';
  headers.Vary = 'Origin';
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  target.writeHead(result.status, headers);
  target.end(await result.text());
};

const server = createServer(async (request, response) => {
  const match = request.url?.match(ROOM_ROUTE);
  const origin = request.headers.origin;
  try {
    if (request.url === '/health') {
      await sendResponse(response, json({ ok: true }));
    } else if (!requestsAllowed(request)) {
      await sendResponse(response, error('origin_denied', 403));
    } else if (!match || !isUuid(match[1]) || match[2]) {
      await sendResponse(response, error('not_found', 404), origin);
    } else if (request.method === 'OPTIONS') {
      const headers = {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      };
      await sendResponse(response, new Response(null, { headers, status: 204 }), origin);
    } else if (request.method === 'POST') {
      const converted = new Request('http://localhost' + request.url, {
        body: Readable.toWeb(request), duplex: 'half', method: 'POST',
      });
      const result = await roomFor(match[1].toLowerCase()).fetch(converted);
      await sendResponse(response, result, origin);
    } else {
      await sendResponse(response, error('bad_request', 405), origin);
    }
  } catch (cause) {
    console.error('Could not handle a request:', cause.message);
    if (!response.headersSent) await sendResponse(response, error('server_error', 500), origin);
    else response.destroy();
  }
});

server.on('upgrade', (request, socket, head) => {
  const reject = (status) => socket.end('HTTP/1.1 ' + status
    + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  const match = request.url?.match(ROOM_ROUTE);
  if (!match || !match[2] || !isUuid(match[1])) return reject('404 Not Found');
  if (!requestsAllowed(request)) return reject('403 Forbidden');

  const room = roomFor(match[1].toLowerCase());
  const game = room.getGame();
  if (!game || game.phase === 'closed' || game.expiresAt <= Date.now()) {
    return reject('404 Not Found');
  }

  const offered = (request.headers['sec-websocket-protocol'] ?? '')
    .split(',').map((item) => item.trim());
  const token = offered.find((item) => item.startsWith('seat.'))?.slice(5);
  const seat = game.players.findIndex((player) => player.token === token);
  if (seat < 0 || !offered.includes(WS_PROTOCOL)) return reject('403 Forbidden');

  socketServer.handleUpgrade(request, socket, head, (connection) => {
    room.connect(connection, seat, game);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (!room.sockets.size) {
      if (now - room.touchedAt > 60_000) rooms.delete(id);
      continue;
    }

    const game = room.getGame();
    for (const socket of room.sockets) {
      if (!game || game.expiresAt <= now) socket.close(4001, 'Game expired');
      else if (!socket.alive) socket.terminate();
      else {
        socket.alive = false;
        socket.ping();
      }
    }
  }
  deleteExpired.run(now);
}, 30_000).unref();

const port = Number(process.env.PORT ?? 8787);
server.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log('Word Ladder listening on port ' + port);
});
