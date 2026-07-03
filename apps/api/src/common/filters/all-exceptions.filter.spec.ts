/* global jest */
import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessError } from '../errors/business-error';
import { ErrorCode } from '../errors/error-codes';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createHost(requestId = 'req-test-1') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ requestId }),
    }),
  } as ArgumentsHost;

  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  it('formats validation errors with stable details and requestId', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost('req-validation');

    filter.catch(new BadRequestException(['page must not be less than 1']), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        details: {
          fields: ['page must not be less than 1'],
        },
      },
      requestId: 'req-validation',
    });
  });

  it('maps authentication and permission exceptions to contract codes', () => {
    const filter = new AllExceptionsFilter();
    const unauthorized = createHost('req-auth');
    const forbidden = createHost('req-permission');

    filter.catch(new UnauthorizedException('Login required'), unauthorized.host);
    filter.catch(new ForbiddenException('No permission'), forbidden.host);

    expect(unauthorized.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(unauthorized.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ErrorCode.AUTHENTICATION_REQUIRED,
        message: 'Login required',
        details: undefined,
      },
      requestId: 'req-auth',
    });
    expect(forbidden.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(forbidden.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ErrorCode.PERMISSION_DENIED,
        message: 'No permission',
        details: undefined,
      },
      requestId: 'req-permission',
    });
  });

  it('uses business error code, status, and details', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost('req-business');

    filter.catch(
      new BusinessError(
        ErrorCode.BUSINESS_RULE_FAILED,
        'Customer is locked',
        { customerId: 'customer-1' },
        HttpStatus.CONFLICT,
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ErrorCode.BUSINESS_RULE_FAILED,
        message: 'Customer is locked',
        details: { customerId: 'customer-1' },
      },
      requestId: 'req-business',
    });
  });

  it('maps Prisma unique constraint errors to a conflict envelope', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost('req-prisma');
    const exception = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['imei'] },
    });

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ErrorCode.CONFLICT,
        message: '数据已存在，请检查重复的 IMEI、Serial、UPC、SKU 或单号后再重试。',
        details: {
          prismaCode: 'P2002',
          target: ['imei'],
        },
      },
      requestId: 'req-prisma',
    });
  });

  it('maps Prisma transaction timeout errors to a readable conflict envelope', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost('req-prisma-timeout');
    const exception = new Prisma.PrismaClientKnownRequestError('Transaction already closed', {
      code: 'P2028',
      clientVersion: 'test',
    });

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ErrorCode.CONFLICT,
        message:
          '本次入库确认数据量较大，数据库事务超时。请刷新页面后重试；如果仍失败，请联系管理员分批处理。',
        details: {
          prismaCode: 'P2028',
        },
      },
      requestId: 'req-prisma-timeout',
    });
  });
});
