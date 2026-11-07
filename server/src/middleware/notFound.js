// notFound.js: answers any route that nothing else matched with a 404 in the standard error shape.
import { AppError } from '../utils/AppError.js';

/** @type {import('express').RequestHandler} */
export function notFound(req, res, next) {
  next(AppError.notFound(`No route for ${req.method} ${req.path}`, 'ROUTE_NOT_FOUND'));
}
