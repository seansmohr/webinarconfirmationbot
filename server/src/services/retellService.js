const Retell = require('retell-sdk');
const config = require('../config');
const prisma = require('../db');
const { getWebinarLabel } = require('./webinarDateResolver');

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

  const webinarLabel = getWebinarLabel(contact.webinarTag);
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

    // Trigger the Retell call
    const retellCall = await retellClient.call.createPhoneCall({
      from_number: null, // Uses Retell default number
      to_number: contact.phone,
      agent_id: agentId,
      retell_llm_dynamic_variables: retellMetadata,
      metadata: {
        callLogId: callLog.id,
        contactId: contact.id,
        callPhase,
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
  let outcome = 'NO_ANSWER';
  if (call_status === 'ended' || call_status === 'ended_by_agent') {
    // If the call actually connected and had a conversation
    if (disconnection_reason === 'agent_hangup' || disconnection_reason === 'user_hangup') {
      outcome = 'CONNECTED';
    } else if (disconnection_reason === 'voicemail_reached') {
      outcome = 'VOICEMAIL';
    } else if (disconnection_reason === 'no_answer') {
      outcome = 'NO_ANSWER';
    } else if (disconnection_reason === 'busy') {
      outcome = 'BUSY';
    } else {
      // For other end reasons, check if there was meaningful conversation
      outcome = 'CONNECTED';
    }
  } else if (call_status === 'error') {
    outcome = 'FAILED';
  }

  // Check call analysis for confirmation (Call 2)
  let confirmationStatus = null;
  if (callLog.callPhase === 'SECOND_CALL' && outcome === 'CONNECTED') {
    // Check if the Retell agent detected confirmation in the conversation
    if (call_analysis?.custom_analysis_data?.confirmed === true ||
        call_analysis?.call_summary?.toLowerCase().includes('confirmed')) {
      confirmationStatus = 'CONFIRMED';
    } else {
      confirmationStatus = 'NOT_CONFIRMED';
    }
  }

  // Update the call log
  const updatedLog = await prisma.callLog.update({
    where: { id: callLog.id },
    data: {
      outcome,
      confirmationStatus,
      duration: webhookData.duration_ms ? Math.round(webhookData.duration_ms / 1000) : null,
      notes: call_analysis?.call_summary || null,
    },
  });

  // Update scheduler state
  if (outcome === 'CONNECTED') {
    const field = callLog.callPhase === 'FIRST_CALL' ? 'completedCall1' : 'completedCall2';
    const updateData = { [field]: true };

    if (confirmationStatus === 'CONFIRMED') {
      updateData.confirmedCall2 = true;
    }

    await prisma.schedulerState.updateMany({
      where: { contactId: callLog.contactId },
      data: updateData,
    });
  }

  console.log(
    `[Retell Webhook] Call ${call_id}: outcome=${outcome}, ` +
    `confirmation=${confirmationStatus || 'N/A'}`
  );

  return updatedLog;
}

module.exports = {
  triggerCall,
  processCallWebhook,
};
