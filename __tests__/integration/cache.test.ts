import { GetItemCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import * as CacheRepo from '#data/repositories/cache.repository'
import { cacheKeys } from '#data/schemas/cache-entry'
import { isError } from '#shared/result'
import { TABLE_NAME, createFlushRedis, createTestRedis, dynamodb, flushDynamo } from './setup'

const redis = createTestRedis(3)
const flushRedis = createFlushRedis(redis)

const cacheDeps = {
  dynamoClient: { db: dynamodb, tableName: TABLE_NAME },
}

beforeAll(async () => {
  await redis.connect().catch(() => {})
})

afterEach(async () => {
  await flushRedis()
  await flushDynamo()
})

describe('DynamoDB Cache Repository Integration', () => {
  it('putItem stores entry and getItem retrieves it', async () => {
    const now = Date.now()
    const entry = {
      entityType: 'SEARCH' as const,
      cacheKey: 'inception:1',
      language: 'en-US',
      data: JSON.stringify({ results: [{ title: 'Inception' }] }),
      freshUntil: now + 300_000,
      staleUntil: now + 900_000,
      ttl: Math.floor((now + 900_000) / 1000),
      createdAt: new Date().toISOString(),
    }

    const putResult = await CacheRepo.putItem(cacheDeps)(entry)
    expect(isError(putResult)).toBe(false)

    const getResult = await CacheRepo.getItem(cacheDeps)('SEARCH', 'inception:1', 'en-US')
    expect(isError(getResult)).toBe(false)
    if (isError(getResult)) return

    expect(getResult).not.toBeNull()
    if (!getResult) return
    expect(getResult.entityType).toBe('SEARCH')
    expect(getResult.cacheKey).toBe('inception:1')
    expect(JSON.parse(getResult.data)).toEqual({ results: [{ title: 'Inception' }] })
  })

  it('getItem returns null for non-existent key', async () => {
    const result = await CacheRepo.getItem(cacheDeps)('SEARCH', 'nonexistent', 'en-US')
    expect(isError(result)).toBe(false)
    if (isError(result)) return
    expect(result).toBeNull()
  })

  it('putItem overwrites existing entry', async () => {
    const now = Date.now()
    const base = {
      entityType: 'MOVIE' as const,
      cacheKey: '550',
      language: 'en-US',
      freshUntil: now + 300_000,
      staleUntil: now + 900_000,
      ttl: Math.floor((now + 900_000) / 1000),
      createdAt: new Date().toISOString(),
    }

    await CacheRepo.putItem(cacheDeps)({ ...base, data: '{"v":1}' })
    await CacheRepo.putItem(cacheDeps)({ ...base, data: '{"v":2}' })

    const result = await CacheRepo.getItem(cacheDeps)('MOVIE', '550', 'en-US')
    expect(isError(result)).toBe(false)
    if (isError(result) || result === null) return
    expect(JSON.parse(result.data)).toEqual({ v: 2 })
  })

  it('deleteItem removes entry', async () => {
    const now = Date.now()
    await CacheRepo.putItem(cacheDeps)({
      entityType: 'TRAILER' as const,
      cacheKey: '550',
      language: 'en-US',
      data: '{}',
      freshUntil: now + 300_000,
      staleUntil: now + 900_000,
      ttl: Math.floor((now + 900_000) / 1000),
      createdAt: new Date().toISOString(),
    })

    const delResult = await CacheRepo.deleteItem(cacheDeps)('TRAILER', '550', 'en-US')
    expect(isError(delResult)).toBe(false)

    const getResult = await CacheRepo.getItem(cacheDeps)('TRAILER', '550', 'en-US')
    expect(isError(getResult)).toBe(false)
    if (isError(getResult)) return
    expect(getResult).toBeNull()
  })

  it('stores composite keys correctly in DynamoDB', async () => {
    const now = Date.now()
    await CacheRepo.putItem(cacheDeps)({
      entityType: 'SEARCH',
      cacheKey: 'test:1',
      language: 'en-US',
      data: '{}',
      freshUntil: now + 300_000,
      staleUntil: now + 900_000,
      ttl: Math.floor((now + 900_000) / 1000),
      createdAt: new Date().toISOString(),
    })

    // Verify raw DynamoDB key structure
    const pk = cacheKeys.pk('SEARCH', 'en-US')
    const sk = cacheKeys.sk('test:1')
    const raw = await dynamodb.send(
      new GetItemCommand({
        TableName: TABLE_NAME,
        Key: { PK: { S: pk }, SK: { S: sk } },
      }),
    )
    expect(raw.Item).toBeDefined()
    if (!raw.Item) return
    const item = unmarshall(raw.Item)
    expect(item.entityType).toBe('SEARCH')
    expect(item.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })
})

const TestDataSchema = z.object({ results: z.array(z.object({ title: z.string() })) })
const SimpleSchema = z.object({ x: z.number() })

describe('Redis Cache Integration', () => {
  it('set stores and get retrieves JSON data', async () => {
    const redisClient = { client: redis }
    const data = { results: [{ title: 'Test' }] }

    const setResult = await (await import('#lib/redis-cache')).set({ redisClient })(
      'test-key',
      data,
      60_000,
    )
    expect(isError(setResult)).toBe(false)

    const getResult = await (await import('#lib/redis-cache')).get({ redisClient })(
      'test-key',
      TestDataSchema,
    )
    expect(isError(getResult)).toBe(false)
    if (isError(getResult)) return
    expect(getResult).toEqual(data)
  })

  it('get returns null for non-existent key', async () => {
    const redisClient = { client: redis }
    const result = await (await import('#lib/redis-cache')).get({ redisClient })(
      'nonexistent',
      TestDataSchema,
    )
    expect(isError(result)).toBe(false)
    if (isError(result)) return
    expect(result).toBeNull()
  })

  it('get returns error for invalid cached shape', async () => {
    const redisClient = { client: redis }
    await redis.set('bad-shape', JSON.stringify({ wrong: 'data' }))

    const result = await (await import('#lib/redis-cache')).get({ redisClient })(
      'bad-shape',
      TestDataSchema,
    )
    expect(isError(result)).toBe(true)
  })

  it('set respects TTL (key expires)', async () => {
    const redisClient = { client: redis }
    await (await import('#lib/redis-cache')).set({ redisClient })('ttl-key', { x: 1 }, 100) // 100ms TTL

    // Immediately available
    const r1 = await (await import('#lib/redis-cache')).get({ redisClient })(
      'ttl-key',
      SimpleSchema,
    )
    expect(isError(r1)).toBe(false)
    if (!isError(r1)) expect(r1).not.toBeNull()

    // Wait for TTL
    await new Promise((r) => setTimeout(r, 200))

    const r2 = await (await import('#lib/redis-cache')).get({ redisClient })(
      'ttl-key',
      SimpleSchema,
    )
    expect(isError(r2)).toBe(false)
    if (!isError(r2)) expect(r2).toBeNull()
  })
})
