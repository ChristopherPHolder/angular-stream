import { BadRequestException } from '@nestjs/common';
import { BadRequestError } from '@push-based/angular-stream-node';

/**
 * The error to hand Nest for one the renderer threw. Nest maps an error to its
 * status only when it is an `HttpException` (or http-errors'), and global
 * filters match on those classes, so the adapter's `BadRequestError` becomes a
 * `BadRequestException`. Anything else stays as it is, a `500`.
 */
export function toNestError(error: unknown): unknown {
  return error instanceof BadRequestError
    ? new BadRequestException(error.message, { cause: error })
    : error;
}
