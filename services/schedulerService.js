import cron from 'node-cron';
import YouTubeCredential from '../models/YouTubeCredential.js';
import { publishAutomatedShort } from './automationService.js';
import { claimChannelLease, releaseChannelLease } from './automationLockService.js';

const DEFAULT_SCHEDULE = '0 9 * * *';
let scheduledTask = null;
let scheduleInProgress = false;

async function runScheduledAutomation() {
  if (scheduleInProgress) {
    console.warn('[automation] Previous scheduled run is still in progress; skipping this tick.');
    return;
  }
  scheduleInProgress = true;
  try {
    const channelIds = await YouTubeCredential.distinct('channelId');
    for (const channelId of channelIds) {
      let leaseId;
      try {
        leaseId = await claimChannelLease(channelId);
        if (!leaseId) {
          console.warn(`[automation] Skipping ${channelId}; another worker holds its publishing lease.`);
          continue;
        }
        const result = await publishAutomatedShort(channelId);
        console.log(`[automation] Published ${result.url} (${result.privacyStatus}) for channel ${channelId}.`);
      } catch (error) {
        console.error(`[automation] Publishing failed for channel ${channelId}:`, error);
      } finally {
        if (leaseId) {
          await releaseChannelLease(channelId, leaseId).catch((error) => {
            console.error(`[automation] Could not release publishing lease for channel ${channelId}:`, error);
          });
        }
      }
    }
  } catch (error) {
    console.error('[automation] Scheduled channel scan failed:', error);
  } finally {
    scheduleInProgress = false;
  }
}

export function startAutomationScheduler() {
  const configuredSchedule = process.env.AUTOMATION_CRON?.trim();
  if (configuredSchedule?.toLowerCase() === 'off' || configuredSchedule?.toLowerCase() === 'disabled') {
    console.log('[automation] Scheduled publishing is disabled by AUTOMATION_CRON.');
    return null;
  }
  const schedule = configuredSchedule || DEFAULT_SCHEDULE;
  const timezone = process.env.AUTOMATION_TIMEZONE || 'America/Los_Angeles';
  if (!cron.validate(schedule)) {
    throw new Error('AUTOMATION_CRON must be a valid cron expression, "off", or "disabled".');
  }

  scheduledTask = cron.schedule(schedule, () => {
    void runScheduledAutomation();
  }, { timezone });
  console.log(`[automation] Public publishing scheduled with "${schedule}" in ${timezone}.`);
  return scheduledTask;
}

export function stopAutomationScheduler() {
  scheduledTask?.stop();
  scheduledTask = null;
}
