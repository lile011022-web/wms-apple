import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { map, tap } from 'rxjs';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { requestId?: string }>();
    const response = http.getResponse<Response>();
    const requestId = request.header('x-request-id') ?? randomUUID();
    const startedAt = Date.now();

    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      tap({
        next: () => this.logRequest(request, response, startedAt),
        error: (error: unknown) => this.logRequest(request, response, startedAt, error),
      }),
      map((data: unknown) => {
        if (data && typeof data === 'object' && 'success' in data && 'requestId' in data) {
          return data;
        }

        return {
          success: true,
          data,
          requestId,
        };
      }),
    );
  }

  private logRequest(request: Request, response: Response, startedAt: number, error?: unknown) {
    const durationMs = Date.now() - startedAt;
    const status =
      response.statusCode ||
      (typeof error === 'object' && error && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : 500);
    const log = {
      method: request.method,
      path: request.originalUrl || request.url,
      status,
      duration_ms: durationMs,
      slow: durationMs > 500 || undefined,
    };
    const message = `${log.method} ${log.path} ${log.status} ${log.duration_ms}ms${
      log.slow ? ' SLOW_API' : ''
    }`;

    if (log.slow || status >= 500) {
      console.warn(message, log);
      return;
    }
    console.log(message, log);
  }
}
