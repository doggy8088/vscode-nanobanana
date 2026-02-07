import { describe, expect, it } from 'vitest';
import { selectPreferredModel } from '../src/services/modelSelection';

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

  it('returns first model when preference not found', () => {
    const models = [{ id: 'model-a' }, { id: 'model-b' }];
    const selected = selectPreferredModel(models, 'missing-model');
    expect(selected.id).toBe('model-a');
  });
});
