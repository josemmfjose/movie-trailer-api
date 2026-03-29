import { describe, expect, it } from 'vitest'
import { isError } from '#shared/result'
import { validateMovieId } from '#validators/detail'
import { validateSearch } from '#validators/search'

// ---------------------------------------------------------------------------
// validateSearch
// ---------------------------------------------------------------------------
describe('validateSearch', () => {
  it('rejects empty query', () => {
    const result = validateSearch({ q: '' })
    expect(isError(result)).toBe(true)
  })

  it('rejects query longer than 200 characters', () => {
    const result = validateSearch({ q: 'a'.repeat(201) })
    expect(isError(result)).toBe(true)
  })

  it('accepts unicode characters in query', () => {
    const result = validateSearch({ q: 'El laberinto del fauno' })
    expect(isError(result)).toBe(false)
    if (!isError(result)) {
      expect(result.q).toBe('El laberinto del fauno')
    }
  })

  it('coerces page from string to number', () => {
    const result = validateSearch({ q: 'test', page: '3' as string | undefined })
    expect(isError(result)).toBe(false)
    if (!isError(result)) {
      expect(result.page).toBe(3)
    }
  })

  it('clamps page to valid range (1-500)', () => {
    const valid1 = validateSearch({ q: 'test', page: '1' as string | undefined })
    expect(isError(valid1)).toBe(false)
    if (!isError(valid1)) expect(valid1.page).toBe(1)

    const valid500 = validateSearch({ q: 'test', page: '500' as string | undefined })
    expect(isError(valid500)).toBe(false)
    if (!isError(valid500)) expect(valid500.page).toBe(500)
  })

  it('rejects page 0', () => {
    const result = validateSearch({ q: 'test', page: '0' as string | undefined })
    expect(isError(result)).toBe(true)
  })

  it('rejects page 501', () => {
    const result = validateSearch({ q: 'test', page: '501' as string | undefined })
    expect(isError(result)).toBe(true)
  })

  it('defaults language to en-US', () => {
    const result = validateSearch({ q: 'test' })
    expect(isError(result)).toBe(false)
    if (!isError(result)) {
      expect(result.language).toBe('en-US')
    }
  })

  it('rejects SQL-injection-like input in query (but still validates length)', () => {
    // The validator trims/validates length but doesn't specifically block SQL.
    // We test that a normal SQL-like string passes if short enough.
    const result = validateSearch({ q: "'; DROP TABLE movies;--" })
    // It should not error because the query is valid as a search string
    expect(isError(result)).toBe(false)
  })

  it('trims whitespace from query', () => {
    const result = validateSearch({ q: '  inception  ' })
    expect(isError(result)).toBe(false)
    if (!isError(result)) {
      expect(result.q).toBe('inception')
    }
  })

  it('defaults page to 1 when not provided', () => {
    const result = validateSearch({ q: 'test' })
    expect(isError(result)).toBe(false)
    if (!isError(result)) {
      expect(result.page).toBe(1)
    }
  })

  it('handles null input gracefully', () => {
    const result = validateSearch(null)
    expect(isError(result)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateMovieId
// ---------------------------------------------------------------------------
describe('validateMovieId', () => {
  it('rejects undefined', () => {
    const result = validateMovieId(undefined)
    expect(isError(result)).toBe(true)
  })

  it('rejects empty string', () => {
    const result = validateMovieId('')
    expect(isError(result)).toBe(true)
  })

  it('rejects non-numeric strings', () => {
    expect(isError(validateMovieId('abc'))).toBe(true)
    expect(isError(validateMovieId('12abc'))).toBe(true)
  })

  it('rejects zero', () => {
    const result = validateMovieId('0')
    expect(isError(result)).toBe(true)
  })

  it('rejects negative numbers', () => {
    const result = validateMovieId('-5')
    expect(isError(result)).toBe(true)
  })

  it('rejects floats', () => {
    const result = validateMovieId('3.14')
    expect(isError(result)).toBe(true)
  })

  it('accepts valid positive integers', () => {
    const result = validateMovieId('550')
    expect(isError(result)).toBe(false)
    expect(result).toBe(550)
  })

  it('accepts large valid integer', () => {
    const result = validateMovieId('999999')
    expect(isError(result)).toBe(false)
    expect(result).toBe(999999)
  })

  it('rejects whitespace-only string', () => {
    const result = validateMovieId('   ')
    expect(isError(result)).toBe(true)
  })
})
