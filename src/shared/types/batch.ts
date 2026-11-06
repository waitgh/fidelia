import type { BatchStatus } from './enums.js';

export interface Batch {
  id: number;
  date: string;
  description: string | null;
  status: BatchStatus;
  createdAt: string;
  closedAt: string | null;
}

export interface BatchWithTotals extends Batch {
  totalAmount: number;
  offeringCount: number;
}

export interface CreateBatchInput {
  date: string;
  description?: string | null;
}

export interface UpdateBatchInput extends Partial<CreateBatchInput> {
  status?: BatchStatus;
}
