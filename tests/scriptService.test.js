import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  countSpokenWords,
  formatRecentVideoTopics,
  generateFallbackShort,
  selectTopicDirection,
  TOPIC_CATEGORIES,
} from '../services/scriptService.js';

test('topic directions select a category and a sub-niche', () => {
  assert.deepEqual(selectTopicDirection(() => 0), {
    category: 'Space Mysteries',
    subNiche: 'black hole boundaries',
  });
  assert.equal(TOPIC_CATEGORIES.length, 6);
});

test('recent video history includes titles, topics, and tags for prompt context', () => {
  assert.equal(
    formatRecentVideoTopics([{ title: 'Moon Mystery', topic: 'lunar distance', tags: ['moon', 'space'] }]),
    '- Moon Mystery (topic/hook: lunar distance) [tags: moon, space]',
  );
  assert.match(formatRecentVideoTopics([]), /No recently published videos/);
});

test('fallback scripts come from a diverse pool and do not repeat consecutively', async () => {
  const memory = {
    lastFallbackScriptIndex: -1,
    async save() {},
  };
  const first = await generateFallbackShort(memory, () => 0);
  const firstIndex = memory.lastFallbackScriptIndex;
  const second = await generateFallbackShort(memory, () => 0);

  assert.notEqual(memory.lastFallbackScriptIndex, firstIndex);
  assert.notEqual(second.title, first.title);
  assert.equal(first.subtitleBeats.map(({ text }) => text).join(' '), first.script);
  assert.ok(countSpokenWords(first.script) >= 55 && countSpokenWords(first.script) <= 70);
  assert.equal(first.subtitleBeats.at(-1).end, 20 + ((countSpokenWords(first.script) - 55) / 15) * 5);
  assert.ok(first.subtitleBeats.every(({ start, end }) => start >= 0 && end <= 25 && end > start));
});

test('every configured fallback script targets 55 to 70 spoken words', async () => {
  const fallbackScripts = JSON.parse(await readFile(new URL('../config/fallbackScripts.json', import.meta.url), 'utf8'));

  assert.ok(fallbackScripts.length >= 20);
  assert.ok(fallbackScripts.every(({ script }) => {
    const wordCount = countSpokenWords(script);
    return wordCount >= 55 && wordCount <= 70;
  }));
});
