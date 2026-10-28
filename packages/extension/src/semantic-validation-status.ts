import type { IValidationResult } from '@berkeley-dsep-infra/a11y-checker-core';

export function describeSuggestionValidation(
  validation?: IValidationResult
): string {
  if (!validation) {
    return 'Quality validation was not run. Review the suggestion carefully.';
  }
  if (validation.outcome === 'pass') {
    return 'Validation passed. Review the suggestion before using it.';
  }
  const error = validation.errorMessage
    ? ` Validation error: ${validation.errorMessage}`
    : '';
  return `Manual review required. ${validation.reasons.join(' ')}${error}`;
}
