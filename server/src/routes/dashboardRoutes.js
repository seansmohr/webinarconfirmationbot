const express = require('express');
const prisma = require('../db');
const router = express.Router();

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
      const call2Connected = call2Logs.some((l) => l.outcome === 'CONNECTED');
      const call2Confirmed = call2Logs.some((l) => l.confirmationStatus === 'CONFIRMED');

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
          status: call1Connected ? 'connected' : (call1Logs.length > 0 ? 'attempted' : 'pending'),
          attempts: call1Logs.length,
          connected: call1Connected,
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
    if (status === 'connected') {
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

module.exports = router;
