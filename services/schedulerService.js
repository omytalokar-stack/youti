import cron from 'node-cron';
import AutomationScheduleState from '../models/AutomationScheduleState.js';
import YouTubeCredential from '../models/YouTubeCredential.js';
import { publishAutomatedShort } from './automationService.js';
import { getScheduleCycleDate, markScheduleCycleSuccessful } from './automationScheduleStateService.js';
import { claimChannelLease, releaseChannelLease } from './automationLockService.js';

const DEFAULT_SCHEDULE = '*/30 * * * *';
const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const DEFAULT_START_HOUR = 16;
let scheduledTask = null;
let scheduleInProgress = false;

async function runScheduledAutomation(timezone, startHour) {
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
        let scheduleState = await AutomationScheduleState.findOne({ channelId });
        const cycleDate = getScheduleCycleDate(
          new Date(),
          timezone,
          startHour,
          scheduleState?.activeCycleDate,
          scheduleState?.lastSuccessfulCycleDate,
        );
        if (!cycleDate || scheduleState?.lastSuccessfulCycleDate === cycleDate) {
          continue;
        }
        await AutomationScheduleState.findOneAndUpdate(
          { channelId },
          { $set: { activeCycleDate: cycleDate } },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
        );
        const result = await publishAutomatedShort(channelId);
        await markScheduleCycleSuccessful(channelId, cycleDate);
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
  const timezone = process.env.AUTOMATION_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
  const startHour = Number(process.env.AUTOMATION_START_HOUR ?? DEFAULT_START_HOUR);
  if (!cron.validate(schedule)) {
    throw new Error('AUTOMATION_CRON must be a valid cron expression, "off", or "disabled".');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    console.error(
      `[automation] Invalid AUTOMATION_TIMEZONE "${timezone}". Scheduled publishing is disabled; set a valid IANA timezone such as "Asia/Kolkata".`,
    );
    return null;
  }
  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
    console.error('[automation] Invalid AUTOMATION_START_HOUR. Scheduled publishing is disabled; set an hour from 0 to 23.');
    return null;
  }

  scheduledTask = cron.schedule(schedule, () => {
    void runScheduledAutomation(timezone, startHour);
  }, { timezone });
  console.log(
    `[automation] Public publishing starts daily at ${String(startHour).padStart(2, '0')}:00 in ${timezone}; retries run every 30 minutes until that cycle succeeds (scheduler: "${schedule}").`,
  );
  return scheduledTask;
}

export function stopAutomationScheduler() {
  scheduledTask?.stop();
  scheduledTask = null;
}
