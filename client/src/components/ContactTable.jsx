import React from 'react';
import StatusBubble, { getCall1Variant, getCall2Variant } from './StatusBubble.jsx';
import WebinarTagBadge from './WebinarTagBadge.jsx';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPhase(phase) {
  if (phase === 'FIRST_CALL') return 'Call 1';
  if (phase === 'SECOND_CALL') return 'Call 2';
  return '—';
}

export default function ContactTable({ contacts, onSelectContact }) {
  if (!contacts || contacts.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p className="text-gray-500">No contacts found. Sync contacts from GHL to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              Contact
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              Webinar
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              Call 1 Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              Call 2 Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              Phase
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              Next Call
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              Attempts
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {contacts.map((contact) => (
            <tr
              key={contact.id}
              className="cursor-pointer transition-colors hover:bg-blue-50"
              onClick={() => onSelectContact?.(contact)}
            >
              <td className="px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">
                    {contact.firstName} {contact.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{contact.phone || contact.email || '—'}</p>
                </div>
              </td>
              <td className="px-4 py-3">
                <WebinarTagBadge tag={contact.webinarTag} />
              </td>
              <td className="px-4 py-3">
                <StatusBubble
                  variant={getCall1Variant(contact.call1)}
                  size="sm"
                />
                {contact.call1.attempts > 0 && (
                  <span className="ml-1 text-xs text-gray-400">
                    ({contact.call1.attempts})
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <StatusBubble
                  variant={getCall2Variant(contact.call2)}
                  size="sm"
                />
                {contact.call2.attempts > 0 && (
                  <span className="ml-1 text-xs text-gray-400">
                    ({contact.call2.attempts})
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-gray-600">
                  {contact.isComplete ? (
                    <span className="text-emerald-600 font-medium">Complete</span>
                  ) : (
                    formatPhase(contact.currentPhase)
                  )}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-gray-500">
                  {contact.isComplete ? '—' : formatDate(contact.nextCallTime)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-gray-500">{contact.totalAttempts}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
