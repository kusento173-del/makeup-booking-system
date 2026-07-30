import { describe, expect, it } from 'vitest';

import { normalizeRelationOperatorName, SourceDataValidationError } from './source-import-plan';

describe('SourceDataValidationError', () => {
  it('reports only the aggregate issue count in its message', () => {
    const error = new SourceDataValidationError(['private row issue', 'another private row issue']);

    expect(error.message).toBe('Source data validation failed with 2 issue(s)');
    expect(error.issues).toHaveLength(2);
  });

  it('treats zero-valued blank relation cells as unassigned operators', () => {
    expect(normalizeRelationOperatorName(0)).toBe('');
    expect(normalizeRelationOperatorName('0')).toBe('');
    expect(normalizeRelationOperatorName(' 运营甲 ')).toBe('运营甲');
  });
});
