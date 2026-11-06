/**
 * Offerings listed on a donor statement but left out of its tax-deductible total:
 * - Lunch is a meal payment, not a contribution.
 * - Charitable (donor-advised fund) and PayPal Giving gifts are receipted by the fund itself.
 */
const STATEMENT_EXCLUDED_CATEGORIES = new Set(['lunch']);
const STATEMENT_EXCLUDED_METHODS = new Set(['charitable', 'paypal_giving']);

export function isExcludedFromStatementTotal(o: { category: string; paymentMethod: string }): boolean {
  return (
    STATEMENT_EXCLUDED_CATEGORIES.has(o.category.trim().toLowerCase()) ||
    STATEMENT_EXCLUDED_METHODS.has(o.paymentMethod)
  );
}
