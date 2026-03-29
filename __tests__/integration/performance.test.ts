import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as TmdbDetail from '#adapters/tmdb-detail.adapter'
import * as TmdbSearch from '#adapters/tmdb-search.adapter'
import { createTmdbClient } from '#adapters/tmdb.client'
import { getMovieDetail } from '#lib/detail'
import * as RedisCache from '#lib/redis-cache'
import { searchMovies } from '#lib/search'
import { inject } from '#shared/inject'
import { isError } from '#shared/result'
import type { Language } from '#shared/types'
import { TMDB_MOCK_URL, createFlushRedis, createTestRedis } from './setup'

const redis = createTestRedis(4)
const flushRedis = createFlushRedis(redis)
const redisClient = { client: redis }

const TMDB_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN

const mockHttpClient = createTmdbClient(
  { secretClient: { getSecret: async () => 'test-tmdb-key' } },
  { baseUrl: TMDB_MOCK_URL },
)

const describeReal = TMDB_TOKEN ? describe : describe.skip

beforeAll(async () => {
  await redis.connect().catch(() => {})
})

beforeEach(async () => {
  await flushRedis()
})

const time = async <T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> => {
  const start = performance.now()
  const result = await fn()
  return { result, ms: performance.now() - start }
}

describe('Performance: Mock TMDB (localhost)', () => {
  const searchDeps = inject({
    tmdb: { searchMovies: TmdbSearch.searchMovies },
    cache: { get: RedisCache.get, set: RedisCache.set },
  })({ httpClient: mockHttpClient, redisClient })

  const detailDeps = inject({
    tmdb: { getDetail: TmdbDetail.getDetail },
    cache: { get: RedisCache.get, set: RedisCache.set },
  })({ httpClient: mockHttpClient, redisClient })

  it('cached search is faster than uncached', async () => {
    const params = { q: 'inception', page: 1, language: 'en-US' as Language, pageSize: 20 }

    const cold = await time(() => searchMovies(searchDeps)(params))
    expect(isError(cold.result)).toBe(false)
    if (isError(cold.result)) return
    expect(cold.result.meta.cacheStatus).toBe('MISS')

    await new Promise((r) => setTimeout(r, 50))

    const warm = await time(() => searchMovies(searchDeps)(params))
    expect(isError(warm.result)).toBe(false)
    if (isError(warm.result)) return
    expect(warm.result.meta.cacheStatus).toBe('HIT')

    expect(warm.ms).toBeLessThan(cold.ms)
    console.log(
      `  [Mock] Search: cold=${cold.ms.toFixed(1)}ms → warm=${warm.ms.toFixed(1)}ms (${(cold.ms / warm.ms).toFixed(1)}x faster)`,
    )
  })

  it('cached detail is faster than uncached', async () => {
    const cold = await time(() => getMovieDetail(detailDeps)(550, 'en-US' as Language))
    expect(isError(cold.result)).toBe(false)
    if (isError(cold.result)) return
    expect(cold.result.meta.cacheStatus).toBe('MISS')

    await new Promise((r) => setTimeout(r, 50))

    const warm = await time(() => getMovieDetail(detailDeps)(550, 'en-US' as Language))
    expect(isError(warm.result)).toBe(false)
    if (isError(warm.result)) return
    expect(warm.result.meta.cacheStatus).toBe('HIT')

    expect(warm.ms).toBeLessThan(cold.ms)
    console.log(
      `  [Mock] Detail: cold=${cold.ms.toFixed(1)}ms → warm=${warm.ms.toFixed(1)}ms (${(cold.ms / warm.ms).toFixed(1)}x faster)`,
    )
  })
})

describeReal('Performance: Real TMDB (network)', () => {
  const realHttpClient = createTmdbClient(
    { secretClient: { getSecret: async () => TMDB_TOKEN ?? '' } },
    { baseUrl: 'https://api.themoviedb.org/3' },
  )

  const searchDeps = inject({
    tmdb: { searchMovies: TmdbSearch.searchMovies },
    cache: { get: RedisCache.get, set: RedisCache.set },
  })({ httpClient: realHttpClient, redisClient })

  const detailDeps = inject({
    tmdb: { getDetail: TmdbDetail.getDetail },
    cache: { get: RedisCache.get, set: RedisCache.set },
  })({ httpClient: realHttpClient, redisClient })

  it('cached search is faster than uncached', async () => {
    const params = { q: 'inception', page: 1, language: 'en-US' as Language, pageSize: 20 }

    const cold = await time(() => searchMovies(searchDeps)(params))
    expect(isError(cold.result)).toBe(false)
    if (isError(cold.result)) return
    expect(cold.result.meta.cacheStatus).toBe('MISS')

    await new Promise((r) => setTimeout(r, 50))

    const warm = await time(() => searchMovies(searchDeps)(params))
    expect(isError(warm.result)).toBe(false)
    if (isError(warm.result)) return
    expect(warm.result.meta.cacheStatus).toBe('HIT')

    expect(warm.ms).toBeLessThan(cold.ms)
    console.log(
      `  [Real] Search: cold=${cold.ms.toFixed(1)}ms → warm=${warm.ms.toFixed(1)}ms (${(cold.ms / warm.ms).toFixed(1)}x faster)`,
    )
  })

  it('cached detail is faster than uncached', async () => {
    const cold = await time(() => getMovieDetail(detailDeps)(550, 'en-US' as Language))
    expect(isError(cold.result)).toBe(false)
    if (isError(cold.result)) return
    expect(cold.result.meta.cacheStatus).toBe('MISS')

    await new Promise((r) => setTimeout(r, 50))

    const warm = await time(() => getMovieDetail(detailDeps)(550, 'en-US' as Language))
    expect(isError(warm.result)).toBe(false)
    if (isError(warm.result)) return
    expect(warm.result.meta.cacheStatus).toBe('HIT')

    expect(warm.ms).toBeLessThan(cold.ms)
    console.log(
      `  [Real] Detail: cold=${cold.ms.toFixed(1)}ms → warm=${warm.ms.toFixed(1)}ms (${(cold.ms / warm.ms).toFixed(1)}x faster)`,
    )
  })
})

describe('Performance: Graceful Degradation', () => {
  it('returns fast error when TMDB is unreachable', async () => {
    const brokenHttpClient = createTmdbClient(
      { secretClient: { getSecret: async () => 'test-key' } },
      { baseUrl: 'http://localhost:19999/3' },
    )
    const brokenDeps = inject({
      tmdb: { searchMovies: TmdbSearch.searchMovies },
      cache: { get: RedisCache.get, set: RedisCache.set },
    })({ httpClient: brokenHttpClient, redisClient })

    const { result, ms } = await time(() =>
      searchMovies(brokenDeps)({ q: 'test', page: 1, language: 'en-US' as Language, pageSize: 20 }),
    )

    expect(isError(result)).toBe(true)
    expect(ms).toBeLessThan(15_000)
    console.log(`  Failure: ${ms.toFixed(1)}ms (timeout + retries, not a hang)`)
  })
})
