const { DateTime } = require('luxon');
const config = require('../config');

/**
 * Given a webinar tag (e.g. "tuesday 11am"), compute the next occurrence
 * of that webinar in CST timezone.
 *
 * If the current time is past this week's occurrence, returns next week's.
 */
function getNextWebinarDate(webinarTag, fromDate = null) {
  const schedule = config.webinarSchedule[webinarTag.toLowerCase()];
  if (!schedule) {
    throw new Error(`Unknown webinar tag: ${webinarTag}`);
  }

  const now = fromDate
    ? DateTime.fromJSDate(fromDate).setZone('America/Chicago')
    : DateTime.now().setZone('America/Chicago');

  // Get this week's occurrence
  let webinarDate = now
    .startOf('week') // Monday in Luxon
    .set({
      weekday: schedule.dayOfWeek === 0 ? 7 : schedule.dayOfWeek, // Luxon: 1=Mon, 7=Sun
      hour: schedule.hourCST,
      minute: schedule.minuteCST,
      second: 0,
      millisecond: 0,
    });

  // If we've already passed this week's webinar, go to next week
  if (webinarDate <= now) {
    webinarDate = webinarDate.plus({ weeks: 1 });
  }

  return webinarDate;
}

/**
 * Get the 24-hour-before cutoff time for transitioning from Call 1 to Call 2.
 */
function get24HourCutoff(webinarTag, fromDate = null) {
  const webinarDate = getNextWebinarDate(webinarTag, fromDate);
  return webinarDate.minus({ hours: 24 });
}

/**
 * Get the 30-minute-before cutoff (stop calling after this).
 */
function getStopCallingCutoff(webinarTag, fromDate = null) {
  const webinarDate = getNextWebinarDate(webinarTag, fromDate);
  return webinarDate.minus({ minutes: 30 });
}

/**
 * Determine which call phase a contact should be in.
 * - If registered < 24 hours before webinar: SECOND_CALL only
 * - If registered >= 24 hours before webinar but now < 24 hours: SECOND_CALL
 * - Otherwise: FIRST_CALL
 */
function determineCallPhase(webinarTag, registeredAt, fromDate = null) {
  const now = fromDate
    ? DateTime.fromJSDate(fromDate).setZone('America/Chicago')
    : DateTime.now().setZone('America/Chicago');

  const webinarDate = getNextWebinarDate(webinarTag, fromDate);
  const cutoff24h = webinarDate.minus({ hours: 24 });
  const registeredDT = DateTime.fromJSDate(registeredAt).setZone('America/Chicago');

  // If registered less than 24 hours before webinar, skip to Call 2
  if (registeredDT >= cutoff24h) {
    return 'SECOND_CALL';
  }

  // If we're now within 24 hours of the webinar, switch to Call 2
  if (now >= cutoff24h) {
    return 'SECOND_CALL';
  }

  return 'FIRST_CALL';
}

/**
 * Check if we should stop calling (30 minutes before webinar).
 */
function shouldStopCalling(webinarTag, fromDate = null) {
  const now = fromDate
    ? DateTime.fromJSDate(fromDate).setZone('America/Chicago')
    : DateTime.now().setZone('America/Chicago');

  const stopCutoff = getStopCallingCutoff(webinarTag, fromDate);
  return now >= stopCutoff;
}

/**
 * Get the final allowed Call 2 attempt time based on call windows.
 *
 * Rule: stop Call 2 at the last call interval BEFORE webinar start time.
 * Example: webinar at 5:00 PM PST and windows [9, 13, 17] => final attempt is 1:00 PM PST.
 *
 * @param {string} webinarTag
 * @param {number[]} callWindowsPST - PST hours in 24h format (e.g. [9, 13, 17])
 * @param {Date} [fromDate]
 */
function getCall2StopWindow(webinarTag, callWindowsPST = [9, 13, 17], fromDate = null) {
  const webinarDateCST = getNextWebinarDate(webinarTag, fromDate);
  const webinarPST = webinarDateCST.setZone('America/Los_Angeles');

  // Find same-day windows that occur strictly before webinar start time.
  const sameDayCandidateHours = callWindowsPST
    .filter((h) => h < webinarPST.hour)
    .sort((a, b) => b - a);

  if (sameDayCandidateHours.length > 0) {
    return webinarPST.set({
      hour: sameDayCandidateHours[0],
      minute: 0,
      second: 0,
      millisecond: 0,
    });
  }

  // If webinar starts before the first daily window, use the previous day's
  // latest window.
  const latestDailyWindow = [...callWindowsPST].sort((a, b) => b - a)[0];
  return webinarPST
    .minus({ days: 1 })
    .set({ hour: latestDailyWindow, minute: 0, second: 0, millisecond: 0 });
}

/**
 * Get the most recent PAST occurrence of a webinar.
 * Derived from getNextWebinarDate: the most recent past date is always
 * one week before the next future date.
 *
 * Example: If it's Saturday and the webinar is "friday 5pm",
 * getNextWebinarDate returns next Friday → minus 1 week = yesterday (this Friday).
 */
function getMostRecentWebinarDate(webinarTag, fromDate = null) {
  const nextWebinar = getNextWebinarDate(webinarTag, fromDate);
  return nextWebinar.minus({ weeks: 1 });
}

/**
 * Check if we're in the post-webinar freeze period.
 * Returns true if the most recent webinar occurred within the last 2.5 hours.
 * During this window, calls should be paused to allow GHL to add
 * "missed webinar" / "attended webinar" tags.
 */
function isInPostWebinarFreeze(webinarTag, fromDate = null) {
  const now = fromDate
    ? DateTime.fromJSDate(fromDate).setZone('America/Chicago')
    : DateTime.now().setZone('America/Chicago');

  const mostRecentWebinar = getMostRecentWebinarDate(webinarTag, fromDate);
  const hoursSince = now.diff(mostRecentWebinar, 'hours').hours;

  return hoursSince >= 0 && hoursSince < 2.5;
}

/**
 * Get the webinar label for the agent script, converted to the contact's timezone.
 * E.g. "Tuesday 11:00 AM CST" or "Friday 5:00 PM PST"
 *
 * @param {string} webinarTag - The webinar tag (e.g. "tuesday 11am")
 * @param {string} [contactTimezone] - IANA timezone (e.g. "America/New_York"). Defaults to CST.
 */
function getWebinarLabel(webinarTag, contactTimezone) {
  const schedule = config.webinarSchedule[webinarTag.toLowerCase()];
  if (!schedule) return webinarTag;

  const tz = contactTimezone || 'America/Chicago';

  // Build the webinar time in CST, then convert to the contact's timezone
  const webinarDateCST = getNextWebinarDate(webinarTag);
  const webinarInContactTZ = webinarDateCST.setZone(tz);

  // Format: "Tuesday 11:00 AM CST"
  const dayName = webinarInContactTZ.toFormat('EEEE');        // e.g. "Tuesday"
  const time = webinarInContactTZ.toFormat('h:mm a');          // e.g. "11:00 AM"
  const tzAbbrev = webinarInContactTZ.toFormat('ZZZZ');        // e.g. "CST", "EST", "PST"

  return `${dayName} ${time} ${tzAbbrev}`;
}

module.exports = {
  getNextWebinarDate,
  get24HourCutoff,
  getStopCallingCutoff,
  determineCallPhase,
  shouldStopCalling,
  getCall2StopWindow,
  getMostRecentWebinarDate,
  isInPostWebinarFreeze,
  getWebinarLabel,
};
