const cron = require('node-cron');
const { runSchedulerTick } = require('../services/callScheduler');
const { syncContacts } = require('../services/ghlService');

/**
 * Initialize all cron jobs for the scheduler.
 *
 * Call windows: 9am, 1pm, 5pm PST
 * - Cron runs in server timezone, so we use PST-aware scheduling
 * - The scheduler tick handles timezone conversion internally
 *
 * Additional jobs:
 * - Contact sync from GHL every 15 minutes
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

  // Sync contacts from GHL every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('[Cron] Running GHL contact sync...');
    try {
      await syncContacts();
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
  console.log('[Cron] - GHL sync: every 15 minutes');
  console.log('[Cron] - Primary call windows: 9am, 1pm, 5pm PST');
}

module.exports = { initializeCronJobs };
