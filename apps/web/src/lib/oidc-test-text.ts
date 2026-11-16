import { type OidcTestFailure, isOidcTestFailure } from '@eunomia/shared';

import { i18n } from './i18n';

const { t } = i18n.global;

/**
 * Why the last connection test of the sign-in provider failed, as a sentence
 * (Slice 87). The API stores a code from `OIDC_TEST_FAILURES` (Slice 86); the
 * table is keyed by that list, so a new code without a sentence does not
 * compile — the same contract as lib/error-messages.ts.
 */
const CAUSE_SENTENCES: Record<OidcTestFailure, () => string> = {
  discovery_failed: () => t('settings.login.cause.discovery_failed'),
  no_asymmetric_alg: () => t('settings.login.cause.no_asymmetric_alg'),
  no_jwks_uri: () => t('settings.login.cause.no_jwks_uri'),
  jwks_unreachable: () => t('settings.login.cause.jwks_unreachable'),
  jwks_no_keys: () => t('settings.login.cause.jwks_no_keys'),
};

/**
 * The sentence for a stored cause. A value this version does not know — a
 * hand-edited row, a newer API — still gets a sentence rather than a raw code.
 */
export function oidcTestCause(code: unknown): string {
  return isOidcTestFailure(code) ? CAUSE_SENTENCES[code]() : t('settings.login.cause.unknown');
}
