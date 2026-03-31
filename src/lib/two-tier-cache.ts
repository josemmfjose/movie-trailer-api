import type { ZodTypeAny, output as ZodOutput } from 'zod'
import { type CacheEntry, CacheEntrySchema } from '#data/schemas/cache-entry'
import type { AppError } from '#shared/errors'
import { InternalError } from '#shared/errors'
import { logger } from '#shared/logger'
import type { ResultAsync } from '#shared/result'
import { fromPromise, isError } from '#shared/result'

type TwoTierDeps = {
  redis: {
    get: <S extends ZodTypeAny>(key: string, schema: S) => ResultAsync<ZodOutput<S> | null, AppError>
    set: <T>(key: string, data: T, ttlMs: number) => ResultAsync<void, AppError>
  }
  dynamo: {
    getItem: (
      entityType: CacheEntry['entityType'],
      cacheKey: string,
      language: string,
    ) => ResultAsync<CacheEntry | null, AppError>
    putItem: (entry: CacheEntry) => ResultAsync<void, AppError>
  }
}

const entityTypeSchema = CacheEntrySchema.shape.entityType

const parseCacheKey = (key: string) => {
  const parts = key.split(':')
  const entityType = entityTypeSchema.parse(parts[0])
  const language = parts[1] ?? 'en-US'
  const cacheKey = parts.slice(2).join(':')
  return { entityType, language, cacheKey }
}

export const get =
  (deps: TwoTierDeps) =>
  <S extends ZodTypeAny>(key: string, schema: S): ResultAsync<ZodOutput<S> | null, AppError> =>
    fromPromise(
      (async () => {
        // L1: Redis
        const cached = await deps.redis.get(key, schema)
        if (!isError(cached) && cached != null) return cached
        if (isError(cached)) {
          logger.warn('redis_read_error', { key, error: cached.message })
        }

        // L2: DynamoDB
        const { entityType, language, cacheKey } = parseCacheKey(key)
        const entry = await deps.dynamo.getItem(entityType, cacheKey, language)

        if (isError(entry)) {
          logger.warn('dynamo_read_error', { key, error: entry.message })
          return null
        }

        if (!entry || entry.freshUntil < Date.now()) return null

        const parsed = schema.safeParse(JSON.parse(entry.data))
        if (!parsed.success) {
          logger.warn('dynamo_schema_invalid', { key })
          return null
        }

        // Backfill Redis from DynamoDB hit
        const redisMs = entry.freshUntil - Date.now()
        if (redisMs > 0) {
          deps.redis.set(key, parsed.data, redisMs).catch((err) => {
            logger.warn('redis_backfill_error', { key, error: String(err) })
          })
        }

        return parsed.data
      })(),
      (e) => InternalError('CACHE_READ_ERROR', { reason: `two-tier get: ${e}` }),
    )

export const set =
  (deps: TwoTierDeps) =>
  <T>(key: string, data: T, ttlMs: number): ResultAsync<void, AppError> =>
    fromPromise(
      (async () => {
        const now = Date.now()
        const { entityType, language, cacheKey } = parseCacheKey(key)

        // L1: Redis
        const redisResult = await deps.redis.set(key, data, ttlMs)
        if (isError(redisResult)) {
          logger.warn('redis_write_error', { key, error: redisResult.message })
        }

        // L2: DynamoDB (fire-and-forget)
        const staleMs = ttlMs * 3
        const entry: CacheEntry = {
          entityType,
          cacheKey,
          language,
          data: JSON.stringify(data),
          freshUntil: now + ttlMs,
          staleUntil: now + staleMs,
          ttl: Math.floor((now + staleMs) / 1000),
          createdAt: new Date(now).toISOString(),
        }

        deps.dynamo.putItem(entry).then((result) => {
          if (isError(result)) {
            logger.warn('dynamo_write_error', { key, error: result.message })
          }
        })
      })(),
      (e) => InternalError('CACHE_WRITE_ERROR', { reason: `two-tier set: ${e}` }),
    )
