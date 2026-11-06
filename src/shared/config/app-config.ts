export interface SelectOption {
  value: string;
  label: string;
}

export interface AppConfig {
  congregationOptions: string[];
  offeringMethodOptions: SelectOption[];
  donorOtherNameLabel: string;
}

/**
 * Central app-level configuration.
 * Update this file to tailor the app for a different church context.
 */
export const APP_CONFIG: AppConfig = {
  congregationOptions: [
    'Mandarin',
    'Cantonese',
    'Springfield',
    'English',
    'Friends',
    'Others',
  ],
  offeringMethodOptions: [
    { value: 'cash', label: 'Cash' },
    { value: 'check', label: 'Check' },
    { value: 'zelle', label: 'Zelle' },
    { value: 'paypal', label: 'PayPal' },
    { value: 'venmo', label: 'Venmo' },
    { value: 'paypal_giving', label: 'PayPal Giving' },
    { value: 'charitable', label: 'Charitable' },
    { value: 'other', label: 'Other' },
    { value: 'import', label: 'Import' },
  ],
  donorOtherNameLabel: 'Other Name',
};
