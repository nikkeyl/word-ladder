'use strict';

const WORD_PATTERNS = {
  en: /^[a-z]+$/,
  ja: /^[ぁ-ゖー]+$/,
  ru: /^[а-яё]+$/,
};
const MIN_WORD_LENGTH = 3;
const MAX_ONLINE_LENGTH = 32;
const MAX_NAME_LENGTH = 40;
const GAME_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WS_PROTOCOL = 'word-ladder';

const QWERTY_KEYS = '`qwertyuiop[]asdfghjkl;\'zxcvbnm,.';
const JCUKEN_KEYS = 'ёйцукенгшщзхъфывапролджэячсмитьбю';
const SHIFTED_QWERTY_KEYS = {
  '"': 'Э',
  ':': 'Ж',
  '<': 'Б',
  '>': 'Ю',
  '{': 'Х',
  '}': 'Ъ',
  '~': 'Ё',
};

const DICTIONARY_TIMEOUT_MS = 12000;
const LOCAL_MOVE_DELAY_MS = 520;
const MAX_RECONNECT_DELAY_MS = 5000;
const RECONNECT_DELAY_MS = 500;

const wordPattern = (word, position) => {
  return word.slice(0, position) + '*' + word.slice(position + 1);
};

const buildPatterns = (words) => {
  const patterns = new Map();

  for (const word of words) {
    for (let position = 0; position < word.length; position += 1) {
      const pattern = wordPattern(word, position);
      const matches = patterns.get(pattern);

      if (matches) {
        matches.push(word);
      } else {
        patterns.set(pattern, [word]);
      }
    }
  }

  return patterns;
};

// BFS по обратным рёбрам. В предыдущем слове изменённая плитка
// должна была быть свободна, иначе ход вперёд невозможен.
const findNextStep = (current, goal, patterns, blocked) => {
  const queue = [goal];
  const visited = new Set(blocked);
  visited.add(goal);

  for (let index = 0; index < queue.length; index += 1) {
    const word = queue[index];

    for (let position = 0; position < word.length; position += 1) {
      for (const neighbor of patterns.get(wordPattern(word, position))) {
        if (neighbor === word || neighbor[position] === goal[position]) continue;

        if (neighbor === current) return word;
        if (visited.has(neighbor)) continue;

        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return null;
};
const advanceRace = (boards, seat) => {
  const opponent = 1 - seat;
  const moves = (board) => (board.used.size ?? board.used.length) - 1;
  const firstFinisher = boards.find((board) => board.status === 'solved');
  const limit = firstFinisher ? moves(firstFinisher) : Infinity;

  for (const board of boards) {
    if (board.status === 'playing' && moves(board) >= limit) board.status = 'limit';
  }

  if (boards[opponent].status === 'playing') return { turn: opponent, winner: null };
  if (boards[seat].status === 'playing') return { turn: seat, winner: null };

  const scores = boards.map((board) => board.status === 'solved' ? moves(board) : Infinity);

  return {
    turn: null,
    winner: scores[0] === scores[1] ? null : Number(scores[1] < scores[0]),
  };
};

const STRINGS = {
  en: {
    opponent: 'Opponent',
    raceWaiting: 'Your opponent is still playing…',
    raceMoves: '{name} · Moves: {moves}',
    solved: 'Solved',
    limit: 'Move limit reached',
    raceBlocked: 'No path to target',
    rulesTitle: 'Game rules',
    rulesClose: 'Close',
    rulesSetup: 'Choose two different words of the same length, at least three characters each.',
    rulesMove: 'Change one character per turn. Click a tile or use ← → to select it, then type the replacement. Intermediate words must be in the dictionary. You can use each word only once per round.',
    rulesLock: 'A character locks as soon as it matches the target in that position.',
    nextRound: 'Next round',
    sharedRoundWinner: 'Round winner: {name}',
    sharedDeadEnd: 'The word reached a dead end.',
    rulesDuo: 'Two players on one device take turns changing the same word. The final move wins the round, and a dead end gives the round to the other player. The other player starts round two. One round each is a draw.',
    rulesRound: 'Against the bot or by link, each player has their own board with the same starting word. Take turns against the bot or play simultaneously by link. A player whose chain reaches a dead end stops, and the opponent can continue.',
    rulesMatch: 'The player who reaches the target in fewer moves wins. After one player finishes, the other gets the same number of moves to match that result. Equal scores, or two dead ends, are a draw.',
    rulesKeyboard: 'In Russian and English games, you can enter words and make moves with either keyboard layout.',
    rulesJapanese: 'For Japanese, choose hiragana or katakana. Type kana directly or use romaji, for example re → れ / レ.',
    settings: 'Game settings',
    mode: 'Game mode',
    duo: 'Two players',
    bot: 'Vs. bot',
    online: 'Play by link',
    language: 'Game language',
    script: 'Script',
    hiragana: 'Hiragana',
    katakana: 'Katakana',
    startWord: 'Starting word',
    goalWord: 'Target word',
    name: 'Name',
    setupHelp: 'Two different words of equal length, at least three characters each.',
    kanaHelp: 'Kana and romaji are accepted.',
    start: 'Start game',
    create: 'Create game',
    joinHeading: 'Join the game',
    join: 'Join',
    back: 'Back',
    board: 'Game board',
    goal: 'Target',
    newGame: 'New game',
    leaveGame: 'Leave game',
    game_ended: 'This game has already ended.',
    letterLabel: 'Replacement character',
    invite: 'Invite link',
    copy: 'Copy link',
    copied: 'Link copied.',
    copyFailed: 'Select and copy the link.',
    loading: 'Connecting…',
    waiting: 'Waiting for the second player…',
    reconnecting: 'Reconnecting…',
    sending: 'Sending move…',
    yourTurn: 'Your turn',
    theirTurn: '{name}’s turn',
    player: 'Player {number}',
    you: 'You',
    botName: 'Bot',
    botThinking: 'The bot is thinking…',
    matchScore: 'Round {round}/2 · {first} {a} – {b} {second}',
    draw: 'Draw!',
    won: 'You won!',
    winner: 'Winner: {name}',
    blocked: 'No path remains. Start a new game.',
    selectPrompt: 'Click a tile or use ← and → to select it.',
    selectLetter: 'Enter a character to replace “{letter}”.',
    romajiHint: 'Romaji also works.',
    romajiProgress: 'Romaji · {value}…',
    romajiNasal: 'For “{letter}”, type nn or press Enter.',
    tileLabel: 'Character {number}: {letter}',
    lockedLabel: '{tile}, locked',
    differentLetter: 'Enter a different character.',
    unknownQuoted: '“{word}” is not in the dictionary.',
    setupPatternEn: 'Enter both words using English letters, without spaces.',
    setupPatternJa: 'Enter both words in kana or romaji, without spaces or kanji.',
    setupPatternRu: 'Enter both words using Russian letters, without spaces.',
    inputPatternEn: 'Enter one English letter.',
    inputPatternJa: 'Enter one kana character or its romaji spelling.',
    inputPatternRu: 'Enter one Russian letter.',
    minimum: 'Each word needs at least three characters.',
    sameLength: 'Enter two different words of equal length.',
    tooLong: 'Online words can have at most {maximum} characters.',
    invalidLink: 'This invite link is invalid.',
    unconfigured: 'The online server address has not been configured.',
    offline: 'Could not reach the game server. Try again.',
    dictionaryLoading: 'Loading dictionary…',
    dictionaryUnavailable: 'Could not load the dictionary. Try again.',
    dictionaryFile: 'Download the offline version to play from a file.',
    invalid_name: 'Enter a name of 1–40 characters.',
    invalid_words: 'These words are not valid for this game.',
    no_path: 'The dictionary has no path for this pair with locked tiles.',
    not_found: 'This game is no longer available.',
    invalid_seat: 'Your seat could not be restored. Join the game again.',
    room_full: 'This game already has two players.',
    room_unavailable: 'This game could not be created. Try again.',
    stale_move: 'The board has changed. Select a tile again.',
    not_your_turn: 'It is not your turn.',
    invalid_move: 'Enter one valid replacement character.',
    locked_tile: 'This tile is locked.',
    unknown_word: 'That word is not in the dictionary.',
    repeated_word: 'That word has already been played.',
  },
  ja: {
    opponent: '対戦相手',
    raceWaiting: '相手はまだプレイ中です…',
    raceMoves: '{name} · {moves}手',
    solved: 'ゴール達成',
    limit: '手数の上限',
    raceBlocked: 'ゴールへの道なし',
    rulesTitle: 'ゲームのルール',
    rulesClose: '閉じる',
    rulesSetup: '同じ長さで3文字以上の、異なる単語を2つ選びます。',
    rulesMove: '1回の手番で1文字だけ入れ替えます。タイルを押すか、← →キーで選んでから、新しい文字を入力します。途中の単語は辞書にあるものに限ります。同じラウンドで同じ単語は使えません。',
    rulesLock: 'ゴールの単語と同じ位置に同じ文字がそろうと、そのタイルは固定されます。',
    nextRound: '次のラウンド',
    sharedRoundWinner: 'ラウンドの勝者：{name}',
    sharedDeadEnd: 'ゴールへの道がなくなりました。',
    rulesDuo: '同じ端末で2人対戦するときは、交互に共通の単語を変えます。ゴールにたどり着いた人がラウンドの勝者です。行き詰まった場合は相手の勝ちです。第2ラウンドでは先攻を交代し、1勝ずつなら引き分けです。',
    rulesRound: 'ボット戦とリンク対戦では、同じ最初の単語から別々の盤で進めます。ボット戦は交互に、リンク対戦は同時に進められます。行き詰まった人は終了し、相手は続けられます。',
    rulesMatch: 'より少ない手数でゴールした人が勝ちです。一方がゴールしたら、もう一方も同じ手数まで続けられます。同じ手数でゴールした場合や、両方が行き詰まった場合は引き分けです。',
    rulesKeyboard: 'ロシア語と英語のゲームでは、キーボード配列を切り替えずに単語を入力したり、手を打ったりできます。',
    rulesJapanese: '日本語では、ひらがなかカタカナを選びます。仮名を直接入力することも、ローマ字で入力することもできます。例：re → れ / レ。',
    settings: 'ゲーム設定',
    mode: '対戦モード',
    duo: '2人で対戦',
    bot: 'ボットと対戦',
    online: 'リンクで対戦',
    language: 'ゲームの言語',
    script: '文字種',
    hiragana: 'ひらがな',
    katakana: 'カタカナ',
    startWord: '最初の単語',
    goalWord: 'ゴールの単語',
    name: '名前',
    setupHelp: '同じ長さの異なる単語を2つ入力してください。どちらも3文字以上です。',
    kanaHelp: '仮名とローマ字を使えます。',
    start: 'ゲーム開始',
    create: '対戦を作成',
    joinHeading: '対戦に参加',
    join: '参加する',
    back: '戻る',
    board: 'ゲーム盤',
    goal: 'ゴール',
    newGame: '新しいゲーム',
    leaveGame: '対戦から退出',
    game_ended: 'この対戦はすでに終了しています。',
    letterLabel: '入れ替える文字',
    invite: '招待リンク',
    copy: 'リンクをコピー',
    copied: 'リンクをコピーしました。',
    copyFailed: 'リンクを選択してコピーしてください。',
    loading: '接続中…',
    waiting: '対戦相手の参加を待っています…',
    reconnecting: '再接続中…',
    sending: '手を送信中…',
    yourTurn: 'あなたの番',
    theirTurn: '{name}さんの番',
    player: 'プレイヤー{number}',
    you: 'あなた',
    botName: 'ボット',
    botThinking: 'ボットが考えています…',
    matchScore: '第{round}ラウンド／全2回 · {first} {a} – {b} {second}',
    draw: '引き分け！',
    won: 'あなたの勝ちです！',
    winner: '勝者：{name}',
    blocked: 'ゴールまでの道がありません。新しいゲームを始めてください。',
    selectPrompt: 'タイルを押すか、← →で選んでください。',
    selectLetter: '「{letter}」の代わりに入れる文字を入力してください。',
    romajiHint: 'ローマ字も使えます。',
    romajiProgress: 'ローマ字 · {value}…',
    romajiNasal: '「{letter}」は nn または Enter で入力できます。',
    tileLabel: '{number}文字目：{letter}',
    lockedLabel: '{tile}、固定済み',
    differentLetter: '別の文字を入力してください。',
    unknownQuoted: '「{word}」は辞書にありません。',
    setupPatternEn: '両方の単語を英字で入力してください。空白は使えません。',
    setupPatternJa: '両方の単語を仮名かローマ字で入力してください。空白と漢字は使えません。',
    setupPatternRu: '両方の単語をロシア語の文字で入力してください。空白は使えません。',
    inputPatternEn: '英字を1文字入力してください。',
    inputPatternJa: '仮名を1文字、またはそのローマ字表記を入力してください。',
    inputPatternRu: 'ロシア語の文字を1文字入力してください。',
    minimum: 'どちらの単語も3文字以上にしてください。',
    sameLength: '同じ長さの異なる単語を2つ入力してください。',
    tooLong: 'オンライン対戦の単語は{maximum}文字までです。',
    invalidLink: '招待リンクが無効です。',
    unconfigured: 'オンラインサーバーのアドレスが設定されていません。',
    offline: 'ゲームサーバーに接続できませんでした。もう一度お試しください。',
    dictionaryLoading: '辞書を読み込み中…',
    dictionaryUnavailable: '辞書を読み込めませんでした。もう一度お試しください。',
    dictionaryFile: 'ファイルから遊ぶにはオフライン版をダウンロードしてください。',
    invalid_name: '名前を1〜40文字で入力してください。',
    invalid_words: 'この対戦では指定された単語を使えません。',
    no_path: 'タイルを固定するルールでは、辞書にこの組み合わせの経路がありません。',
    not_found: 'この対戦には参加できません。',
    invalid_seat: '対戦に復帰できませんでした。参加し直してください。',
    room_full: 'この対戦にはすでに2人が参加しています。',
    room_unavailable: '対戦を作成できませんでした。もう一度お試しください。',
    stale_move: '盤面が変わりました。タイルを選び直してください。',
    not_your_turn: 'まだあなたの番ではありません。',
    invalid_move: '入れ替える文字を1文字入力してください。',
    locked_tile: 'このタイルは固定されています。',
    unknown_word: 'その単語は辞書にありません。',
    repeated_word: 'その単語はすでに使われています。',
  },
  ru: {
    opponent: 'Соперник',
    raceWaiting: 'Соперник ещё играет…',
    raceMoves: '{name} · Ходы: {moves}',
    solved: 'Цель собрана',
    limit: 'Лимит ходов исчерпан',
    raceBlocked: 'Нет пути к цели',
    rulesTitle: 'Правила игры',
    rulesClose: 'Закрыть',
    rulesSetup: 'Выберите два разных слова одинаковой длины, от трёх знаков.',
    rulesMove: 'За ход замените один знак. Выберите плитку нажатием или стрелками ← → и введите новый знак. Промежуточное слово должно быть в словаре. Повторять слова в одном раунде нельзя.',
    rulesLock: 'Знак, который совпадает с целью на своей позиции, сразу блокируется.',
    nextRound: 'Следующий раунд',
    sharedRoundWinner: 'Раунд выиграл {name}',
    sharedDeadEnd: 'Слово зашло в тупик.',
    rulesDuo: 'На одном устройстве двое по очереди меняют общее слово. Кто собрал цель, выигрывает раунд. Ход в тупик отдаёт раунд сопернику. Во втором раунде начинает другой игрок. По одной победе дают ничью.',
    rulesRound: 'С ботом и по ссылке у каждого своё поле с одинаковым стартовым словом. С ботом ходы идут по очереди, по ссылке можно ходить одновременно. Если путь к цели закрыт, игрок выбывает из гонки, а соперник может продолжать.',
    rulesMatch: 'Побеждает тот, кто собрал цель за меньшее число ходов. После первого финиша сопернику даётся столько же ходов, чтобы сравнять результат. Одинаковый результат или два тупика — ничья.',
    rulesKeyboard: 'В русской и английской игре можно вводить слова и делать ходы без переключения раскладки клавиатуры.',
    rulesJapanese: 'В японском выберите хирагану или катакану. Можно вводить знаки напрямую или печатать ромадзи, например re → れ / レ.',
    settings: 'Настройка партии',
    mode: 'Режим игры',
    duo: 'Вдвоём',
    bot: 'Против бота',
    online: 'По ссылке',
    language: 'Язык игры',
    script: 'Азбука',
    hiragana: 'Хирагана',
    katakana: 'Катакана',
    startWord: 'Начальное слово',
    goalWord: 'Конечное слово',
    name: 'Имя',
    setupHelp: 'Два разных слова одинаковой длины, от трёх знаков.',
    kanaHelp: 'Подойдут кана и ромадзи.',
    start: 'Начать игру',
    create: 'Создать игру',
    joinHeading: 'Вход в игру',
    join: 'Войти',
    back: 'Назад',
    board: 'Игровое поле',
    goal: 'Цель',
    newGame: 'Новая игра',
    leaveGame: 'Покинуть игру',
    game_ended: 'Эта партия уже завершилась.',
    letterLabel: 'Новый знак',
    invite: 'Ссылка для приглашения',
    copy: 'Скопировать ссылку',
    copied: 'Ссылка скопирована.',
    copyFailed: 'Выделите и скопируйте ссылку.',
    loading: 'Подключение…',
    waiting: 'Ждём второго игрока…',
    reconnecting: 'Восстанавливаем соединение…',
    sending: 'Отправляем ход…',
    yourTurn: 'Ваш ход',
    theirTurn: 'Ходит {name}',
    player: 'Игрок {number}',
    you: 'Вы',
    botName: 'Бот',
    botThinking: 'Бот думает…',
    matchScore: 'Раунд {round}/2 · {first} {a} – {b} {second}',
    draw: 'Ничья!',
    won: 'Вы победили!',
    winner: 'Победитель — {name}',
    blocked: 'Путь к цели закрыт. Начните новую игру.',
    selectPrompt: 'Выберите плитку нажатием или стрелками ← →.',
    selectLetter: 'Введите знак вместо «{letter}».',
    romajiHint: 'Можно ромадзи.',
    romajiProgress: 'Ромадзи · {value}…',
    romajiNasal: 'Для «{letter}» наберите nn или нажмите Enter.',
    tileLabel: '{number}-й знак: {letter}',
    lockedLabel: '{tile}, плитка заблокирована',
    differentLetter: 'Введите другой знак.',
    unknownQuoted: 'Слова «{word}» нет в словаре.',
    setupPatternEn: 'Введите оба слова английскими буквами, без пробелов.',
    setupPatternJa: 'Введите оба слова каной или ромадзи, без пробелов и кандзи.',
    setupPatternRu: 'Введите оба слова русскими буквами, без пробелов.',
    inputPatternEn: 'Введите одну английскую букву.',
    inputPatternJa: 'Введите один знак каны или его запись ромадзи.',
    inputPatternRu: 'Введите одну русскую букву.',
    minimum: 'В каждом слове должно быть не меньше трёх знаков.',
    sameLength: 'Нужны два разных слова одинаковой длины.',
    tooLong: 'В онлайн-игре слова могут быть длиной до {maximum} знаков.',
    invalidLink: 'Ссылка на игру недействительна.',
    unconfigured: 'Адрес сервера для игры по ссылке ещё не настроен.',
    offline: 'Не удалось подключиться к серверу. Попробуйте ещё раз.',
    dictionaryLoading: 'Загружаем словарь…',
    dictionaryUnavailable: 'Не удалось загрузить словарь. Попробуйте ещё раз.',
    dictionaryFile: 'Для игры из файла скачайте офлайн-версию.',
    invalid_name: 'Введите имя от 1 до 40 знаков.',
    invalid_words: 'Эти слова не подходят для игры.',
    no_path: 'В словаре нет цепочки для этой пары с правилом блокировки.',
    not_found: 'Эта партия недоступна.',
    invalid_seat: 'Не удалось восстановить место. Войдите в игру заново.',
    room_full: 'В этой партии уже два игрока.',
    room_unavailable: 'Не удалось создать игру. Попробуйте ещё раз.',
    stale_move: 'Слово уже изменилось. Выберите плитку заново.',
    not_your_turn: 'Сейчас ход другого игрока.',
    invalid_move: 'Введите один допустимый знак.',
    locked_tile: 'Эта плитка заблокирована.',
    unknown_word: 'Этого слова нет в словаре.',
    repeated_word: 'Это слово уже было в цепочке.',
  },
};

const detectLocale = () => {
  const preferred = (navigator.languages?.length ? navigator.languages : [navigator.language])
    .filter(Boolean).flatMap((tag) => {
      try {
        return [new Intl.Locale(tag)];
      } catch {
        return [];
      }
    });

  const supported = preferred.find((item) => Object.hasOwn(STRINGS, item.language));
  if (supported) return supported.language;

  return preferred.some((item) => item.maximize().script === 'Cyrl') ? 'ru' : 'en';
};

let locale = detectLocale();
const t = (key, values = {}) => {
  const text = STRINGS[locale][key] ?? STRINGS[locale].offline;
  return text.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
};

const LANGUAGES = {
  en: {
    goal: 'warm',
    letterError: 'inputPatternEn',
    pattern: WORD_PATTERNS.en,
    start: 'cold',
    wordError: 'setupPatternEn',
  },
  ja: {
    goal: 'ことり',
    letterError: 'inputPatternJa',
    pattern: WORD_PATTERNS.ja,
    start: 'さくら',
    wordError: 'setupPatternJa',
  },
  ru: {
    goal: 'слон',
    letterError: 'inputPatternRu',
    pattern: WORD_PATTERNS.ru,
    start: 'муха',
    wordError: 'setupPatternRu',
  },
};
const setup = document.getElementById('setup');
const setupHelp = document.getElementById('setup-help');
const setupError = document.getElementById('setup-error');
const languagePicker = document.getElementById('language');
const languageField = document.getElementById('language-field');
const scriptField = document.getElementById('script-field');
const scriptPicker = document.getElementById('script');
const startWord = document.getElementById('start-word');
const goalWord = document.getElementById('goal-word');
const game = document.getElementById('game');
const target = document.getElementById('target');
const input = document.getElementById('letter');
const restart = document.getElementById('restart');
const nextRound = document.getElementById('next-round');
const tiles = document.getElementById('tiles');
const turn = document.getElementById('turn');
const notice = document.getElementById('notice');
const matchScore = document.getElementById('match-score');
const raceProgress = document.getElementById('race-progress');
const boardLabels = [...raceProgress.children];
const rulesDialog = document.getElementById('rules');

const hostName = document.getElementById('host-name');
const hostNameField = document.getElementById('host-name-field');
const startButton = document.getElementById('start-button');
const joinForm = document.getElementById('join-form');
const joinError = document.getElementById('join-error');
const guestName = document.getElementById('guest-name');
const joinButton = document.getElementById('join-button');
const joinBack = document.getElementById('join-back');
const unavailableGame = document.getElementById('unavailable-game');
const unavailableHeading = document.getElementById('unavailable-heading');
const unavailableBack = document.getElementById('unavailable-back');
const onlineTurn = document.getElementById('online-turn');
const invitePanel = document.getElementById('invite-panel');
const inviteLink = document.getElementById('invite-link');
const copyInvite = document.getElementById('copy-invite');

bindRulesDialog(rulesDialog, document.getElementById('open-rules'));

let round;
let tileButtons = [];
let localTurn;
let localBoards;
let sharedBoard;
let sharedRoundWinners;
let localWinner;
let mode;
let botDetoured;
let moveTimer;
let selected = null;

const bindSelect = (field) => {
  const shell = field.parentElement;
  const trigger = shell.querySelector('[role="combobox"]');
  const menu = shell.querySelector('[role="listbox"]');
  const options = [...menu.children];
  let active = 0;
  let expanded = false;

  const highlight = (index) => {
    options[active].removeAttribute('data-active');
    active = Math.max(0, Math.min(index, options.length - 1));
    const option = options[active];
    option.dataset.active = 'true';
    trigger.setAttribute('aria-activedescendant', option.id);

    const offset = option.offsetTop;
    const bottom = offset + option.offsetHeight;
    if (offset < menu.scrollTop) menu.scrollTop = offset;
    if (bottom > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = bottom - menu.clientHeight;
    }
  };

  const close = () => {
    expanded = false;
    menu.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
  };

  const open = () => {
    menu.style.maxHeight = '';

    const { top, bottom } = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const above = top - viewportTop - 12;
    const below = viewportTop + viewportHeight - bottom - 12;
    const opensUp = below < menu.offsetHeight && above > below;
    menu.classList.toggle('opens-up', opensUp);
    menu.style.maxHeight = Math.max(44, opensUp ? above : below) + 'px';
    expanded = true;
    menu.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    highlight(options.findIndex((option) => option.dataset.value === field.value));
  };

  const choose = (index, notify = true) => {
    const option = options[index];
    close();

    if (field.value === option.dataset.value) return;

    field.value = option.dataset.value;
    trigger.textContent = option.textContent;

    for (const item of options) {
      item.setAttribute('aria-selected', String(item === option));
    }

    if (notify) field.dispatchEvent(new Event('change', { bubbles: true }));
  };

  trigger.addEventListener('pointerdown', (event) => {
    if (expanded) event.preventDefault();
  });
  trigger.addEventListener('click', (event) => {
    if (!expanded) {
      trigger.focus();
      open();
    } else if (event.detail === 0) {
      choose(active);
    } else {
      close();
    }
  });
  trigger.addEventListener('blur', close);
  menu.addEventListener('mousedown', (event) => event.preventDefault());
  menu.addEventListener('click', (event) => {
    const index = options.indexOf(event.target.closest('[role="option"]'));
    if (expanded && index >= 0) choose(index);
  });
  document.addEventListener('pointerdown', (event) => {
    if (expanded && !shell.contains(event.target)) close();
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;

    const { key } = event;
    if (key === 'Tab') {
      if (expanded) choose(active);
      return;
    }

    if (key === 'Escape' && expanded) {
      event.preventDefault();
      close();
    } else if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      if (!expanded) open();
      else highlight(active + (key === 'ArrowDown' ? 1 : -1));
    } else if (key === 'Home' || key === 'End') {
      event.preventDefault();
      if (!expanded) open();
      highlight(key === 'Home' ? 0 : options.length - 1);
    } else if (key.length === 1) {
      const index = options.findIndex((option) => {
        return option.textContent.toLowerCase().startsWith(key.toLowerCase());
      });
      if (index < 0) return;

      event.preventDefault();
      if (!expanded) open();
      highlight(index);
    }
  });
  return (value) => {
    choose(options.findIndex((option) => option.dataset.value === value), false);
  };
};

const selectLanguage = bindSelect(languagePicker);
bindSelect(scriptPicker);

const convertKeyboardLayout = (value, language) => {
  if (language === 'ja') return value;

  const russian = language === 'ru';
  const sourceKeys = russian ? QWERTY_KEYS : JCUKEN_KEYS;
  const targetKeys = russian ? JCUKEN_KEYS : QWERTY_KEYS;

  return Array.from(value, (character) => {
    if (russian && Object.hasOwn(SHIFTED_QWERTY_KEYS, character)) {
      return SHIFTED_QWERTY_KEYS[character];
    }

    const lower = character.toLowerCase();
    const mapped = targetKeys[sourceKeys.indexOf(lower)];
    if (mapped === undefined) return character;

    return character === lower ? mapped : mapped.toUpperCase();
  }).join('');
};

const normalizeWord = (word, language, composingRomaji = false) => {
  if (language !== 'ja') {
    return convertKeyboardLayout(word.normalize('NFC'), language).toLowerCase();
  }

  const normalized = word.normalize('NFKC').toLowerCase();
  const kana = wanakana.toHiragana(normalized, {
    IMEMode: composingRomaji,
    convertLongVowelMark: false,
  });

  return kana.replace(/[ァ-ヶ]/g, (letter) => {
    return String.fromCharCode(letter.charCodeAt(0) - 0x60);
  });
};

const printWord = (word, language, script) => {
  if (language !== 'ja') return word.toUpperCase();

  return script === 'katakana' ? wanakana.toKatakana(word) : word;
};

const setNotice = (message, invalid = false) => {
  notice.textContent = message;
  notice.classList.toggle('error', invalid);

  input.setAttribute('aria-invalid', String(invalid));
};

const promptForLetter = () => {
  const current = tileButtons[selected].textContent;
  const romaji = round.language === 'ja' ? ' ' + t('romajiHint') : '';
  setNotice(t('selectLetter', { letter: current }) + romaji);
};

const clearSelection = () => {
  tileButtons[selected]?.setAttribute('aria-pressed', 'false');
  selected = null;
  input.value = '';
  input.blur();
};

const getPlayer = (seat = localTurn) => {
  if (mode === 'bot') return t(seat === 1 ? 'botName' : 'you');

  return t('player', { number: seat + 1 });
};

const isBotTurn = () => mode === 'bot' && localTurn === 1;

const showMatchScore = (winners, players, roundNumber) => {
  matchScore.hidden = !winners || players.length < 2;
  if (matchScore.hidden) return;

  const a = winners.filter((winner) => winner === 0).length;
  matchScore.textContent = t('matchScore', {
    round: roundNumber ?? Math.min(winners.length + 1, 2),
    first: players[0],
    a,
    b: winners.length - a,
    second: players[1],
  });
};

const paintBoard = (word, changed, canPlay) => {
  const printed = printWord(word, round.language, round.script);
  tiles.setAttribute('aria-label', printed);

  for (const [index, tile] of tileButtons.entries()) {
    const locked = word[index] === round.goal[index];
    const letter = printed[index];
    const glyph = tile.firstElementChild;

    if (glyph.textContent !== letter) {
      const printedGlyph = glyph.cloneNode(false);
      printedGlyph.textContent = letter;
      glyph.replaceWith(printedGlyph);
    }
    const position = t('tileLabel', { letter, number: index + 1 });
    tile.setAttribute('aria-label', locked ? t('lockedLabel', { tile: position }) : position);
    tile.classList.toggle('changed', index === changed);
    tile.classList.toggle('locked', locked);
    tile.disabled = !canPlay || locked;
  }
};

const renderRace = (boards, players, activeRow, canPlay) => {
  matchScore.hidden = true;
  raceProgress.hidden = false;
  input.disabled = !canPlay;

  for (const [row, board] of boards.entries()) {
    const name = players[row] ?? t('opponent');
    boardLabels[row].textContent = t('raceMoves', { name, moves: board.moves });
    if (board.status !== 'playing') boardLabels[row].textContent += ' · ' + t(board.status === 'blocked' ? 'raceBlocked' : board.status);
  }

  const { changed, word } = boards[activeRow];
  paintBoard(word, changed, canPlay);
};

const renderBotRace = () => {
  const finished = localTurn === null;
  const botPlaying = !finished && isBotTurn();
  const boards = localBoards.map((board) => ({ ...board, moves: board.used.size - 1 }));
  renderRace(boards, [getPlayer(0), getPlayer(1)], 0, !finished && !botPlaying);
  onlineTurn.hidden = true;
  turn.textContent = '';

  if (finished) {
    if (localWinner === null) setNotice(t('draw'));
    else if (localWinner === 0) setNotice(t('won'));
    else setNotice(t('winner', { name: getPlayer(localWinner) }));
  } else if (botPlaying) {
    setNotice(t('botThinking'));
  } else {
    turn.textContent = t('yourTurn');
    setNotice(t('selectPrompt'));
  }
};

const renderSharedBoard = () => {
  const { changed, status, word } = sharedBoard;
  const canPlay = status === 'playing';
  const roundsFinished = sharedRoundWinners.length;
  const players = [getPlayer(0), getPlayer(1)];
  showMatchScore(sharedRoundWinners, players, roundsFinished + Number(canPlay));
  raceProgress.hidden = true;
  nextRound.hidden = canPlay || roundsFinished !== 1;
  onlineTurn.hidden = false;
  onlineTurn.dataset.ownTurn = 'false';
  input.disabled = !canPlay;
  paintBoard(word, changed, canPlay);

  if (canPlay) {
    onlineTurn.textContent = t('theirTurn', { name: getPlayer() });
    setNotice(t('selectPrompt'));
    return;
  }

  const lastWinner = sharedRoundWinners.at(-1);
  onlineTurn.textContent = t('sharedRoundWinner', { name: players[lastWinner] });
  const messages = [];
  if (status === 'blocked') messages.push(t('sharedDeadEnd'));
  if (roundsFinished === 2) {
    const winner = sharedRoundWinners[0];
    messages.push(winner === lastWinner ? t('winner', { name: players[winner] }) : t('draw'));
  }
  setNotice(messages.join(' '));
};

const focusAfterMove = (changed) => {
  if (rulesDialog.open || document.activeElement !== document.body) return;

  const previousTile = tileButtons[changed];
  const availableTile = previousTile && !previousTile.disabled
    ? previousTile
    : tileButtons.find((tile) => !tile.disabled);
  const nextAction = nextRound.hidden ? restart : nextRound;
  const focusTarget = input.disabled ? nextAction : availableTile;
  focusTarget?.focus();
};

const activeLocalBoard = () => mode === 'duo' ? sharedBoard : localBoards[localTurn];

const play = (word, changed) => {
  const seat = localTurn;
  const board = activeLocalBoard();
  board.word = word;
  board.changed = changed;
  board.used.add(word);

  if (word === round.goal) {
    board.status = 'solved';
  } else {
    board.next = findNextStep(word, round.goal, round.patterns, board.used);
    if (!board.next) board.status = 'blocked';
  }

  clearSelection();
  if (mode === 'duo') {
    if (board.status === 'playing') {
      localTurn = 1 - seat;
    } else {
      sharedRoundWinners.push(board.status === 'solved' ? seat : 1 - seat);
    }

    renderSharedBoard();
    focusAfterMove(changed);
    return;
  }

  const result = advanceRace(localBoards, seat);
  localTurn = result.turn;
  localWinner = result.winner;
  renderBotRace();
  if (isBotTurn()) {
    moveTimer = setTimeout(() => {
      const bot = localBoards[1];
      const changedByBot = [...bot.word].findIndex((letter, index) => {
        return letter !== bot.next[index];
      });
      let move = bot.next;

      if (!botDetoured && bot.next !== round.goal && localBoards[0].status !== 'solved') {
        // Keep the shortest continuation available after at most one extra move.
        const candidates = round.patterns.get(wordPattern(bot.word, changedByBot));
        const detour = candidates.find((candidate) => candidate !== bot.next
          && !bot.used.has(candidate)
          && candidate[changedByBot] !== round.goal[changedByBot]);
        if (detour) {
          move = detour;
          botDetoured = true;
        }
      }

      play(move, changedByBot);
    }, LOCAL_MOVE_DELAY_MS);
  } else {
    focusAfterMove(changed);
  }
};

const createLocalBoard = (firstStep) => ({
  changed: -1,
  next: firstStep,
  status: 'playing',
  used: new Set([round.start]),
  word: round.start,
});

const reset = (firstStep) => {
  clearTimeout(moveTimer);
  clearSelection();
  mode = document.querySelector('[name="mode"]:checked').value;
  localTurn = 0;
  nextRound.hidden = true;

  if (mode === 'duo') {
    sharedBoard = createLocalBoard(firstStep);
    sharedRoundWinners = [];
    renderSharedBoard();
    return;
  }

  localBoards = [createLocalBoard(firstStep), createLocalBoard(firstStep)];
  localWinner = null;
  botDetoured = false;
  renderBotRace();
};

nextRound.addEventListener('click', () => {
  if (mode !== 'duo' || nextRound.hidden) return;

  sharedBoard = createLocalBoard(findNextStep(round.start, round.goal, round.patterns, []));
  localTurn = 1;
  renderSharedBoard();
  tiles.querySelector(':enabled')?.focus();
});

const enterLetter = (commitRomaji = false) => {
  if (selected === null || tileButtons[selected].disabled) return;

  if (!input.value) {
    promptForLetter();
    return;
  }

  const raw = input.value.normalize('NFKC').toLowerCase();
  const letter = normalizeWord(input.value, round.language, !commitRomaji);

  // Согласная может быть только началом знака, например r → re → れ.
  if (round.language === 'ja' && !commitRomaji && letter === raw
    && /^[a-z]{1,3}$/.test(raw)) {
    const nasal = printWord('ん', round.language, round.script);
    const help = raw === 'n' ? ' ' + t('romajiNasal', { letter: nasal }) : '';
    setNotice(t('romajiProgress', { value: raw }) + help);
    return;
  }

  const current = mode === 'online' ? online.state.word : activeLocalBoard().word;
  const word = current.slice(0, selected) + letter + current.slice(selected + 1);
  input.value = '';

  const { letterError, pattern } = LANGUAGES[round.language];
  if (letter.length !== 1 || !pattern.test(letter)) {
    setNotice(t(letterError), true);
  } else if (letter === current[selected]) {
    setNotice(t('differentLetter'), true);
  } else if (mode === 'online') {
    sendOnlineMove(selected, letter);
  } else if (!round.words.has(word)) {
    const printed = printWord(word, round.language, round.script);
    setNotice(t('unknownQuoted', { word: printed }), true);
  } else if (activeLocalBoard().used.has(word)) {
    setNotice(t('repeated_word'), true);
  } else {
    play(word, selected);
  }
};

tiles.addEventListener('click', (event) => {
  const tile = event.target.closest('.tile');
  const index = tileButtons.indexOf(tile);

  if (index < 0 || tile.disabled) return;

  tileButtons[selected]?.setAttribute('aria-pressed', 'false');
  selected = index;
  tile.setAttribute('aria-pressed', 'true');
  input.value = '';
  promptForLetter();
  input.focus({ preventScroll: true });
});

input.addEventListener('input', (event) => {
  if (!event.isComposing) enterLetter();
});
input.addEventListener('compositionend', () => enterLetter());
input.addEventListener('blur', () => {
  if (selected === null) return;

  clearSelection();
  setNotice(t('selectPrompt'));
});
input.addEventListener('keydown', (event) => {
  if (selected === null || event.isComposing) return;

  if (event.key === 'Escape') tileButtons[selected].focus();
  if (event.key === 'Enter' && round.language === 'ja') {
    event.preventDefault();
    enterLetter(true);
  }
});

document.addEventListener('keydown', (event) => {
  if (game.hidden || input.disabled || event.isComposing || event.altKey || event.ctrlKey
    || event.metaKey || event.shiftKey) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

  const focusedTile = tileButtons.indexOf(event.target);

  if (event.target !== input && event.target !== document.body && focusedTile < 0) {
    return;
  }

  event.preventDefault();
  const direction = event.key === 'ArrowRight' ? 1 : -1;
  const origin = selected ?? focusedTile;
  const start = origin < 0 && direction < 0 ? 0 : origin;
  const tileCount = tileButtons.length;

  for (let step = 1; step <= tileCount; step += 1) {
    const index = (start + direction * step + tileCount) % tileCount;

    if (!tileButtons[index].disabled) {
      tileButtons[index].click();
      return;
    }
  }
});

const showSetupError = (message) => {
  setupError.textContent = message;
  setupError.hidden = !message;
};

const applyLocale = () => {
  locale = languagePicker.value;
  document.documentElement.lang = locale;
  for (const item of document.querySelectorAll('[data-i18n]')) {
    item.textContent = t(item.dataset.i18n);
  }
  for (const item of document.querySelectorAll('[data-i18n-label]')) {
    item.setAttribute('aria-label', t(item.dataset.i18nLabel));
  }

  const script = scriptPicker.value;
  const scriptTrigger = scriptField.querySelector('[role="combobox"]');
  scriptTrigger.textContent = t(script);
  const japanese = locale === 'ja';
  const { start, goal } = LANGUAGES[locale];
  startWord.value = japanese ? printWord(start, locale, script) : start;
  goalWord.value = japanese ? printWord(goal, locale, script) : goal;
  startWord.lang = locale;
  goalWord.lang = locale;
  scriptField.hidden = !japanese;
  languageField.classList.toggle('col-span-2', !japanese);
  setupHelp.textContent = t('setupHelp') + (japanese ? ' ' + t('kanaHelp') : '');
  updateModeSettings();
  showSetupError('');
};

languagePicker.addEventListener('change', () => {
  applyLocale();
  try {
    localStorage.setItem('word-ladder-locale', locale);
  } catch {
    // The locale remains active for this page.
  }
});

scriptPicker.addEventListener('change', () => {
  for (const field of [startWord, goalWord]) {
    const word = normalizeWord(field.value.trim(), 'ja');

    if (LANGUAGES.ja.pattern.test(word)) {
      field.value = printWord(word, 'ja', scriptPicker.value);
    }
  }
});

const DICTIONARY_ASSETS = JSON.parse(
  document.getElementById('dictionary-assets').textContent,
);
const dictionaryCache = new Map();

const storedDictionary = (url, source) => new Promise((resolve) => {
  const opening = indexedDB.open('word-ladder-dictionaries', 1);
  opening.onerror = opening.onblocked = () => resolve();
  opening.onupgradeneeded = () => opening.result.createObjectStore('lists');
  opening.onsuccess = () => {
    const database = opening.result;
    const reading = source === undefined;
    try {
      const transaction = database.transaction('lists', reading ? 'readonly' : 'readwrite');
      const lists = transaction.objectStore('lists');
      const request = reading ? lists.get(url) : lists.put(source, url);

      transaction.oncomplete = () => {
        database.close();
        resolve(request.result);
      };
      transaction.onabort = () => {
        database.close();
        resolve();
      };
    } catch {
      database.close();
      resolve();
    }
  };
}).catch(() => undefined);

const loadDictionary = async (language, length) => {
  const embedded = document.getElementById('dictionary-' + language);
  if (embedded) return embedded.textContent;
  if (location.protocol === 'file:') throw new Error('dictionaryFile');

  const asset = DICTIONARY_ASSETS[language]?.[length];
  if (!asset) return '';

  const url = new URL(asset, location.href).href;
  const cached = dictionaryCache.get(url);
  if (cached) return cached;

  const saved = await storedDictionary(url);
  if (saved) {
    dictionaryCache.set(url, saved);
    return saved;
  }

  const response = await fetch(url, {
    // The dictionary URL changes when its contents change.
    cache: 'force-cache',
    signal: AbortSignal.timeout(DICTIONARY_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('dictionaryUnavailable');

  const source = (await response.text()).trim();
  if (!source) throw new Error('dictionaryUnavailable');

  await storedDictionary(url, source);
  dictionaryCache.set(url, source);
  return source;
};

const convertWordField = (event) => {
  if (event.isComposing) return;

  const field = event.currentTarget;
  const value = convertKeyboardLayout(field.value, languagePicker.value);
  if (value === field.value) return;

  const { selectionDirection, selectionEnd, selectionStart } = field;
  field.value = value;
  field.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
};

for (const field of [startWord, goalWord]) {
  field.addEventListener('input', convertWordField);
  field.addEventListener('compositionend', convertWordField);
}

setup.addEventListener('input', () => showSetupError(''));
setup.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (setup.inert) return;

  const language = languagePicker.value;
  const script = language === 'ja' ? scriptPicker.value : '';
  const start = normalizeWord(startWord.value.trim(), language);
  const goal = normalizeWord(goalWord.value.trim(), language);
  const { pattern, wordError } = LANGUAGES[language];

  if (!pattern.test(start) || !pattern.test(goal)) {
    showSetupError(t(wordError));
    return;
  }

  if (start.length < MIN_WORD_LENGTH || goal.length < MIN_WORD_LENGTH) {
    showSetupError(t('minimum'));
    return;
  }

  if (start.length !== goal.length || start === goal) {
    showSetupError(t('sameLength'));
    return;
  }

  const config = { goal, language, script, start };
  if (document.querySelector('[name="mode"]:checked').value === 'online') {
    if (start.length > MAX_ONLINE_LENGTH) {
      showSetupError(t('tooLong', { maximum: MAX_ONLINE_LENGTH }));
      return;
    }
    createOnline(config);
    return;
  }

  let source;
  setup.inert = true;
  startButton.textContent = t('dictionaryLoading');

  try {
    source = await loadDictionary(language, start.length);
  } catch {
    source = undefined;
  } finally {
    setup.inert = false;
    startButton.textContent = t('start');
  }

  if (source === undefined) {
    showSetupError(t(location.protocol === 'file:' ? 'dictionaryFile' : 'dictionaryUnavailable'));
    startButton.focus();
    return;
  }

  const words = new Set(source.trim().split(/\s+/).filter((word) => {
    return word.length === start.length;
  }));
  words.add(start);
  words.add(goal);
  const patterns = buildPatterns(words);
  const firstStep = findNextStep(start, goal, patterns, []);

  if (!firstStep) {
    showSetupError(t('no_path'));
    return;
  }

  showBoard({ ...config, patterns, words });
  reset(firstStep);
  tiles.querySelector(':enabled')?.focus();
});

const showBoard = (config) => {
  round = config;
  const { goal, language, script } = config;
  tileButtons = [];
  const printedGoal = printWord(goal, language, script);
  const targetTiles = [...printedGoal].map((goalGlyph) => {
    const tile = document.createElement('button');
    const glyph = document.createElement('span');
    const targetTile = document.createElement('div');
    glyph.lang = language;
    tile.className = 'tile';
    tile.type = 'button';
    tile.setAttribute('aria-pressed', 'false');
    tile.append(glyph);
    const targetGlyph = glyph.cloneNode(false);
    targetGlyph.textContent = goalGlyph;
    targetTile.className = 'tile target-glyph';
    targetTile.setAttribute('aria-hidden', 'true');
    targetTile.append(targetGlyph);
    tileButtons.push(tile);
    return targetTile;
  });
  tiles.replaceChildren(...tileButtons);
  target.replaceChildren(...targetTiles);
  game.style.setProperty('--letters', printedGoal.length);
  target.lang = language;
  target.setAttribute('aria-label', printedGoal);
  setup.hidden = true;
  game.hidden = false;
};

let online = null;
let pendingCreate;
let guestToken;
let inviteId = new URL(location.href).searchParams.get('game');

const setInvite = (id) => {
  const url = new URL(location.href);
  if (id) url.searchParams.set('game', id);
  else url.searchParams.delete('game');
  historyReplace(url);
  inviteId = id;
};

const historyReplace = (url) => {
  try {
    window.history.replaceState(null, '', url);
  } catch {
    // Some browsers restrict URL changes when opening the standalone file.
  }
};

const serverUrl = (id, socket = false) => {
  const configured = document.querySelector('[name="word-ladder-server"]').content.trim();
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!configured && !local) throw new Error('unconfigured');

  const url = new URL(configured || 'http://127.0.0.1:8787');
  if (!['http:', 'https:'].includes(url.protocol)
    || (location.protocol === 'https:' && url.protocol !== 'https:')) {
    throw new Error('unconfigured');
  }
  const prefix = url.pathname.replace(/\/+$/, '');
  url.pathname = prefix + '/games/' + id + (socket ? '/socket' : '');
  url.search = '';
  url.hash = '';
  if (socket) url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url;
};

const roomRequest = async (id, payload) => {
  let url;
  try {
    url = serverUrl(id);
  } catch {
    throw new Error('unconfigured');
  }

  let response;
  try {
    response = await fetch(url, {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error('offline');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'offline');
  return data;
};

const seatStorage = (id, token) => {
  const key = 'word-ladder-seat:' + id;
  let persisted = false;
  try {
    if (token === undefined) {
      const savedSeat = localStorage.getItem(key);
      if (savedSeat) return savedSeat;
    } else if (token) {
      localStorage.setItem(key, token);
      persisted = true;
    } else localStorage.removeItem(key);
  } catch {
    // Use tab storage when persistent storage is unavailable.
  }
  try {
    if (token === undefined) return sessionStorage.getItem(key);
    if (token && !persisted) sessionStorage.setItem(key, token);
    else sessionStorage.removeItem(key);
  } catch {
    // Reconnection within this tab still works while it stays open.
  }
  return null;
};

const validName = (name) => name.length > 0 && name.length <= MAX_NAME_LENGTH
  && !/[\x00-\x1f\x7f]/.test(name);

const renderOnline = () => {
  const { connected, error, leaving, pending, seat, state } = online;
  const canPlay = state.simultaneous ? state.boards[seat].status === 'playing'
    : state.turn === seat;
  const ownTurn = connected && !leaving && !pending
    && state.phase === 'playing' && canPlay;
  const { boards, players, roundWinners: winners, winner } = state;
  if (boards) {
    renderRace([boards[seat], boards[1 - seat]],
      [players[seat], players[1 - seat]], 0, ownTurn);
  } else {
    showMatchScore(winners, players);
    raceProgress.hidden = true;
    input.disabled = !ownTurn;
    paintBoard(state.word, state.changed, ownTurn);
  }
  let status;
  if (error) status = t(error);
  else if (state.phase === 'finished') {
    if (winner === null) status = t('draw');
    else status = winner === seat ? t('won') : t('winner', { name: players[winner] });
  } else if (state.phase === 'blocked') status = t('blocked');
  else if (!connected) status = t(online.socket ? 'reconnecting' : 'loading');
  else if (state.phase === 'waiting') status = t('waiting');
  else if (pending) status = t('sending');
  else if (state.simultaneous && !canPlay) status = t('raceWaiting');
  else status = ownTurn ? t('yourTurn') : t('theirTurn', { name: players[state.turn] });

  turn.textContent = '';
  onlineTurn.hidden = false;
  onlineTurn.textContent = status;
  onlineTurn.dataset.ownTurn = String(ownTurn);
  invitePanel.hidden = seat !== 0 || state.phase !== 'waiting' || !!error;
  const canLeave = !error && seat === 1 && state.phase === 'playing';
  restart.textContent = t(canLeave ? 'leaveGame' : 'newGame');
  restart.disabled = !!leaving;
  if (!ownTurn || selected === null) {
    setNotice(ownTurn ? t('selectPrompt') : '');
  }
};

const reopenOnline = (session) => {
  const retry = async () => {
    if (online !== session) return;

    try {
      const data = await roomRequest(session.id, { action: 'resume', token: session.token });
      if (online !== session) return;
      session.state = data.state;
      openSocket(session);
    } catch (error) {
      if (online !== session) return;
      if (error.message === 'not_found') {
        showUnavailable();
        return;
      }
      if (['invalid_seat', 'unconfigured'].includes(error.message)) {
        session.error = error.message;
        renderOnline();
        return;
      }
      reopenOnline(session);
    }
  };
  session.retry = setTimeout(retry, session.delay);
  session.delay = Math.min(session.delay * 2, MAX_RECONNECT_DELAY_MS);
};

const openSocket = (session) => {
  const socket = new WebSocket(serverUrl(session.id, true), [
    WS_PROTOCOL, 'seat.' + session.token,
  ]);
  session.socket = socket;

  socket.addEventListener('message', (event) => {
    if (online !== session || session.socket !== socket) return;
    const message = JSON.parse(event.data);
    session.connected = true;
    session.delay = RECONNECT_DELAY_MS;
    const previous = session.state;
    const next = message.state;
    if (next && next.revision >= previous.revision) {
      const boardChanged = !previous.simultaneous
        || previous.boardRevision !== next.boardRevision || previous.phase !== next.phase
        || previous.boards[session.seat].status !== next.boards[session.seat].status;
      if (boardChanged) {
        session.pending = false;
        clearSelection();
      }
      session.state = next;
    }
    if (message.type === 'error') session.pending = false;
    renderOnline();
    if (message.type === 'error') setNotice(t(message.code), true);
  });
  socket.addEventListener('close', ({ code }) => {
    if (online !== session || session.socket !== socket) return;
    if (code === 4002 || (code === 4001 && session.leaving)) {
      seatStorage(session.id, null);
      leaveGame();
      return;
    }
    if (code === 4001) {
      showUnavailable();
      return;
    }
    session.connected = false;
    session.pending = false;
    clearSelection();
    renderOnline();
    if (!session.error) reopenOnline(session);
  });
};

const enterOnline = (id, token, { seat, state }) => {
  seatStorage(id, token);
  setInvite(id);
  online = {
    id,
    seat,
    state,
    token,
    connected: false,
    delay: RECONNECT_DELAY_MS,
    pending: false,
  };
  mode = 'online';
  joinForm.hidden = true;
  showBoard(state.config);
  const url = new URL(location.href);
  url.searchParams.set('game', id);
  inviteLink.value = url.href;
  renderOnline();
  openSocket(online);
};

const createOnline = async (config) => {
  const name = hostName.value.trim();
  if (!validName(name)) {
    showSetupError(t('invalid_name'));
    hostName.focus();
    return;
  }

  setup.inert = true;
  startButton.textContent = t('loading');
  try {
    const fingerprint = JSON.stringify({ config, name });
    if (pendingCreate?.fingerprint !== fingerprint) {
      pendingCreate = { fingerprint, id: crypto.randomUUID(), token: crypto.randomUUID() };
    }
    const { id, token } = pendingCreate;
    const result = await roomRequest(id, {
      action: 'create', config, name, race: true, simultaneous: true, token,
    });
    enterOnline(id, token, result);
    pendingCreate = null;
  } catch (error) {
    showSetupError(t(error.message));
  } finally {
    setup.inert = false;
    startButton.textContent = t('create');
  }
};

const showJoinError = (code) => {
  joinError.textContent = code ? t(code) : '';
  joinError.hidden = !code;
};

const submitJoin = async (id, payload) => {
  joinButton.disabled = true;
  joinButton.textContent = t('loading');
  showJoinError('');
  try {
    const result = await roomRequest(id, payload);
    if (inviteId !== id) return;
    enterOnline(id, payload.token, result);
  } catch (error) {
    if (inviteId !== id) return;
    if (error.message === 'not_found') {
      showUnavailable();
      return;
    }
    joinForm.hidden = false;
    if (payload.action === 'resume' && error.message === 'invalid_seat') {
      seatStorage(id, null);
      guestToken = null;
    }
    showJoinError(error.message);
  } finally {
    joinButton.disabled = false;
    joinButton.textContent = t('join');
  }
};

const initializeInvite = async () => {
  if (inviteId === null) return;
  setup.hidden = true;
  if (!GAME_UUID.test(inviteId)) {
    joinForm.hidden = false;
    showJoinError('invalidLink');
    joinButton.disabled = true;
    return;
  }

  inviteId = inviteId.toLowerCase();
  const id = inviteId;
  const token = seatStorage(id);
  if (token) {
    submitJoin(id, { action: 'resume', token });
    return;
  }

  try {
    await roomRequest(id, { action: 'status' });
  } catch (error) {
    if (inviteId !== id) return;
    if (error.message === 'not_found') {
      showUnavailable();
      return;
    }
    showJoinError(error.message);
  }

  if (inviteId !== id) return;
  joinForm.hidden = false;
  guestName.focus();
};

const leaveGame = (keepInvite = false) => {
  const session = online;
  online = null;
  if (session) {
    clearTimeout(session.retry);
    session.socket?.close();
  }
  clearTimeout(moveTimer);
  clearSelection();
  if (!keepInvite && inviteId !== null) setInvite(null);
  guestToken = null;
  onlineTurn.hidden = true;
  nextRound.hidden = true;
  invitePanel.hidden = true;
  restart.disabled = false;
  restart.textContent = t('newGame');
  game.hidden = true;
  joinForm.hidden = true;
  unavailableGame.hidden = !keepInvite;
  setup.hidden = keepInvite;
  if (keepInvite) unavailableHeading.focus();
  else startWord.focus();
};

const showUnavailable = () => {
  seatStorage(inviteId, null);
  leaveGame(true);
};

const leaveOnline = async (session) => {
  session.leaving = true;
  clearSelection();
  renderOnline();

  try {
    const action = session.seat === 0 ? 'end' : 'leave';
    await roomRequest(session.id, { action, token: session.token });
  } catch (error) {
    if (online !== session) return;
    if (error.message !== 'invalid_seat' && error.message !== 'not_found') {
      session.leaving = false;
      renderOnline();
      setNotice(t(error.message), true);
      return;
    }
  }

  if (online !== session) return;
  seatStorage(session.id, null);
  leaveGame();
};

const sendOnlineMove = (position, letter) => {
  if (!online.connected || online.pending || online.socket.readyState !== WebSocket.OPEN) return;

  const revision = online.state.boardRevision ?? online.state.revision;
  online.socket.send(JSON.stringify({ letter, position, revision, type: 'move' }));
  online.pending = true;
  clearSelection();
  renderOnline();
};

const updateModeSettings = () => {
  const onlineMode = document.querySelector('[name="mode"]:checked').value === 'online';
  hostNameField.hidden = !onlineMode;
  startButton.textContent = t(onlineMode ? 'create' : 'start');
};

for (const choice of document.querySelectorAll('[name="mode"]')) {
  choice.addEventListener('change', () => {
    updateModeSettings();
    showSetupError('');
  });
}

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!inviteId || !GAME_UUID.test(inviteId) || joinButton.disabled) return;
  const name = guestName.value.trim();
  if (!validName(name)) {
    showJoinError('invalid_name');
    guestName.focus();
    return;
  }
  try {
    guestToken ??= seatStorage(inviteId) ?? crypto.randomUUID();
    submitJoin(inviteId, { action: 'join', name, token: guestToken });
  } catch {
    showJoinError('offline');
  }
});
guestName.addEventListener('input', () => showJoinError(''));
joinBack.addEventListener('click', () => leaveGame());
unavailableBack.addEventListener('click', () => leaveGame());
restart.addEventListener('click', () => {
  if (online && !online.error && (online.seat === 0 || online.state.phase === 'playing')) {
    if (!online.leaving) leaveOnline(online);
  } else {
    leaveGame();
  }
});

copyInvite.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(inviteLink.value);
    setNotice(t('copied'));
  } catch {
    inviteLink.select();
    setNotice(t('copyFailed'));
  }
});

try {
  const savedLocale = localStorage.getItem('word-ladder-locale');
  if (savedLocale && Object.hasOwn(STRINGS, savedLocale)) locale = savedLocale;
} catch {
  // Fall back to browser preferences when storage is unavailable.
}
if (languagePicker.value !== locale) selectLanguage(locale);
applyLocale();
initializeInvite();
