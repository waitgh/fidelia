import type { StatementEmailConfig, StatementEmailRecipient } from '../../shared/types/index.js';

import { getDb, markDirty } from '../data/session';
import type { AppDb } from '../data/db';
import * as categoriesData from '../data/categories';
import * as donorsData from '../data/donors';
import * as batchesData from '../data/batches';
import * as offeringsData from '../data/offerings';
import * as pledgesData from '../data/pledges';
import * as settingsData from '../data/settings';

const BASE_URL = '/api';

/** Runs a read against the open local database. */
function read<T>(fn: (db: AppDb) => T): Promise<T> {
  try {
    return Promise.resolve(fn(getDb()));
  } catch (e) {
    return Promise.reject(e);
  }
}

/** Runs a write against the open local database and triggers autosave. */
function write<T>(fn: (db: AppDb) => T): Promise<T> {
  try {
    const r = fn(getDb());
    markDirty();
    return Promise.resolve(r);
  } catch (e) {
    return Promise.reject(e);
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 401 && !url.startsWith('/auth/')) {
    window.dispatchEvent(new Event('auth:expired'));
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<{ id: number; username: string; displayName: string; role: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    me: () =>
      request<{ id: number; username: string; displayName: string; role: string }>('/auth/me'),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ ok: boolean }>('/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
  },

  users: {
    list: () => request<any[]>('/users'),
    create: (data: { username: string; displayName: string; password: string; role: string }) =>
      request<any>('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Record<string, unknown>) =>
      request<any>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    resetPassword: (id: number, password: string) =>
      request<{ ok: boolean }>(`/users/${id}/reset-password`, {
        method: 'PUT',
        body: JSON.stringify({ password }),
      }),
    delete: (id: number) => request<{ ok: boolean }>(`/users/${id}`, { method: 'DELETE' }),
  },

  donors: {
    list: (search?: string, showInactive?: boolean) => read((db) => donorsData.listDonors(db, search, showInactive)),
    get: (id: number) => read((db) => donorsData.getDonor(db, id)),
    create: (data: any) => write((db) => donorsData.createDonor(db, data)),
    update: (id: number, data: any) => write((db) => donorsData.updateDonor(db, id, data)),
    delete: (id: number) => write((db) => donorsData.deleteDonor(db, id)),
    checkEnvelope: (envelopeNumber: string, excludeId?: number) =>
      read((db) => donorsData.isEnvelopeTaken(db, envelopeNumber, excludeId)),
  },

  categories: {
    list: () => read((db) => categoriesData.listCategories(db)),
    create: (data: any) => write((db) => categoriesData.createCategory(db, data)),
    update: (id: number, data: any) => write((db) => categoriesData.updateCategory(db, id, data)),
  },

  batches: {
    list: (params?: { limit?: number; offset?: number; description?: string }) =>
      read((db) => batchesData.listBatches(db, params)),
    get: (id: number) => read((db) => batchesData.getBatch(db, id)),
    create: (data: any) => write((db) => batchesData.createBatch(db, data)),
    update: (id: number, data: any) => write((db) => batchesData.updateBatch(db, id, data)),
    delete: (id: number) => write((db) => batchesData.deleteBatch(db, id)),
    close: (id: number) => write((db) => batchesData.closeBatch(db, id)),
    reopen: (id: number) => write((db) => batchesData.reopenBatch(db, id)),
  },

  offerings: {
    list: (params?: Record<string, string>) => read((db) => offeringsData.listOfferings(db, params)),
    create: (data: any) => write((db) => offeringsData.createOffering(db, data)),
    update: (id: number, data: any) => write((db) => offeringsData.updateOffering(db, id, data)),
    delete: (id: number) => write((db) => offeringsData.deleteOffering(db, id)),
    reassign: (id: number, batchId: number) => write((db) => offeringsData.reassignOffering(db, id, batchId)),
  },

  pledges: {
    list: (params?: Record<string, string>) => read((db) => pledgesData.listPledges(db, params)),
    get: (id: number) => read((db) => pledgesData.getPledge(db, id)),
    create: (data: any) => write((db) => pledgesData.createPledge(db, data)),
    update: (id: number, data: any) => write((db) => pledgesData.updatePledge(db, id, data)),
    delete: (id: number) => write((db) => pledgesData.deletePledge(db, id)),
  },

  sync: {
    pull: (force = false) =>
      request<{ status: string; message: string; sizeKB?: number }>('/sync/pull', {
        method: 'POST',
        body: JSON.stringify({ force }),
      }),
    push: (force = false) =>
      request<{ status: string; message: string; sizeKB?: number }>('/sync/push', {
        method: 'POST',
        body: JSON.stringify({ force }),
      }),
    status: () => request<{ configured: boolean; remote: string | null }>('/sync/status'),
    rcloneInfo: () =>
      request<{
        installed: boolean;
        version: string;
        remotes: { name: string; type: string }[];
        currentRemote: string | null;
      }>('/sync/rclone-info'),
    encryptionStatus: () =>
      request<{
        enabled: boolean;
        unlocked: boolean;
        hasLocalPassphrase: boolean;
        usingEnvPassphrase: boolean;
      }>('/sync/encryption-status'),
    saveEncryptionPassphrase: (passphrase: string) =>
      request<{ ok: boolean }>('/sync/encryption-passphrase', {
        method: 'POST',
        body: JSON.stringify({ passphrase }),
      }),
    clearEncryptionPassphrase: () =>
      request<{ ok: boolean }>('/sync/encryption-passphrase', {
        method: 'DELETE',
      }),
    testConnection: (remote: string) =>
      request<{ ok: boolean; error?: string }>('/sync/test-connection', {
        method: 'POST',
        body: JSON.stringify({ remote }),
      }),
    browseFolders: (remoteName: string, path = '') =>
      request<{ ok: boolean; folders: string[]; error?: string }>('/sync/browse-folders', {
        method: 'POST',
        body: JSON.stringify({ remoteName, path }),
      }),
    setupProvider: (provider: string) =>
      request<{ ok: boolean; remoteName?: string; error?: string }>('/sync/setup-provider', {
        method: 'POST',
        body: JSON.stringify({ provider }),
      }),
    deleteRemote: (remoteName: string) =>
      request<{ ok: boolean; error?: string }>('/sync/delete-remote', {
        method: 'POST',
        body: JSON.stringify({ remoteName }),
      }),
  },

  settings: {
    getAll: () => read((db) => settingsData.getAllSettings(db)),
    update: (key: string, value: unknown) => write((db) => settingsData.updateSetting(db, key, value)),
  },

  auditLog: {
    list: (params: { startDate?: string; endDate?: string; username?: string; action?: string; limit?: number; offset?: number } = {}) => {
      const p = new URLSearchParams();
      if (params.startDate) p.set('startDate', params.startDate);
      if (params.endDate) p.set('endDate', params.endDate);
      if (params.username) p.set('username', params.username);
      if (params.action) p.set('action', params.action);
      if (params.limit !== undefined) p.set('limit', String(params.limit));
      if (params.offset !== undefined) p.set('offset', String(params.offset));
      return request<any>(`/audit?${p}`);
    },
  },

  statementEmails: {
    config: () => request<StatementEmailConfig>('/statement-emails/config'),
    recipients: (startDate: string, endDate: string) =>
      request<StatementEmailRecipient[]>(`/statement-emails/recipients?${new URLSearchParams({ startDate, endDate })}`),
    send: (data: {
      donorId: number;
      startDate: string;
      endDate: string;
      subject: string;
      body: string;
      pdfBase64: string;
      filename: string;
      testTo?: string;
    }) =>
      request<{ ok: boolean; status: 'sent' | 'dry_run'; to: string[] }>('/statement-emails/send', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  reports: {
    dashboard: () => request<any>('/reports/dashboard'),
    donorStatement: (donorId: number, startDate: string, endDate: string) =>
      request<any>(`/reports/donor-statement?donorId=${donorId}&startDate=${startDate}&endDate=${endDate}`),
    congregationSummary: (startDate: string, endDate: string, congregation?: string) => {
      const params = new URLSearchParams({ startDate, endDate });
      if (congregation) params.set('congregation', congregation);
      return request<any>(`/reports/congregation-summary?${params}`);
    },
    trends: (
      period: 'weekly' | 'monthly' | 'quarterly' | 'yearly',
      startDate: string,
      endDate: string,
      congregation?: string,
    ) => {
      const params = new URLSearchParams({ period, startDate, endDate });
      if (congregation) params.set('congregation', congregation);
      return request<any>(`/reports/trends?${params}`);
    },
  },
};
