import axios from 'axios';
import type { ApiResponse } from '@wms-scan/shared';
import { authTokenStore } from './token-store';

type AuthRefreshData = {
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
};

const authFailureCodes = new Set(['AUTHENTICATION_REQUIRED', 'AUTHENTICATION_FAILED']);
const credentialEndpoints = new Set(['/auth/login', '/auth/register']);
let refreshPromise: Promise<boolean> | null = null;

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
    timeout?: number;
  },
) {
  const startedAt = performance.now();
  const config = {
    method,
    url,
    data: options?.data,
    params: options?.params,
    timeout: options?.timeout,
  };
  const response = await apiClient.request<ApiResponse<T>>(config).catch(async (error: unknown) => {
    const apiFailure = axios.isAxiosError<ApiResponse<T>>(error) ? error.response?.data : undefined;
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    logApiTiming(method, url, startedAt, status);

    if (apiFailure?.success === false) {
      if (isAuthFailure(apiFailure) && shouldTryRefresh(url)) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          return apiClient.request<ApiResponse<T>>(config);
        }
      }

      throw toApiClientError(apiFailure, { notifyAuthExpired: shouldNotifyAuthExpired(url) });
    }

    throw error;
  });
  logApiTiming(method, url, startedAt, response.status);

  if (!response.data.success) {
    if (isAuthFailure(response.data) && shouldTryRefresh(url)) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        const retryResponse = await apiClient.request<ApiResponse<T>>(config);
        if (retryResponse.data.success) {
          return retryResponse.data.data;
        }
        throw toApiClientError(retryResponse.data, {
          notifyAuthExpired: shouldNotifyAuthExpired(url),
        });
      }
    }

    throw toApiClientError(response.data, { notifyAuthExpired: shouldNotifyAuthExpired(url) });
  }

  return response.data.data;
}

function logApiTiming(method: string, url: string, startedAt: number, status?: number) {
  if (!import.meta.env.DEV) {
    return;
  }
  const durationMs = Math.round(performance.now() - startedAt);
  const message = `[api] ${method.toUpperCase()} ${url} ${status ?? '-'} ${durationMs}ms`;
  if (durationMs > 800) {
    console.warn(message);
    return;
  }
  console.debug(message);
}

function isAuthFailure<T>(failure: ApiResponse<T>) {
  return !failure.success && authFailureCodes.has(failure.error.code);
}

function shouldTryRefresh(url: string) {
  return url !== '/auth/refresh' && !credentialEndpoints.has(url);
}

function shouldNotifyAuthExpired(url: string) {
  return !credentialEndpoints.has(url);
}

function toApiClientError<T>(
  failure: ApiResponse<T>,
  options: { notifyAuthExpired?: boolean } = {},
) {
  if (!failure.success && isAuthFailure(failure)) {
    const notifyExpired = options.notifyAuthExpired ?? true;
    authTokenStore.clear();
    if (notifyExpired) {
      notifyAuthExpired();
    }
    return new ApiClientError(
      notifyExpired ? '登录已过期，请重新登录。' : failure.error.message,
      failure.error.code,
      failure.requestId,
      {
        ...failure.error.details,
        originalMessage: failure.error.message,
      },
    );
  }

  if (!failure.success) {
    return new ApiClientError(
      failure.error.message,
      failure.error.code,
      failure.requestId,
      failure.error.details,
    );
  }

  return new ApiClientError('请求失败', 'UNKNOWN_ERROR');
}

async function refreshAccessToken() {
  const refreshToken = authTokenStore.getRefreshToken();
  if (!refreshToken) {
    authTokenStore.clear();
    notifyAuthExpired();
    return false;
  }

  refreshPromise ??= apiClient
    .request<ApiResponse<AuthRefreshData>>({
      method: 'post',
      url: '/auth/refresh',
      data: { refreshToken },
    })
    .then((response) => {
      if (!response.data.success) {
        return false;
      }

      authTokenStore.setTokens(response.data.data.tokens);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });

  const refreshed = await refreshPromise;
  if (!refreshed) {
    authTokenStore.clear();
    notifyAuthExpired();
  }

  return refreshed;
}

function notifyAuthExpired() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new window.Event('wms-scan-auth-expired'));
  }
}
