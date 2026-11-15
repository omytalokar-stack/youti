import cron from 'node-cron';
import AutomationScheduleState from '../models/AutomationScheduleState.js';
import YouTubeCredential from '../models/YouTubeCredential.js';
import { publishAutomatedShort } from './automationService.js';
import {
  getScheduleCycleDate,
  markScheduleCycleSuccessful,
  recordAutomationRun,
} from './automationScheduleStateService.js';
import { claimChannelLease, releaseChannelLease } from './automationLockService.js';

const DEFAULT_DAILY_SCHEDULE = '0 16 * * *';
const RETRY_SCHEDULE = '*/30 * * * *';
const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const DEFAULT_START_HOUR = 16;
let scheduledTask = null;
let retryTask = null;
let scheduleInProgress = false;

async function runScheduledAutomation(timezone, startHour) {
  if (scheduleInProgress) {
    console.warn('[automation] Skipping because a cycle check is already in progress in this process.');
    return;
  }
  scheduleInProgress = true;
  try {
    console.info('[automation] Cycle check: loading connected channels.');
    const channelIds = await YouTubeCredential.distinct('channelId');
    for (const channelId of channelIds) {
      let leaseId;
      let cycleDate;
      let step = 'checking-schedule-state';
      try {
        let scheduleState = await AutomationScheduleState.findOne({ channelId });
        cycleDate = getScheduleCycleDate(
          new Date(),
          timezone,
          startHour,
          scheduleState?.activeCycleDate,
          scheduleState?.lastSuccessfulCycleDate,
        );
        if (!cycleDate) {
          console.info(`[automation] Skipping because the ${String(startHour).padStart(2, '0')}:00 ${timezone} start time has not arrived for channel ${channelId}.`);
          continue;
        }
        if (scheduleState?.lastSuccessfulCycleDate === cycleDate) {
          console.info(`[automation] Skipping because channel ${channelId} already succeeded for ${cycleDate}.`);
          continue;
        }
        console.info(`[automation] Cycle check: channel ${channelId} has a pending cycle for ${cycleDate}.`);

        step = 'claiming-publish-lease';
        leaseId = await claimChannelLease(channelId);
        if (!leaseId) {
          console.info(`[automation] Skipping because another worker holds the publishing lease for channel ${channelId}.`);
          continue;
        }

        scheduleState = await AutomationScheduleState.findOne({ channelId });
        cycleDate = getScheduleCycleDate(
          new Date(),
          timezone,
          startHour,
          scheduleState?.activeCycleDate,
          scheduleState?.lastSuccessfulCycleDate,
        );
        if (!cycleDate || scheduleState?.lastSuccessfulCycleDate === cycleDate) {
          console.info(`[automation] Skipping because channel ${channelId} no longer has a pending cycle.`);
          continue;
        }

        step = 'recording-cycle-start';
        await recordAutomationRun(channelId, {
          status: 'running',
          step: 'publishing',
          cycleDate,
        });

        step = 'publishing';
        const result = await publishAutomatedShort(channelId);

        step = 'marking-cycle-success';
        await markScheduleCycleSuccessful(channelId, cycleDate);
        console.log(`[automation] Published ${result.url} (${result.privacyStatus}) for channel ${channelId}.`);
        try {
          await recordAutomationRun(channelId, {
            status: 'succeeded',
            step: 'completed',
          });
        } catch (error) {
          console.error(`[automation] Upload succeeded for channel ${channelId}, but run status could not be saved:`, error);
        }
      } catch (error) {
        const failureStep = error.publishStage || step;
        console.error(`[automation] Cycle failed at step ${failureStep} for channel ${channelId}: ${error.message}`);
        console.error(error);
        try {
          await recordAutomationRun(channelId, {
            status: 'failed',
            step: failureStep,
            error: error.message,
            cycleDate,
          });
        } catch (statusError) {
          console.error(`[automation] Could not persist the failed cycle status for channel ${channelId}:`, statusError);
        }
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

export function triggerAutomationCycle() {
  const timezone = process.env.AUTOMATION_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
  const startHour = Number(process.env.AUTOMATION_START_HOUR ?? DEFAULT_START_HOUR);
  if (scheduleInProgress) {
    return false;
  }
  void runScheduledAutomation(timezone, startHour);
  return true;
}

export function startAutomationScheduler() {
  const configuredSchedule = process.env.AUTOMATION_CRON?.trim();
  if (configuredSchedule?.toLowerCase() === 'off' || configuredSchedule?.toLowerCase() === 'disabled') {
    console.log('[automation] Scheduled publishing is disabled by AUTOMATION_CRON.');
    return null;
  }
  if (configuredSchedule && configuredSchedule !== DEFAULT_DAILY_SCHEDULE && configuredSchedule !== RETRY_SCHEDULE) {
    console.warn(
      `[automation] Ignoring legacy AUTOMATION_CRON="${configuredSchedule}"; using the configured daily start hour and 30-minute retries.`,
    );
  }

  const timezone = process.env.AUTOMATION_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
  const startHour = Number(process.env.AUTOMATION_START_HOUR ?? DEFAULT_START_HOUR);
  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
    console.error('[automation] Invalid AUTOMATION_START_HOUR. Scheduled publishing is disabled; set an hour from 0 to 23.');
    return null;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    console.error(
      `[automation] Invalid AUTOMATION_TIMEZONE "${timezone}". Scheduled publishing is disabled; set a valid IANA timezone such as "Asia/Kolkata".`,
    );
    return null;
  }

  const dailySchedule = `0 ${startHour} * * *`;
  scheduledTask = cron.schedule(dailySchedule, () => {
    void runScheduledAutomation(timezone, startHour);
  }, { timezone });
  retryTask = cron.schedule(RETRY_SCHEDULE, () => {
    void runScheduledAutomation(timezone, startHour);
  }, { timezone });
  console.log(
    `[automation] Public publishing starts daily at ${String(startHour).padStart(2, '0')}:00 in ${timezone} (scheduler: "${dailySchedule}"); retries run every 30 minutes until that cycle succeeds (retry scheduler: "${RETRY_SCHEDULE}").`,
  );
  return scheduledTask;
}

export function stopAutomationScheduler() {
  scheduledTask?.stop();
  retryTask?.stop();
  scheduledTask = null;
  retryTask = null;
}
