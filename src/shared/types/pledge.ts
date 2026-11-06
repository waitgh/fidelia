export interface Pledge {
  id: number;
  donorId: number;
  categoryId: number;
  amount: number;
  startDate: string;
  endDate: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PledgeWithDetails extends Pledge {
  donorFirstName: string;
  donorLastName: string;
  donorSpouseName: string | null;
  categoryName: string;
  givenAmount: number;
  fulfillmentPct: number;
}

export interface CreatePledgeInput {
  donorId: number;
  categoryId: number;
  amount: number;
  startDate: string;
  endDate: string;
  notes?: string | null;
}

export interface UpdatePledgeInput extends Partial<CreatePledgeInput> {}
