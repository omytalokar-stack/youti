import assert from 'node:assert/strict';
import test from 'node:test';
import { getScheduleCycleDate } from '../services/automationScheduleStateService.js';

test('daily scheduled cycle begins at 16:00 Asia/Kolkata, not 16:00 UTC', () => {
  const beforeStart = new Date('2026-11-14T10:29:59.999Z');
  const atStart = new Date('2026-11-14T10:30:00.000Z');

  assert.equal(getScheduleCycleDate(beforeStart, 'Asia/Kolkata', 16, '', ''), null);
  assert.equal(getScheduleCycleDate(atStart, 'Asia/Kolkata', 16, '', ''), '2026-11-14');
});

test('an unfinished cycle remains retryable before the next daily start', () => {
  const beforeStart = new Date('2026-11-14T04:00:00.000Z');

  assert.equal(
    getScheduleCycleDate(beforeStart, 'Asia/Kolkata', 16, '2026-11-13', '2026-11-12'),
    '2026-11-13',
  );
});
