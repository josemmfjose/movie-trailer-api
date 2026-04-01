/**
 * Result<T, E> = T | E
 *
 * Simple union type for typed error handling.
 * isError() is the discriminator.
 * safeTry() + yield* ok() emulates Rust's ? operator.
 */

export type Result<T, E extends Error = Error> = T | E
export type ResultAsync<T, E extends Error = Error> = Promise<T | E>

export const isError = (e: unknown): e is Error => {
  if (!e) return false
  return e instanceof Error || (typeof e === 'object' && 'isError' in e)
}

export const fromPromise = <T, E extends Error>(
  promise: Promise<T>,
  mapError: (e: unknown) => E,
): ResultAsync<T, E> => promise.then((v) => v as T | E).catch((e) => mapError(e))

export const okOr = <R, F>(
  result: R,
  fallback: (e: Extract<R, Error>) => F,
): Exclude<R, Error> | F =>
  isError(result) ? fallback(result as Extract<R, Error>) : (result as Exclude<R, Error>)

// Generator-based composition: yield* ok(result) unwraps T or short-circuits with E
// Async overload: unwraps Promise<T | E> by yielding the promise to safeTry
export function ok<R extends Promise<unknown>>(
  result: R,
  // biome-ignore lint: TNext is any — managed by safeTry, not user code
): Generator<Extract<Awaited<R>, Error> | R, Exclude<Awaited<R>, Error>, any>
// Sync overload: unwraps T | E directly
// biome-ignore lint: TNext is any — managed by safeTry, not user code
export function ok<R>(result: R): Generator<Extract<R, Error>, Exclude<R, Error>, any>
export function* ok(result: unknown): Generator<unknown, unknown, unknown> {
  if (result instanceof Promise) {
    const resolved = yield result
    if (isError(resolved)) {
      yield resolved
      throw resolved // unreachable, safeTry returns on error
    }
    return resolved
  }
  if (isError(result)) {
    yield result
    throw result
  }
  return result
}

export const safeTry = async <T, Y>(
  gen: () => AsyncGenerator<Y, T, unknown>,
): Promise<T | Extract<Y, Error>> => {
  type E = Extract<Y, Error>
  const iterator = gen()
  let next = await iterator.next()

  while (!next.done) {
    const yielded = next.value

    if (yielded instanceof Promise) {
      const resolved = await yielded
      if (isError(resolved)) return resolved as E
      next = await iterator.next(resolved)
      continue
    }

    if (isError(yielded)) return yielded as E

    next = await iterator.next(yielded)
  }

  return next.value
}
