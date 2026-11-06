import type { StatementEmailConfig, StatementEmailRecipient } from '../../shared/types/index.js';

import { getDb, getUserName, markDirty } from '../data/session';
import { getMailer } from '../mail/types';
import * as statementEmailsData from '../data/statementEmails';
import type { AppDb } from '../data/db';
import * as categoriesData from '../data/categories';
import * as donorsData from '../data/donors';
import * as batchesData from '../data/batches';
import * as offeringsData from '../data/offerings';
import * as pledgesData from '../data/pledges';
import * as settingsData from '../data/settings';
import * as reportsData from '../data/reports';

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

export const api = {
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

  settings: {
    getAll: () => read((db) => settingsData.getAllSettings(db)),
    update: (key: string, value: unknown) => write((db) => settingsData.updateSetting(db, key, value)),
  },

  statementEmails: {
    config: (): Promise<StatementEmailConfig> => {
      const m = getMailer();
      return Promise.resolve({
        configured: !!m,
        dryRun: m?.provider === 'dry-run',
        sender: m?.sender() ?? null,
        missing: m ? [] : ['Sign in with Microsoft 365 or Gmail in Settings to send statements'],
      });
    },
    recipients: (startDate: string, endDate: string): Promise<StatementEmailRecipient[]> =>
      read((db) => statementEmailsData.listRecipients(db, startDate, endDate)),
    send: async (data: statementEmailsData.SendRequest) => {
      const db = getDb();
      const prep = statementEmailsData.prepareSend(db, data);
      const mailer = getMailer();
      if (!mailer) throw new Error('Email sending is not set up');
      const attempt = { donorId: data.donorId, startDate: data.startDate, endDate: data.endDate, to: prep.to, sentBy: getUserName() };
      try {
        const status = await mailer.send({
          to: prep.to,
          subject: prep.subject,
          bodyText: data.body,
          attachments: [{ filename: prep.filename, contentType: 'application/pdf', contentBase64: data.pdfBase64 }],
        });
        if (!prep.isTest) {
          statementEmailsData.recordAttempt(db, { ...attempt, status });
          markDirty();
        }
        return { ok: true, status, to: prep.to };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Send failed';
        if (!prep.isTest) {
          statementEmailsData.recordAttempt(db, { ...attempt, status: 'failed', error: message });
          markDirty();
        }
        throw new Error(message);
      }
    },
  },

  reports: {
    dashboard: () => read((db) => reportsData.dashboard(db)),
    donorStatement: (donorId: number, startDate: string, endDate: string) =>
      read((db) => reportsData.donorStatement(db, donorId, startDate, endDate)),
    congregationSummary: (startDate: string, endDate: string, congregation?: string) =>
      read((db) => reportsData.congregationSummary(db, startDate, endDate, congregation)),
    trends: (
      period: 'weekly' | 'monthly' | 'quarterly' | 'yearly',
      startDate: string,
      endDate: string,
      congregation?: string,
    ) => read((db) => reportsData.trends(db, period, startDate, endDate, congregation)),
  },
};
