import React, { useState } from 'react';
import { useContactDetail, triggerManualCall, deleteContact } from '../hooks/useDashboard.js';
import StatusBubble, { getCall1Variant, getCall2Variant } from './StatusBubble.jsx';
import WebinarTagBadge from './WebinarTagBadge.jsx';

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function outcomeLabel(outcome) {
  const map = {
    CONNECTED: 'Connected',
    NO_ANSWER: 'No Answer',
    VOICEMAIL: 'Voicemail',
    BUSY: 'Busy',
    FAILED: 'Failed',
    PENDING: 'Pending',
  };
  return map[outcome] || outcome;
}

function outcomeColor(outcome) {
  const map = {
    CONNECTED: 'text-emerald-600',
    NO_ANSWER: 'text-red-500',
    VOICEMAIL: 'text-amber-500',
    BUSY: 'text-orange-500',
    FAILED: 'text-red-600',
    PENDING: 'text-blue-500',
  };
  return map[outcome] || 'text-gray-500';
}

export default function ContactDetail({ contactId, onClose, onDeleted }) {
  const { data, loading } = useContactDetail(contactId);
  const [calling, setCalling] = useState(null); // 'FIRST_CALL' | 'SECOND_CALL' | null
  const [callError, setCallError] = useState(null);
  const [callSuccess, setCallSuccess] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm('Remove this contact from the dashboard? This will not delete them from GHL.')) return;
    setDeleting(true);
    try {
      await deleteContact(contactId);
      onDeleted?.(contactId);
      onClose();
    } catch (err) {
      setCallError(err.message);
      setDeleting(false);
    }
  }

  async function handleTriggerCall(callPhase) {
    setCalling(callPhase);
    setCallError(null);
    setCallSuccess(null);
    try {
      await triggerManualCall(contactId, callPhase);
      setCallSuccess(`${callPhase === 'FIRST_CALL' ? 'Call 1' : 'Call 2'} triggered successfully`);
    } catch (err) {
      setCallError(err.message);
    } finally {
      setCalling(null);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="rounded-xl bg-white p-8 shadow-xl">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!data?.contact) return null;

  const { contact, schedulerState } = data;
  const call1Logs = contact.callLogs.filter((l) => l.callPhase === 'FIRST_CALL');
  const call2Logs = contact.callLogs.filter((l) => l.callPhase === 'SECOND_CALL');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {contact.firstName} {contact.lastName}
              </h2>
              <div className="mt-1 space-y-1 text-sm text-gray-500">
                {contact.phone && <p>Phone: {contact.phone}</p>}
                {contact.email && <p>Email: {contact.email}</p>}
                <p>Timezone: {contact.timezone}</p>
                <p>Registered: {formatDateTime(contact.registeredAt)}</p>
              </div>
              <div className="mt-2">
                <WebinarTagBadge tag={contact.webinarTag} />
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Status bubbles */}
          <div className="mt-4 flex gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">Call 1:</span>
              <StatusBubble
                variant={getCall1Variant({
                  connected: call1Logs.some((l) => l.outcome === 'CONNECTED'),
                  attempts: call1Logs.length,
                })}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">Call 2:</span>
              <StatusBubble
                variant={getCall2Variant({
                  confirmed: call2Logs.some((l) => l.confirmationStatus === 'CONFIRMED'),
                  connected: call2Logs.some((l) => l.outcome === 'CONNECTED'),
                  attempts: call2Logs.length,
                })}
              />
            </div>
          </div>

          {/* Manual Call Buttons */}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => handleTriggerCall('FIRST_CALL')}
              disabled={calling !== null}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {calling === 'FIRST_CALL' ? 'Calling...' : 'Trigger Call 1'}
            </button>
            <button
              onClick={() => handleTriggerCall('SECOND_CALL')}
              disabled={calling !== null}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {calling === 'SECOND_CALL' ? 'Calling...' : 'Trigger Call 2'}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="ml-auto rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? 'Removing...' : 'Remove Contact'}
            </button>
          </div>
          {callSuccess && (
            <p className="mt-2 text-sm text-emerald-600">{callSuccess}</p>
          )}
          {callError && (
            <p className="mt-2 text-sm text-red-600">{callError}</p>
          )}
        </div>

        {/* Call History */}
        <div className="p-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Call History</h3>

          {contact.callLogs.length === 0 ? (
            <p className="text-sm text-gray-400">No calls made yet.</p>
          ) : (
            <div className="space-y-3">
              {contact.callLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                        {log.callPhase === 'FIRST_CALL' ? 'Call 1' : 'Call 2'}
                      </span>
                      <span className="text-xs text-gray-400">Attempt #{log.attemptNumber}</span>
                    </div>
                    <span className={`text-sm font-medium ${outcomeColor(log.outcome)}`}>
                      {outcomeLabel(log.outcome)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {log.calledAt ? formatDateTime(log.calledAt) : 'Scheduled: ' + formatDateTime(log.scheduledAt)}
                    {log.duration && ` • ${log.duration}s`}
                  </div>
                  {log.confirmationStatus && (
                    <div className="mt-1">
                      <StatusBubble
                        variant={log.confirmationStatus === 'CONFIRMED' ? 'confirmed' : 'not-confirmed'}
                        size="sm"
                      />
                    </div>
                  )}
                  {log.notes && (
                    <p className="mt-2 text-xs text-gray-500 italic">{log.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Scheduler State */}
          {schedulerState && (
            <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 p-4">
              <h4 className="text-sm font-semibold text-blue-800">Scheduler Status</h4>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-blue-700">
                <p>Phase: {schedulerState.currentPhase === 'FIRST_CALL' ? 'Call 1' : 'Call 2'}</p>
                <p>Total Attempts: {schedulerState.totalAttempts}</p>
                <p>Next Call: {schedulerState.isComplete ? 'Complete' : formatDateTime(schedulerState.nextCallTime)}</p>
                <p>Today's Attempts: {schedulerState.attemptsToday}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
