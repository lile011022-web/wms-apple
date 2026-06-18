export type PaginatedResult<T> = {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
};

export type AuthSession = {
  user: CurrentUser;
  tokens: AuthTokens;
};
