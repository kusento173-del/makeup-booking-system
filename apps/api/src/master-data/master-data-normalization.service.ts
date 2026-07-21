import { Injectable } from '@nestjs/common';

@Injectable()
export class MasterDataNormalizationService {
  normalizeMatchText(value: string, fieldName: string): string {
    const normalized = value.normalize('NFKC').trim().toLocaleLowerCase('en-US');

    if (normalized.length === 0) {
      throw new TypeError(`${fieldName} must not be blank`);
    }

    return normalized;
  }
}
