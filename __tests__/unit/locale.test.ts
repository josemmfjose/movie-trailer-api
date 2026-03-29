import { describe, expect, it } from 'vitest'
import { detectLanguage } from '#middleware/locale'

describe('detectLanguage', () => {
  it('explicit param takes priority', () => {
    expect(detectLanguage({ language: 'es-ES' }, { 'accept-language': 'fr-FR' })).toBe('es-ES')
  })

  it('falls back to Accept-Language header', () => {
    expect(detectLanguage({}, { 'accept-language': 'de-DE,en;q=0.9' })).toBe('de-DE')
  })

  it('defaults to en-US when no param and no header', () => {
    expect(detectLanguage({}, {})).toBe('en-US')
  })

  it('defaults to en-US when both are null', () => {
    expect(detectLanguage(null, null)).toBe('en-US')
  })

  it('defaults to en-US when both are undefined', () => {
    expect(detectLanguage(undefined, undefined)).toBe('en-US')
  })

  it('ignores invalid language param format and falls back', () => {
    expect(detectLanguage({ language: 'INVALID' }, { 'accept-language': 'ja-JP' })).toBe('ja-JP')
  })

  it('handles Accept-Language with quality values', () => {
    expect(detectLanguage({}, { 'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8' })).toBe('pt-BR')
  })

  it('accepts two-letter language code in param', () => {
    expect(detectLanguage({ language: 'fr' }, {})).toBe('fr')
  })
})
