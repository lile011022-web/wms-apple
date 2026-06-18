import axios from 'axios';
import type { ApiResponse } from '@wms-scan/shared';
import { authTokenStore } from './token-store';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1',
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  const accessToken = authTokenStore.getAccessToken();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly requestId?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function request<T>(
  method: 'get' | 'post' | 'patch' | 'delete',
  url: string,
  options?: {
    data?: unknown;
    params?: Record<string, unknown>;
  },
) {
  const response = await apiClient
    .request<ApiResponse<T>>({
      method,
      url,
      data: options?.data,
      params: options?.params,
    })
    .catch((error: unknown) => {
      const apiFailure = axios.isAxiosError<ApiResponse<T>>(error)
        ? error.response?.data
        : undefined;

      if (apiFailure?.success === false) {
        throw new ApiClientError(
          apiFailure.error.message,
          apiFailure.error.code,
          apiFailure.requestId,
          apiFailure.error.details,
        );
      }

      throw error;
    });

  if (!response.data.success) {
    throw new ApiClientError(
      response.data.error.message,
      response.data.error.code,
      response.data.requestId,
      response.data.error.details,
    );
  }

  return response.data.data;
}
