import type { PermissionKey } from '@eunomia/shared';

import { logEvent } from './log.js';

/**
 * The audit trail (Sicherheits-Review, SEC-09). `lib/log.ts` already had the
 * greppable one-line format; what was missing is that anything security-
 * relevant ever used it. Until now the log knew about mail, reminders, the
 * update check and a decryption failure — not about a single login, a single
 * refused request, a single user, role, purge or setting.
 *
 * Why a catalogue instead of `logEvent` calls at the sites: an event name is a
 * documented search string (`docker logs eunomia | grep TRASH_PURGED`), so it
 * is an interface. Here it cannot be mistyped, and a field cannot be invented
 * at a call site — which is also what keeps the two rules below enforceable in
 * one place rather than in seventeen.
 *
 * **Rule 1 — no case data in a line (invariant I-7).** A line carries UIDs,
 * not labels. A trash entry reads as "Rechnung 2026-0042, Max Mustermann" in
 * the UI; in the log it is its kind and its UID. The one personal datum that
 * does appear is a user's email address on a failed login, and only because a
 * line without it cannot tell a targeted attack from a spray (decision of the
 * author, 2026-10-04). It is an account identifier, not health data.
 *
 * **Rule 2 — no values from the settings.** SETTINGS_CHANGED names the keys
 * that were written or cleared, never what they were set to. A mail password
 * has no business in a log line, not even as a "new value".
 *
 * Each function builds its field object key by key rather than spreading its
 * argument: the order of the fields is the shape of the line an operator
 * reads, and a spread would leave it to the order the caller happened to use.
 *
 * The level follows one rule: **info** is a successful, intended action by a
 * named user; **warn** is an action that was refused, or one that destroys or
 * hands out rights. So an operator watching stderr sees the login that failed,
 * the record that is gone for good and the role that was granted, and does not
 * have to wade through the ones that merely succeeded.
 */

/** Every event this module can write. The test holds DEV.md against this list. */
export const AUDIT_EVENTS = [
  'AUTH_LOGIN_OK',
  'AUTH_LOGIN_FAILED',
  'AUTH_LOGOUT',
  'AUTH_PASSWORD_CHANGED',
  'AUTH_SETUP_COMPLETED',
  'AUTH_UNAUTHENTICATED',
  'AUTH_FORBIDDEN',
  'AUTH_REFRESH_REUSE',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DEACTIVATED',
  'USER_RESTORED',
  'USER_PURGED',
  'USER_ROLES_CHANGED',
  'TRASH_PURGED',
  'TRASH_RESTORED',
  'RETENTION_SWEPT',
  'SETTINGS_CHANGED',
] as const;

export type AuditEvent = (typeof AUDIT_EVENTS)[number];

/**
 * The source address of a request, as `req.ip` hands it over. Express resolves
 * it through `trust proxy` (see app.ts), so behind the documented reverse proxy
 * this is the real client and not the proxy. It can be undefined on a socket
 * that has already gone away, which prints as no field at all rather than as
 * the string "undefined" (see log.ts).
 */
export type SourceIp = string | undefined;

/** Why a login did not happen. The answer to the client stays the same for all three. */
export type LoginFailure = 'unknown_user' | 'bad_password' | 'user_inactive';

/**
 * Why a request counted as unauthenticated. `token_expired` is deliberately
 * part of the type although it is never logged: the decision not to write it
 * belongs next to the other reasons, where it can be read.
 */
export type AuthFailure =
  'no_token' | 'token_expired' | 'invalid_token' | 'unknown_user' | 'user_inactive';

/**
 * A signed-in user, as every admin event names the one who acted.
 *
 * A type alias rather than an interface, here and below, and that is not a
 * matter of taste: only an alias gets the implicit index signature that makes
 * it assignable to `LogFields`. An interface would have to be spread at every
 * call to be accepted.
 */
type Actor = {
  /**
   * The acting user's UUID — or `SYSTEM_ACTOR` for the one caller that is not
   * a person (the retention sweep).
   */
  actor: string;
};

/**
 * Who acted when nobody did: the retention period (retention/sweep.ts) removes
 * records on a timer, and the line it writes is the same `TRASH_PURGED` an
 * administrator's button writes — the act is identical, only the actor is not a
 * user. A fixed word rather than an empty field, so `grep 'actor=system'`
 * answers "what did the instance delete by itself".
 */
export const SYSTEM_ACTOR = 'system';

/** What identifies the request a guard refused. */
type RequestOrigin = {
  method: string;
  path: string;
  ip: SourceIp;
};

export function auditLoginOk(fields: { user: string; ip: SourceIp }): void {
  logEvent('info', 'AUTH_LOGIN_OK', fields);
}

export function auditLoginFailed(fields: {
  email: string;
  ip: SourceIp;
  reason: LoginFailure;
}): void {
  logEvent('warn', 'AUTH_LOGIN_FAILED', fields);
}

/** `user` is unknown when the presented refresh token belongs to no row. */
export function auditLogout(fields: { user: string | null; ip: SourceIp }): void {
  logEvent('info', 'AUTH_LOGOUT', { user: fields.user ?? 'unknown', ip: fields.ip });
}

export function auditPasswordChanged(fields: {
  user: string;
  sessionsEnded: number;
  ip: SourceIp;
}): void {
  logEvent('info', 'AUTH_PASSWORD_CHANGED', fields);
}

/**
 * The one moment an instance hands out full rights out of nothing, so it is a
 * warn: on a running instance this line must never appear a second time.
 */
export function auditSetupCompleted(fields: { user: string; email: string; ip: SourceIp }): void {
  logEvent('warn', 'AUTH_SETUP_COMPLETED', fields);
}

/**
 * A request refused for want of a usable token. An **expired** access token
 * never gets here: it is the normal end of every 15-minute token in every open
 * browser tab, and a line for it would bury the ones that mean something
 * (decision of the author, 2026-10-04). The caller filters, so that the reason
 * list above stays complete.
 */
export function auditUnauthenticated(fields: RequestOrigin & { reason: AuthFailure }): void {
  logEvent('warn', 'AUTH_UNAUTHENTICATED', fields);
}

/**
 * A request refused for want of a permission. `account` is present when the
 * check was account-scoped — without it the same line would not say whether
 * the permission is missing entirely or only for this insured person.
 */
export function auditForbidden(
  fields: RequestOrigin & {
    user: string;
    permission: PermissionKey | undefined;
    account: string | undefined;
  },
): void {
  logEvent('warn', 'AUTH_FORBIDDEN', fields);
}

/**
 * The one audit event that already existed, written by hand in `auth/service.ts`
 * since the session slice. It belongs in the catalogue like the other
 * thirteen — an event that is documented but not listed here is one the
 * documentation test cannot hold.
 */
export function auditRefreshReuse(fields: { user: string; sessionsEnded: number }): void {
  logEvent('warn', 'AUTH_REFRESH_REUSE', fields);
}

export function auditUserCreated(fields: Actor & { user: string }): void {
  logEvent('info', 'USER_CREATED', fields);
}

/**
 * `fields` names which keys the request body carried — never their values, so
 * a password reset reads `fields=password` and nothing more. `status` is the
 * exception that is worth its value: it is the difference between an edit and
 * a deactivation, which is why that case is written at warn.
 */
export function auditUserUpdated(
  fields: Actor & { user: string; fields: string[]; status?: number },
): void {
  logEvent(fields.status === 0 ? 'warn' : 'info', 'USER_UPDATED', {
    actor: fields.actor,
    user: fields.user,
    fields: fields.fields.join(','),
    status: fields.status,
  });
}

export function auditUserDeactivated(fields: Actor & { user: string }): void {
  logEvent('warn', 'USER_DEACTIVATED', fields);
}

/**
 * A deleted user brought back. Warn, because it hands an account its way in
 * again — the counterpart of the deletion, not a correction of a typo. It
 * returns deactivated (see `restoreUser`), so the line is not yet a login that
 * works.
 */
export function auditUserRestored(fields: Actor & { user: string }): void {
  logEvent('warn', 'USER_RESTORED', fields);
}

/**
 * A user removed for good: name, address and every role, grant, session and
 * reminder note of theirs are gone, and this line is all that is left. The
 * UUID and never the address, as everywhere outside a failed login (rule 1).
 */
export function auditUserPurged(fields: Actor & { user: string }): void {
  logEvent('warn', 'USER_PURGED', fields);
}

/**
 * Both role routes replace the whole set, so the line is the new state, not a
 * delta. `roles` is a list of role UIDs for the global set and of
 * `accountUID:roleUID` pairs for the account-scoped one; `count` is there so a
 * grep can spot "everything taken away" without parsing the list.
 */
export function auditUserRolesChanged(
  fields: Actor & { user: string; scope: 'global' | 'account'; roles: string[] },
): void {
  logEvent('warn', 'USER_ROLES_CHANGED', {
    actor: fields.actor,
    user: fields.user,
    scope: fields.scope,
    // Before the list on purpose: with a hundred grants the line is long, and
    // "everything taken away" is the case worth seeing at a glance.
    count: fields.roles.length,
    roles: fields.roles.join(','),
  });
}

/** `kind` is the registry key of the entity, `uid` its UID — never its label (rule 1). */
export function auditTrashPurged(
  fields: Actor & { kind: string; uid: string; alsoRemoved: number },
): void {
  logEvent('warn', 'TRASH_PURGED', fields);
}

export function auditTrashRestored(
  fields: Actor & { kind: string; uid: string; alsoRestored: number },
): void {
  logEvent('info', 'TRASH_RESTORED', fields);
}

/**
 * One line per sweep of the retention period, in addition to the
 * `TRASH_PURGED` and `USER_PURGED` lines of the records themselves: without it
 * nothing would say which period did the removing.
 *
 * Written only when something actually went — a daily line reading `purged=0`
 * is noise in a log meant to be grepped (the same stance as auth/cleanup.ts),
 * and an entry held back is not news every day either. `skipped` counts the
 * records something active still points at; they are tried again next time.
 */
export function auditRetentionSwept(fields: {
  days: number;
  purged: number;
  users: number;
  skipped: number;
}): void {
  logEvent('warn', 'RETENTION_SWEPT', fields);
}

/** Keys only, never values (rule 2). `cleared` are the ones written back to null. */
export function auditSettingsChanged(fields: Actor & { set: string[]; cleared: string[] }): void {
  logEvent('info', 'SETTINGS_CHANGED', {
    actor: fields.actor,
    set: fields.set.join(','),
    cleared: fields.cleared.join(','),
  });
}
