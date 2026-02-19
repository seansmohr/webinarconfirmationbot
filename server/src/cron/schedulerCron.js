const cron = require('node-cron');
const { runSchedulerTick, initializeContactSchedule } = require('../services/callScheduler');
const { syncContacts } = require('../services/ghlService');
const prisma = require('../db');

/**
 * Initialize all cron jobs for the scheduler.
 *
 * Call windows: 9am, 1pm, 5pm PST
 * - Cron runs in server timezone, so we use PST-aware scheduling
 * - The scheduler tick handles timezone conversion internally
 *
 * Additional jobs:
 * - Contact sync from GHL every hour (with schedule initialization for new contacts)
 * - Minute-by-minute check for immediate calls (new registrations, 24h triggers)
 */
function initializeCronJobs() {
  // Run scheduler tick every 5 minutes to catch due calls
  // The scheduler itself determines if a call should fire based on nextCallTime
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Cron] Running scheduler tick (every 5 min)...');
    try {
      await runSchedulerTick();
    } catch (error) {
      console.error('[Cron] Scheduler tick error:', error.message);
    }
  });

  // Sync contacts from GHL every hour and initialize schedules for new contacts
  cron.schedule('0 * * * *', async () => {
    console.log('[Cron] Running hourly GHL contact sync...');
    try {
      await syncAndInitializeSchedules();
    } catch (error) {
      console.error('[Cron] GHL sync error:', error.message);
    }
  });

  // Run a full scheduler evaluation at each call window: 9am, 1pm, 5pm PST
  // These are the primary call windows - the 5-min tick handles stragglers
  // Times in UTC: 9am PST = 17:00 UTC, 1pm PST = 21:00 UTC, 5pm PST = 01:00 UTC (+1 day)
  // Note: These shift with DST. During PDT: 9am = 16:00 UTC, 1pm = 20:00 UTC, 5pm = 00:00 UTC
  cron.schedule('0 9,13,17 * * *', async () => {
    console.log('[Cron] Primary call window - running full scheduler tick...');
    try {
      await runSchedulerTick();
    } catch (error) {
      console.error('[Cron] Primary window tick error:', error.message);
    }
  }, {
    timezone: 'America/Los_Angeles',
  });

  console.log('[Cron] All cron jobs initialized.');
  console.log('[Cron] - Scheduler tick: every 5 minutes');
  console.log('[Cron] - GHL sync: every hour');
  console.log('[Cron] - Primary call windows: 9am, 1pm, 5pm PST');
}

/**
 * Sync contacts from GHL and initialize schedules for any new contacts.
 * This is the same logic as the manual sync button on the dashboard.
 */
async function syncAndInitializeSchedules() {
  const result = await syncContacts();

  // Initialize schedules for any contacts that don't have one yet
  const contacts = await prisma.contact.findMany();
  let schedulesCreated = 0;

  for (const contact of contacts) {
    const existing = await prisma.schedulerState.findUnique({
      where: { contactId: contact.id },
    });

    if (!existing) {
      await initializeContactSchedule(contact);
      schedulesCreated++;
    }
  }

  if (schedulesCreated > 0) {
    console.log(`[Cron] Created ${schedulesCreated} new schedules from hourly sync.`);
  }

  return { ...result, schedulesCreated };
}

module.exports = { initializeCronJobs };
