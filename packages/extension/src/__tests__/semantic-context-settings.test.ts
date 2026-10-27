import { describe, expect, it } from 'vitest';
import { parseSemanticContextSettings } from '../semantic-context-settings.js';

describe('parseSemanticContextSettings', () => {
  it('preserves full-current-cell behavior for minimal with a blank budget', () => {
    expect(parseSemanticContextSettings('minimal', '  ')).toEqual({
      contextStrategy: 'minimal'
    });
  });

  it.each([
    ['fixed-window', 'Fixed-window'],
    ['structure-aware', 'Structure-aware'],
    ['largest-practical', 'Largest-practical']
  ] as const)('requires an explicit budget for %s', (strategy, displayName) => {
    expect(() => parseSemanticContextSettings(strategy, '  ')).toThrow(
      `Enter a character budget for ${displayName} context.`
    );
  });

  it.each([
    'minimal',
    'fixed-window',
    'structure-aware',
    'largest-practical'
  ] as const)('accepts explicit limits, including zero, for %s', strategy => {
    expect(parseSemanticContextSettings(strategy, ' 5000 ')).toEqual({
      contextStrategy: strategy,
      contextCharacterBudget: 5000
    });
    expect(parseSemanticContextSettings(strategy, '0')).toEqual({
      contextStrategy: strategy,
      contextCharacterBudget: 0
    });
  });

  it.each(['-1', '1.5', 'NaN', 'Infinity', 'abc', '9007199254740992'])(
    'rejects invalid budget %s',
    budget => {
      expect(() => parseSemanticContextSettings('minimal', budget)).toThrow(
        'nonnegative whole number'
      );
    }
  );

  it.each(['unknown', 'custom', 'invalid'])(
    'rejects unavailable strategy %s',
    strategy => {
      expect(() => parseSemanticContextSettings(strategy, '5000')).toThrow(
        'supported context strategy'
      );
    }
  );
});
