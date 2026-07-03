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
import { Prisma } from '@prisma/client';
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

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.toPrismaErrorResponse(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      },
    };
  }

  private toPrismaErrorResponse(exception: Prisma.PrismaClientKnownRequestError): {
    status: HttpStatus;
    error: ErrorBody;
  } {
    if (exception.code === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        error: {
          code: ErrorCode.CONFLICT,
          message: '数据已存在，请检查重复的 IMEI、Serial、UPC、SKU 或单号后再重试。',
          details: this.toPrismaDetails(exception),
        },
      };
    }

    if (exception.code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        error: {
          code: ErrorCode.RESOURCE_NOT_FOUND,
          message: '请求的数据不存在或已被处理，请刷新页面后重试。',
          details: this.toPrismaDetails(exception),
        },
      };
    }

    if (exception.code === 'P2028') {
      return {
        status: HttpStatus.CONFLICT,
        error: {
          code: ErrorCode.CONFLICT,
          message:
            '本次入库确认数据量较大，数据库事务超时。请刷新页面后重试；如果仍失败，请联系管理员分批处理。',
          details: this.toPrismaDetails(exception),
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: '数据库操作失败，请刷新页面后重试；如果仍失败，请联系管理员。',
        details: this.toPrismaDetails(exception),
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

  private toPrismaDetails(
    exception: Prisma.PrismaClientKnownRequestError,
  ): Record<string, unknown> | undefined {
    const target = exception.meta?.target;
    if (!target) {
      return {
        prismaCode: exception.code,
      };
    }

    return {
      prismaCode: exception.code,
      target,
    };
  }
}
