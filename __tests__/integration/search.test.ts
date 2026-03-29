import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as TmdbSearch from '#adapters/tmdb-search.adapter'
import { createTmdbClient } from '#adapters/tmdb.client'
import * as RedisCache from '#lib/redis-cache'
import { searchMovies } from '#lib/search'
import { inject } from '#shared/inject'
import { isError } from '#shared/result'
import type { Language } from '#shared/types'
import { TMDB_MOCK_URL, createFlushRedis, createTestRedis } from './setup'

const redis = createTestRedis(1)
const flushRedis = createFlushRedis(redis)

const httpClient = createTmdbClient(
  { secretClient: { getSecret: async () => 'test-tmdb-key' } },
  { baseUrl: TMDB_MOCK_URL },
)
const redisClient = { client: redis }

const deps = inject({
  tmdb: { searchMovies: TmdbSearch.searchMovies },
  cache: { get: RedisCache.get, set: RedisCache.set },
})({ httpClient, redisClient })

beforeAll(async () => {
  await redis.connect().catch(() => {})
})

beforeEach(async () => {
  await flushRedis()
})

afterEach(async () => {
  await flushRedis()
})

describe('Search Integration', () => {
  it('returns search results from TMDB mock', async () => {
    const result = await searchMovies(deps)({
      q: 'inception',
      page: 1,
      language: 'en-US' as Language,
      pageSize: 20,
    })
    expect(isError(result)).toBe(false)
    if (isError(result)) return

    expect(result.results.length).toBeGreaterThan(0)
    expect(result.results[0]).toMatchObject({
      id: expect.any(Number),
      title: expect.any(String),
      posterUrl: expect.any(String),
      rating: expect.any(Number),
    })
  })

  it('returns pagination metadata', async () => {
    const result = await searchMovies(deps)({
      q: 'inception',
      page: 1,
      language: 'en-US' as Language,
      pageSize: 20,
    })
    expect(isError(result)).toBe(false)
    if (isError(result)) return

    expect(result.meta.pagination).toMatchObject({
      page: 1,
      totalResults: expect.any(Number),
      totalPages: expect.any(Number),
    })
    expect(result.meta.links.self).toContain('inception')
    expect(result.meta.links.self).toContain('page=1')
  })

  it('returns MISS on first call, HIT on second', async () => {
    const result1 = await searchMovies(deps)({
      q: 'inception',
      page: 1,
      language: 'en-US' as Language,
      pageSize: 20,
    })
    expect(isError(result1)).toBe(false)
    if (isError(result1)) return
    expect(result1.meta.cacheStatus).toBe('MISS')

    // Small delay for cache write
    await new Promise((r) => setTimeout(r, 500))

    const result2 = await searchMovies(deps)({
      q: 'inception',
      page: 1,
      language: 'en-US' as Language,
      pageSize: 20,
    })
    expect(isError(result2)).toBe(false)
    if (isError(result2)) return
    expect(result2.meta.cacheStatus).toBe('HIT')
  })

  it('returns empty results for unknown query', async () => {
    const result = await searchMovies(deps)({
      q: 'xyznonexistent999',
      page: 1,
      language: 'en-US' as Language,
      pageSize: 20,
    })
    expect(isError(result)).toBe(false)
    if (isError(result)) return

    expect(result.results).toEqual([])
    expect(result.meta.pagination.totalResults).toBe(0)
  })

  it('caches per language (no cross-contamination)', async () => {
    const enResult = await searchMovies(deps)({
      q: 'inception',
      page: 1,
      language: 'en-US' as Language,
      pageSize: 20,
    })
    expect(isError(enResult)).toBe(false)

    await new Promise((r) => setTimeout(r, 500))

    // Different language key should be a MISS
    const esResult = await searchMovies(deps)({
      q: 'inception',
      page: 1,
      language: 'es-ES' as Language,
      pageSize: 20,
    })
    expect(isError(esResult)).toBe(false)
    if (isError(esResult)) return
    expect(esResult.meta.cacheStatus).toBe('MISS')
  })

  it('normalizes query for cache key (case insensitive)', async () => {
    await searchMovies(deps)({
      q: 'inception',
      page: 1,
      language: 'en-US' as Language,
      pageSize: 20,
    })
    await new Promise((r) => setTimeout(r, 500))

    const result = await searchMovies(deps)({
      q: 'INCEPTION',
      page: 1,
      language: 'en-US' as Language,
      pageSize: 20,
    })
    expect(isError(result)).toBe(false)
    if (isError(result)) return
    // Should be HIT because cache keys are normalized to lowercase
    expect(result.meta.cacheStatus).toBe('HIT')
  })

  it('transforms poster URLs to full paths', async () => {
    const result = await searchMovies(deps)({
      q: 'inception',
      page: 1,
      language: 'en-US' as Language,
      pageSize: 20,
    })
    expect(isError(result)).toBe(false)
    if (isError(result)) return

    const withPoster = result.results.find((r) => r.posterUrl !== null)
    expect(withPoster?.posterUrl).toMatch(/^https:\/\/image\.tmdb\.org\/t\/p\/w500\//)
  })

  it('handles null poster_path gracefully', async () => {
    const result = await searchMovies(deps)({
      q: 'inception',
      page: 1,
      language: 'en-US' as Language,
      pageSize: 20,
    })
    expect(isError(result)).toBe(false)
    if (isError(result)) return

    // Fixture has a movie with null poster_path
    const withoutPoster = result.results.find((r) => r.posterUrl === null)
    expect(withoutPoster).toBeDefined()
  })
})
