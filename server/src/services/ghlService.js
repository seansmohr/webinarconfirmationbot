const axios = require('axios');
const config = require('../config');
const prisma = require('../db');

const VALID_WEBINAR_TAGS = Object.keys(config.webinarSchedule);

// Only sync these tags during testing — set to null to sync all valid webinar tags
const ACTIVE_WEBINAR_TAGS = ['friday 5pm'];

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
    let startAfterId = null;
    let page = 0;
    const MAX_PAGES = 100; // Safety limit to prevent infinite loops

    do {
      page++;
      const params = {
        locationId: config.ghl.locationId,
        limit: 100,
      };

      if (startAfterId) {
        params.startAfterId = startAfterId;
      }

      console.log(`[GHL Fetch] Page ${page} — startAfterId: ${startAfterId || '(first page)'}`);
      const response = await ghlApi.get('/contacts/', { params });
      const data = response.data;

      const pageContacts = data.contacts || [];
      console.log(`[GHL Fetch] Page ${page} returned ${pageContacts.length} contacts (meta: ${JSON.stringify(data.meta || {})})`);

      if (pageContacts.length === 0) break;

      contacts.push(...pageContacts);

      // Determine the next cursor
      const prevCursor = startAfterId;
      // Try to extract cursor from nextPageUrl first (most reliable)
      if (data.meta?.nextPageUrl) {
        try {
          const url = new URL(data.meta.nextPageUrl);
          startAfterId = url.searchParams.get('startAfterId') || url.searchParams.get('startAfter') || null;
        } catch {
          startAfterId = null;
        }
      }
      // Fall back to meta.startAfterId, then last contact ID
      if (!startAfterId) {
        startAfterId = data.meta?.startAfterId || pageContacts[pageContacts.length - 1].id;
      }

      // If cursor didn't advance, we're stuck — stop
      if (startAfterId === prevCursor) {
        console.warn(`[GHL Fetch] Cursor did not advance (stuck at ${startAfterId}), stopping.`);
        break;
      }

      // Stop if GHL signals no more pages
      if (!data.meta?.nextPageUrl) break;
    } while (page < MAX_PAGES);

    if (page >= MAX_PAGES) {
      console.warn(`[GHL Fetch] Hit max page limit (${MAX_PAGES}).`);
    }

    console.log(`[GHL Fetch] Total contacts fetched: ${contacts.length} across ${page} pages`);
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
 * Only returns a tag if the contact has exactly ONE tag and it's a valid webinar tag.
 * Contacts with multiple tags (e.g. "missed webinar", "attended webinar") are skipped.
 */
function extractWebinarTag(tags) {
  if (!tags || !Array.isArray(tags) || tags.length !== 1) return null;
  const tag = tags[0].toLowerCase().trim();
  const activeTags = ACTIVE_WEBINAR_TAGS || VALID_WEBINAR_TAGS;
  return activeTags.includes(tag) ? tag : null;
}

/**
 * Remove contacts from the local DB whose webinarTag is not in the active list.
 * Also cleans up their SchedulerState records.
 */
async function pruneInactiveContacts(activeTags) {
  const staleContacts = await prisma.contact.findMany({
    where: { webinarTag: { notIn: activeTags } },
    select: { id: true, firstName: true, lastName: true, webinarTag: true },
  });

  if (staleContacts.length === 0) return 0;

  const staleIds = staleContacts.map((c) => c.id);
  console.log(`[GHL Sync] Removing ${staleContacts.length} contacts not matching active tags [${activeTags.join(', ')}]:`);
  for (const c of staleContacts) {
    console.log(`[GHL Sync]   - "${c.firstName} ${c.lastName}" (tag: ${c.webinarTag})`);
  }

  // Delete SchedulerState records first (no cascade relation)
  await prisma.schedulerState.deleteMany({ where: { contactId: { in: staleIds } } });
  // Delete contacts (CallLogs cascade automatically)
  await prisma.contact.deleteMany({ where: { id: { in: staleIds } } });

  console.log(`[GHL Sync] Removed ${staleContacts.length} stale contacts and their scheduler/call data.`);
  return staleContacts.length;
}

/**
 * Sync contacts from GHL into our local database.
 * Only syncs contacts that have a valid webinar tag.
 */
async function syncContacts() {
  const activeTags = ACTIVE_WEBINAR_TAGS || VALID_WEBINAR_TAGS;
  console.log('[GHL Sync] Starting contact sync...');
  console.log('[GHL Sync] Active webinar tags:', activeTags);
  const ghlContacts = await fetchContacts();
  console.log(`[GHL Sync] Fetched ${ghlContacts.length} total contacts from GHL`);
  let synced = 0;
  let skipped = 0;

  for (const ghlContact of ghlContacts) {
    const name = `${ghlContact.firstName || ''} ${ghlContact.lastName || ''}`.trim();
    console.log(`[GHL Sync] Contact "${name}" (${ghlContact.id}) — raw tags:`, JSON.stringify(ghlContact.tags));
    const webinarTag = extractWebinarTag(ghlContact.tags);
    console.log(`[GHL Sync]   → extracted webinar tag: ${webinarTag || 'NONE (skipping)'}`);
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

  // Clean up contacts that don't match the active filter
  const removed = await pruneInactiveContacts(activeTags);

  return { synced, skipped, removed };
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
