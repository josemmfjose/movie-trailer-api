import { describe, expect, it } from 'vitest'
import { ApiError, ErrorFactory, InternalError } from '#shared/errors'
import { isError } from '#shared/result'

// ---------------------------------------------------------------------------
// ErrorFactory
// ---------------------------------------------------------------------------
describe('ErrorFactory', () => {
  it('creates an object that passes isError()', () => {
    const err = ErrorFactory({
      showError: true,
      tag: 'TestTag',
      errorCode: 'TEST_CODE',
      errorReason: { reason: 'something' },
    })
    expect(isError(err)).toBe(true)
  })

  it('is an instance of Error', () => {
    const err = ErrorFactory({
      showError: true,
      tag: 'TestTag',
      errorCode: 'TEST_CODE',
      errorReason: undefined,
    })
    expect(err).toBeInstanceOf(Error)
  })

  it('has isError property set to true', () => {
    const err = ErrorFactory({
      showError: false,
      tag: 'Tag',
      errorCode: 'CODE',
      errorReason: undefined,
    })
    expect(err.isError).toBe(true)
  })

  it('preserves errorCode in the message', () => {
    const err = ErrorFactory({
      showError: true,
      tag: 'Tag',
      errorCode: 'MY_CODE',
      errorReason: undefined,
    })
    expect(err.message).toContain('MY_CODE')
  })

  it('includes JSON-serialized errorReason in message when present', () => {
    const err = ErrorFactory({
      showError: true,
      tag: 'Tag',
      errorCode: 'CODE',
      errorReason: { reason: 'detail', extra: 123 },
    })
    expect(err.message).toContain('CODE')
    expect(err.message).toContain('detail')
  })
})

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------
describe('ApiError', () => {
  it('has showError: true', () => {
    const err = ApiError('VALIDATION_ERROR', { reason: 'bad input' })
    expect(err.showError).toBe(true)
  })

  it('has tag: ApiError', () => {
    const err = ApiError('NOT_FOUND', { reason: 'missing' })
    expect(err.tag).toBe('ApiError')
  })

  it('preserves errorCode', () => {
    const err = ApiError('RATE_LIMITED', { reason: 'slow down' })
    expect(err.errorCode).toBe('RATE_LIMITED')
  })

  it('preserves errorReason', () => {
    const err = ApiError('UNAUTHORIZED', { reason: 'no token' })
    expect(err.errorReason).toEqual({ reason: 'no token' })
  })

  it('passes isError check', () => {
    const err = ApiError('NOT_FOUND', { reason: 'not there' })
    expect(isError(err)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// InternalError
// ---------------------------------------------------------------------------
describe('InternalError', () => {
  it('has showError: false', () => {
    const err = InternalError('TMDB_UNAVAILABLE', { reason: 'timeout' })
    expect(err.showError).toBe(false)
  })

  it('has tag: InternalError', () => {
    const err = InternalError('CACHE_READ_ERROR')
    expect(err.tag).toBe('InternalError')
  })

  it('preserves errorCode', () => {
    const err = InternalError('SECRET_NOT_FOUND')
    expect(err.errorCode).toBe('SECRET_NOT_FOUND')
  })

  it('preserves errorReason when provided', () => {
    const err = InternalError('UNKNOWN_ERROR', { reason: 'something' })
    expect(err.errorReason).toEqual({ reason: 'something' })
  })

  it('has undefined errorReason when not provided', () => {
    const err = InternalError('CIRCUIT_OPEN')
    expect(err.errorReason).toBeUndefined()
  })

  it('passes isError check', () => {
    const err = InternalError('TMDB_RATE_LIMITED')
    expect(isError(err)).toBe(true)
  })
})
