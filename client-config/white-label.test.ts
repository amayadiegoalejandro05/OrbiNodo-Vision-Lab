import { describe, expect, it } from 'vitest';
import { getWhiteLabelConfiguration } from './white-label';

describe('configuracion white-label', () => {
  it('centraliza tema y assets del perfil demo', () => {
    const config = getWhiteLabelConfiguration('orbinodo-demo');
    expect(config.assets.logoAlt).toBe('OrbiNodo');
    expect(config.assets.logoFallback).toBe('O');
    expect(config.theme.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(config.theme.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(config.theme.primary).not.toBe(config.theme.background);
  });
});
