import { OIDC_LOGIN_ERRORS } from '@eunomia/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from './i18n';
import { oidcLoginErrorText } from './oidc-login-text';

const request = vi.fn();
vi.mock('./http', () => ({ request: (...args: unknown[]): unknown => request(...args) }));

const { FALLBACK_LOGIN_OPTIONS, loadLoginOptions } = await import('./login-options');

describe('login options', () => {
  // In braces: a value returned from beforeEach is run as its teardown, and
  // mockReset() returns the mock itself.
  beforeEach(() => {
    request.mockReset();
  });

  it('asks the public endpoint, without a token', async () => {
    request.mockResolvedValue({ data: { password: true, oidc: { label: 'SSO' } } });

    expect(await loadLoginOptions()).toEqual({ password: true, oidc: { label: 'SSO' } });
    expect(request).toHaveBeenCalledWith('/login-options');
  });

  it('falls back to the password form alone when the request fails', async () => {
    request.mockRejectedValue(new Error('offline'));

    expect(await loadLoginOptions()).toEqual(FALLBACK_LOGIN_OPTIONS);
    expect(FALLBACK_LOGIN_OPTIONS).toEqual({ password: true, oidc: null });
  });
});

describe('sentences for the codes of the way back', () => {
  it.each(['de', 'en'] as const)('has a sentence of its own for every code in %s', (locale) => {
    i18n.global.locale.value = locale;
    try {
      const sentences = Object.values(OIDC_LOGIN_ERRORS).map(oidcLoginErrorText);
      const unknown = oidcLoginErrorText('not_a_code');

      for (const sentence of sentences) {
        expect(sentence).not.toMatch(/^login\./);
        expect(sentence).not.toBe(unknown);
      }
      expect(new Set(sentences).size).toBe(sentences.length);
    } finally {
      i18n.global.locale.value = 'de';
    }
  });

  it('answers a value that is no code with the general sentence', () => {
    expect(oidcLoginErrorText(undefined)).toBe(oidcLoginErrorText('<script>'));
    expect(oidcLoginErrorText(42)).toMatch(/Anmeldedienst/);
  });
});
