export const BUSINESS_RULES = {
  inboundRequiresLockedCustomer: true,
  outboundMustUseCurrentCustomerInventory: true,
  imeiIsPrimaryTrackingId: true,
  batchCustomerChangeRequiresAuditLog: true,
} as const;
