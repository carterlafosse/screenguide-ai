// env.js: loads server/.env and validates every environment variable with Zod. Importing `env`
// exits the process with a readable message if anything is missing or malformed (values are never
// printed, only which variables failed and why). parseEnv() is exported for tests.
import './loadDotenv.js';
import { z } from 'zod';

/** Treat empty strings (e.g. `KEY=` in .env) as "not set". */
const optional = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
const withDefault = (schema, value) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.default(value));
const flag = (value) => withDefault(z.stringbool(), value);

const BASE64_32_BYTES = (v) =>
  /^[A-Za-z0-9+/]+={0,2}$/.test(v) && Buffer.from(v, 'base64').length === 32;

export const envSchema = z.object({
  NODE_ENV: withDefault(z.enum(['development', 'test', 'production']), 'development'),
  PORT: withDefault(z.coerce.number().int().min(1).max(65535), 4001),
  // Proxy hops in front of the API (Vercel → Render). Sets Express 'trust proxy' so req.ip, and
  // therefore rate limiting, sees the real client address. Same variable as Resolvd.
  TRUST_PROXY_HOPS: withDefault(z.coerce.number().int().min(0).max(10), 1),
  LOG_LEVEL: withDefault(
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
    'info',
  ),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// URL' }),
  MIGRATION_DATABASE_URL: optional(z.url({ protocol: /^postgres(ql)?$/ })),

  JWT_SECRET: z
    .string({ error: 'is required' })
    .regex(/^[0-9a-fA-F]{96,}$/, 'must be at least 48 random bytes as hex (96+ hex characters)'),
  CLIENT_ORIGIN: z.url({ protocol: /^https?$/, error: 'must be an http(s) origin' }),
  PUBLIC_WS_URL: z.url({ protocol: /^wss?$/, error: 'must be a ws:// or wss:// URL' }),
  ENCRYPTION_KEY: z
    .string({ error: 'is required' })
    .refine(BASE64_32_BYTES, 'must be exactly 32 random bytes, base64-encoded'),

  ANTHROPIC_API_KEY: optional(z.string()),
  AI_MODEL_FAST: withDefault(z.string(), 'claude-haiku-5-5'),
  AI_MODEL_SMART: withDefault(z.string(), 'claude-sonnet-5-5'),
  AI_MOCK: flag(false),

  DEEPGRAM_API_KEY: optional(z.string()),
  ELEVENLABS_API_KEY: optional(z.string()),
  ELEVENLABS_VOICE_ID: optional(z.string()),
  ELEVENLABS_MODEL_ID: optional(z.string()),

  RESEND_API_KEY: optional(z.string()),
  EMAIL_FROM: withDefault(z.string(), 'ScreenGuide <help@yourdomain.com>'),

  PRIVACY_CONTACT_EMAIL: optional(z.email()),
  DISABLE_PLAN_LIMITS: flag(false),
  DEMO_RESET: flag(false),
});

export class EnvError extends Error {}

/**
 * Validate an env object. Throws EnvError listing the problems (never the values).
 * @param {Record<string, string | undefined>} source
 * @returns {z.infer<typeof envSchema>}
 */
export function parseEnv(source) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return Object.freeze(result.data);
}

function loadOrExit() {
  try {
    return parseEnv(process.env);
  } catch (err) {
    if (!(err instanceof EnvError)) throw err;
    console.error(`${err.message}\n\nCheck server/.env against server/.env.example.`);
    process.exit(1);
  }
}

export const env = loadOrExit();

/** True in production (secure cookies, 0.0.0.0, no pretty logs). Same export as Resolvd. */
export const isProd = env.NODE_ENV === 'production';
