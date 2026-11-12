// validate.js: Zod validation for route inputs: validate({ body, query, params }).
// Parsed values replace req.body and req.params (unknown keys are stripped, which blocks mass
// assignment). Express 5's req.query is read-only, so the parsed query goes on req.validatedQuery.
// The first failing part (params, then query, then body) is passed on as its ZodError, which the
// error handler turns into a 400 VALIDATION_ERROR with flattened details, the same as Resolvd.

/**
 * @param {{ body?: import('zod').ZodType, query?: import('zod').ZodType, params?: import('zod').ZodType }} schemas
 * @returns {import('express').RequestHandler}
 */
export function validate(schemas) {
  return (req, res, next) => {
    const parsed = {};
    for (const location of /** @type {const} */ (['params', 'query', 'body'])) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse(req[location] ?? {});
      if (!result.success) return next(result.error);
      parsed[location] = result.data;
    }

    if ('body' in parsed) req.body = parsed.body;
    if ('params' in parsed) req.params = parsed.params;
    if ('query' in parsed) req.validatedQuery = parsed.query;
    next();
  };
}
