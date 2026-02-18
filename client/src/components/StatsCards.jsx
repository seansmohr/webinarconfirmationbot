import React from 'react';

function StatCard({ title, value, subtitle, color }) {
  const colorMap = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
  };

  return (
    <div className={`rounded-xl border p-5 ${colorMap[color] || colorMap.blue}`}>
      <p className="text-sm font-medium opacity-70">{title}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {subtitle && <p className="mt-1 text-xs opacity-60">{subtitle}</p>}
    </div>
  );
}

export default function StatsCards({ stats }) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Registrants"
        value={stats.totalContacts}
        subtitle={`${stats.activeSchedules} active schedules`}
        color="blue"
      />
      <StatCard
        title="Call 1 Connected"
        value={stats.call1Connected}
        subtitle={`of ${stats.totalContacts} registrants`}
        color="green"
      />
      <StatCard
        title="Call 2 Confirmed"
        value={stats.call2Confirmed}
        subtitle={`of ${stats.call2Connected} connected`}
        color="amber"
      />
      <StatCard
        title="Connection Rate"
        value={`${stats.connectionRate}%`}
        subtitle={`${stats.connectedCalls} of ${stats.totalCalls} calls`}
        color="purple"
      />
    </div>
  );
}
