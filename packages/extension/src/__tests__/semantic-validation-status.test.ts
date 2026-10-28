import { describe, expect, it } from 'vitest';
import type { IValidationResult } from '@berkeley-dsep-infra/a11y-checker-core';
import { describeSuggestionValidation } from '../semantic-validation-status.js';

const validation: IValidationResult = {
  outcome: 'pass',
  reasons: [],
  wordLimit: { wordCount: 5, maxWords: 40, withinLimit: true },
  modelCheckStatus: 'succeeded',
  requestCount: 1,
  latencyMs: 10
};

describe('describeSuggestionValidation', () => {
  it('keeps author review explicit when checks pass', () => {
    expect(describeSuggestionValidation(validation)).toBe(
      'Validation passed. Review the suggestion before using it.'
    );
  });

  it('shows a failed quality judgment as manual review', () => {
    expect(
      describeSuggestionValidation({
        ...validation,
        outcome: 'manual-review',
        reasons: ['The trend is unsupported.']
      })
    ).toBe('Manual review required. The trend is unsupported.');
  });

  it('shows validator errors without calling them a pass', () => {
    expect(
      describeSuggestionValidation({
        ...validation,
        outcome: 'manual-review',
        modelCheckStatus: 'failed',
        reasons: ['Quality check unavailable.'],
        errorMessage: 'Provider unavailable'
      })
    ).toBe(
      'Manual review required. Quality check unavailable. Validation error: Provider unavailable'
    );
  });

  it('does not imply validation when a result is missing', () => {
    expect(describeSuggestionValidation()).toBe(
      'Quality validation was not run. Review the suggestion carefully.'
    );
  });
});
