import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiClientError, request } from './client';
import { authTokenStore } from './token-store';

function createLocalStorageMock() {
  const values = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear()),
  };
}

describe('frontend API client', () => {
  let originalAdapter: typeof apiClient.defaults.adapter;

  beforeEach(() => {
    originalAdapter = apiClient.defaults.adapter;
    vi.stubGlobal('window', {
      localStorage: createLocalStorageMock(),
    });
    authTokenStore.clear();
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    vi.unstubAllGlobals();
  });

  it('attaches the persisted bearer token and unwraps successful envelopes', async () => {
    authTokenStore.setTokens({
      accessToken: 'access-token-1',
      refreshToken: 'refresh-token-1',
    });
    const adapter = vi.fn(async (config) => ({
      data: {
        success: true,
        data: { status: 'ok' },
        requestId: 'req-1',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }));
    apiClient.defaults.adapter = adapter;

    await expect(request<{ status: string }>('get', '/health')).resolves.toEqual({ status: 'ok' });
    expect(adapter).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token-1',
        }),
      }),
    );
  });

  it('throws ApiClientError for failed API envelopes', async () => {
    apiClient.defaults.adapter = vi.fn(async (config) => ({
      data: {
        success: false,
        requestId: 'req-2',
        error: {
          code: 'BUSINESS_ERROR',
          message: 'Customer is inactive.',
          details: { customerId: 'customer-1' },
        },
      },
      status: 409,
      statusText: 'Conflict',
      headers: {},
      config,
    }));

    await expect(request('post', '/customers')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'BUSINESS_ERROR',
      message: 'Customer is inactive.',
      requestId: 'req-2',
      details: { customerId: 'customer-1' },
    } satisfies Partial<ApiClientError>);
  });

  it('unwraps failed API envelopes from rejected HTTP responses', async () => {
    apiClient.defaults.adapter = vi.fn(async (config) => {
      throw {
        isAxiosError: true,
        response: {
          data: {
            success: false,
            requestId: 'req-3',
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Inbound draft has no confirmable items.',
            },
          },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          config,
        },
        config,
      };
    });

    await expect(request('post', '/inbound/drafts/draft-1/confirm')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'VALIDATION_ERROR',
      message: 'Inbound draft has no confirmable items.',
      requestId: 'req-3',
    } satisfies Partial<ApiClientError>);
  });
});
