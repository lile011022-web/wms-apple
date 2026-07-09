export const packagePrealertsEnabled = ['true', '1', 'yes'].includes(
  (import.meta.env.VITE_ENABLE_PACKAGE_PREALERTS ?? 'false').toLowerCase(),
);
