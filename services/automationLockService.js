import { randomUUID } from 'node:crypto';
import AutomationLock from '../models/AutomationLock.js';

const LEASE_DURATION_MS = 5 * 60 * 1000;
const LEASE_HEARTBEAT_MS = 60 * 1000;
const leaseHeartbeats = new Map();

export function buildStaleLeaseFilter(channelId, now = new Date()) {
  const staleBefore = new Date(now.getTime() - LEASE_DURATION_MS);
  return {
    channelId,
    $or: [
      { leaseUntil: { $lte: now } },
      { updatedAt: { $lte: staleBefore } },
      { updatedAt: { $exists: false }, createdAt: { $lte: staleBefore } },
    ],
  };
}

function startLeaseHeartbeat(channelId, leaseId) {
  const heartbeat = async () => {
    try {
      const result = await AutomationLock.updateOne(
        { channelId, leaseId },
        { $set: { leaseUntil: new Date(Date.now() + LEASE_DURATION_MS) } },
      );
      if (result.matchedCount === 0) {
        clearInterval(interval);
        leaseHeartbeats.delete(leaseId);
        console.warn(`[automation] Lease heartbeat stopped because the lease was replaced for channel ${channelId}.`);
      }
    } catch (error) {
      console.error(`[automation] Could not renew publishing lease for channel ${channelId}:`, error);
    }
  };
  const interval = setInterval(heartbeat, LEASE_HEARTBEAT_MS);
  interval.unref();
  leaseHeartbeats.set(leaseId, interval);
}

export async function claimChannelLease(channelId) {
  const now = new Date();
  const leaseId = randomUUID();
  const leaseUntil = new Date(now.getTime() + LEASE_DURATION_MS);
  const existing = await AutomationLock.findOneAndUpdate(
    buildStaleLeaseFilter(channelId, now),
    { $set: { leaseId, leaseUntil } },
    { new: true },
  );
  if (existing) {
    startLeaseHeartbeat(channelId, leaseId);
    return leaseId;
  }

  try {
    await AutomationLock.create({ channelId, leaseId, leaseUntil });
    startLeaseHeartbeat(channelId, leaseId);
    return leaseId;
  } catch (error) {
    if (error.code === 11000) {
      return null;
    }
    throw error;
  }
}

export async function releaseChannelLease(channelId, leaseId) {
  const heartbeat = leaseHeartbeats.get(leaseId);
  if (heartbeat) {
    clearInterval(heartbeat);
    leaseHeartbeats.delete(leaseId);
  }
  await AutomationLock.deleteOne({ channelId, leaseId });
}
