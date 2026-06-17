import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user';

export type RequestContext = Request & {
  requestId?: string;
  user?: AuthenticatedUser;
};
