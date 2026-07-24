/**
 * Central, fail-fast reader for the environment variables the API needs.
 * Everything that touches process.env goes through here so a missing or
 * malformed value produces one clear error at startup instead of a confusing
 * failure deep inside the database layer later.
 */

/** Reads a required string variable, throwing a descriptive error if unset/empty. */
function requireString(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Reads an optional integer variable, falling back to the given default. */
function optionalInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got: ${value}`);
  }
  return parsed;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface AuthConfig {
  /** HMAC secret for signing access-token JWTs. */
  jwtSecret: string;
  /** Access-token lifetime in seconds (short — the refresh token is the long-lived one). */
  accessTokenTtlSeconds: number;
  /** Refresh-token lifetime in seconds. */
  refreshTokenTtlSeconds: number;
  /**
   * One-time bootstrap token required by the setup endpoint (see 2.4 / Slice 3).
   * Setup only works while no user exists AND this token is presented, so an
   * exposed API port cannot be used to claim the first admin account. Unset
   * (undefined) disables the setup endpoint entirely.
   */
  setupToken: string | undefined;
}

export interface RateLimitConfig {
  /** Requests per window allowed on the auth endpoints (brute-force protection). */
  authMax: number;
  authWindowMs: number;
  /** Requests per window allowed across the whole API (generous baseline). */
  globalMax: number;
  globalWindowMs: number;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  isProduction: boolean;
  /** Number of proxy hops to trust for the client IP (reverse proxy in front). */
  trustProxy: number;
  database: DatabaseConfig;
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
}

/** Reads an optional string variable, returning undefined when unset/empty. */
function optionalString(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? undefined : value;
}

/**
 * Reads only the database config. Split out so tools that need the database but
 * not the app's auth config (e.g. the seed script) don't have to provide
 * JWT_SECRET etc.
 */
export function loadDatabaseConfig(): DatabaseConfig {
  return {
    host: requireString('DB_HOST'),
    port: optionalInt('DB_PORT', 3306),
    user: requireString('DB_USER'),
    password: requireString('DB_PASSWORD'),
    database: requireString('DB_NAME'),
  };
}

/** Reads and validates the full application config from the environment. */
export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  const jwtSecret = requireString('JWT_SECRET');
  // A short secret undermines HS256 token signing. Enforced only in production
  // so development configs can stay simple.
  if (isProduction && jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters in production — generate one with `openssl rand -base64 64`.',
    );
  }

  return {
    nodeEnv,
    port: optionalInt('PORT', 3000),
    isProduction,
    trustProxy: optionalInt('TRUST_PROXY', 1),
    database: loadDatabaseConfig(),
    auth: {
      jwtSecret,
      accessTokenTtlSeconds: optionalInt('ACCESS_TOKEN_TTL_SECONDS', 15 * 60),
      refreshTokenTtlSeconds: optionalInt('REFRESH_TOKEN_TTL_SECONDS', 30 * 24 * 60 * 60),
      setupToken: optionalString('SETUP_TOKEN'),
    },
    rateLimit: {
      authMax: optionalInt('RATE_LIMIT_AUTH_MAX', 10),
      authWindowMs: optionalInt('RATE_LIMIT_AUTH_WINDOW_MS', 15 * 60 * 1000),
      globalMax: optionalInt('RATE_LIMIT_GLOBAL_MAX', 300),
      globalWindowMs: optionalInt('RATE_LIMIT_GLOBAL_WINDOW_MS', 60 * 1000),
    },
  };
}
