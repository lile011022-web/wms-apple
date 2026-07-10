export type AuthenticatedUser = {
  id: string;
  sessionId: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
};
