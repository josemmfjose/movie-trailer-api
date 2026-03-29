import type Redis from 'ioredis'
import type { AppError } from '../shared/errors'
import { InternalError } from '../shared/errors'
import type { ResultAsync } from '../shared/result'
import { fromPromise } from '../shared/result'

type RedisDeps = { redisClient: { client: Redis } }

export const get =
  (deps: RedisDeps) =>
  <T>(key: string): ResultAsync<T | null, AppError> =>
    fromPromise(
      deps.redisClient.client.get(key).then((v) => (v ? (JSON.parse(v) as T) : null)),
      (e) => InternalError('CACHE_READ_ERROR', { reason: `Redis get: ${e}` }),
    )

export const set =
  (deps: RedisDeps) =>
  <T>(key: string, data: T, ttlMs: number): ResultAsync<void, AppError> =>
    fromPromise(
      deps.redisClient.client.set(key, JSON.stringify(data), 'PX', ttlMs).then(() => undefined),
      (e) => InternalError('CACHE_WRITE_ERROR', { reason: `Redis set: ${e}` }),
    )
