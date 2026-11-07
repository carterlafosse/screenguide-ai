// validate.js: Zod validation for route inputs: validate({ body, params, query }).
// Parsed values replace req.body and req.params. Express 5's req.query is read-only, so the parsed
// query goes on req.validatedQuery. Failures become a 400 VALIDATION_ERROR listing each issue.
import { AppError } from '../utils/AppError.js';

/**
 * @param {import('zod').ZodError} error
 * @param {'body' | 'params' | 'query'} location
 */
function toDetails(error, location) {
  return error.issues.map((issue) => ({
    location,
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * @param {{ body?: import('zod').ZodType, params?: import('zod').ZodType, query?: import('zod').ZodType }} schemas
 * @returns {import('express').RequestHandler}
 */
export function validate(schemas) {
  return (req, res, next) => {
    const details = [];
    const parsed = {};
    for (const location of /** @type {const} */ (['params', 'query', 'body'])) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse(req[location] ?? {});
      if (result.success) parsed[location] = result.data;
      else details.push(...toDetails(result.error, location));
    }
    if (details.length) return next(AppError.validation(details));

    if ('body' in parsed) req.body = parsed.body;
    if ('params' in parsed) req.params = parsed.params;
    if ('query' in parsed) req.validatedQuery = parsed.query;
    next();
  };
}
