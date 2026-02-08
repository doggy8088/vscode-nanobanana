import { describe, expect, it } from 'vitest';
import {
  collectDistinctModelIdentifiers,
  getModelIdentifier,
  selectPreferredModel
} from '../src/services/modelSelection';

describe('collectDistinctModelIdentifiers', () => {
  it('returns sorted unique model ids from runtime models', () => {
    const models = [
      { id: 'gpt-4.1' },
      { id: 'gemini-3-pro-preview' },
      { id: 'gpt-4.1' },
      { name: 'claude-sonnet-4.5' },
      { id: '' }
    ];

    expect(collectDistinctModelIdentifiers(models)).toEqual([
      'claude-sonnet-4.5',
      'gemini-3-pro-preview',
      'gpt-4.1'
    ]);
  });
});

describe('getModelIdentifier', () => {
  it('prefers id and falls back to name', () => {
    expect(getModelIdentifier({ id: 'gpt-5', name: 'GPT-5' })).toBe('gpt-5');
    expect(getModelIdentifier({ id: '   ', name: 'gemini-3-pro-preview' })).toBe(
      'gemini-3-pro-preview'
    );
  });
});

describe('selectPreferredModel', () => {
  it('returns exact id match when available', () => {
    const models = [
      { id: 'gpt-4.1-mini', family: 'gpt-4.1' },
      { id: 'gpt-4.1', family: 'gpt-4.1' }
    ];

    const selected = selectPreferredModel(models, 'gpt-4.1');
    expect(selected.id).toBe('gpt-4.1');
  });

  it('falls back to partial match', () => {
    const models = [
      { id: 'claude-sonnet-4.5' },
      { id: 'openai-gpt-4.1-preview' }
    ];

    const selected = selectPreferredModel(models, 'gpt-4.1');
    expect(selected.id).toBe('openai-gpt-4.1-preview');
  });

  it('matches regardless of punctuation differences', () => {
    const models = [
      { id: 'model-a', name: 'Claude Opus 4.6 (fast mode) (preview)' },
      { id: 'model-b', name: 'Some Other Model' }
    ];

    const selected = selectPreferredModel(models, 'claude-opus-4.6-fast');
    expect(selected.id).toBe('model-a');
  });

  it('returns first model when preference not found', () => {
    const models = [{ id: 'model-a' }, { id: 'model-b' }];
    const selected = selectPreferredModel(models, 'missing-model');
    expect(selected.id).toBe('model-a');
  });
});
