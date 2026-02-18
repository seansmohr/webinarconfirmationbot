import React, { useState, useCallback } from 'react';
import { useDashboardStats, useDashboardContacts, triggerSync } from './hooks/useDashboard.js';
import StatsCards from './components/StatsCards.jsx';
import Filters from './components/Filters.jsx';
import ContactTable from './components/ContactTable.jsx';
import ContactDetail from './components/ContactDetail.jsx';

export default function App() {
  const [filters, setFilters] = useState({});
  const [selectedContact, setSelectedContact] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const { stats, loading: statsLoading, refetch: refetchStats } = useDashboardStats();
  const { contacts, total, loading: contactsLoading, refetch: refetchContacts } = useDashboardContacts(filters);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await triggerSync();
      console.log('Sync result:', result);
      await refetchStats();
      await refetchContacts();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  }, [refetchStats, refetchContacts]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-mohr-dark">
                Medicare 101 Workshop
              </h1>
              <p className="text-sm text-gray-500">
                Webinar Confirmation Dashboard — Mohr Insurance Services
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Auto-refreshing
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-6">
          {statsLoading ? (
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200" />
              ))}
            </div>
          ) : (
            <StatsCards stats={stats} />
          )}
        </div>

        {/* Status Bubble Legend */}
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Status Legend</h3>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Connected / Confirmed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                No Connection
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Not Yet Confirmed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                In Progress
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                Pending
              </span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4">
          <Filters
            filters={filters}
            onFilterChange={setFilters}
            onSync={handleSync}
            syncing={syncing}
          />
        </div>

        {/* Results count */}
        <div className="mb-2 text-sm text-gray-500">
          Showing {total} contact{total !== 1 ? 's' : ''}
        </div>

        {/* Contact Table */}
        {contactsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-200" />
            ))}
          </div>
        ) : (
          <ContactTable
            contacts={contacts}
            onSelectContact={(contact) => setSelectedContact(contact.id)}
          />
        )}
      </main>

      {/* Contact Detail Modal */}
      {selectedContact && (
        <ContactDetail
          contactId={selectedContact}
          onClose={() => setSelectedContact(null)}
        />
      )}
    </div>
  );
}
