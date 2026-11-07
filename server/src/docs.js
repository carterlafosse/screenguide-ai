// docs.js: serves the OpenAPI document (server/openapi.yaml) as Swagger UI at /api/docs and as JSON
// at /api/docs/openapi.json.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';

const OPENAPI_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../openapi.yaml');

/** The parsed OpenAPI document (read once at startup). */
export const openApiDocument = parse(readFileSync(OPENAPI_PATH, 'utf8'));

export function docsRouter() {
  const router = Router();
  router.get('/openapi.json', (req, res) => {
    res.json(openApiDocument);
  });
  router.use(
    '/',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, { customSiteTitle: 'ScreenGuide AI API' }),
  );
  return router;
}
