import { describe, expect, it } from 'vitest';

import { PASSWORD_ALPHABET, generatePassword } from './generate-password';

describe('generatePassword', () => {
  it('is four groups of four from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i += 1) {
      const password = generatePassword();
      expect(password).toMatch(/^[^-]{4}-[^-]{4}-[^-]{4}-[^-]{4}$/);
      for (const char of password.replaceAll('-', '')) {
        expect(PASSWORD_ALPHABET).toContain(char);
      }
    }
  });

  it('leaves out the characters that are mistaken for each other', () => {
    for (const char of '0O1lI') expect(PASSWORD_ALPHABET).not.toContain(char);
  });

  it('throws away bytes that would skew the draw', () => {
    // 228 = 4 × 57 is the first byte past the even range; it must be skipped,
    // and 0 maps to the first character.
    let call = 0;
    const random = (length: number): Uint8Array =>
      new Uint8Array(length).fill(call++ === 0 ? 228 : 0);
    expect(generatePassword(random)).toBe('AAAA-AAAA-AAAA-AAAA');
    expect(call).toBe(2);
  });

  it('differs between calls', () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
