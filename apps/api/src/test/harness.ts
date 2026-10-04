/**
 * The preamble every integration test needs: read the database out of the
 * environment, skip cleanly when there is none, build an `AppConfig` that
 * reaches no mail server and no GitHub, and bootstrap the first administrator.
 *
 * It stood character for character in ten test files (CR-32's neighbourhood:
 * the duplication is what made a new test expensive to write, and SEC-17 needs
 * a new one).
 */

import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';

import type { Express } from 'express';
import type { Pool } from 'mariadb';
import request from 'supertest';

import type { AppConfig, DatabaseConfig } from '../config/env.js';
import { createPool, waitForDatabase } from '../db/pool.js';

/** The setup token the tests hand to `POST /setup`; no test needs its own. */
export const SETUP_TOKEN = 'integration-setup-token';

/** Reads DB config from the environment, or null when it isn't fully set. */
export function databaseConfigFromEnv(): DatabaseConfig | null {
  const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) return null;
  return {
    host: DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  };
}

/** A pool on the test database, plus the config it was opened with. */
export interface TestDatabase {
  pool: Pool;
  database: DatabaseConfig;
}

/**
 * Opens the test database, or skips the test and returns null — so a suite
 * stays runnable on a machine without one (CI provides it). The caller owns the
 * pool from here and ends it in a `finally`.
 */
export async function openTestDatabase(t: TestContext): Promise<TestDatabase | null> {
  const database = databaseConfigFromEnv();
  if (!database) {
    t.skip('no database configured (DB_* env vars unset)');
    return null;
  }
  const pool = createPool(database);
  try {
    await waitForDatabase(pool, { retries: 5, delayMs: 500 });
  } catch {
    await pool.end();
    t.skip('database not reachable');
    return null;
  }
  return { pool, database };
}

/**
 * Every application table, children before parents. Each suite used to carry
 * its own list, and each list was the same one with different omissions — which
 * is why one of them (reminders) already carried a note about leftovers from
 * another suite's run. One complete wipe is both shorter and more honest: a
 * suite starts on an empty database, whatever ran before it.
 *
 * The catalog tables the migrations own stay: `Permissions`, and the two system
 * roles. A role a test built itself does not.
 */
const RESET_STATEMENTS = [
  'DELETE FROM InvoiceReminders',
  'DELETE FROM Allocations',
  'DELETE FROM ServiceBillings',
  'DELETE FROM SubmissionInvoices',
  'DELETE FROM InvoiceExclusions',
  'DELETE FROM InvoiceTreatmentDays',
  'DELETE FROM Invoices',
  'DELETE FROM Submissions',
  'DELETE FROM ContractPremiums',
  'DELETE FROM ContractBonusTiers',
  'DELETE FROM ContractYears',
  'DELETE FROM ContractTerms',
  'DELETE FROM Contracts',
  'DELETE FROM InsuranceCompanies',
  'DELETE FROM AgencyBankAccounts',
  'DELETE FROM CollectionAgencies',
  'DELETE FROM Facilities',
  // SystemSettings references Users, so it goes before the user rows.
  'DELETE FROM SystemSettings',
  'DELETE FROM RefreshTokens',
  'DELETE FROM UserAccountRoles',
  'DELETE FROM UserRoles',
  'DELETE FROM Users',
  'DELETE FROM Accounts',
  'DELETE FROM RolePermissions WHERE roleID IN (SELECT roleID FROM Roles WHERE isSystem = 0)',
  'DELETE FROM Roles WHERE isSystem = 0',
];

/**
 * Empties the test database. Destructive by design — which is why the suites
 * run against `eunomia_test` and never against the dev database (DEV.md).
 */
export async function resetData(pool: Pool): Promise<void> {
  for (const statement of RESET_STATEMENTS) {
    await pool.query(statement);
  }
}

/** The few values a suite actually varies; everything else is fixed below. */
export interface TestConfigOverrides {
  /** Omitted only by tests that build routers without ever querying. */
  database?: DatabaseConfig;
  /** Set by the suites that store secrets (settings, reminders). */
  configEncryptionKey?: Buffer | null;
}

/** The app configuration every integration test runs against. */
export function testConfig(overrides: TestConfigOverrides = {}): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    isProduction: false,
    database: overrides.database ??
      // Never connected to: the structural tests build routers to read their
      // route table, which touches no database at all.
      { host: 'unused.invalid', port: 3306, user: 'none', password: 'none', database: 'none' },
    auth: {
      jwtSecret: 'test-secret-please-ignore',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 3600,
      setupToken: SETUP_TOKEN,
    },
    trustProxy: 1,
    // High enough that no suite trips the limiter; the limits themselves have
    // their own test.
    rateLimit: { authMax: 100000, authWindowMs: 60000, globalMax: 100000, globalWindowMs: 60000 },
    // Disabled so no test ever reaches out to GitHub.
    updateCheck: {
      enabled: false,
      repository: 'MagicOizo/eunomia',
      token: undefined,
      cacheTtlMs: 0,
    },
    configEncryptionKey: overrides.configEncryptionKey ?? null,
  };
}

/** A bearer header, as the tests pass it to supertest's `.set()`. */
export type AuthHeader = Record<string, string>;

/** The credentials of the administrator `bootstrapAdmin` creates. */
export const ADMIN = { email: 'admin@example.com', password: 'adminpass1', firstname: 'Ada' };

/**
 * Runs the setup endpoint and logs in — the first administrator holds every
 * permission globally, which is the state of a fresh instance and therefore
 * what a test that says nothing about permissions runs as.
 *
 * The UUID comes back because the user administration needs it to prove what
 * one cannot do to oneself; most suites destructure only `admin`.
 */
export async function bootstrapAdmin(
  app: Express,
  credentials: { email: string; password: string; firstname: string } = ADMIN,
): Promise<{ admin: AuthHeader; uuid: string }> {
  const setup = await request(app)
    .post('/api/v1/setup')
    .set('X-Setup-Token', SETUP_TOKEN)
    .send(credentials);
  assert.equal(setup.status, 201, JSON.stringify(setup.body));
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: credentials.email, password: credentials.password });
  assert.equal(login.status, 200, 'the bootstrapped administrator should log in');
  return {
    admin: { Authorization: `Bearer ${login.body.accessToken}` },
    uuid: setup.body.user.uuid as string,
  };
}
