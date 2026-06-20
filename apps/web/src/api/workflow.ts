import { request } from './client';
import type { PaginatedResult } from './types';

type QueryParams = Record<string, string | number | boolean | undefined>;
type Payload = Record<string, unknown>;

export function getHealth() {
  return request<{ status: string; timestamp: string }>('get', '/health');
}

export const customersApi = {
  list: (params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', '/customers', { params }),
  options: (params?: QueryParams) => request<unknown[]>('get', '/customers/options', { params }),
  get: (id: string) => request<unknown>('get', `/customers/${id}`),
  create: (data: Payload) => request<unknown>('post', '/customers', { data }),
  update: (id: string, data: Payload) => request<unknown>('patch', `/customers/${id}`, { data }),
  updateStatus: (id: string, data: Payload) =>
    request<unknown>('patch', `/customers/${id}/status`, { data }),
};

export const productsApi = {
  list: (params?: QueryParams) => request<PaginatedResult<unknown>>('get', '/products', { params }),
  byUpc: (upc: string) => request<unknown>('get', `/products/by-upc/${upc}`),
  create: (data: Payload) => request<unknown>('post', '/products', { data }),
  importProducts: (data: Payload) => request<unknown>('post', '/products/import', { data }),
  update: (id: string, data: Payload) => request<unknown>('patch', `/products/${id}`, { data }),
  updateStatus: (id: string, data: Payload) =>
    request<unknown>('patch', `/products/${id}/status`, { data }),
};

export const inboundApi = {
  createDraft: (data: Payload) => request<unknown>('post', '/inbound/drafts', { data }),
  getDraft: (id: string) => request<unknown>('get', `/inbound/drafts/${id}`),
  scanUps: (id: string, data: Payload) =>
    request<unknown>('post', `/inbound/drafts/${id}/ups`, { data }),
  addItem: (id: string, data: Payload) =>
    request<unknown>('post', `/inbound/drafts/${id}/items`, { data }),
  importItems: (id: string, data: Payload) =>
    request<unknown>('post', `/inbound/drafts/${id}/items/import`, { data }),
  removeItem: (id: string, itemId: string) =>
    request<unknown>('delete', `/inbound/drafts/${id}/items/${itemId}`),
  confirmDraft: (id: string) => request<unknown>('post', `/inbound/drafts/${id}/confirm`),
  records: (params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', '/inbound/records', { params }),
  exportPreview: (data: Payload) =>
    request<unknown>('post', '/inbound/records/export-preview', { data }),
};

export const inventoryApi = {
  customerSummary: (params?: QueryParams) =>
    request<unknown>('get', '/inventory/customer-summary', { params }),
  products: (params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', '/inventory/products', { params }),
  items: (params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', '/inventory/items', { params }),
  availableForOutbound: (params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', '/inventory/available-for-outbound', { params }),
};

export const outboundApi = {
  boxes: (params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', '/outbound/boxes', { params }),
  availableItems: (params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', '/outbound/available-items', { params }),
  createBox: (data: Payload) => request<unknown>('post', '/outbound/boxes', { data }),
  addItem: (boxId: string, data: Payload) =>
    request<unknown>('post', `/outbound/boxes/${boxId}/items`, { data }),
  seal: (boxId: string) => request<unknown>('post', `/outbound/boxes/${boxId}/seal`),
};

export const exceptionsApi = {
  list: (params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', '/exceptions', { params }),
  summary: () => request<unknown>('get', '/exceptions/summary'),
  resolve: (id: string, data: Payload) =>
    request<unknown>('post', `/exceptions/${id}/resolve`, { data }),
  ignore: (id: string, data: Payload) =>
    request<unknown>('post', `/exceptions/${id}/ignore`, { data }),
  invalidate: (id: string, data: Payload) =>
    request<unknown>('post', `/exceptions/${id}/invalidate`, { data }),
  batchResolve: (data: Payload) => request<unknown>('post', '/exceptions/batch-resolve', { data }),
  batchIgnore: (data: Payload) => request<unknown>('post', '/exceptions/batch-ignore', { data }),
};

export const customerChangesApi = {
  candidates: (params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', '/customer-changes/candidates', { params }),
  preview: (data: Payload) => request<unknown>('post', '/customer-changes/preview', { data }),
  commit: (data: Payload) => request<unknown>('post', '/customer-changes/commit', { data }),
  logs: (params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', '/customer-changes/logs', { params }),
};

export const reportsApi = {
  preview: (data: Payload) => request<unknown>('post', '/reports/preview', { data }),
  createExport: (data: Payload) => request<unknown>('post', '/reports/exports', { data }),
  exports: (params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', '/reports/exports', { params }),
  download: (id: string) => request<unknown>('get', `/reports/exports/${id}/download`),
};

export const dashboardApi = {
  summary: (params?: QueryParams) => request<unknown>('get', '/dashboard/summary', { params }),
  trends: (params?: QueryParams) => request<unknown>('get', '/dashboard/trends', { params }),
  exceptionDistribution: (params?: QueryParams) =>
    request<unknown>('get', '/dashboard/exception-distribution', { params }),
  topInboundCustomers: (params?: QueryParams) =>
    request<unknown>('get', '/dashboard/top-inbound-customers', { params }),
};

export const auditLogsApi = {
  recent: () => request<unknown[]>('get', '/audit-logs/recent'),
  list: (params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', '/audit-logs', { params }),
};
