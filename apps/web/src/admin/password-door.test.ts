import { describe, expect, it } from 'vitest';

import { type PasswordDoorState, passwordDoorBlock } from './password-door';

const READY: PasswordDoorState = {
  passwordEnabled: false,
  oidcEnabled: true,
  providerChanged: false,
  storedPasswordEnabled: true,
  lastTestOk: true,
};

describe('passwordDoorBlock', () => {
  it('lets a tested provider close the password login', () => {
    expect(passwordDoorBlock(READY)).toBeNull();
  });

  it('never blocks an open password login', () => {
    expect(
      passwordDoorBlock({
        ...READY,
        passwordEnabled: true,
        oidcEnabled: false,
        lastTestOk: false,
      }),
    ).toBeNull();
  });

  it('refuses both doors closed, also once already closed', () => {
    expect(passwordDoorBlock({ ...READY, oidcEnabled: false })).toBe('no_way_in');
    expect(passwordDoorBlock({ ...READY, oidcEnabled: false, storedPasswordEnabled: false })).toBe(
      'no_way_in',
    );
  });

  it('asks for a green test of the saved provider on the step to closed', () => {
    expect(passwordDoorBlock({ ...READY, lastTestOk: false })).toBe('test_required');
    expect(passwordDoorBlock({ ...READY, providerChanged: true })).toBe('test_required');
  });

  it('keeps an already closed door repairable without a green test', () => {
    expect(
      passwordDoorBlock({
        ...READY,
        storedPasswordEnabled: false,
        lastTestOk: false,
        providerChanged: true,
      }),
    ).toBeNull();
  });
});
