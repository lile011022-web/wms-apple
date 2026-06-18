export type IntegrationStep = {
  order: number;
  title: string;
  endpoints: string[];
  owner:
    | 'platform'
    | 'auth'
    | 'customers'
    | 'products'
    | 'inbound'
    | 'inventory'
    | 'outbound'
    | 'exceptions'
    | 'reports'
    | 'settings';
};

export const apiIntegrationSteps: IntegrationStep[] = [
  { order: 1, title: 'Health and errors', endpoints: ['GET /health'], owner: 'platform' },
  {
    order: 2,
    title: 'Login, current user, permissions',
    endpoints: ['POST /auth/login', 'POST /auth/refresh', 'POST /auth/logout', 'GET /auth/me'],
    owner: 'auth',
  },
  {
    order: 3,
    title: 'Customer options',
    endpoints: ['GET /customers/options'],
    owner: 'customers',
  },
  { order: 4, title: 'UPC lookup', endpoints: ['GET /products/by-upc/:upc'], owner: 'products' },
  {
    order: 5,
    title: 'Customer CRUD',
    endpoints: ['GET /customers', 'POST /customers', 'PATCH /customers/:id'],
    owner: 'customers',
  },
  {
    order: 6,
    title: 'UPC product CRUD',
    endpoints: ['GET /products', 'POST /products', 'PATCH /products/:id'],
    owner: 'products',
  },
  {
    order: 7,
    title: 'Inbound draft and confirmation',
    endpoints: [
      'POST /inbound/drafts',
      'POST /inbound/drafts/:id/items',
      'POST /inbound/drafts/:id/confirm',
    ],
    owner: 'inbound',
  },
  { order: 8, title: 'Inbound records', endpoints: ['GET /inbound/records'], owner: 'inbound' },
  {
    order: 9,
    title: 'Customer inventory',
    endpoints: ['GET /inventory/items', 'GET /inventory/customer-summary'],
    owner: 'inventory',
  },
  {
    order: 10,
    title: 'Outbound packing',
    endpoints: [
      'GET /outbound/available-items',
      'POST /outbound/boxes',
      'POST /outbound/boxes/:id/items',
      'POST /outbound/boxes/:id/seal',
    ],
    owner: 'outbound',
  },
  {
    order: 11,
    title: 'Exception pool',
    endpoints: [
      'GET /exceptions',
      'POST /exceptions/:id/resolve',
      'POST /exceptions/:id/ignore',
      'POST /exceptions/batch-resolve',
      'POST /exceptions/batch-ignore',
    ],
    owner: 'exceptions',
  },
  {
    order: 12,
    title: 'Batch customer change',
    endpoints: [
      'GET /customer-changes/candidates',
      'POST /customer-changes/preview',
      'POST /customer-changes/commit',
    ],
    owner: 'customers',
  },
  {
    order: 13,
    title: 'Detail download',
    endpoints: ['POST /reports/preview', 'POST /reports/exports', 'GET /reports/exports'],
    owner: 'reports',
  },
  {
    order: 14,
    title: 'Dashboard',
    endpoints: [
      'GET /dashboard/summary',
      'GET /dashboard/trends',
      'GET /dashboard/exception-distribution',
      'GET /dashboard/top-inbound-customers',
      'GET /audit-logs/recent',
    ],
    owner: 'reports',
  },
  {
    order: 15,
    title: 'System settings save all',
    endpoints: ['GET /warehouses', 'GET /settings', 'PATCH /settings'],
    owner: 'settings',
  },
];
