import { Joi } from "../utils/validate.js";

export type Env = {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  DATABASE_URL: string;
  CORS_ORIGINS: string;
  JWT_SECRET: string;
  OTP_PEPPER?: string;
  AUTH_COOKIE_NAME: string;
  FRONTEND_URL: string;
  APP_PUBLIC_URL?: string;
  DEVICE_TOKEN_PEPPER?: string;
  DEVICE_LIMIT_DEFAULT: number;
  DEVICE_AUTH_TOKEN_DAYS: number;
  ACTIVATION_SESSION_MINUTES: number;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_REDIRECT_URI?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
  SMTP_SECURE?: boolean;
  LICENSE_SIGNING_KEY_ID?: string;
  LICENSE_SIGNING_PRIVATE_KEY?: string;
  LICENSE_SIGNING_PUBLIC_KEY?: string;
  LICENSE_ISSUER_VERSION: number;
  LICENSE_GRACE_DAYS: number;
  LICENSE_MAX_OFFLINE_DAYS: number;
  LICENSE_TRIAL_DAYS: number;
  APP_RELEASE_MANIFEST_JSON?: string;
  STORAGE_LOCAL_DIR?: string;
  STORAGE_BUCKET?: string;
  PAYMENT_UPI_ID?: string;
  PAYMENT_PAYEE_NAME?: string;
  PAYMENT_QR_IMAGE_URL?: string;
  SMTP_TO?: string;
  CRON_SECRET?: string;
  NOTIFICATIONS_MAX_ATTEMPTS?: number;
  DEVICE_RESET_COOLDOWN_DAYS: number;
  DEVICE_RESET_MAX_REQUESTS_30D: number;
  DEVICE_RESET_REQUIRE_DEVICE_ID: boolean;
};

const envSchema = Joi.object<Env>({
  NODE_ENV: Joi.string().valid("development", "test", "production").default("development"),
  PORT: Joi.number().integer().positive().default(4000),
  DATABASE_URL: Joi.string().min(1).required(),
  CORS_ORIGINS: Joi.string().default("http://localhost:3000,http://localhost:3001"),

  JWT_SECRET: Joi.string().min(16).required(),
  OTP_PEPPER: Joi.string().min(8).optional(),
  AUTH_COOKIE_NAME: Joi.string().default("ekotsa_session"),
  FRONTEND_URL: Joi.string().uri().default("http://localhost:3000"),
  APP_PUBLIC_URL: Joi.string().uri().optional(),

  DEVICE_TOKEN_PEPPER: Joi.string().min(8).optional(),
  DEVICE_LIMIT_DEFAULT: Joi.number().integer().positive().default(2),
  DEVICE_AUTH_TOKEN_DAYS: Joi.number().integer().positive().default(30),
  ACTIVATION_SESSION_MINUTES: Joi.number().integer().positive().default(15),

  GOOGLE_OAUTH_CLIENT_ID: Joi.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: Joi.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: Joi.string().uri().optional(),

  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().integer().optional(),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  SMTP_FROM: Joi.string().optional(),
  SMTP_SECURE: Joi.boolean().truthy("true").falsy("false").optional(),

  LICENSE_SIGNING_KEY_ID: Joi.string().optional(),
  LICENSE_SIGNING_PRIVATE_KEY: Joi.string().optional(),
  LICENSE_SIGNING_PUBLIC_KEY: Joi.string().optional(),
  LICENSE_ISSUER_VERSION: Joi.number().integer().positive().default(1),
  LICENSE_GRACE_DAYS: Joi.number().integer().min(0).max(30).default(7),
  LICENSE_MAX_OFFLINE_DAYS: Joi.number().integer().min(1).max(180).default(30),
  LICENSE_TRIAL_DAYS: Joi.number().integer().min(1).max(90).default(21),

  APP_RELEASE_MANIFEST_JSON: Joi.string().optional(),
  STORAGE_LOCAL_DIR: Joi.string().optional(),
  STORAGE_BUCKET: Joi.string().default("payment-proofs"),
  PAYMENT_UPI_ID: Joi.string().optional(),
  PAYMENT_PAYEE_NAME: Joi.string().optional(),
  PAYMENT_QR_IMAGE_URL: Joi.string().uri().optional(),

  SMTP_TO: Joi.string().email().optional(),
  CRON_SECRET: Joi.string().min(8).optional(),
  NOTIFICATIONS_MAX_ATTEMPTS: Joi.number().integer().min(1).max(20).default(6),
  DEVICE_RESET_COOLDOWN_DAYS: Joi.number().integer().min(0).max(90).default(7),
  DEVICE_RESET_MAX_REQUESTS_30D: Joi.number().integer().min(0).max(20).default(2),
  DEVICE_RESET_REQUIRE_DEVICE_ID: Joi.boolean().truthy("true").falsy("false").default(false),
}).unknown(true);

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;

  const { error, value } = envSchema.validate(process.env, {
    abortEarly: false,
    convert: true,
    stripUnknown: false,
  });

  if (error) {
    const details = error.details.map((d) => d.message).join("; ");
    throw new Error(`Invalid environment: ${details}`);
  }

  cached = value as Env;
  return cached;
}

export function getCorsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getOtpPepper(env: Env): string {
  return env.OTP_PEPPER || env.JWT_SECRET;
}

export function getDevicePepper(env: Env): string {
  return env.DEVICE_TOKEN_PEPPER || env.JWT_SECRET;
}
