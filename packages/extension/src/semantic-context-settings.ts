import type { ContextStrategy } from '@berkeley-dsep-infra/a11y-checker-core';

export interface ISemanticContextSettings {
  contextStrategy: ContextStrategy;
  contextCharacterBudget?: number;
}

const SUPPORTED_STRATEGIES: readonly ContextStrategy[] = [
  'minimal',
  'fixed-window',
  'structure-aware',
  'largest-practical'
];

/** Converts sidebar values into the supported per-request context settings. */
export function parseSemanticContextSettings(
  strategy: string,
  budgetText: string
): ISemanticContextSettings {
  if (!SUPPORTED_STRATEGIES.includes(strategy as ContextStrategy)) {
    throw new Error('Choose a supported context strategy.');
  }

  if (!budgetText.trim()) {
    if (strategy !== 'minimal') {
      const displayName =
        strategy === 'fixed-window'
          ? 'Fixed-window'
          : strategy === 'structure-aware'
            ? 'Structure-aware'
            : 'Largest-practical';
      throw new Error(`Enter a character budget for ${displayName} context.`);
    }
    return { contextStrategy: strategy as ContextStrategy };
  }

  const budget = Number(budgetText);
  if (!Number.isSafeInteger(budget) || budget < 0) {
    throw new Error('The context budget must be a nonnegative whole number.');
  }

  return {
    contextStrategy: strategy as ContextStrategy,
    contextCharacterBudget: budget
  };
}
