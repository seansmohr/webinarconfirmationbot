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
 * Get the webinar label for the agent script.
 */
function getWebinarLabel(webinarTag) {
  const schedule = config.webinarSchedule[webinarTag.toLowerCase()];
  return schedule ? schedule.label : webinarTag;
}

module.exports = {
  getNextWebinarDate,
  get24HourCutoff,
  getStopCallingCutoff,
  determineCallPhase,
  shouldStopCalling,
  getWebinarLabel,
};
