import { describe, expect, it } from 'vitest'
import {
  buildPaginationMeta,
  transformMovieDetail,
  transformMovieSummary,
  transformTrailers,
} from '#lib/transformers'
import type { TmdbMovie, TmdbMovieDetailResult, TmdbSearchResult, TmdbVideo } from '#shared/types'

// ---------------------------------------------------------------------------
// Helpers: reusable fixtures
// ---------------------------------------------------------------------------
const baseTmdbMovie: TmdbMovie = {
  id: 550,
  title: 'Fight Club',
  originalTitle: 'Fight Club',
  overview: 'An insomniac and a soap salesman...',
  releaseDate: '1999-10-15',
  popularity: 73.248,
  voteAverage: 8.438,
  voteCount: 28753,
  posterPath: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
  backdropPath: '/hZkgoQYus5dXo3H8T7Uef6DNknx.jpg',
  genreIds: [18, 53, 35],
  adult: false,
}

const youtubeTrailer: TmdbVideo = {
  id: 'yt1',
  key: 'qtRKdVHc-cE',
  name: 'Fight Club - Trailer',
  site: 'YouTube',
  type: 'Trailer',
  official: true,
  publishedAt: '2015-07-14T12:00:06.000Z',
}

const vimeoTrailer: TmdbVideo = {
  id: 'vim1',
  key: '123456',
  name: 'Vimeo Trailer',
  site: 'Vimeo',
  type: 'Trailer',
  official: false,
  publishedAt: '2020-01-01T00:00:00.000Z',
}

const behindTheScenes: TmdbVideo = {
  id: 'bts1',
  key: 'f_cPa99grCA',
  name: 'Behind the Scenes',
  site: 'Vimeo',
  type: 'Behind the Scenes',
  official: false,
  publishedAt: '2012-03-22T10:00:00.000Z',
}

const dailymotionTrailer: TmdbVideo = {
  id: 'dm1',
  key: 'xabc',
  name: 'Dailymotion Trailer',
  site: 'Dailymotion',
  type: 'Trailer',
  official: false,
  publishedAt: '2020-01-01T00:00:00.000Z',
}

// ---------------------------------------------------------------------------
// transformMovieSummary
// ---------------------------------------------------------------------------
describe('transformMovieSummary', () => {
  it('maps all fields correctly', () => {
    const summary = transformMovieSummary(baseTmdbMovie)
    expect(summary.id).toBe(550)
    expect(summary.title).toBe('Fight Club')
    expect(summary.overview).toBe('An insomniac and a soap salesman...')
    expect(summary.posterUrl).toBe(
      'https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
    )
    expect(summary.backdropUrl).toBe(
      'https://image.tmdb.org/t/p/w1280/hZkgoQYus5dXo3H8T7Uef6DNknx.jpg',
    )
    expect(summary.releaseDate).toBe('1999-10-15')
    expect(summary.year).toBe(1999)
    expect(summary.rating).toBe(8.438)
    expect(summary.voteCount).toBe(28753)
    expect(summary.popularity).toBe(73.248)
    expect(summary.genreIds).toEqual([18, 53, 35])
    expect(summary.hasTrailer).toBeNull()
    expect(summary.trailerCount).toBeNull()
  })

  it('handles null poster_path', () => {
    const movie = { ...baseTmdbMovie, posterPath: null }
    const summary = transformMovieSummary(movie)
    expect(summary.posterUrl).toBeNull()
  })

  it('handles empty release_date', () => {
    const movie = { ...baseTmdbMovie, releaseDate: '' }
    const summary = transformMovieSummary(movie)
    expect(summary.releaseDate).toBeNull()
    expect(summary.year).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// transformTrailers
// ---------------------------------------------------------------------------
describe('transformTrailers', () => {
  it('filters to Trailer type only', () => {
    const trailers = transformTrailers([youtubeTrailer, behindTheScenes])
    expect(trailers).toHaveLength(1)
    expect(trailers[0]?.name).toBe('Fight Club - Trailer')
  })

  it('filters to YouTube/Vimeo only (excludes Dailymotion)', () => {
    const trailers = transformTrailers([youtubeTrailer, dailymotionTrailer])
    expect(trailers).toHaveLength(1)
    expect(trailers[0]?.source).toBe('youtube')
  })

  it('sorts official trailers first', () => {
    const unofficialFirst: TmdbVideo = {
      ...youtubeTrailer,
      id: 'unoff',
      official: false,
    }
    const trailers = transformTrailers([unofficialFirst, youtubeTrailer])
    expect(trailers[0]?.official).toBe(true)
    expect(trailers[1]?.official).toBe(false)
  })

  it('constructs YouTube URLs correctly', () => {
    const trailers = transformTrailers([youtubeTrailer])
    expect(trailers[0]?.url).toBe('https://www.youtube.com/watch?v=qtRKdVHc-cE')
  })

  it('constructs Vimeo URLs correctly', () => {
    const trailers = transformTrailers([vimeoTrailer])
    expect(trailers[0]?.url).toBe('https://vimeo.com/123456')
  })

  it('constructs YouTube thumbnail URLs', () => {
    const trailers = transformTrailers([youtubeTrailer])
    expect(trailers[0]?.thumbnailUrl).toBe('https://img.youtube.com/vi/qtRKdVHc-cE/hqdefault.jpg')
  })

  it('sets thumbnailUrl to null for Vimeo', () => {
    const trailers = transformTrailers([vimeoTrailer])
    expect(trailers[0]?.thumbnailUrl).toBeNull()
  })

  it('returns empty array for no matching videos', () => {
    const trailers = transformTrailers([behindTheScenes])
    expect(trailers).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// transformMovieDetail
// ---------------------------------------------------------------------------
describe('transformMovieDetail', () => {
  const detailInput: TmdbMovieDetailResult = {
    ...baseTmdbMovie,
    tagline: 'Mischief. Mayhem. Soap.',
    runtime: 139,
    genres: [
      { id: 18, name: 'Drama' },
      { id: 53, name: 'Thriller' },
    ],
    status: 'Released',
    homepage: 'http://www.foxmovies.com/movies/fight-club',
    imdbId: 'tt0137523',
  }

  it('extends summary with detail fields', () => {
    const detail = transformMovieDetail(detailInput)
    // summary fields
    expect(detail.id).toBe(550)
    expect(detail.title).toBe('Fight Club')
    // detail fields
    expect(detail.tagline).toBe('Mischief. Mayhem. Soap.')
    expect(detail.runtime).toBe(139)
    expect(detail.genres).toEqual([
      { id: 18, name: 'Drama' },
      { id: 53, name: 'Thriller' },
    ])
    expect(detail.status).toBe('Released')
    expect(detail.homepage).toBe('http://www.foxmovies.com/movies/fight-club')
    expect(detail.imdbId).toBe('tt0137523')
  })

  it('handles null runtime', () => {
    const detail = transformMovieDetail({ ...detailInput, runtime: null })
    expect(detail.runtime).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// buildPaginationMeta
// ---------------------------------------------------------------------------
describe('buildPaginationMeta', () => {
  const tmdbResult: TmdbSearchResult = {
    page: 1,
    totalPages: 10,
    totalResults: 200,
    results: Array(20).fill(baseTmdbMovie),
  }

  it('builds correct pagination and links', () => {
    const meta = buildPaginationMeta(tmdbResult, 'inception', 1)
    expect(meta.pagination.page).toBe(1)
    expect(meta.pagination.pageSize).toBe(20)
    expect(meta.pagination.totalResults).toBe(200)
    expect(meta.pagination.totalPages).toBe(10)
    expect(meta.links.self).toBe('/v1/movies/search?q=inception&page=1')
    expect(meta.links.next).toBe('/v1/movies/search?q=inception&page=2')
  })

  it('caps totalPages at 500', () => {
    const bigResult = { ...tmdbResult, totalPages: 1000 }
    const meta = buildPaginationMeta(bigResult, 'test', 1)
    expect(meta.pagination.totalPages).toBe(500)
  })

  it('prev is null on page 1', () => {
    const meta = buildPaginationMeta(tmdbResult, 'test', 1)
    expect(meta.links.prev).toBeNull()
  })

  it('next is null on last page', () => {
    const lastPage = { ...tmdbResult, page: 10, totalPages: 10 }
    const meta = buildPaginationMeta(lastPage, 'test', 10)
    expect(meta.links.next).toBeNull()
  })

  it('has both prev and next on middle page', () => {
    const midResult = { ...tmdbResult, page: 5 }
    const meta = buildPaginationMeta(midResult, 'test', 5)
    expect(meta.links.prev).toBe('/v1/movies/search?q=test&page=4')
    expect(meta.links.next).toBe('/v1/movies/search?q=test&page=6')
  })

  it('encodes query with special characters', () => {
    const meta = buildPaginationMeta(tmdbResult, 'star wars & more', 1)
    expect(meta.links.self).toContain('star%20wars%20%26%20more')
  })
})
