import { HttpStatus } from '@nestjs/common';

export class BusinessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(message);
  }
}
