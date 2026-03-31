import { GetItemCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import * as CacheRepo from '#data/repositories/cache.repository'
import { cacheTable } from '#data/schemas/cache-entry'
import { get as redisGet, set as redisSet } from '#lib/redis-cache'
import { get as cacheGet, set as cacheSet } from '#lib/two-tier-cache'
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
    const pk = cacheTable.pk({ entityType: 'SEARCH', language: 'en-US' })
    const sk = cacheTable.sk({ cacheKey: 'test:1' })
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

const twoTierRedis = createTestRedis(5)
const flushTwoTierRedis = createFlushRedis(twoTierRedis)
const clientDeps = {
  redisClient: { client: twoTierRedis },
  dynamoClient: { db: dynamodb, tableName: TABLE_NAME },
}
const twoTierDeps = {
  redis: { get: redisGet(clientDeps), set: redisSet(clientDeps) },
  dynamo: { getItem: CacheRepo.getItem(clientDeps), putItem: CacheRepo.putItem(clientDeps) },
}

describe('Two-Tier Cache Integration', () => {
  beforeAll(async () => {
    await twoTierRedis.connect().catch(() => {})
  })

  afterEach(async () => {
    await flushTwoTierRedis()
    await flushDynamo()
  })

  it('set writes to both Redis and DynamoDB', async () => {
    const data = { results: [{ title: 'TwoTierWrite' }] }
    const setResult = await cacheSet(twoTierDeps)('SEARCH:en-US:twotier-write:1', data, 60_000)
    expect(isError(setResult)).toBe(false)

    // Verify Redis
    const redisVal = await twoTierRedis.get('SEARCH:en-US:twotier-write:1')
    expect(redisVal).not.toBeNull()
    expect(JSON.parse(redisVal!)).toEqual(data)

    // Verify DynamoDB (fire-and-forget, small delay)
    await new Promise((r) => setTimeout(r, 100))
    const dynamoResult = await CacheRepo.getItem(cacheDeps)('SEARCH', 'twotier-write:1', 'en-US')
    expect(isError(dynamoResult)).toBe(false)
    if (isError(dynamoResult) || !dynamoResult) return
    expect(JSON.parse(dynamoResult.data)).toEqual(data)
    expect(dynamoResult.freshUntil).toBeGreaterThan(Date.now())
  })

  it('get returns from Redis (L1 hit)', async () => {
    const data = { results: [{ title: 'L1 Hit' }] }
    await cacheSet(twoTierDeps)('SEARCH:en-US:l1test:1', data, 60_000)

    const result = await cacheGet(twoTierDeps)('SEARCH:en-US:l1test:1', TestDataSchema)
    expect(isError(result)).toBe(false)
    if (isError(result)) return
    expect(result).toEqual(data)
  })

  it('get falls back to DynamoDB when Redis misses (L2 hit)', async () => {
    const data = { results: [{ title: 'L2 Fallback' }] }

    // Write directly to DynamoDB to avoid fire-and-forget timing
    const now = Date.now()
    await CacheRepo.putItem(cacheDeps)({
      entityType: 'MOVIE',
      cacheKey: '999',
      language: 'en-US',
      data: JSON.stringify(data),
      freshUntil: now + 60_000,
      staleUntil: now + 180_000,
      ttl: Math.floor((now + 180_000) / 1000),
      createdAt: new Date(now).toISOString(),
    })

    // get should fall back to DynamoDB (Redis is empty)
    const result = await cacheGet(twoTierDeps)('MOVIE:en-US:999', TestDataSchema)
    expect(isError(result)).toBe(false)
    if (isError(result)) return
    expect(result).toEqual(data)
  })

  it('L2 hit backfills Redis', async () => {
    const data = { results: [{ title: 'Backfill' }] }

    // Write directly to DynamoDB
    const now = Date.now()
    await CacheRepo.putItem(cacheDeps)({
      entityType: 'TRAILER',
      cacheKey: '888',
      language: 'en-US',
      data: JSON.stringify(data),
      freshUntil: now + 60_000,
      staleUntil: now + 180_000,
      ttl: Math.floor((now + 180_000) / 1000),
      createdAt: new Date(now).toISOString(),
    })

    // Trigger L2 hit + backfill (Redis is empty)
    await cacheGet(twoTierDeps)('TRAILER:en-US:888', TestDataSchema)
    await new Promise((r) => setTimeout(r, 100))

    // Redis should now have the data
    const redisVal = await twoTierRedis.get('TRAILER:en-US:888')
    expect(redisVal).not.toBeNull()
    expect(JSON.parse(redisVal!)).toEqual(data)
  })

  it('get returns null when both tiers miss', async () => {
    const result = await cacheGet(twoTierDeps)(
      'SEARCH:en-US:nonexistent:1',
      TestDataSchema,
    )
    expect(isError(result)).toBe(false)
    if (isError(result)) return
    expect(result).toBeNull()
  })

  it('get returns null for expired DynamoDB entry', async () => {
    // Write directly to DynamoDB with an already-expired freshUntil
    const now = Date.now()
    await CacheRepo.putItem(cacheDeps)({
      entityType: 'SEARCH',
      cacheKey: 'expired:1',
      language: 'en-US',
      data: JSON.stringify({ results: [{ title: 'Stale' }] }),
      freshUntil: now - 1000,
      staleUntil: now + 900_000,
      ttl: Math.floor((now + 900_000) / 1000),
      createdAt: new Date().toISOString(),
    })

    const result = await cacheGet(twoTierDeps)('SEARCH:en-US:expired:1', TestDataSchema)
    expect(isError(result)).toBe(false)
    if (isError(result)) return
    expect(result).toBeNull()
  })

  it('get returns null when DynamoDB data fails schema validation', async () => {
    const now = Date.now()
    await CacheRepo.putItem(cacheDeps)({
      entityType: 'MOVIE',
      cacheKey: '777',
      language: 'en-US',
      data: JSON.stringify({ wrong: 'shape' }),
      freshUntil: now + 300_000,
      staleUntil: now + 900_000,
      ttl: Math.floor((now + 900_000) / 1000),
      createdAt: new Date().toISOString(),
    })

    const result = await cacheGet(twoTierDeps)('MOVIE:en-US:777', TestDataSchema)
    expect(isError(result)).toBe(false)
    if (isError(result)) return
    expect(result).toBeNull()
  })
})

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
