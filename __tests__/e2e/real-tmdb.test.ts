/**
 * E2E tests against the REAL TMDB API.
 *
 * These tests verify that our adapters, transformers, and service functions
 * work correctly with actual TMDB responses (not mocks).
 *
 * Requires: TMDB_READ_ACCESS_TOKEN in .env
 * Skip if: no token available (CI without credentials)
 */
import { beforeAll, describe, expect, it } from 'vitest'
import * as TmdbDetail from '#adapters/tmdb-detail.adapter'
import * as TmdbSearch from '#adapters/tmdb-search.adapter'
import { type HttpClient, createTmdbClient } from '#adapters/tmdb.client'
import { getMovieDetail } from '#lib/detail'
import { searchMovies } from '#lib/search'
import { getTrailers } from '#lib/trailers'
import { inject } from '#shared/inject'
import { isError } from '#shared/result'
import type { Language } from '#shared/types'

const TMDB_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN

// In-memory cache for E2E (no Redis/DynamoDB needed)
const memoryCache = new Map<string, { data: unknown; expiry: number }>()
const mockCache = {
  get: async <T>(key: string) => {
    const entry = memoryCache.get(key)
    if (entry && entry.expiry > Date.now()) return entry.data as T
    return null
  },
  set: async <T>(key: string, data: T, ttlMs: number) => {
    memoryCache.set(key, { data, expiry: Date.now() + ttlMs })
  },
}

const describeIfToken = TMDB_TOKEN ? describe : describe.skip

describeIfToken('E2E: Real TMDB API', () => {
  let httpClient: HttpClient

  beforeAll(() => {
    httpClient = createTmdbClient(
      { secretClient: { getSecret: async () => TMDB_TOKEN ?? '' } },
      { baseUrl: 'https://api.themoviedb.org/3' },
    )
  })

  describe('Search', () => {
    it('searches for "inception" and returns results', async () => {
      const deps = inject({
        tmdb: { searchMovies: TmdbSearch.searchMovies },
      })({ httpClient })
      const result = await searchMovies({ ...deps, cache: mockCache })({
        q: 'inception',
        page: 1,
        language: 'en-US' as Language,
        pageSize: 20,
      })

      expect(isError(result)).toBe(false)
      if (isError(result)) return

      expect(result.results.length).toBeGreaterThan(0)
      const inception = result.results.find((m) => m.title === 'Inception')
      expect(inception).toBeDefined()
      expect(inception?.id).toBe(27205)
      expect(inception?.posterUrl).toMatch(/^https:\/\/image\.tmdb\.org\/t\/p\/w500\//)
      expect(inception?.rating).toBeGreaterThan(7)
      expect(inception?.year).toBe(2010)
    })

    it('returns pagination with correct metadata', async () => {
      const deps = {
        ...inject({ tmdb: { searchMovies: TmdbSearch.searchMovies } })({ httpClient }),
        cache: mockCache,
      }
      const result = await searchMovies(deps)({
        q: 'batman',
        page: 1,
        language: 'en-US' as Language,
        pageSize: 20,
      })

      expect(isError(result)).toBe(false)
      if (isError(result)) return

      expect(result.meta.pagination.page).toBe(1)
      expect(result.meta.pagination.totalResults).toBeGreaterThan(10)
      expect(result.meta.pagination.totalPages).toBeGreaterThanOrEqual(1)
      expect(result.meta.links.self).toContain('batman')
      expect(result.meta.cacheStatus).toBe('MISS')
    })

    it('returns empty results for nonsense query', async () => {
      const deps = {
        ...inject({ tmdb: { searchMovies: TmdbSearch.searchMovies } })({ httpClient }),
        cache: mockCache,
      }
      const result = await searchMovies(deps)({
        q: 'xyzqwerty99999nosuchfilm',
        page: 1,
        language: 'en-US' as Language,
        pageSize: 20,
      })

      expect(isError(result)).toBe(false)
      if (isError(result)) return

      expect(result.results).toEqual([])
      expect(result.meta.pagination.totalResults).toBe(0)
    })

    it('handles Spanish language search', async () => {
      const deps = {
        ...inject({ tmdb: { searchMovies: TmdbSearch.searchMovies } })({ httpClient }),
        cache: mockCache,
      }
      const result = await searchMovies(deps)({
        q: 'inception',
        page: 1,
        language: 'es-ES' as Language,
        pageSize: 20,
      })

      expect(isError(result)).toBe(false)
      if (isError(result)) return

      expect(result.results.length).toBeGreaterThan(0)
      // TMDB returns Spanish titles when available
      // Inception keeps its English title in most languages, so just check it works
    })
  })

  describe('Movie Detail', () => {
    it('returns full detail for Inception (27205)', async () => {
      const deps = {
        ...inject({ tmdb: { getDetail: TmdbDetail.getDetail } })({ httpClient }),
        cache: mockCache,
      }
      const result = await getMovieDetail(deps)(27205, 'en-US' as Language)

      expect(isError(result)).toBe(false)
      if (isError(result)) return

      expect(result.movie).toMatchObject({
        id: 27205,
        title: 'Inception',
        overview: expect.any(String),
        posterUrl: expect.stringContaining('image.tmdb.org'),
        rating: expect.any(Number),
        runtime: 148,
        tagline: expect.any(String),
      })
      expect(result.movie.genres.length).toBeGreaterThan(0)
      expect(result.movie.genres[0]).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
      })
    })

    it('returns trailers embedded via append_to_response', async () => {
      const deps = {
        ...inject({ tmdb: { getDetail: TmdbDetail.getDetail } })({ httpClient }),
        cache: mockCache,
      }
      const result = await getMovieDetail(deps)(27205, 'en-US' as Language)

      expect(isError(result)).toBe(false)
      if (isError(result)) return

      expect(result.trailers.length).toBeGreaterThan(0)
      result.trailers.forEach((t) => {
        expect(t.source).toMatch(/^(youtube|vimeo)$/)
        expect(t.url).toMatch(/^https:\/\//)
        expect(t.type).toBe('Trailer')
        expect(typeof t.official).toBe('boolean')
      })
    })

    it('returns detail for Fight Club (550)', async () => {
      const deps = {
        ...inject({ tmdb: { getDetail: TmdbDetail.getDetail } })({ httpClient }),
        cache: mockCache,
      }
      const result = await getMovieDetail(deps)(550, 'en-US' as Language)

      expect(isError(result)).toBe(false)
      if (isError(result)) return

      expect(result.movie.title).toBe('Fight Club')
      expect(result.movie.year).toBe(1999)
    })
  })

  describe('Trailers (standalone)', () => {
    it('returns trailers for Inception', async () => {
      const deps = {
        ...inject({ tmdb: { getTrailers: TmdbDetail.getTrailers } })({ httpClient }),
        cache: mockCache,
      }
      const result = await getTrailers(deps)(27205, 'en-US' as Language)

      expect(isError(result)).toBe(false)
      if (isError(result)) return

      expect(result.trailers.length).toBeGreaterThan(0)
      const ytTrailer = result.trailers.find((t) => t.source === 'youtube')
      expect(ytTrailer).toBeDefined()
      expect(ytTrailer?.url).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/)
      expect(ytTrailer?.thumbnailUrl).toMatch(/^https:\/\/img\.youtube\.com\/vi\//)
    })

    it('filters to only Trailer type (not Featurette/BTS)', async () => {
      const deps = {
        ...inject({ tmdb: { getTrailers: TmdbDetail.getTrailers } })({ httpClient }),
        cache: mockCache,
      }
      const result = await getTrailers(deps)(27205, 'en-US' as Language)

      expect(isError(result)).toBe(false)
      if (isError(result)) return

      result.trailers.forEach((t) => {
        expect(t.type).toBe('Trailer')
      })
    })
  })
})
