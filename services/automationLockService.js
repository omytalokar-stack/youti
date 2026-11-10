import { randomUUID } from 'node:crypto';
import AutomationLock from '../models/AutomationLock.js';

const LEASE_DURATION_MS = 30 * 60 * 1000;

export async function claimChannelLease(channelId) {
  const now = new Date();
  const leaseId = randomUUID();
  const leaseUntil = new Date(now.getTime() + LEASE_DURATION_MS);
  const existing = await AutomationLock.findOneAndUpdate(
    { channelId, leaseUntil: { $lte: now } },
    { $set: { leaseId, leaseUntil } },
    { new: true },
  );
  if (existing) {
    return leaseId;
  }

  try {
    await AutomationLock.create({ channelId, leaseId, leaseUntil });
    return leaseId;
  } catch (error) {
    if (error.code === 11000) {
      return null;
    }
    throw error;
  }
}

export async function releaseChannelLease(channelId, leaseId) {
  await AutomationLock.deleteOne({ channelId, leaseId });
}
