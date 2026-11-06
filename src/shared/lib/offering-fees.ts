const VENMO_FEE_RATE = 0.019;
const VENMO_FEE_FIXED = 0.10;

const PAYPAL_FEE_RATE = 0.0199;
const PAYPAL_FEE_FIXED = 0.49;

function normalizePaymentMethod(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

const FEE_BEARING_METHODS: Record<string, { rate: number; fixed: number }> = {
  venmo: { rate: VENMO_FEE_RATE, fixed: VENMO_FEE_FIXED },
  paypal: { rate: PAYPAL_FEE_RATE, fixed: PAYPAL_FEE_FIXED },
};

const FEE_EXEMPT_CATEGORIES = new Set(['lunch']);

function normalizeCategoryName(value: string): string {
  return value.toLowerCase().trim();
}

export function isFeeExemptPaymentMethod(paymentMethod: string): boolean {
  return !(normalizePaymentMethod(paymentMethod) in FEE_BEARING_METHODS);
}

export function isFeeExemptCategory(categoryName: string): boolean {
  return FEE_EXEMPT_CATEGORIES.has(normalizeCategoryName(categoryName));
}

export function calculateOfferingFee(
  amount: number,
  paymentMethod: string,
  categoryName?: string,
): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (categoryName && isFeeExemptCategory(categoryName)) return null;
  const method = normalizePaymentMethod(paymentMethod);
  const schedule = FEE_BEARING_METHODS[method];
  if (!schedule) return null;
  return Math.round((amount * schedule.rate + schedule.fixed) * 100) / 100;
}
