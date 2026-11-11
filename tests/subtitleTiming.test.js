import assert from 'node:assert/strict';
import test from 'node:test';
import { fitSubtitleBeatsToDuration } from '../services/subtitleTiming.js';

test('fitSubtitleBeatsToDuration preserves timings that fit the voiceover', () => {
  const beats = [
    { start: 0, end: 2, text: 'पहला', highlightedWord: 'पहला' },
    { start: 2, end: 4, text: 'दूसरा', highlightedWord: 'दूसरा' },
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
