import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStaleLeaseFilter } from '../services/automationLockService.js';

test('buildStaleLeaseFilter reclaims leases expired or inactive for five minutes', () => {
  const now = new Date('2026-11-11T08:00:00.000Z');
  const filter = buildStaleLeaseFilter('channel-123', now);
  const staleBefore = new Date('2026-11-11T07:55:00.000Z');

  assert.equal(filter.channelId, 'channel-123');
  assert.equal(filter.$or[0].leaseUntil.$lte.getTime(), now.getTime());
  assert.equal(filter.$or[1].updatedAt.$lte.getTime(), staleBefore.getTime());
  assert.equal(filter.$or[2].updatedAt.$exists, false);
  assert.equal(filter.$or[2].createdAt.$lte.getTime(), staleBefore.getTime());
});
