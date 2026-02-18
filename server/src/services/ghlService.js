const axios = require('axios');
const config = require('../config');
const prisma = require('../db');

const VALID_WEBINAR_TAGS = Object.keys(config.webinarSchedule);

const ghlApi = axios.create({
  baseURL: config.ghl.baseUrl,
  headers: {
    Authorization: `Bearer ${config.ghl.apiKey}`,
    Version: '2021-07-28',
  },
});

/**
 * Fetch contacts from GHL that are in the Pre-Webinar pipeline stage.
 * Uses the search/filter contacts endpoint.
 */
async function fetchContacts() {
  try {
    const contacts = [];
    let nextPageUrl = null;

    // Paginate through all contacts in the location
    do {
      const params = {
        locationId: config.ghl.locationId,
        limit: 100,
      };

      if (nextPageUrl) {
        params.startAfterId = nextPageUrl;
      }

      const response = await ghlApi.get('/contacts/', { params });
      const data = response.data;

      if (data.contacts && data.contacts.length > 0) {
        contacts.push(...data.contacts);
      }

      nextPageUrl = data.meta?.nextPageUrl || null;
    } while (nextPageUrl);

    return contacts;
  } catch (error) {
    console.error('Error fetching contacts from GHL:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get a single contact by ID from GHL.
 */
async function getContact(contactId) {
  try {
    const response = await ghlApi.get(`/contacts/${contactId}`);
    return response.data.contact;
  } catch (error) {
    console.error(`Error fetching contact ${contactId}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Extract the webinar tag from a GHL contact's tags array.
 * Returns the first matching webinar tag or null.
 */
function extractWebinarTag(tags) {
  if (!tags || !Array.isArray(tags)) return null;
  const normalizedTags = tags.map((t) => t.toLowerCase().trim());
  return VALID_WEBINAR_TAGS.find((vt) => normalizedTags.includes(vt)) || null;
}

/**
 * Sync contacts from GHL into our local database.
 * Only syncs contacts that have a valid webinar tag.
 */
async function syncContacts() {
  console.log('[GHL Sync] Starting contact sync...');
  const ghlContacts = await fetchContacts();
  let synced = 0;
  let skipped = 0;

  for (const ghlContact of ghlContacts) {
    const webinarTag = extractWebinarTag(ghlContact.tags);
    if (!webinarTag) {
      skipped++;
      continue;
    }

    const contactData = {
      ghlContactId: ghlContact.id,
      firstName: ghlContact.firstName || null,
      lastName: ghlContact.lastName || null,
      phone: ghlContact.phone || null,
      email: ghlContact.email || null,
      timezone: ghlContact.timezone || 'America/Chicago',
      webinarTag,
      pipelineStage: 'Pre-Webinar',
      registeredAt: ghlContact.dateAdded
        ? new Date(ghlContact.dateAdded)
        : new Date(),
    };

    await prisma.contact.upsert({
      where: { ghlContactId: ghlContact.id },
      update: contactData,
      create: contactData,
    });

    synced++;
  }

  console.log(`[GHL Sync] Done. Synced: ${synced}, Skipped (no tag): ${skipped}`);
  return { synced, skipped };
}

/**
 * Process a single incoming GHL webhook contact (new registration).
 */
async function processWebhookContact(ghlContact) {
  const webinarTag = extractWebinarTag(ghlContact.tags);
  if (!webinarTag) {
    console.log(`[GHL Webhook] Contact ${ghlContact.id} has no webinar tag, skipping.`);
    return null;
  }

  const contactData = {
    ghlContactId: ghlContact.id,
    firstName: ghlContact.firstName || null,
    lastName: ghlContact.lastName || null,
    phone: ghlContact.phone || null,
    email: ghlContact.email || null,
    timezone: ghlContact.timezone || 'America/Chicago',
    webinarTag,
    pipelineStage: 'Pre-Webinar',
    registeredAt: new Date(),
  };

  const contact = await prisma.contact.upsert({
    where: { ghlContactId: ghlContact.id },
    update: contactData,
    create: contactData,
  });

  console.log(`[GHL Webhook] Processed contact: ${contact.firstName} ${contact.lastName} (${webinarTag})`);
  return contact;
}

module.exports = {
  fetchContacts,
  getContact,
  extractWebinarTag,
  syncContacts,
  processWebhookContact,
};
