import { ERROR_CODES, type ErrorCode, type ErrorDetails } from '@eunomia/shared';

/**
 * Base class for errors that map to a specific HTTP response. Handlers throw
 * these instead of threading status codes through return values; the terminal
 * error middleware turns them into the uniform `{ error: { code, message } }`
 * envelope. AuthError extends this so the whole app shares one error shape.
 *
 * `code` is what the UI translates (see @eunomia/shared), and `details` carries
 * the data its sentence needs — the message repeats that data for API clients
 * and logs, but the UI never has to parse a sentence for it.
 */
export class ApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Code and data of a specific failure case; without it the generic code applies. */
interface ErrorOptions {
  code?: ErrorCode;
  details?: ErrorDetails;
}

export const notFound = (resource = 'Resource'): ApiError =>
  new ApiError(404, ERROR_CODES.NOT_FOUND, `${resource} not found`, { resource });

export const conflict = (message = 'Conflicting request', options: ErrorOptions = {}): ApiError =>
  new ApiError(409, options.code ?? ERROR_CODES.CONFLICT, message, options.details);

export const badRequest = (message = 'Invalid request', options: ErrorOptions = {}): ApiError =>
  new ApiError(400, options.code ?? ERROR_CODES.BAD_REQUEST, message, options.details);
