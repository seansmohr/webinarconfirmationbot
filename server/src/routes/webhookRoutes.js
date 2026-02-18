const express = require('express');
const { processWebhookContact } = require('../services/ghlService');
const { processCallWebhook } = require('../services/retellService');
const { initializeContactSchedule } = require('../services/callScheduler');
const router = express.Router();

/**
 * POST /api/webhooks/ghl
 * Webhook receiver for GoHighLevel.
 * Triggered when a new contact enters the Pre-Webinar stage.
 */
router.post('/ghl', async (req, res) => {
  try {
    console.log('[Webhook] GHL webhook received:', JSON.stringify(req.body).substring(0, 200));

    const payload = req.body;

    // GHL sends different event types - we care about contact creation/update
    // and pipeline stage changes
    const contactData = payload.contact || payload;

    if (!contactData.id && !contactData.contactId) {
      return res.status(400).json({ error: 'No contact data in webhook' });
    }

    const ghlContact = {
      id: contactData.id || contactData.contactId,
      firstName: contactData.firstName || contactData.first_name,
      lastName: contactData.lastName || contactData.last_name,
      phone: contactData.phone,
      email: contactData.email,
      timezone: contactData.timezone,
      tags: contactData.tags || [],
    };

    // Process and save the contact
    const contact = await processWebhookContact(ghlContact);

    if (contact) {
      // Initialize the call schedule for this new registration
      await initializeContactSchedule(contact);
      console.log(`[Webhook] New registration processed: ${contact.firstName} ${contact.lastName}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Webhook] GHL webhook error:', error.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/webhooks/retell
 * Webhook receiver for Retell AI call status updates.
 */
router.post('/retell', async (req, res) => {
  try {
    console.log('[Webhook] Retell webhook received:', JSON.stringify(req.body).substring(0, 200));

    const webhookData = req.body;

    // Retell sends events for call lifecycle
    if (webhookData.event === 'call_ended' || webhookData.event === 'call_analyzed') {
      const callData = webhookData.call || webhookData;
      await processCallWebhook(callData);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Webhook] Retell webhook error:', error.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
