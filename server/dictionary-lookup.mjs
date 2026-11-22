import { DICTIONARIES } from './dictionaries.mjs';
import { buildPatterns } from './game-rules.mjs';

const MAX_CACHED_DICTIONARIES = 2;
const cache = new Map();

const getDictionary = (language, length) => {
  const key = `${language}:${length}`;
  let dictionary = cache.get(key);

  if (dictionary) {
    cache.delete(key);
  } else {
    if (cache.size >= MAX_CACHED_DICTIONARIES) cache.delete(cache.keys().next().value);

    const data = DICTIONARIES[language][length];
    const words = new Set(data ? data.split('\n') : []);
    dictionary = { patterns: buildPatterns(words), words };
  }

  cache.set(key, dictionary);
  return dictionary;
};

const dictionaryFor = ({ goal, language, start }) => {
  const { patterns, words } = getDictionary(language, start.length);
  const endpoints = [start, goal].filter((word) => !words.has(word));

  if (endpoints.length === 0) return { hasWord: (word) => words.has(word), patterns };

  const additions = buildPatterns(endpoints);

  return {
    hasWord: (word) => words.has(word) || word === start || word === goal,
    patterns: {
      get: (key) => {
        const base = patterns.get(key) ?? [];
        const extra = additions.get(key);

        return extra ? base.concat(extra) : base;
      },
    },
  };
};

export { dictionaryFor };
