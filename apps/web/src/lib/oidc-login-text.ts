import { type OidcLoginError, isOidcLoginError } from '@eunomia/shared';

import { i18n } from './i18n';

const { t } = i18n.global;

/**
 * Why a sign-in through the provider did not end in a session, as a sentence
 * (Slice 89). The API sends the browser back to `/login?oidcError=<code>` with
 * a code from `OIDC_LOGIN_ERRORS` (Slice 88); the table is keyed by that list,
 * so a new code without a sentence does not compile — the same contract as
 * lib/oidc-test-text.ts.
 */
const SENTENCES: Record<OidcLoginError, () => string> = {
  disabled: () => t('login.oidc.error.disabled'),
  unavailable: () => t('login.oidc.error.unavailable'),
  flow_invalid: () => t('login.oidc.error.flow_invalid'),
  denied: () => t('login.oidc.error.denied'),
  email_missing: () => t('login.oidc.error.email_missing'),
  no_account: () => t('login.oidc.error.no_account'),
  account_inactive: () => t('login.oidc.error.account_inactive'),
  linked_elsewhere: () => t('login.oidc.error.linked_elsewhere'),
  rate_limited: () => t('login.oidc.error.rate_limited'),
  failed: () => t('login.oidc.error.failed'),
};

/**
 * The sentence for a code from the URL. Anyone can type a query, and a newer
 * API may know a code this version does not — both still get a sentence
 * rather than a raw code.
 */
export function oidcLoginErrorText(code: unknown): string {
  return isOidcLoginError(code) ? SENTENCES[code]() : t('login.oidc.error.unknown');
}
