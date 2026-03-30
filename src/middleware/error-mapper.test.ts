import { describe, expect, it } from 'vitest'
import { mapErrorToResponse } from '#middleware/error-mapper'
import { ApiError, InternalError } from '#shared/errors'

describe('mapErrorToResponse', () => {
  // --- HTTP status mapping ---

  it('maps VALIDATION_ERROR to 400', () => {
    const res = mapErrorToResponse(ApiError('VALIDATION_ERROR', { reason: 'bad' }))
    expect(res.statusCode).toBe(400)
  })

  it('maps UNAUTHORIZED to 401', () => {
    const res = mapErrorToResponse(ApiError('UNAUTHORIZED', { reason: 'no token' }))
    expect(res.statusCode).toBe(401)
  })

  it('maps NOT_FOUND to 404', () => {
    const res = mapErrorToResponse(ApiError('NOT_FOUND', { reason: 'missing' }))
    expect(res.statusCode).toBe(404)
  })

  it('maps RATE_LIMITED to 429', () => {
    const res = mapErrorToResponse(ApiError('RATE_LIMITED', { reason: 'slow down' }))
    expect(res.statusCode).toBe(429)
  })

  it('maps TMDB_UNAVAILABLE to 503', () => {
    const res = mapErrorToResponse(InternalError('TMDB_UNAVAILABLE'))
    expect(res.statusCode).toBe(503)
  })

  it('maps TMDB_RATE_LIMITED to 502', () => {
    const res = mapErrorToResponse(InternalError('TMDB_RATE_LIMITED'))
    expect(res.statusCode).toBe(502)
  })

  it('maps CACHE_READ_ERROR to 500', () => {
    const res = mapErrorToResponse(InternalError('CACHE_READ_ERROR'))
    expect(res.statusCode).toBe(500)
  })

  it('maps CACHE_WRITE_ERROR to 500', () => {
    const res = mapErrorToResponse(InternalError('CACHE_WRITE_ERROR'))
    expect(res.statusCode).toBe(500)
  })

  it('maps SECRET_NOT_FOUND to 500', () => {
    const res = mapErrorToResponse(InternalError('SECRET_NOT_FOUND'))
    expect(res.statusCode).toBe(500)
  })

  it('maps CIRCUIT_OPEN to 503', () => {
    const res = mapErrorToResponse(InternalError('CIRCUIT_OPEN'))
    expect(res.statusCode).toBe(503)
  })

  it('maps UNKNOWN_ERROR to 500', () => {
    const res = mapErrorToResponse(InternalError('UNKNOWN_ERROR'))
    expect(res.statusCode).toBe(500)
  })

  // --- Message visibility ---

  it('exposes reason when showError is true', () => {
    const res = mapErrorToResponse(ApiError('VALIDATION_ERROR', { reason: 'query is required' }))
    const body = JSON.parse(res.body)
    expect(body.error.message).toBe('query is required')
  })

  it('returns "Internal server error" when showError is false', () => {
    const res = mapErrorToResponse(InternalError('TMDB_UNAVAILABLE', { reason: 'timeout' }))
    const body = JSON.parse(res.body)
    expect(body.error.message).toBe('Internal server error')
  })

  it('includes the error code in response body', () => {
    const res = mapErrorToResponse(ApiError('NOT_FOUND', { reason: 'not found' }))
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('includes security headers', () => {
    const res = mapErrorToResponse(ApiError('NOT_FOUND', { reason: 'test' }))
    expect(res.headers['Content-Type']).toBe('application/json')
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff')
  })
})
