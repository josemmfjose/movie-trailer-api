import { z } from 'zod'
import type {
  TmdbMovie,
  TmdbMovieDetailResult,
  TmdbSearchResult,
  TmdbVideo,
  TmdbVideosResult,
} from '../shared/types'

// --- Raw TMDB API Schemas (snake_case) ---

export const TmdbRawMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  original_title: z.string(),
  overview: z.string(),
  release_date: z.string(),
  popularity: z.number(),
  vote_average: z.number(),
  vote_count: z.number(),
  poster_path: z.string().nullable(),
  backdrop_path: z.string().nullable(),
  genre_ids: z.array(z.number()),
  adult: z.boolean(),
})

export type TmdbRawMovie = z.infer<typeof TmdbRawMovieSchema>

export const TmdbRawSearchResponseSchema = z.object({
  page: z.number(),
  total_pages: z.number(),
  total_results: z.number(),
  results: z.array(TmdbRawMovieSchema),
})

export type TmdbRawSearchResponse = z.infer<typeof TmdbRawSearchResponseSchema>

export const TmdbRawVideoSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  site: z.string(),
  type: z.string(),
  official: z.boolean(),
  published_at: z.string(),
})

export type TmdbRawVideo = z.infer<typeof TmdbRawVideoSchema>

export const TmdbRawVideosResponseSchema = z.object({
  id: z.number().optional(),
  results: z.array(TmdbRawVideoSchema),
})

export type TmdbRawVideosResponse = z.infer<typeof TmdbRawVideosResponseSchema>

const TmdbGenreSchema = z.object({
  id: z.number(),
  name: z.string(),
})

// Detail endpoint returns genres (objects) instead of genre_ids (numbers)
// and has extra fields not in search results. Defined separately, not extending TmdbRawMovieSchema.
export const TmdbRawMovieDetailSchema = z.object({
  id: z.number(),
  title: z.string(),
  original_title: z.string(),
  overview: z.string(),
  release_date: z.string(),
  popularity: z.number(),
  vote_average: z.number(),
  vote_count: z.number(),
  poster_path: z.string().nullable(),
  backdrop_path: z.string().nullable(),
  genre_ids: z.array(z.number()).optional(),
  adult: z.boolean(),
  tagline: z.string().default(''),
  runtime: z.number().nullable(),
  genres: z.array(TmdbGenreSchema),
  status: z.string(),
  homepage: z.string().nullable(),
  imdb_id: z.string().nullable(),
  videos: TmdbRawVideosResponseSchema.optional(),
})

export type TmdbRawMovieDetail = z.infer<typeof TmdbRawMovieDetailSchema>

// --- Transformers (snake_case -> camelCase) ---

export const transformTmdbMovie = (raw: TmdbRawMovie | TmdbRawMovieDetail): TmdbMovie => ({
  id: raw.id,
  title: raw.title,
  originalTitle: raw.original_title,
  overview: raw.overview,
  releaseDate: raw.release_date,
  popularity: raw.popularity,
  voteAverage: raw.vote_average,
  voteCount: raw.vote_count,
  posterPath: raw.poster_path,
  backdropPath: raw.backdrop_path,
  genreIds: raw.genre_ids ?? [],
  adult: raw.adult,
})

export const transformTmdbSearchResponse = (raw: TmdbRawSearchResponse): TmdbSearchResult => ({
  page: raw.page,
  totalPages: raw.total_pages,
  totalResults: raw.total_results,
  results: raw.results.map(transformTmdbMovie),
})

export const transformTmdbVideo = (raw: TmdbRawVideo): TmdbVideo => ({
  id: raw.id,
  key: raw.key,
  name: raw.name,
  site: raw.site,
  type: raw.type,
  official: raw.official,
  publishedAt: raw.published_at,
})

export const transformTmdbVideosResponse = (raw: TmdbRawVideosResponse): TmdbVideosResult => ({
  ...(raw.id != null ? { id: raw.id } : {}),
  results: raw.results.map(transformTmdbVideo),
})

export const transformTmdbMovieDetail = (raw: TmdbRawMovieDetail): TmdbMovieDetailResult => ({
  ...transformTmdbMovie(raw),
  tagline: raw.tagline,
  runtime: raw.runtime,
  genres: raw.genres,
  status: raw.status,
  homepage: raw.homepage,
  imdbId: raw.imdb_id,
  ...(raw.videos ? { videos: transformTmdbVideosResponse(raw.videos) } : {}),
})
