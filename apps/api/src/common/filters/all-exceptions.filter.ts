import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BusinessError } from '../errors/business-error';
import { ApiErrorCode, ErrorCode } from '../errors/error-codes';

type ErrorBody = {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const { status, error } = this.toErrorResponse(exception);

    response.status(status).json({
      success: false,
      error,
      requestId: request.requestId ?? 'unknown',
    });
  }

  private toErrorResponse(exception: unknown): { status: HttpStatus; error: ErrorBody } {
    if (exception instanceof BusinessError) {
      return {
        status: exception.status,
        error: {
          code: exception.code as ApiErrorCode,
          message: exception.message,
          details: exception.details,
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        error: {
          code: this.toCode(exception, status),
          message: this.toMessage(exception),
          details: this.toDetails(exception),
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      },
    };
  }

  private toCode(exception: HttpException, status: HttpStatus): ApiErrorCode {
    if (exception instanceof UnauthorizedException) {
      return ErrorCode.AUTHENTICATION_REQUIRED;
    }

    if (exception instanceof ForbiddenException) {
      return ErrorCode.PERMISSION_DENIED;
    }

    if (exception instanceof BadRequestException) {
      return ErrorCode.VALIDATION_FAILED;
    }

    if (exception instanceof NotFoundException) {
      return ErrorCode.RESOURCE_NOT_FOUND;
    }

    if (status === HttpStatus.CONFLICT) {
      return ErrorCode.CONFLICT;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return ErrorCode.INTERNAL_SERVER_ERROR;
    }

    return ErrorCode.BUSINESS_RULE_FAILED;
  }

  private toMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'object' && response !== null && 'message' in response) {
      const message = (response as { message: unknown }).message;
      return Array.isArray(message) ? 'Validation failed' : String(message);
    }

    return exception.message;
  }

  private toDetails(exception: HttpException): Record<string, unknown> | undefined {
    const response = exception.getResponse();

    if (typeof response !== 'object' || response === null || !('message' in response)) {
      return undefined;
    }

    const message = (response as { message: unknown }).message;
    if (!Array.isArray(message)) {
      return undefined;
    }

    return {
      fields: message,
    };
  }
}
