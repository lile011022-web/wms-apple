import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestContext } from '../types/request-context';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<RequestContext>();
  return request.user;
});
