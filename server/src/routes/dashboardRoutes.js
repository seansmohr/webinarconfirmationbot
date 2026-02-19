const express = require('express');
const { DateTime } = require('luxon');
const prisma = require('../db');
const { triggerCall } = require('../services/retellService');
const router = express.Router();

const PST_ZONE = 'America/Los_Angeles';

/**
 * GET /api/dashboard/contacts
 * Returns all contacts with their call status summary for the dashboard.
 */
router.get('/contacts', async (req, res) => {
  try {
    const { webinarTag, status, search } = req.query;

    const where = {};

    if (webinarTag) {
      where.webinarTag = webinarTag;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const contacts = await prisma.contact.findMany({
      where,
      include: {
        callLogs: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get scheduler state for all contacts
    const schedulerStates = await prisma.schedulerState.findMany();
    const stateMap = {};
    for (const s of schedulerStates) {
      stateMap[s.contactId] = s;
    }

    // Build dashboard view
    const dashboardContacts = contacts.map((contact) => {
      const state = stateMap[contact.id] || null;
      const call1Logs = contact.callLogs.filter((l) => l.callPhase === 'FIRST_CALL');
      const call2Logs = contact.callLogs.filter((l) => l.callPhase === 'SECOND_CALL');

      const call1Connected = call1Logs.some((l) => l.outcome === 'CONNECTED');
      const call1Confirmed = call1Logs.some((l) => l.confirmationStatus === 'CONFIRMED');
      const call2Connected = call2Logs.some((l) => l.outcome === 'CONNECTED');
      const call2Confirmed = call2Logs.some((l) => l.confirmationStatus === 'CONFIRMED');

      // Get the latest connected call log for each phase (for disposition/reason)
      const latestCall1 = call1Logs.find((l) => l.outcome === 'CONNECTED');
      const latestCall2 = call2Logs.find((l) => l.outcome === 'CONNECTED');

      return {
        id: contact.id,
        ghlContactId: contact.ghlContactId,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        email: contact.email,
        timezone: contact.timezone,
        webinarTag: contact.webinarTag,
        registeredAt: contact.registeredAt,

        // Call 1 status
        call1: {
          status: call1Confirmed
            ? 'confirmed'
            : call1Connected
              ? 'connected'
              : (call1Logs.length > 0 ? 'attempted' : 'pending'),
          attempts: call1Logs.length,
          connected: call1Connected,
          confirmed: call1Confirmed,
          disposition: latestCall1?.callDisposition || null,
          declineReason: latestCall1?.declineReason || null,
          lastAttempt: call1Logs[0]?.calledAt || null,
        },

        // Call 2 status
        call2: {
          status: call2Confirmed
            ? 'confirmed'
            : call2Connected
              ? 'connected'
              : (call2Logs.length > 0 ? 'attempted' : 'pending'),
          attempts: call2Logs.length,
          connected: call2Connected,
          confirmed: call2Confirmed,
          disposition: latestCall2?.callDisposition || null,
          declineReason: latestCall2?.declineReason || null,
          lastAttempt: call2Logs[0]?.calledAt || null,
        },

        // Scheduler info
        currentPhase: state?.currentPhase || null,
        nextCallTime: state?.nextCallTime || null,
        isComplete: state?.isComplete || false,
        totalAttempts: state?.totalAttempts || 0,
      };
    });

    // Filter by status if requested
    let filtered = dashboardContacts;
    if (status === 'scheduled') {
      filtered = dashboardContacts.filter((c) => !c.isComplete && c.nextCallTime);
    } else if (status === 'connected') {
      filtered = dashboardContacts.filter((c) => c.call1.connected || c.call2.connected);
    } else if (status === 'confirmed') {
      filtered = dashboardContacts.filter((c) => c.call2.confirmed);
    } else if (status === 'pending') {
      filtered = dashboardContacts.filter((c) => !c.isComplete);
    }

    res.json({
      contacts: filtered,
      total: filtered.length,
    });
  } catch (error) {
    console.error('[Dashboard] Error fetching contacts:', error.message);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

/**
 * GET /api/dashboard/stats
 * Returns aggregate stats for the dashboard header.
 */
router.get('/stats', async (req, res) => {
  try {
    const totalContacts = await prisma.contact.count();

    const schedulerStates = await prisma.schedulerState.findMany();
    const call1Connected = schedulerStates.filter((s) => s.completedCall1).length;
    const call1Confirmed = schedulerStates.filter((s) => s.confirmedCall1).length;
    const call2Connected = schedulerStates.filter((s) => s.completedCall2).length;
    const call2Confirmed = schedulerStates.filter((s) => s.confirmedCall2).length;
    const activeSchedules = schedulerStates.filter((s) => !s.isComplete).length;

    const totalCalls = await prisma.callLog.count();
    const connectedCalls = await prisma.callLog.count({
      where: { outcome: 'CONNECTED' },
    });

    res.json({
      totalContacts,
      call1Connected,
      call1Confirmed,
      call2Connected,
      call2Confirmed,
      activeSchedules,
      totalCalls,
      connectedCalls,
      connectionRate: totalCalls > 0 ? Math.round((connectedCalls / totalCalls) * 100) : 0,
    });
  } catch (error) {
    console.error('[Dashboard] Error fetching stats:', error.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/dashboard/contact/:id
 * Returns detailed info for a single contact including all call logs.
 */
router.get('/contact/:id', async (req, res) => {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: req.params.id },
      include: {
        callLogs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const state = await prisma.schedulerState.findUnique({
      where: { contactId: contact.id },
    });

    res.json({ contact, schedulerState: state });
  } catch (error) {
    console.error('[Dashboard] Error fetching contact:', error.message);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

/**
 * POST /api/dashboard/call/:contactId
 * Manually trigger a call for a contact.
 * Body: { callPhase: "FIRST_CALL" | "SECOND_CALL" }
 */
router.post('/call/:contactId', async (req, res) => {
  try {
    const { callPhase } = req.body;

    if (!callPhase || !['FIRST_CALL', 'SECOND_CALL'].includes(callPhase)) {
      return res.status(400).json({ error: 'callPhase must be "FIRST_CALL" or "SECOND_CALL"' });
    }

    const contact = await prisma.contact.findUnique({
      where: { id: req.params.contactId },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (!contact.phone) {
      return res.status(400).json({ error: 'Contact has no phone number' });
    }

    console.log(`[Dashboard] Manual ${callPhase} triggered for ${contact.firstName} ${contact.lastName}`);
    const callLog = await triggerCall(contact, callPhase);

    // Update SchedulerState attempt counters (same as scheduled calls)
    const state = await prisma.schedulerState.findUnique({
      where: { contactId: contact.id },
    });

    if (state) {
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
          attemptsToday,
          totalAttempts: state.totalAttempts + 1,
          lastCallDate: new Date(),
        },
      });
    }

    res.json({ success: true, callLogId: callLog.id, callPhase });
  } catch (error) {
    console.error('[Dashboard] Error triggering manual call:', error.message);
    res.status(500).json({ error: 'Failed to trigger call' });
  }
});

/**
 * DELETE /api/dashboard/contact/:id
 * Delete a contact and all associated call logs and scheduler state.
 */
router.delete('/contact/:id', async (req, res) => {
  try {
    const contactId = req.params.id;

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Delete scheduler state first (no cascade relation)
    await prisma.schedulerState.deleteMany({
      where: { contactId },
    });

    // Delete contact (call logs cascade automatically via onDelete: Cascade)
    await prisma.contact.delete({
      where: { id: contactId },
    });

    console.log(`[Dashboard] Deleted contact ${contact.firstName} ${contact.lastName} (${contactId})`);
    res.json({ success: true, deletedId: contactId });
  } catch (error) {
    console.error('[Dashboard] Error deleting contact:', error.message);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

module.exports = router;
