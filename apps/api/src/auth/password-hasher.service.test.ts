import { describe, expect, it } from 'vitest';

import { AuthRequestInvalidError } from './auth-request.parser';
import { PasswordHasherService } from './password-hasher.service';

const service = new PasswordHasherService();

describe('PasswordHasherService', () => {
  it('hashes passwords with the configured Argon2id cost and verifies them', async () => {
    const encoded = await service.hash('correct horse battery staple');

    expect(encoded).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    await expect(service.verify(encoded, 'correct horse battery staple')).resolves.toBe(true);
    await expect(service.verify(encoded, 'wrong password')).resolves.toBe(false);
  });

  it('requires a 12 to 128 character passphrase when creating a credential', () => {
    expect(() => service.assertPassword('short')).toThrow(AuthRequestInvalidError);
    expect(() => service.assertPassword('long enough passphrase')).not.toThrow();
  });

  it('uses a dummy hash for unknown accounts', async () => {
    await expect(service.verify(null, 'any submitted password')).resolves.toBe(false);
  });
});
