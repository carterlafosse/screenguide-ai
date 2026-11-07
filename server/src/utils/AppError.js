// AppError.js: the one error type services and middleware throw on purpose. The error handler turns
// it into `{ error: { code, message, details? } }` with the given HTTP status.

export class AppError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} code stable machine-readable code, e.g. 'NOT_FOUND'
   * @param {string} message safe to show to the user
   * @param {unknown} [details] optional extra data (e.g. validation issues)
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Bad request', details, code = 'BAD_REQUEST') {
    return new AppError(400, code, message, details);
  }

  static validation(details, message = 'Some fields are missing or invalid') {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Please sign in to continue', code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }

  static forbidden(message = "You don't have permission to do that", code = 'FORBIDDEN') {
    return new AppError(403, code, message);
  }

  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }

  static conflict(message = 'Conflict', code = 'CONFLICT', details) {
    return new AppError(409, code, message, details);
  }

  static unprocessable(message, code = 'UNPROCESSABLE', details) {
    return new AppError(422, code, message, details);
  }

  static tooManyRequests(message = 'Too many requests, please try again later') {
    return new AppError(429, 'RATE_LIMITED', message);
  }

  static internal(message = 'Something went wrong') {
    return new AppError(500, 'INTERNAL_ERROR', message);
  }

  static serviceUnavailable(message = 'Service unavailable', code = 'SERVICE_UNAVAILABLE') {
    return new AppError(503, code, message);
  }
}
