const { DateTime } = require('luxon');
const prisma = require('../db');
const config = require('../config');
const { determineCallPhase, shouldStopCalling, get24HourCutoff, getNextWebinarDate } = require('./webinarDateResolver');
const { triggerCall } = require('./retellService');

const PST_ZONE = 'America/Los_Angeles';
const CALL_WINDOWS = config.callWindows; // [9, 13, 17] in PST

/**
 * Get the next valid call window time in PST.
 * Call windows are 9am, 1pm, 5pm PST.
 *
 * If current time is past all windows, returns 9am next day.
 * If current time is before the first window, returns 9am today.
 */
function getNextCallWindow(fromDate = null) {
  const now = fromDate
    ? DateTime.fromJSDate(fromDate).setZone(PST_ZONE)
    : DateTime.now().setZone(PST_ZONE);

  const currentHour = now.hour;

  // Find the next window that hasn't passed
  for (const windowHour of CALL_WINDOWS) {
    if (currentHour < windowHour) {
      return now.set({ hour: windowHour, minute: 0, second: 0, millisecond: 0 });
    }
  }

  // All windows passed today, return 9am tomorrow
  return now.plus({ days: 1 }).set({ hour: CALL_WINDOWS[0], minute: 0, second: 0, millisecond: 0 });
}

/**
 * Check if current time is within a call window (within 5 minutes of a window).
 */
function isInCallWindow(fromDate = null) {
  const now = fromDate
    ? DateTime.fromJSDate(fromDate).setZone(PST_ZONE)
    : DateTime.now().setZone(PST_ZONE);

  const currentHour = now.hour;
  const currentMinute = now.minute;

  for (const windowHour of CALL_WINDOWS) {
    if (currentHour === windowHour && currentMinute < 30) {
      return true;
    }
  }

  return false;
}

/**
 * Determine if a newly registered contact should get an immediate call.
 * Rules:
 * - If registered during a call window: call immediately
 * - If registered between windows: schedule for next window
 * - If registered after 5pm PST: schedule for 9am next day
 */
function shouldCallImmediately(registeredAt = null) {
  const now = registeredAt
    ? DateTime.fromJSDate(registeredAt).setZone(PST_ZONE)
    : DateTime.now().setZone(PST_ZONE);

  const currentHour = now.hour;

  // If registered before 9am or after 5pm, don't call immediately
  if (currentHour < 9 || currentHour >= 17) {
    return false;
  }

  // If registered during business hours, call immediately
  return true;
}

/**
 * Initialize scheduler state for a new contact.
 * Determines starting phase and first call time.
 */
async function initializeContactSchedule(contact) {
  const phase = determineCallPhase(contact.webinarTag, contact.registeredAt);

  let nextCallTime;

  if (phase === 'SECOND_CALL') {
    // For Call 2, call immediately (24hr before webinar) then resume windows
    nextCallTime = new Date();
  } else if (shouldCallImmediately(contact.registeredAt)) {
    // For Call 1, if registered during business hours, call immediately
    nextCallTime = new Date();
  } else {
    // Schedule for next call window
    nextCallTime = getNextCallWindow(contact.registeredAt).toJSDate();
  }

  const schedulerState = await prisma.schedulerState.upsert({
    where: { contactId: contact.id },
    update: {
      currentPhase: phase,
      nextCallTime,
      attemptsToday: 0,
      totalAttempts: 0,
      isComplete: false,
    },
    create: {
      contactId: contact.id,
      currentPhase: phase,
      nextCallTime,
      attemptsToday: 0,
      totalAttempts: 0,
      isComplete: false,
    },
  });

  console.log(
    `[Scheduler] Initialized schedule for ${contact.firstName}: ` +
    `phase=${phase}, nextCall=${nextCallTime.toISOString()}`
  );

  return schedulerState;
}

/**
 * Main scheduling tick. Called by cron job.
 * Evaluates all active contacts and triggers calls as needed.
 */
async function runSchedulerTick() {
  const now = DateTime.now().setZone(PST_ZONE);
  console.log(`[Scheduler] Tick at ${now.toISO()}`);

  // Get all contacts with active (non-complete) scheduler states
  const activeStates = await prisma.schedulerState.findMany({
    where: {
      isComplete: false,
      nextCallTime: { lte: new Date() },
    },
  });

  console.log(`[Scheduler] Found ${activeStates.length} contacts due for calls.`);

  for (const state of activeStates) {
    try {
      await processContactCall(state);
    } catch (error) {
      console.error(`[Scheduler] Error processing contact ${state.contactId}:`, error.message);
    }
  }
}

/**
 * Process a single contact's call based on their scheduler state.
 */
async function processContactCall(state) {
  const contact = await prisma.contact.findUnique({
    where: { id: state.contactId },
  });

  if (!contact) {
    console.warn(`[Scheduler] Contact ${state.contactId} not found, marking complete.`);
    await prisma.schedulerState.update({
      where: { id: state.id },
      data: { isComplete: true },
    });
    return;
  }

  // Check if we should stop calling (30 min before webinar)
  if (shouldStopCalling(contact.webinarTag)) {
    console.log(`[Scheduler] Webinar imminent for ${contact.firstName}, stopping calls.`);
    await prisma.schedulerState.update({
      where: { id: state.id },
      data: { isComplete: true },
    });
    return;
  }

  // Check if phase needs to transition from Call 1 to Call 2
  const currentPhase = determineCallPhase(contact.webinarTag, contact.registeredAt);
  if (state.currentPhase === 'FIRST_CALL' && currentPhase === 'SECOND_CALL') {
    console.log(`[Scheduler] Transitioning ${contact.firstName} from Call 1 to Call 2.`);
    await prisma.schedulerState.update({
      where: { id: state.id },
      data: {
        currentPhase: 'SECOND_CALL',
        attemptsToday: 0,
      },
    });
    state.currentPhase = 'SECOND_CALL';
    state.attemptsToday = 0;
  }

  // Skip if already completed for current phase
  if (state.currentPhase === 'FIRST_CALL' && state.completedCall1) {
    // Transition to Call 2 or mark complete
    const cutoff24h = get24HourCutoff(contact.webinarTag);
    const now = DateTime.now().setZone('America/Chicago');

    if (now >= cutoff24h) {
      await prisma.schedulerState.update({
        where: { id: state.id },
        data: {
          currentPhase: 'SECOND_CALL',
          attemptsToday: 0,
          nextCallTime: new Date(),
        },
      });
    } else {
      // Wait until 24h before webinar to start Call 2
      await prisma.schedulerState.update({
        where: { id: state.id },
        data: {
          nextCallTime: cutoff24h.toJSDate(),
          currentPhase: 'SECOND_CALL',
        },
      });
    }
    return;
  }

  if (state.currentPhase === 'SECOND_CALL' && state.completedCall2) {
    await prisma.schedulerState.update({
      where: { id: state.id },
      data: { isComplete: true },
    });
    return;
  }

  // Don't call if no phone number
  if (!contact.phone) {
    console.warn(`[Scheduler] Contact ${contact.firstName} has no phone, skipping.`);
    return;
  }

  // Trigger the call
  try {
    await triggerCall(contact, state.currentPhase);

    // Calculate next call time
    const nextCallTime = calculateNextCallTime(contact, state);

    // Reset attempts counter if new day
    const today = DateTime.now().setZone(PST_ZONE).startOf('day');
    const lastCallDay = state.lastCallDate
      ? DateTime.fromJSDate(state.lastCallDate).setZone(PST_ZONE).startOf('day')
      : null;

    const attemptsToday = lastCallDay && lastCallDay.equals(today)
      ? state.attemptsToday + 1
      : 1;

    await prisma.schedulerState.update({
      where: { id: state.id },
      data: {
        nextCallTime: nextCallTime ? nextCallTime.toJSDate() : null,
        attemptsToday,
        totalAttempts: state.totalAttempts + 1,
        lastCallDate: new Date(),
        isComplete: nextCallTime === null,
      },
    });
  } catch (error) {
    console.error(`[Scheduler] Call failed for ${contact.firstName}:`, error.message);
    // Still schedule next attempt
    const nextCallTime = getNextCallWindow();
    await prisma.schedulerState.update({
      where: { id: state.id },
      data: {
        nextCallTime: nextCallTime.toJSDate(),
      },
    });
  }
}

/**
 * Calculate the next call time for a contact after a call attempt.
 * Returns null if no more calls should be made.
 */
function calculateNextCallTime(contact, state) {
  const now = DateTime.now().setZone(PST_ZONE);
  const webinarDate = getNextWebinarDate(contact.webinarTag);
  const stopCutoff = webinarDate.minus({ minutes: 30 });

  // For Call 2, check if we need a "30 min before" final call
  if (state.currentPhase === 'SECOND_CALL') {
    const thirtyMinBefore = webinarDate.minus({ minutes: 30 }).setZone(PST_ZONE);

    // Get next regular window
    const nextWindow = getNextCallWindow();

    // If the next window is after the webinar stop cutoff
    if (nextWindow >= stopCutoff.setZone(PST_ZONE)) {
      // Schedule for 30 min before if we haven't passed it
      if (now < thirtyMinBefore) {
        return thirtyMinBefore;
      }
      return null; // Done
    }

    return nextWindow;
  }

  // For Call 1, check if next window crosses into Call 2 territory
  const cutoff24h = get24HourCutoff(contact.webinarTag).setZone(PST_ZONE);
  const nextWindow = getNextCallWindow();

  if (nextWindow >= cutoff24h) {
    // Transition to Call 2 at the 24h mark
    return cutoff24h;
  }

  return nextWindow;
}

module.exports = {
  getNextCallWindow,
  isInCallWindow,
  shouldCallImmediately,
  initializeContactSchedule,
  runSchedulerTick,
  processContactCall,
  calculateNextCallTime,
};
