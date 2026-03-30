import type Redis from 'ioredis'
import type { ZodTypeAny, output as ZodOutput } from 'zod'
import type { AppError } from '../shared/errors'
import { InternalError } from '../shared/errors'
import type { ResultAsync } from '../shared/result'
import { fromPromise } from '../shared/result'

type RedisDeps = { redisClient: { client: Redis } }

export const get =
  (deps: RedisDeps) =>
  <S extends ZodTypeAny>(key: string, schema: S): ResultAsync<ZodOutput<S> | null, AppError> =>
    fromPromise(
      deps.redisClient.client.get(key).then((v) => {
        if (!v) return null
        const parsed = schema.safeParse(JSON.parse(v))
        if (!parsed.success) {
          throw new Error(`Redis schema validation failed: ${parsed.error.message}`)
        }
        return parsed.data
      }),
      (e) => InternalError('CACHE_READ_ERROR', { reason: `Redis get: ${e}` }),
    )

export const set =
  (deps: RedisDeps) =>
  <T>(key: string, data: T, ttlMs: number): ResultAsync<void, AppError> =>
    fromPromise(
      deps.redisClient.client.set(key, JSON.stringify(data), 'PX', ttlMs).then(() => undefined),
      (e) => InternalError('CACHE_WRITE_ERROR', { reason: `Redis set: ${e}` }),
    )
