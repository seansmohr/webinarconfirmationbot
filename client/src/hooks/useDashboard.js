import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api/dashboard';

export function useDashboardStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}

export function useDashboardContacts(filters = {}) {
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.webinarTag) params.set('webinarTag', filters.webinarTag);
      if (filters.status) params.set('status', filters.status);
      if (filters.search) params.set('search', filters.search);

      const res = await fetch(`${API_BASE}/contacts?${params.toString()}`);
      const data = await res.json();
      setContacts(data.contacts || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    } finally {
      setLoading(false);
    }
  }, [filters.webinarTag, filters.status, filters.search]);

  useEffect(() => {
    fetchContacts();
    const interval = setInterval(fetchContacts, 30000);
    return () => clearInterval(interval);
  }, [fetchContacts]);

  return { contacts, total, loading, refetch: fetchContacts };
}

export function useContactDetail(contactId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contactId) return;

    async function fetchDetail() {
      try {
        const res = await fetch(`${API_BASE}/contact/${contactId}`);
        const result = await res.json();
        setData(result);
      } catch (error) {
        console.error('Failed to fetch contact detail:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDetail();
  }, [contactId]);

  return { data, loading };
}

export async function triggerSync() {
  try {
    const res = await fetch('/api/sync/contacts', { method: 'POST' });
    return await res.json();
  } catch (error) {
    console.error('Failed to trigger sync:', error);
    throw error;
  }
}
