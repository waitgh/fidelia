export interface DonorStatement {
  donor: {
    id: number;
    firstName: string;
    lastName: string;
    spouseName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    envelopeNumber: string | null;
  };
  startDate: string;
  endDate: string;
  offerings: {
    date: string;
    category: string;
    amount: number;
    paymentMethod: string;
    checkNumber: string | null;
  }[];
  totalsByCategory: Record<string, number>;
  grandTotal: number;
  pledges: {
    category: string;
    pledgedAmount: number;
    givenAmount: number;
    fulfillmentPct: number;
  }[];
}

export interface CategorySummary {
  categoryId: number;
  categoryName: string;
  totalAmount: number;
  offeringCount: number;
}

export interface PaymentMethodSummary {
  paymentMethod: string;
  totalAmount: number;
  offeringCount: number;
}

export interface CongregationDonorRow {
  donorId: number;
  firstName: string;
  lastName: string;
  envelopeNumber: string | null;
  totalAmount: number;
  offeringCount: number;
}

export interface CongregationOfferingRow {
  offeringId: number;
  date: string;
  donorId: number;
  firstName: string;
  lastName: string;
  envelopeNumber: string | null;
  categoryName: string;
  amount: number;
  paymentMethod: string;
  checkNumber: string | null;
}

export interface CongregationBreakdown {
  congregation: string;
  totalAmount: number;
  offeringCount: number;
  donorCount: number;
  categories: CategorySummary[];
  paymentMethods: PaymentMethodSummary[];
  donors: CongregationDonorRow[];
  offeringDetails: CongregationOfferingRow[];
}

export interface CongregationSummary {
  startDate: string;
  endDate: string;
  congregation: string | null;
  categories: CategorySummary[];
  paymentMethods: PaymentMethodSummary[];
  congregations: CongregationBreakdown[];
  grandTotal: number;
  totalOfferings: number;
  uniqueDonors: number;
}

// ── Trends report ──────────────────────────────────────────────────────────

export type TrendPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface TrendPeriodRow {
  period: string;      // display label: "Jan 2025", "Q1 2025", "2025"
  periodKey: string;   // sort key: "2025-01", "2025-Q1", "2025"
  totalAmount: number;
  offeringCount: number;
  donorCount: number;
}

export interface TrendCategoryRow {
  period: string;
  periodKey: string;
  categoryId: number;
  categoryName: string;
  totalAmount: number;
}

export interface TrendCongregationRow {
  period: string;
  periodKey: string;
  congregation: string; // "Unassigned" when null in DB
  totalAmount: number;
  donorCount: number;
}

export interface TrendsReport {
  period: TrendPeriod;
  startDate: string;
  endDate: string;
  totals: TrendPeriodRow[];
  byCategory: TrendCategoryRow[];
  byCongregation: TrendCongregationRow[];
  categoryNames: string[];
  congregationNames: string[];
}
