import { describe, expect, it } from 'vitest';

import { SourceDataValidationError } from './source-import-plan';

describe('SourceDataValidationError', () => {
  it('reports only the aggregate issue count in its message', () => {
    const error = new SourceDataValidationError(['private row issue', 'another private row issue']);

    expect(error.message).toBe('Source data validation failed with 2 issue(s)');
    expect(error.issues).toHaveLength(2);
  });
});
