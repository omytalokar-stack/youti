import AutomationScheduleState from '../models/AutomationScheduleState.js';

function localDateParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function getLocalDate({ year, month, day }) {
  return `${year}-${month}-${day}`;
}

export function getScheduleCycleDate(now, timezone, startHour, activeCycleDate, lastSuccessfulCycleDate) {
  const parts = localDateParts(now, timezone);
  const today = getLocalDate(parts);
  if (Number(parts.hour) >= startHour) {
    return today;
  }
  if (activeCycleDate && activeCycleDate !== lastSuccessfulCycleDate) {
    return activeCycleDate;
  }
  return null;
}

export async function markScheduleCycleSuccessful(channelId, cycleDate) {
  return AutomationScheduleState.findOneAndUpdate(
    { channelId },
    { $set: { activeCycleDate: cycleDate, lastSuccessfulCycleDate: cycleDate } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
}

export async function markManualPublishAsScheduledSuccess(channelId, now = new Date()) {
  const timezone = process.env.AUTOMATION_TIMEZONE?.trim() || 'Asia/Kolkata';
  const startHour = Number(process.env.AUTOMATION_START_HOUR ?? 16);
  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
    throw new Error('Cannot update scheduled cycle after manual publish: AUTOMATION_START_HOUR must be an hour from 0 to 23.');
  }
  const state = await AutomationScheduleState.findOne({ channelId });
  const cycleDate = getScheduleCycleDate(
    now,
    timezone,
    startHour,
    state?.activeCycleDate,
    state?.lastSuccessfulCycleDate,
  );
  if (!cycleDate || state?.lastSuccessfulCycleDate === cycleDate) {
    return false;
  }
  await markScheduleCycleSuccessful(channelId, cycleDate);
  return true;
}
