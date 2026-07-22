/**
 * Base class for errors that map to a specific HTTP response. Handlers throw
 * these instead of threading status codes through return values; the terminal
 * error middleware turns them into the uniform `{ error: { code, message } }`
 * envelope. AuthError extends this so the whole app shares one error shape.
 */
export class ApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export const notFound = (resource = 'Resource'): ApiError =>
  new ApiError(404, 'NOT_FOUND', `${resource} not found`);

export const conflict = (message = 'Conflicting request'): ApiError =>
  new ApiError(409, 'CONFLICT', message);

export const badRequest = (message = 'Invalid request'): ApiError =>
  new ApiError(400, 'BAD_REQUEST', message);
