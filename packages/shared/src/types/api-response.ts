export type ApiSuccess<T> = {
  success: true;
  data: T;
  requestId: string;
};

export type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
