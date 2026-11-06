export interface Donor {
  id: number;
  firstName: string;
  lastName: string;
  spouseName: string | null;
  chineseName: string | null;
  congregation: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  envelopeNumber: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDonorInput {
  firstName: string;
  lastName: string;
  spouseName?: string | null;
  chineseName?: string | null;
  congregation?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  envelopeNumber?: string | null;
  notes?: string | null;
}

export interface UpdateDonorInput extends Partial<CreateDonorInput> {
  isActive?: boolean;
}
