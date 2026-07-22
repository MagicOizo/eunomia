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

export interface AppConfig {
  nodeEnv: string;
  port: number;
  isProduction: boolean;
  database: DatabaseConfig;
}

/** Reads and validates the full application config from the environment. */
export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  return {
    nodeEnv,
    port: optionalInt('PORT', 3000),
    isProduction: nodeEnv === 'production',
    database: {
      host: requireString('DB_HOST'),
      port: optionalInt('DB_PORT', 3306),
      user: requireString('DB_USER'),
      password: requireString('DB_PASSWORD'),
      database: requireString('DB_NAME'),
    },
  };
}
