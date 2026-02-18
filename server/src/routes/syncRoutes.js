const express = require('express');
const { syncContacts } = require('../services/ghlService');
const { initializeContactSchedule } = require('../services/callScheduler');
const prisma = require('../db');
const router = express.Router();

/**
 * POST /api/sync/contacts
 * Manually trigger a GHL contact sync.
 */
router.post('/contacts', async (req, res) => {
  try {
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

    res.json({
      ...result,
      schedulesCreated,
    });
  } catch (error) {
    console.error('[Sync] Error syncing contacts:', error.message);
    res.status(500).json({ error: 'Sync failed' });
  }
});

module.exports = router;
