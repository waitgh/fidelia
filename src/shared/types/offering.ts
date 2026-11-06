import type { PaymentMethod } from './enums.js';

export interface Offering {
  id: number;
  batchId: number;
  donorId: number;
  categoryId: number;
  amount: number;
  paymentMethod: PaymentMethod;
  checkNumber: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfferingWithDetails extends Offering {
  donorFirstName: string;
  donorLastName: string;
  categoryName: string;
  batchDate: string;
}

export interface CreateOfferingInput {
  batchId: number;
  donorId: number;
  categoryId: number;
  amount: number;
  paymentMethod: PaymentMethod;
  checkNumber?: string | null;
  notes?: string | null;
}

export interface UpdateOfferingInput extends Partial<Omit<CreateOfferingInput, 'batchId'>> {}
