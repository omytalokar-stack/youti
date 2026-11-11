import assert from 'node:assert/strict';
import test from 'node:test';
import { fitSubtitleBeatsToDuration } from '../services/subtitleTiming.js';

test('fitSubtitleBeatsToDuration preserves timings that already match the voiceover', () => {
  const beats = [
    { start: 0, end: 2, text: 'पहला', highlightedWord: 'पहला' },
    { start: 2, end: 5, text: 'दूसरा', highlightedWord: 'दूसरा' },
  ];

  assert.equal(fitSubtitleBeatsToDuration(beats, 5), beats);
});

test('fitSubtitleBeatsToDuration scales subtitle timings to the voiceover', () => {
  const beats = [
    { start: 0, end: 4, text: 'पहला', highlightedWord: 'पहला' },
    { start: 4, end: 10, text: 'दूसरा', highlightedWord: 'दूसरा' },
  ];

  assert.deepEqual(fitSubtitleBeatsToDuration(beats, 8), [
    { start: 0, end: 3.2, text: 'पहला', highlightedWord: 'पहला' },
    { start: 3.2, end: 8, text: 'दूसरा', highlightedWord: 'दूसरा' },
  ]);
});

test('fitSubtitleBeatsToDuration stretches long script captions across a longer voiceover', () => {
  const beats = Array.from({ length: 18 }, (_, index) => ({
    start: index,
    end: index + 1,
    text: `part ${index}`,
    highlightedWord: String(index),
  }));

  const fitted = fitSubtitleBeatsToDuration(beats, 23);

  assert.equal(fitted[0].start, 0);
  assert.equal(fitted.at(-1).end, 23);
  assert.ok(fitted.every((beat, index) => index === 0 || beat.start >= fitted[index - 1].end));
});
