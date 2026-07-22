import { afterEach, describe, expect, it, vi } from 'vitest';

import { BindingCodeConfigurationError, BindingCodeInvalidError } from './binding-code.errors';
import { BindingCodeHasherService } from './binding-code-hasher.service';

describe('BindingCodeHasherService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('generates an eight-character code without ambiguous characters', () => {
    const hasher = new BindingCodeHasherService();

    expect(hasher.generate()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it('normalizes display separators and compares HMAC hashes', () => {
    vi.stubEnv('AUTH_BINDING_CODE_PEPPER', 'test-pepper-with-at-least-32-characters');
    const hasher = new BindingCodeHasherService();
    const hash = hasher.hash('ABCD-EFGH');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hasher.matches(' abcd efgh ', hash)).toBe(true);
    expect(hasher.matches('ABCD-EFGJ', hash)).toBe(false);
    expect(hasher.matches('invalid', hash)).toBe(false);
  });

  it('fails closed when the server-side pepper is missing or the code is malformed', () => {
    const hasher = new BindingCodeHasherService();

    expect(() => hasher.hash('ABCD-EFGH')).toThrow(BindingCodeConfigurationError);
    vi.stubEnv('AUTH_BINDING_CODE_PEPPER', 'test-pepper-with-at-least-32-characters');
    expect(() => hasher.hash('O0O0-1111')).toThrow(BindingCodeInvalidError);
  });
});
