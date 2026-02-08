import { describe, expect, it } from 'vitest';
import { createRuntimeI18n, resolveLocale } from '../src/i18n';

describe('i18n locale resolution', () => {
  it('uses env language when configured as auto', () => {
    expect(resolveLocale('auto', 'zh-TW')).toBe('zh-TW');
    expect(resolveLocale('auto', 'zh-CN')).toBe('zh-CN');
    expect(resolveLocale('auto', 'ja')).toBe('ja');
  });

  it('uses explicit configured language', () => {
    expect(resolveLocale('ko', 'en')).toBe('ko');
    expect(resolveLocale('th', 'en')).toBe('th');
  });

  it('normalizes language variants', () => {
    expect(resolveLocale('zh-hant', 'en')).toBe('zh-TW');
    expect(resolveLocale('zh-hans', 'en')).toBe('zh-CN');
  });

  it('falls back to english for unsupported env language', () => {
    expect(resolveLocale('auto', 'fr')).toBe('en');
  });

  it('formats message placeholders', () => {
    const i18n = createRuntimeI18n('en', 'en');
    expect(i18n.t('error.geminiFailed', { status: 404, message: 'Not Found' })).toContain('404');
  });
});
