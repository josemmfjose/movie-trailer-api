import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getDetail, getTrailers as tmdbGetTrailers } from '#adapters/tmdb-detail.adapter'
import { searchMovies as tmdbSearchMovies } from '#adapters/tmdb-search.adapter'
import { createTmdbClient } from '#adapters/tmdb.client'
import { getItem, putItem } from '#data/repositories/cache.repository'
import { searchProcessor } from '../../src/handlers/search/processor'
import { detailProcessor } from '../../src/handlers/detail/processor'
import { trailersProcessor } from '../../src/handlers/trailers/processor'
import { get as redisGet, set as redisSet } from '#lib/redis-cache'
import { get as cacheGet, set as cacheSet } from '#lib/two-tier-cache'
import { inject } from '#shared/inject'
import {
  TMDB_MOCK_URL,
  TABLE_NAME,
  createFlushRedis,
  createTestRedis,
  dynamodb,
  flushDynamo,
} from './setup'

const redis = createTestRedis(6)
const flushRedis = createFlushRedis(redis)

const tmdbClient = createTmdbClient(
  { secretClient: { getSecret: async () => 'test-tmdb-key' } },
  { baseUrl: TMDB_MOCK_URL },
)

const clientDeps = {
  redisClient: { client: redis },
  dynamoClient: { db: dynamodb, tableName: TABLE_NAME },
}

const searchDeps = inject({
  tmdb: { searchMovies: tmdbSearchMovies },
  cache: { get: cacheGet, set: cacheSet },
})(
  inject({
    tmdbClient: () => tmdbClient,
    redis: { get: redisGet, set: redisSet },
    dynamo: { getItem, putItem },
  })(clientDeps),
)

const detailDeps = inject({
  tmdb: { getDetail },
  cache: { get: cacheGet, set: cacheSet },
})(
  inject({
    tmdbClient: () => tmdbClient,
    redis: { get: redisGet, set: redisSet },
    dynamo: { getItem, putItem },
  })(clientDeps),
)

const trailersDeps = inject({
  tmdb: { getTrailers: tmdbGetTrailers },
  cache: { get: cacheGet, set: cacheSet },
})(
  inject({
    tmdbClient: () => tmdbClient,
    redis: { get: redisGet, set: redisSet },
    dynamo: { getItem, putItem },
  })(clientDeps),
)

const fakeEvent = (overrides: Partial<APIGatewayProxyEventV2>): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'GET /',
    rawPath: '/',
    rawQueryString: '',
    headers: {},
    queryStringParameters: undefined,
    pathParameters: undefined,
    isBase64Encoded: false,
    requestContext: {
      accountId: '000000000000',
      apiId: 'test',
      http: { method: 'GET', path: '/', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'test',
      routeKey: 'GET /',
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    ...overrides,
  }) as APIGatewayProxyEventV2

beforeAll(async () => {
  await redis.connect().catch(() => {})
})

beforeEach(async () => {
  await flushRedis()
  await flushDynamo()
})

afterEach(async () => {
  await flushRedis()
  await flushDynamo()
})

describe('Search Processor', () => {
  const process = searchProcessor(searchDeps)

  it('returns 200 with search results', async () => {
    const result = await process(
      fakeEvent({
        rawPath: '/v1/movies/search',
        rawQueryString: 'q=inception&page=1',
        queryStringParameters: { q: 'inception', page: '1' },
      }),
    )

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data[0]).toMatchObject({ id: expect.any(Number), title: expect.any(String) })
    expect(body.meta.pagination).toMatchObject({ page: 1, totalResults: expect.any(Number) })
  })

  it('returns 400 for missing query parameter', async () => {
    const result = await process(
      fakeEvent({
        rawPath: '/v1/movies/search',
        rawQueryString: '',
        queryStringParameters: {},
      }),
    )

    expect(result.statusCode).toBe(400)
    const body = JSON.parse(result.body as string)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for empty query', async () => {
    const result = await process(
      fakeEvent({
        rawPath: '/v1/movies/search',
        rawQueryString: 'q=',
        queryStringParameters: { q: '' },
      }),
    )

    expect(result.statusCode).toBe(400)
    const body = JSON.parse(result.body as string)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('includes security headers in response', async () => {
    const result = await process(
      fakeEvent({
        rawPath: '/v1/movies/search',
        rawQueryString: 'q=inception',
        queryStringParameters: { q: 'inception' },
      }),
    )

    expect(result.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    })
  })

  it('returns cache HIT on second call', async () => {
    const event = fakeEvent({
      rawPath: '/v1/movies/search',
      rawQueryString: 'q=inception&page=1',
      queryStringParameters: { q: 'inception', page: '1' },
    })

    const r1 = await process(event)
    expect(r1.statusCode).toBe(200)
    expect(JSON.parse(r1.body as string).meta.cacheStatus).toBe('MISS')

    await new Promise((r) => setTimeout(r, 100))

    const r2 = await process(event)
    expect(r2.statusCode).toBe(200)
    expect(JSON.parse(r2.body as string).meta.cacheStatus).toBe('HIT')
  })
})

describe('Detail Processor', () => {
  const process = detailProcessor(detailDeps)

  it('returns 200 with movie detail and trailers', async () => {
    const result = await process(
      fakeEvent({
        rawPath: '/v1/movies/550',
        pathParameters: { id: '550' },
      }),
    )

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.data).toMatchObject({ id: 550, title: 'Fight Club' })
    expect(body.trailers.length).toBeGreaterThan(0)
  })

  it('returns 400 for non-numeric movie id', async () => {
    const result = await process(
      fakeEvent({
        rawPath: '/v1/movies/abc',
        pathParameters: { id: 'abc' },
      }),
    )

    expect(result.statusCode).toBe(400)
    const body = JSON.parse(result.body as string)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for missing movie id', async () => {
    const result = await process(
      fakeEvent({
        rawPath: '/v1/movies/',
        pathParameters: {},
      }),
    )

    expect(result.statusCode).toBe(400)
  })

  it('respects Accept-Language header', async () => {
    const result = await process(
      fakeEvent({
        rawPath: '/v1/movies/550',
        pathParameters: { id: '550' },
        headers: { 'accept-language': 'es-ES' },
      }),
    )

    expect(result.statusCode).toBe(200)
  })

  it('includes security headers in error responses', async () => {
    const result = await process(
      fakeEvent({
        rawPath: '/v1/movies/abc',
        pathParameters: { id: 'abc' },
      }),
    )

    expect(result.statusCode).toBe(400)
    expect(result.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
    })
  })
})

describe('Trailers Processor', () => {
  const process = trailersProcessor(trailersDeps)

  it('returns 200 with trailers', async () => {
    const result = await process(
      fakeEvent({
        rawPath: '/v1/movies/550/trailers',
        pathParameters: { id: '550' },
      }),
    )

    expect(result.statusCode).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.data.length).toBeGreaterThan(0)
    body.data.forEach((t: { type: string }) => expect(t.type).toBe('Trailer'))
  })

  it('returns 400 for invalid movie id', async () => {
    const result = await process(
      fakeEvent({
        rawPath: '/v1/movies/-1/trailers',
        pathParameters: { id: '-1' },
      }),
    )

    expect(result.statusCode).toBe(400)
  })

  it('returns cache HIT on second call', async () => {
    const event = fakeEvent({
      rawPath: '/v1/movies/550/trailers',
      pathParameters: { id: '550' },
    })

    const r1 = await process(event)
    expect(r1.statusCode).toBe(200)
    expect(JSON.parse(r1.body as string).meta.cacheStatus).toBe('MISS')

    await new Promise((r) => setTimeout(r, 100))

    const r2 = await process(event)
    expect(r2.statusCode).toBe(200)
    expect(JSON.parse(r2.body as string).meta.cacheStatus).toBe('HIT')
  })
})
