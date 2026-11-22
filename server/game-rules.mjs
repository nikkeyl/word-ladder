export const WORD_PATTERNS = {
  en: /^[a-z]+$/,
  ja: /^[ぁ-ゖー]+$/,
  ru: /^[а-яё]+$/,
};
export const MIN_WORD_LENGTH = 3;
export const MAX_ONLINE_LENGTH = 32;
export const MAX_NAME_LENGTH = 40;
export const GAME_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const WS_PROTOCOL = 'word-ladder';

const wordPattern = (word, position) => {
  return word.slice(0, position) + '*' + word.slice(position + 1);
};

export const buildPatterns = (words) => {
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
export const findNextStep = (current, goal, patterns, blocked) => {
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
