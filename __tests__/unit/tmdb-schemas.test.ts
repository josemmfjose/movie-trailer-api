import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  TmdbRawMovieDetailSchema,
  TmdbRawMovieSchema,
  TmdbRawSearchResponseSchema,
  TmdbRawVideoSchema,
  transformTmdbMovie,
  transformTmdbMovieDetail,
  transformTmdbSearchResponse,
  transformTmdbVideo,
} from '#adapters/tmdb.schemas'

// Load real fixture files
const fixturesDir = resolve(__dirname, '../../test/mocks/tmdb/fixtures')
const searchFixture = JSON.parse(
  readFileSync(resolve(fixturesDir, 'search-inception.json'), 'utf8'),
)
const movieFixture = JSON.parse(readFileSync(resolve(fixturesDir, 'movie-550.json'), 'utf8'))
const videosFixture = JSON.parse(readFileSync(resolve(fixturesDir, 'videos-550.json'), 'utf8'))

// ---------------------------------------------------------------------------
// transformTmdbMovie
// ---------------------------------------------------------------------------
describe('transformTmdbMovie', () => {
  it('maps snake_case fields to camelCase', () => {
    const raw = TmdbRawMovieSchema.parse(searchFixture.results[0])
    const movie = transformTmdbMovie(raw)

    expect(movie.id).toBe(27205)
    expect(movie.title).toBe('Inception')
    expect(movie.originalTitle).toBe('Inception')
    expect(movie.releaseDate).toBe('2010-07-15')
    expect(movie.voteAverage).toBe(8.369)
    expect(movie.voteCount).toBe(36142)
    expect(movie.posterPath).toBe('/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg')
    expect(movie.backdropPath).toBe('/s3TBrRGB1iav7gFOCNx3H31MoES.jpg')
    expect(movie.genreIds).toEqual([28, 878, 12])
    expect(movie.adult).toBe(false)
  })

  it('handles null poster_path and backdrop_path', () => {
    const raw = TmdbRawMovieSchema.parse(searchFixture.results[1])
    const movie = transformTmdbMovie(raw)
    expect(movie.posterPath).toBeNull()
    expect(movie.backdropPath).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// transformTmdbSearchResponse
// ---------------------------------------------------------------------------
describe('transformTmdbSearchResponse', () => {
  it('maps page, total_pages, total_results to camelCase', () => {
    const raw = TmdbRawSearchResponseSchema.parse(searchFixture)
    const result = transformTmdbSearchResponse(raw)

    expect(result.page).toBe(1)
    expect(result.totalPages).toBe(1)
    expect(result.totalResults).toBe(3)
    expect(result.results).toHaveLength(3)
  })

  it('transforms each movie in results', () => {
    const raw = TmdbRawSearchResponseSchema.parse(searchFixture)
    const result = transformTmdbSearchResponse(raw)

    expect(result.results[0]?.title).toBe('Inception')
    expect(result.results[0]?.originalTitle).toBe('Inception')
    expect(result.results[1]?.title).toBe('Inception: The Cobol Job')
  })
})

// ---------------------------------------------------------------------------
// transformTmdbVideo
// ---------------------------------------------------------------------------
describe('transformTmdbVideo', () => {
  it('maps published_at to publishedAt', () => {
    const rawVideo = TmdbRawVideoSchema.parse(videosFixture.results[0])
    const video = transformTmdbVideo(rawVideo)

    expect(video.publishedAt).toBe('2015-07-14T12:00:06.000Z')
    expect(video.id).toBe('5c9294240e0a267cd516835f')
    expect(video.key).toBe('qtRKdVHc-cE')
    expect(video.name).toBe('Fight Club - Trailer')
    expect(video.site).toBe('YouTube')
    expect(video.type).toBe('Trailer')
    expect(video.official).toBe(true)
  })

  it('handles non-official videos', () => {
    const rawVideo = TmdbRawVideoSchema.parse(videosFixture.results[2])
    const video = transformTmdbVideo(rawVideo)

    expect(video.official).toBe(false)
    expect(video.site).toBe('Vimeo')
    expect(video.type).toBe('Behind the Scenes')
  })
})

// ---------------------------------------------------------------------------
// transformTmdbMovieDetail
// ---------------------------------------------------------------------------
describe('transformTmdbMovieDetail', () => {
  // The movie-550.json fixture uses the TMDB API detail format which has "genres"
  // but not "genre_ids", and "videos" without a top-level "id". We build a
  // schema-valid raw object by merging the fixture with the missing fields.
  const rawDetailInput = {
    ...movieFixture,
    genre_ids: movieFixture.genres.map((g: { id: number }) => g.id),
    videos: {
      id: movieFixture.id,
      results: movieFixture.videos.results,
    },
  }

  it('transforms full movie detail from fixture', () => {
    const raw = TmdbRawMovieDetailSchema.parse(rawDetailInput)
    const detail = transformTmdbMovieDetail(raw)

    expect(detail.id).toBe(550)
    expect(detail.title).toBe('Fight Club')
    expect(detail.tagline).toBe('Mischief. Mayhem. Soap.')
    expect(detail.runtime).toBe(139)
    expect(detail.status).toBe('Released')
    expect(detail.homepage).toBe('http://www.foxmovies.com/movies/fight-club')
    expect(detail.imdbId).toBe('tt0137523')
    expect(detail.genres).toEqual([
      { id: 18, name: 'Drama' },
      { id: 53, name: 'Thriller' },
      { id: 35, name: 'Comedy' },
    ])
  })

  it('includes transformed videos when present', () => {
    const raw = TmdbRawMovieDetailSchema.parse(rawDetailInput)
    const detail = transformTmdbMovieDetail(raw)

    expect(detail.videos).toBeDefined()
    expect(detail.videos?.results).toHaveLength(3)
    expect(detail.videos?.results[0]?.publishedAt).toBe('2015-07-14T12:00:06.000Z')
  })

  it('maps snake_case fields in detail correctly', () => {
    const raw = TmdbRawMovieDetailSchema.parse(rawDetailInput)
    const detail = transformTmdbMovieDetail(raw)

    expect(detail.voteAverage).toBe(8.438)
    expect(detail.voteCount).toBe(28753)
    expect(detail.posterPath).toBe('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg')
    expect(detail.backdropPath).toBe('/hZkgoQYus5dXo3H8T7Uef6DNknx.jpg')
    expect(detail.releaseDate).toBe('1999-10-15')
  })
})
