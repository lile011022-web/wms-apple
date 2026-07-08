import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://wms_scan:wms_scan_dev_password@localhost:5432/wms_scan'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev-only-access-secret'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-only-refresh-secret'),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional(),
  GOOGLE_SHEETS_CLIENT_EMAIL: z.string().optional(),
  GOOGLE_SHEETS_PRIVATE_KEY: z.string().optional(),
  GOOGLE_SHEETS_PREALERT_SHEET_NAME: z.string().optional(),
  GOOGLE_SHEETS_ORDER_SHEET_NAME: z.string().optional(),
  GOOGLE_SHEETS_STATUS_SHEET_NAME: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
