import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as TmdbDetail from '#adapters/tmdb-detail.adapter'
import { createTmdbClient } from '#adapters/tmdb.client'
import { getMovieDetail } from '#lib/detail'
import * as RedisCache from '#lib/redis-cache'
import { getTrailers } from '#lib/trailers'
import { inject } from '#shared/inject'
import { isError } from '#shared/result'
import type { Language } from '#shared/types'
import { TMDB_MOCK_URL, createFlushRedis, createTestRedis } from './setup'

const redis = createTestRedis(2)
const flushRedis = createFlushRedis(redis)

const httpClient = createTmdbClient(
  { secretClient: { getSecret: async () => 'test-tmdb-key' } },
  { baseUrl: TMDB_MOCK_URL },
)
const redisClient = { client: redis }

const detailDeps = inject({
  tmdb: { getDetail: TmdbDetail.getDetail },
  cache: { get: RedisCache.get, set: RedisCache.set },
})({ httpClient, redisClient })

const trailerDeps = inject({
  tmdb: { getTrailers: TmdbDetail.getTrailers },
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

describe('Movie Detail Integration', () => {
  it('returns full movie detail for Fight Club (550)', async () => {
    const result = await getMovieDetail(detailDeps)(550, 'en-US' as Language)
    expect(isError(result)).toBe(false)
    if (isError(result)) return

    expect(result.movie).toMatchObject({
      id: 550,
      title: 'Fight Club',
      overview: expect.any(String),
      posterUrl: expect.stringContaining('image.tmdb.org'),
      rating: expect.any(Number),
      runtime: expect.any(Number),
    })
    expect(result.movie.genres.length).toBeGreaterThan(0)
  })

  it('includes trailers from append_to_response', async () => {
    const result = await getMovieDetail(detailDeps)(550, 'en-US' as Language)
    expect(isError(result)).toBe(false)
    if (isError(result)) return

    expect(result.trailers.length).toBeGreaterThan(0)
    result.trailers.forEach((trailer) => {
      expect(trailer).toMatchObject({
        name: expect.any(String),
        source: expect.stringMatching(/^(youtube|vimeo)$/),
        url: expect.stringMatching(/^https:\/\/(www\.youtube\.com|vimeo\.com)/),
        type: 'Trailer',
      })
    })
  })

  it('caches detail on second call', async () => {
    const r1 = await getMovieDetail(detailDeps)(550, 'en-US' as Language)
    expect(isError(r1)).toBe(false)
    if (isError(r1)) return
    expect(r1.meta.cacheStatus).toBe('MISS')

    await new Promise((r) => setTimeout(r, 200))

    const r2 = await getMovieDetail(detailDeps)(550, 'en-US' as Language)
    expect(isError(r2)).toBe(false)
    if (isError(r2)) return
    expect(r2.meta.cacheStatus).toBe('HIT')
  })

  it('returns Inception detail (27205)', async () => {
    const result = await getMovieDetail(detailDeps)(27205, 'en-US' as Language)
    expect(isError(result)).toBe(false)
    if (isError(result)) return

    expect(result.movie.title).toBe('Inception')
    expect(result.movie.tagline).toBeTruthy()
  })
})

describe('Trailers Integration', () => {
  it('returns standalone trailers for movie 550', async () => {
    const result = await getTrailers(trailerDeps)(550, 'en-US' as Language)
    expect(isError(result)).toBe(false)
    if (isError(result)) return

    expect(result.trailers.length).toBeGreaterThan(0)
    // Should only include type=Trailer, not Featurette/Behind the Scenes
    result.trailers.forEach((t) => expect(t.type).toBe('Trailer'))
  })

  it('constructs correct YouTube embed URLs', async () => {
    const result = await getTrailers(trailerDeps)(550, 'en-US' as Language)
    expect(isError(result)).toBe(false)
    if (isError(result)) return

    const ytTrailer = result.trailers.find((t) => t.source === 'youtube')
    expect(ytTrailer).toBeDefined()
    expect(ytTrailer?.url).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/)
    expect(ytTrailer?.thumbnailUrl).toMatch(/^https:\/\/img\.youtube\.com\/vi\//)
  })

  it('caches trailers on second call', async () => {
    const r1 = await getTrailers(trailerDeps)(550, 'en-US' as Language)
    expect(isError(r1)).toBe(false)
    if (isError(r1)) return
    expect(r1.meta.cacheStatus).toBe('MISS')

    await new Promise((r) => setTimeout(r, 200))

    const r2 = await getTrailers(trailerDeps)(550, 'en-US' as Language)
    expect(isError(r2)).toBe(false)
    if (isError(r2)) return
    expect(r2.meta.cacheStatus).toBe('HIT')
  })

  it('sorts official trailers first', async () => {
    const result = await getTrailers(trailerDeps)(550, 'en-US' as Language)
    expect(isError(result)).toBe(false)
    if (isError(result)) return

    if (result.trailers.length > 1) {
      const officials = result.trailers.filter((t) => t.official)
      const nonOfficials = result.trailers.filter((t) => !t.official)
      if (officials.length > 0 && nonOfficials.length > 0) {
        const lastOfficial = officials[officials.length - 1]
        const firstNonOfficial = nonOfficials[0]
        if (!lastOfficial || !firstNonOfficial) return
        const lastOfficialIdx = result.trailers.lastIndexOf(lastOfficial)
        const firstNonOfficialIdx = result.trailers.indexOf(firstNonOfficial)
        expect(lastOfficialIdx).toBeLessThan(firstNonOfficialIdx)
      }
    }
  })
})
