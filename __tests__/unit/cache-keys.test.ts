import { describe, expect, it } from 'vitest'
import {
  buildDetailCacheKey,
  buildSearchCacheKey,
  buildTrailersCacheKey,
} from '#lib/cache-keys'

// ---------------------------------------------------------------------------
// buildSearchCacheKey
// ---------------------------------------------------------------------------
describe('buildSearchCacheKey', () => {
  it('normalizes whitespace and case', () => {
    const key = buildSearchCacheKey({ q: '  Star   Wars  ', page: 1, language: 'en-US' })
    expect(key).toBe('SEARCH:en-US:star wars:1')
  })

  it('different params produce different keys', () => {
    const a = buildSearchCacheKey({ q: 'inception', page: 1, language: 'en-US' })
    const b = buildSearchCacheKey({ q: 'inception', page: 2, language: 'en-US' })
    const c = buildSearchCacheKey({ q: 'inception', page: 1, language: 'es-ES' })
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })

  it('trims leading/trailing whitespace', () => {
    const key = buildSearchCacheKey({ q: '  test  ', page: 1, language: 'en-US' })
    expect(key).toBe('SEARCH:en-US:test:1')
  })

  it('lowercases the query', () => {
    const key = buildSearchCacheKey({ q: 'INCEPTION', page: 1, language: 'en-US' })
    expect(key).toBe('SEARCH:en-US:inception:1')
  })
})

// ---------------------------------------------------------------------------
// buildDetailCacheKey
// ---------------------------------------------------------------------------
describe('buildDetailCacheKey', () => {
  it('formats correctly', () => {
    expect(buildDetailCacheKey(550, 'en-US')).toBe('MOVIE:en-US:550')
  })

  it('different ids produce different keys', () => {
    expect(buildDetailCacheKey(550, 'en-US')).not.toBe(buildDetailCacheKey(27205, 'en-US'))
  })
})

// ---------------------------------------------------------------------------
// buildTrailersCacheKey
// ---------------------------------------------------------------------------
describe('buildTrailersCacheKey', () => {
  it('formats correctly', () => {
    expect(buildTrailersCacheKey(550, 'en-US')).toBe('TRAILER:en-US:550')
  })

  it('different ids produce different keys', () => {
    expect(buildTrailersCacheKey(550, 'en-US')).not.toBe(buildTrailersCacheKey(27205, 'en-US'))
  })
})

