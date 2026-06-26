import { request } from './client';
import type { PaginatedResult } from './types';

type QueryParams = Record<string, string | number | boolean | undefined>;
type Payload = Record<string, unknown>;

const outboundEvidenceMaxBytes = 100 * 1024 * 1024;
const outboundPhotoCompressTargetBytes = 3 * 1024 * 1024;
const outboundPhotoMaxSide = 1800;
const outboundEvidenceUploadTimeoutMs = 180000;

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
  updateItem: (id: string, itemId: string, data: Payload) =>
    request<unknown>('patch', `/inbound/drafts/${id}/items/${itemId}`, { data }),
  importItems: (id: string, data: Payload) =>
    request<unknown>('post', `/inbound/drafts/${id}/items/import`, { data }),
  removeItem: (id: string, itemId: string) =>
    request<unknown>('delete', `/inbound/drafts/${id}/items/${itemId}`),
  confirmDraft: (id: string) => request<unknown>('post', `/inbound/drafts/${id}/confirm`),
  records: (params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', '/inbound/records', { params }),
  forceConfirmRecord: (id: string, data: Payload) =>
    request<unknown>('post', `/inbound/records/${id}/force-confirm`, { data }),
  correctRecordUpc: (id: string, data: Payload) =>
    request<unknown>('patch', `/inbound/records/${id}/upc`, { data }),
  correctRecord: (id: string, data: Payload) =>
    request<unknown>('patch', `/inbound/records/${id}/correction`, { data }),
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
  getBox: (boxId: string) => request<unknown>('get', `/outbound/boxes/${boxId}`),
  boxItems: (boxId: string, params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', `/outbound/boxes/${boxId}/items`, { params }),
  availableItems: (params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', '/outbound/available-items', { params }),
  createBox: (data: Payload) => request<unknown>('post', '/outbound/boxes', { data }),
  updateBox: (boxId: string, data: Payload) =>
    request<unknown>('patch', `/outbound/boxes/${boxId}`, { data }),
  addItem: (boxId: string, data: Payload) =>
    request<unknown>('post', `/outbound/boxes/${boxId}/items`, { data }),
  removeItem: (boxId: string, itemId: string) =>
    request<unknown>('delete', `/outbound/boxes/${boxId}/items/${itemId}`),
  clearItems: (boxId: string) => request<unknown>('delete', `/outbound/boxes/${boxId}/items`),
  seal: (boxId: string) => request<unknown>('post', `/outbound/boxes/${boxId}/seal`),
  reopen: (boxId: string) => request<unknown>('post', `/outbound/boxes/${boxId}/reopen`),
  deleteBox: (boxId: string) => request<unknown>('delete', `/outbound/boxes/${boxId}`),
  uploadPhoto: async (boxId: string, file: File) => {
    const uploadFile = await prepareOutboundEvidenceFile(file);
    const data = new FormData();
    data.append('photo', uploadFile, uploadFile.name);
    return request<unknown>('post', `/outbound/boxes/${boxId}/photos`, {
      data,
      timeout: outboundEvidenceUploadTimeoutMs,
    });
  },
  deletePhoto: (boxId: string, photoId: string) =>
    request<unknown>('delete', `/outbound/boxes/${boxId}/photos/${photoId}`),
};

async function prepareOutboundEvidenceFile(file: File) {
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    throw new Error('请选择照片或视频文件后再上传。');
  }

  if (file.type.startsWith('video/')) {
    if (!isApiSupportedVideoType(file.type)) {
      throw new Error('当前仅支持 MP4、MOV 或 WebM 视频。');
    }
    if (file.size > outboundEvidenceMaxBytes) {
      throw new Error('视频太大，请选择 100 MB 以内的视频后再上传。');
    }
    return file;
  }

  if (file.size <= outboundPhotoCompressTargetBytes && isApiSupportedPhotoType(file.type)) {
    return file;
  }

  const compressed = await compressImageToJpeg(file);
  if (compressed && compressed.size < file.size) {
    return compressed;
  }

  if (file.size > outboundEvidenceMaxBytes) {
    throw new Error('照片太大，请在手机相册中选择较小照片，或重新拍摄后再上传。');
  }

  return file;
}

function isApiSupportedPhotoType(type: string) {
  return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
}

function isApiSupportedVideoType(type: string) {
  return type === 'video/mp4' || type === 'video/quicktime' || type === 'video/webm';
}

async function compressImageToJpeg(file: File) {
  if (typeof document === 'undefined') {
    return null;
  }

  const image = await loadImage(file).catch(() => null);
  if (!image) {
    return null;
  }

  const scale = Math.min(
    1,
    outboundPhotoMaxSide / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.82),
  );
  if (!blob) {
    return null;
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'packing-photo';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

async function loadImage(file: File) {
  const objectUrl = URL.createObjectURL(file);

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image could not be loaded.'));
    };
    image.src = objectUrl;
  });
}

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
  inboundBatches: (params?: QueryParams) =>
    request<PaginatedResult<unknown>>('get', '/reports/inbound-batches', { params }),
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
