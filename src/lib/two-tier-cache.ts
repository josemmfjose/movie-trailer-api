import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import type Redis from 'ioredis'
import type { ZodTypeAny, output as ZodOutput } from 'zod'
import * as CacheRepo from '#data/repositories/cache.repository'
import type { CacheEntry } from '#data/schemas/cache-entry'
import type { AppError } from '#shared/errors'
import { InternalError } from '#shared/errors'
import { logger } from '#shared/logger'
import type { ResultAsync } from '#shared/result'
import { fromPromise, isError } from '#shared/result'

type TwoTierDeps = {
  redisClient: { client: Redis }
  dynamoClient: { db: DynamoDBClient; tableName: string }
}

const parseCacheKey = (key: string): { entityType: string; language: string; cacheKey: string } => {
  const [entityType, language, ...rest] = key.split(':')
  return { entityType: entityType!, language: language!, cacheKey: rest.join(':') }
}

export const get =
  (deps: TwoTierDeps) =>
  <S extends ZodTypeAny>(key: string, schema: S): ResultAsync<ZodOutput<S> | null, AppError> =>
    fromPromise(
      (async () => {
        // L1: Redis
        const cached = await deps.redisClient.client.get(key)
        if (cached) {
          const parsed = schema.safeParse(JSON.parse(cached))
          if (parsed.success) return parsed.data
          logger.warn('redis_schema_invalid', { key })
        }

        // L2: DynamoDB
        const { entityType, language, cacheKey } = parseCacheKey(key)
        const entry = await CacheRepo.getItem({ dynamoClient: deps.dynamoClient })(
          entityType,
          cacheKey,
          language,
        )

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
          deps.redisClient.client
            .set(key, entry.data, 'PX', redisMs)
            .catch((err) => logger.warn('redis_backfill_error', { key, error: String(err) }))
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
        const json = JSON.stringify(data)
        const now = Date.now()
        const { entityType, language, cacheKey } = parseCacheKey(key)

        // L1: Redis
        await deps.redisClient.client.set(key, json, 'PX', ttlMs)

        // L2: DynamoDB (fire-and-forget)
        const staleMs = ttlMs * 3
        const entry: CacheEntry = {
          entityType: entityType as CacheEntry['entityType'],
          cacheKey,
          language,
          data: json,
          freshUntil: now + ttlMs,
          staleUntil: now + staleMs,
          ttl: Math.floor((now + staleMs) / 1000),
          createdAt: new Date(now).toISOString(),
        }

        CacheRepo.putItem({ dynamoClient: deps.dynamoClient })(entry).then((result) => {
          if (isError(result)) {
            logger.warn('dynamo_write_error', { key, error: result.message })
          }
        })
      })(),
      (e) => InternalError('CACHE_WRITE_ERROR', { reason: `two-tier set: ${e}` }),
    )
