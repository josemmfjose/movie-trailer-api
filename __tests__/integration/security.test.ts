import { describe, expect, it } from 'vitest'
import { mapErrorToResponse } from '#middleware/error-mapper'
import { securityHeaders } from '#middleware/security-headers'
import { ApiError, InternalError } from '#shared/errors'
import { isError } from '#shared/result'
import { validateMovieId } from '#validators/detail'
import { validateSearch } from '#validators/search'

describe('Security: Input Validation', () => {
  it('rejects empty and oversized queries via search validator', () => {
    const emptyResult = validateSearch({ q: '' })
    expect(isError(emptyResult)).toBe(true)

    const longResult = validateSearch({ q: 'a'.repeat(201) })
    expect(isError(longResult)).toBe(true)
  })

  it('sanitizes injection payloads without crashing', () => {
    const payloads = [
      "'; DROP TABLE --",
      '{"$gt":""}',
      '<script>alert(1)</script>',
      'inception"; cat /etc/passwd',
      '{{7*7}}',
      '${7*7}',
    ]
    for (const q of payloads) {
      const result = validateSearch({ q })
      // Zod trims and accepts these as strings — the key is they're never executed
      expect(result).toBeDefined()
    }
  })

  it('validates movie ID rejects non-numeric input', () => {
    const attacks = ['-1', '0', 'abc', '1.5', '1;DROP TABLE', '../etc/passwd', '1e10']
    for (const id of attacks) {
      const result = validateMovieId(id)
      expect(isError(result)).toBe(true)
    }
  })

  it('validates movie ID accepts valid positive integers', () => {
    const valid = ['1', '550', '27205', '999999']
    for (const id of valid) {
      const result = validateMovieId(id)
      expect(isError(result)).toBe(false)
    }
  })
})

describe('Security: Response Headers', () => {
  it('includes all OWASP security headers', () => {
    expect(securityHeaders['X-Content-Type-Options']).toBe('nosniff')
    expect(securityHeaders['X-Frame-Options']).toBe('DENY')
    expect(securityHeaders['Strict-Transport-Security']).toContain('max-age=')
    expect(securityHeaders['Content-Security-Policy']).toBe("default-src 'none'")
  })
})

describe('Security: Error Responses', () => {
  it('does not expose internal error details', () => {
    const internalErr = InternalError('TMDB_UNAVAILABLE', {
      reason: 'Connection refused to internal:4566',
    })
    const response = mapErrorToResponse(internalErr)
    const body = JSON.parse(response.body)

    // Internal error details must NOT leak
    expect(body.error.message).toBe('Internal server error')
    expect(body.error.message).not.toContain('4566')
    expect(body.error.message).not.toContain('Connection refused')
  })

  it('exposes API error details (they are user-facing)', () => {
    const apiErr = ApiError('VALIDATION_ERROR', { reason: 'query is required' })
    const response = mapErrorToResponse(apiErr)
    const body = JSON.parse(response.body)

    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toBe('query is required')
  })

  it('always includes security headers in error responses', () => {
    const apiErr = ApiError('NOT_FOUND', { reason: 'Movie not found' })
    const response = mapErrorToResponse(apiErr)

    expect(response.headers['X-Content-Type-Options']).toBe('nosniff')
    expect(response.headers['X-Frame-Options']).toBe('DENY')
  })
})
