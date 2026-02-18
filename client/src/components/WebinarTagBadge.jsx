import React from 'react';

const TAG_COLORS = {
  'tuesday 11am': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'tuesday 6pm': 'bg-violet-100 text-violet-700 border-violet-200',
  'thursday 1pm': 'bg-sky-100 text-sky-700 border-sky-200',
  'saturday 11am': 'bg-rose-100 text-rose-700 border-rose-200',
  'friday 5pm': 'bg-amber-100 text-amber-700 border-amber-200',
};

const TAG_LABELS = {
  'tuesday 11am': 'Tue 11am CST',
  'tuesday 6pm': 'Tue 6pm CST',
  'thursday 1pm': 'Thu 1pm CST',
  'saturday 11am': 'Sat 11am CST',
  'friday 5pm': 'Fri 5pm PST',
};

export default function WebinarTagBadge({ tag }) {
  const colorClass = TAG_COLORS[tag] || 'bg-gray-100 text-gray-700 border-gray-200';
  const label = TAG_LABELS[tag] || tag;

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}
