import { APP_CONFIG } from '../config/app-config.js';

export const PaymentMethodOptions = APP_CONFIG.offeringMethodOptions;
export type PaymentMethod = (typeof PaymentMethodOptions)[number]['value'];

export const PaymentMethodLabels: Record<string, string> = Object.fromEntries(
  PaymentMethodOptions.map((method) => [method.value, method.label]),
);

export const CongregationOptions = APP_CONFIG.congregationOptions;
export type Congregation = (typeof CongregationOptions)[number];
export const DonorOtherNameLabel = APP_CONFIG.donorOtherNameLabel;

export const UserRole = {
  ADMIN: 'admin',
  BOOKKEEPER: 'bookkeeper',
  VIEWER: 'viewer',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserRoleLabels: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Admin',
  [UserRole.BOOKKEEPER]: 'Bookkeeper',
  [UserRole.VIEWER]: 'Viewer',
};

export const BatchStatus = {
  OPEN: 'open',
  CLOSED: 'closed',
} as const;

export type BatchStatus = (typeof BatchStatus)[keyof typeof BatchStatus];

export const BatchStatusLabels: Record<BatchStatus, string> = {
  [BatchStatus.OPEN]: 'Open',
  [BatchStatus.CLOSED]: 'Closed',
};
