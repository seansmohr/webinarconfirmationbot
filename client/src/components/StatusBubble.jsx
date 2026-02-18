import React from 'react';

/**
 * StatusBubble — Visual indicator for call status.
 *
 * Variants:
 * - connected (green)    — Call 1: Successfully connected
 * - not-connected (red)  — Call 1: Attempted but not connected
 * - confirmed (green)    — Call 2: Confirmed attendance
 * - not-confirmed (amber)— Call 2: Connected but not confirmed
 * - pending (blue)       — Calls still in progress
 * - inactive (gray)      — Not yet started
 */
const VARIANTS = {
  connected: {
    bg: 'bg-emerald-100',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    label: 'Connected',
  },
  'not-connected': {
    bg: 'bg-red-100',
    dot: 'bg-red-500',
    text: 'text-red-700',
    label: 'No Connection',
  },
  confirmed: {
    bg: 'bg-emerald-100',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    label: 'Confirmed',
  },
  'not-confirmed': {
    bg: 'bg-amber-100',
    dot: 'bg-amber-500',
    text: 'text-amber-700',
    label: 'Not Confirmed',
  },
  pending: {
    bg: 'bg-blue-100',
    dot: 'bg-blue-500',
    text: 'text-blue-700',
    label: 'In Progress',
  },
  inactive: {
    bg: 'bg-gray-100',
    dot: 'bg-gray-400',
    text: 'text-gray-500',
    label: 'Pending',
  },
};

export default function StatusBubble({ variant, label, size = 'md' }) {
  const config = VARIANTS[variant] || VARIANTS.inactive;
  const displayLabel = label || config.label;

  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-xs'
    : 'px-3 py-1 text-sm';

  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${config.bg} ${config.text} ${sizeClasses}`}
    >
      <span className={`${dotSize} rounded-full ${config.dot} ${variant === 'pending' ? 'animate-pulse' : ''}`} />
      {displayLabel}
    </span>
  );
}

/**
 * Helper to determine the correct bubble variant for Call 1.
 */
export function getCall1Variant(call1Status) {
  if (!call1Status) return 'inactive';
  if (call1Status.connected) return 'connected';
  if (call1Status.attempts > 0) return 'not-connected';
  return 'inactive';
}

/**
 * Helper to determine the correct bubble variant for Call 2.
 */
export function getCall2Variant(call2Status) {
  if (!call2Status) return 'inactive';
  if (call2Status.confirmed) return 'confirmed';
  if (call2Status.connected) return 'not-confirmed';
  if (call2Status.attempts > 0) return 'not-connected';
  return 'inactive';
}
