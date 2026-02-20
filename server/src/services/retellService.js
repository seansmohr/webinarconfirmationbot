const Retell = require('retell-sdk');
const config = require('../config');
const prisma = require('../db');
const { DateTime } = require('luxon');
const { getWebinarLabel, get24HourCutoff } = require('./webinarDateResolver');
const { addTagToContact } = require('./ghlService');

const retellClient = new Retell({
  apiKey: config.retell.apiKey,
});

/**
 * Trigger a Retell AI call to a contact.
 *
 * @param {Object} contact - The contact record from our DB
 * @param {string} callPhase - 'FIRST_CALL' or 'SECOND_CALL'
 * @returns {Object} The call log record
 */
async function triggerCall(contact, callPhase) {
  const agentId = callPhase === 'FIRST_CALL'
    ? config.retell.agentIdCall1
    : config.retell.agentIdCall2;

  const webinarLabel = getWebinarLabel(contact.webinarTag, contact.timezone);
  const firstName = contact.firstName || 'there';

  // Dynamic variables passed to the Retell agent script
  const retellMetadata = {
    contact_first_name: firstName,
    contact_last_name: contact.lastName || '',
    webinar_label: webinarLabel,
    call_phase: callPhase,
    contact_id: contact.id,
  };

  try {
    // Count existing attempts for this contact + phase
    const existingAttempts = await prisma.callLog.count({
      where: {
        contactId: contact.id,
        callPhase,
      },
    });

    // Create call log record first
    const callLog = await prisma.callLog.create({
      data: {
        contactId: contact.id,
        callPhase,
        attemptNumber: existingAttempts + 1,
        scheduledAt: new Date(),
        outcome: 'PENDING',
      },
    });

    // Trigger the Retell call — hang up if voicemail detected
    const retellCall = await retellClient.call.createPhoneCall({
      from_number: callPhase === 'FIRST_CALL'
        ? config.retell.fromNumberCall1
        : config.retell.fromNumberCall2,
      to_number: contact.phone,
      agent_id: agentId,
      retell_llm_dynamic_variables: retellMetadata,
      metadata: {
        callLogId: callLog.id,
        contactId: contact.id,
        callPhase,
      },
      override_agent_config: {
        voicemail_option: {
          action: { type: 'hangup' },
        },
      },
    });

    // Update call log with Retell call ID
    await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        retellCallId: retellCall.call_id,
        calledAt: new Date(),
      },
    });

    console.log(
      `[Retell] ${callPhase} triggered for ${firstName} ${contact.lastName || ''} ` +
      `(attempt #${existingAttempts + 1}), Retell call ID: ${retellCall.call_id}`
    );

    return callLog;
  } catch (error) {
    console.error(
      `[Retell] Failed to trigger ${callPhase} for contact ${contact.id}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Process a Retell webhook for call status updates.
 * Updates the call log with the outcome.
 */
async function processCallWebhook(webhookData) {
  const { call_id, call_status, disconnection_reason, call_analysis, metadata } = webhookData;

  if (!metadata?.callLogId) {
    console.warn('[Retell Webhook] No callLogId in metadata, skipping.');
    return null;
  }

  const callLog = await prisma.callLog.findUnique({
    where: { id: metadata.callLogId },
  });

  if (!callLog) {
    console.warn(`[Retell Webhook] Call log ${metadata.callLogId} not found.`);
    return null;
  }

  // Map Retell status to our outcome enum
  const inVoicemail = call_analysis?.in_voicemail === true;
  let outcome = 'NO_ANSWER';

  if (call_status === 'ended' || call_status === 'ended_by_agent') {
    if (disconnection_reason === 'voicemail_reached' || disconnection_reason === 'machine_detected' || inVoicemail) {
      outcome = 'VOICEMAIL';
    } else if (disconnection_reason === 'agent_hangup' || disconnection_reason === 'user_hangup') {
      // Safety net: very short calls (< 5s) that ended by agent are likely
      // undetected voicemail where the agent hung up before a real conversation.
      const durationSec = webhookData.duration_ms ? Math.round(webhookData.duration_ms / 1000) : null;
      if (durationSec !== null && durationSec < 5) {
        outcome = 'VOICEMAIL';
      } else {
        outcome = 'CONNECTED';
      }
    } else if (disconnection_reason === 'no_answer') {
      outcome = 'NO_ANSWER';
    } else if (disconnection_reason === 'busy') {
      outcome = 'BUSY';
    } else {
      // Unknown disconnection reason — don't assume connected
      outcome = 'NO_ANSWER';
    }
  } else if (call_status === 'error') {
    outcome = 'FAILED';
  }

  // Extract custom analysis fields from the Retell post-call analysis
  const customData = call_analysis?.custom_analysis_data || {};
  const callDisposition = customData.call_disposition || null;
  const declineReason = customData.decline_reason || customData.reason_if_declined || null;

  // Google Voice / call screening detection:
  // If the agent only interacted with an automated screening system (e.g. Google Voice
  // asking "Who's calling?") and never reached the actual person, treat as NO_ANSWER.
  if (outcome === 'CONNECTED' && customData.reached_person === false) {
    console.log(
      `[Retell Webhook] Call ${call_id}: Google Voice / call screening detected — ` +
      `agent never reached actual person. Treating as NO_ANSWER.`
    );
    outcome = 'NO_ANSWER';
  }

  // Determine confirmation status based on call phase and custom analysis fields
  let confirmationStatus = null;
  if (outcome === 'CONNECTED') {
    if (callLog.callPhase === 'FIRST_CALL') {
      // Call 1 agent may use either "registration_confirmed" or generic "confirmed".
      const registrationConfirmed =
        customData.registration_confirmed === true ||
        customData.confirmed === true;
      confirmationStatus = registrationConfirmed ? 'CONFIRMED' : 'NOT_CONFIRMED';
    } else if (callLog.callPhase === 'SECOND_CALL') {
      // Call 2 script uses "confirmed" (and may include attended_status);
      // keep backward compatibility with "confirmed_attendance".
      const attendanceConfirmed =
        customData.confirmed_attendance === true ||
        customData.confirmed === true ||
        customData.attended_status === 'confirmed';
      confirmationStatus = attendanceConfirmed ? 'CONFIRMED' : 'NOT_CONFIRMED';
    }
  }

  // Update the call log with outcome, confirmation, disposition, and decline reason
  const updatedLog = await prisma.callLog.update({
    where: { id: callLog.id },
    data: {
      outcome,
      confirmationStatus,
      callDisposition,
      declineReason,
      duration: webhookData.duration_ms ? Math.round(webhookData.duration_ms / 1000) : null,
      notes: call_analysis?.call_summary || null,
    },
  });

  // Update scheduler state
  if (outcome === 'CONNECTED') {
    const isCall1 = callLog.callPhase === 'FIRST_CALL';
    const completedField = isCall1 ? 'completedCall1' : 'completedCall2';
    const updateData = { [completedField]: true };

    if (isCall1 && confirmationStatus === 'CONFIRMED') {
      updateData.confirmedCall1 = true;
    }
    if (!isCall1 && confirmationStatus === 'CONFIRMED') {
      updateData.confirmedCall2 = true;
    }

    // If disposition is "Wrong Number", stop all calling for this contact
    if (callDisposition === 'Wrong Number') {
      updateData.isComplete = true;
    }

    // Fetch contact for phase advancement and GHL tagging
    const contact = await prisma.contact.findUnique({
      where: { id: callLog.contactId },
      select: { ghlContactId: true, webinarTag: true },
    });

    // Immediately advance to Call 2 when Call 1 completes
    if (isCall1 && contact && !updateData.isComplete) {
      const cutoff24h = get24HourCutoff(contact.webinarTag);
      const now = DateTime.now().setZone('America/Chicago');
      updateData.currentPhase = 'SECOND_CALL';
      updateData.attemptsToday = 0;
      updateData.nextCallTime = now >= cutoff24h
        ? new Date()
        : cutoff24h.toJSDate();
    }

    // For Call 2, only mark complete on explicit confirmation.
    // If connected but not confirmed, keep schedule active for retries until
    // the scheduler's phase-specific stop window.
    if (!isCall1 && confirmationStatus === 'CONFIRMED') {
      updateData.isComplete = true;
    }

    await prisma.schedulerState.updateMany({
      where: { contactId: callLog.contactId },
      data: updateData,
    });

    if (contact?.ghlContactId) {
      if (isCall1 && confirmationStatus === 'CONFIRMED') {
        await addTagToContact(contact.ghlContactId, 'confirmed webinar registration');
      }
      if (!isCall1 && confirmationStatus === 'CONFIRMED') {
        await addTagToContact(contact.ghlContactId, 'confirmed webinar attendance');
      }
    }
  }

  console.log(
    `[Retell Webhook] Call ${call_id}: outcome=${outcome}, ` +
    `confirmation=${confirmationStatus || 'N/A'}, ` +
    `disposition=${callDisposition || 'N/A'}`
  );

  return updatedLog;
}

module.exports = {
  triggerCall,
  processCallWebhook,
};
