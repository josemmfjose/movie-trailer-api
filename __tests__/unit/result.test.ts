import { describe, expect, it } from 'vitest'
import {
  type Result,
  fromPromise,
  isError,
  ok,
  okOr,
  safeTry,
} from '#shared/result'

// ---------------------------------------------------------------------------
// isError
// ---------------------------------------------------------------------------
describe('isError', () => {
  it('returns true for native Error instances', () => {
    expect(isError(new Error('boom'))).toBe(true)
    expect(isError(new TypeError('bad type'))).toBe(true)
  })

  it('returns true for ErrorFactory-like objects with { isError: true }', () => {
    expect(isError({ isError: true, tag: 'ApiError' })).toBe(true)
  })

  it('returns false for strings', () => {
    expect(isError('hello')).toBe(false)
  })

  it('returns false for numbers including 0', () => {
    expect(isError(42)).toBe(false)
    expect(isError(0)).toBe(false)
  })

  it('returns false for null and undefined', () => {
    expect(isError(null)).toBe(false)
    expect(isError(undefined)).toBe(false)
  })

  it('returns false for plain objects without isError', () => {
    expect(isError({ foo: 'bar' })).toBe(false)
    expect(isError({})).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isError('')).toBe(false)
  })

  it('returns false for false / true booleans', () => {
    expect(isError(false)).toBe(false)
    expect(isError(true)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// fromPromise
// ---------------------------------------------------------------------------
describe('fromPromise', () => {
  it('returns the value when promise resolves', async () => {
    const result = await fromPromise(Promise.resolve('ok'), (e) => new Error(String(e)))
    expect(result).toBe('ok')
  })

  it('catches rejections and maps to error', async () => {
    const result = await fromPromise(
      Promise.reject(new Error('rejected')),
      (e) => new Error(`mapped: ${(e as Error).message}`),
    )
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('mapped: rejected')
  })
})

// ---------------------------------------------------------------------------
// okOr
// ---------------------------------------------------------------------------
describe('okOr', () => {
  it('returns value when result is not an error', () => {
    expect(okOr(42, () => 'fallback')).toBe(42)
  })

  it('calls fallback when result is an error', () => {
    const err = new Error('oops')
    const result = okOr(err, (e) => `recovered: ${e.message}`)
    expect(result).toBe('recovered: oops')
  })
})

// ---------------------------------------------------------------------------
// safeTry + ok
// ---------------------------------------------------------------------------
describe('safeTry + ok', () => {
  it('short-circuits on the first error', async () => {
    const err = new Error('boom')
    const success: Result<number, Error> = 42
    const failure: Result<number, Error> = err
    const result = await safeTry(async function* () {
      yield* ok(success)
      const val = yield* ok(failure) // should short-circuit here
      return val + 1
    })
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.message).toBe('boom')
  })

  it('returns the final value on success', async () => {
    const a: Result<number, Error> = 10
    const b: Result<number, Error> = 20
    const result = await safeTry(async function* () {
      return (yield* ok(a)) + (yield* ok(b))
    })
    expect(result).toBe(30)
  })

  it('handles async values (promises)', async () => {
    const result = await safeTry(async function* () {
      const a = yield* ok(Promise.resolve('hello') as Promise<string | Error>)
      const b = yield* ok(Promise.resolve(' world') as Promise<string | Error>)
      return a + b
    })
    expect(result).toBe('hello world')
  })

  it('short-circuits on rejected promise result', async () => {
    const err = new Error('async fail')
    const result = await safeTry(async function* () {
      const _a = yield* ok(fromPromise(Promise.reject(new Error('bad')), () => err))
      return _a
    })
    expect(isError(result)).toBe(true)
    expect((result as Error).message).toBe('async fail')
  })
})
