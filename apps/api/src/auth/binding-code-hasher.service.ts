import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { BindingCodeConfigurationError, BindingCodeInvalidError } from './binding-code.errors';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

@Injectable()
export class BindingCodeHasherService {
  generate(): string {
    const characters = Array.from({ length: CODE_LENGTH }, () =>
      CODE_ALPHABET.at(randomInt(CODE_ALPHABET.length)),
    ).join('');

    return `${characters.slice(0, 4)}-${characters.slice(4)}`;
  }

  hash(code: string): string {
    const normalized = this.normalize(code);

    if (!normalized) {
      throw new BindingCodeInvalidError();
    }

    return createHmac('sha256', this.pepper())
      .update(`binding-code:v1:${normalized}`)
      .digest('hex');
  }

  matches(code: string, expectedHash: string): boolean {
    const normalized = this.normalize(code);

    if (!normalized || !HASH_PATTERN.test(expectedHash)) {
      return false;
    }

    const actual = Buffer.from(
      createHmac('sha256', this.pepper()).update(`binding-code:v1:${normalized}`).digest('hex'),
      'hex',
    );
    const expected = Buffer.from(expectedHash, 'hex');

    return timingSafeEqual(actual, expected);
  }

  private normalize(code: string): string | null {
    const normalized = code.normalize('NFKC').trim().toUpperCase().replace(/[\s-]/g, '');
    const pattern = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

    return pattern.test(normalized) ? normalized : null;
  }

  private pepper(): string {
    const pepper = process.env.AUTH_BINDING_CODE_PEPPER;

    if (!pepper || pepper.length < 32) {
      throw new BindingCodeConfigurationError();
    }

    return pepper;
  }
}
