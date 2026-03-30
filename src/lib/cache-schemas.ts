import { z } from 'zod'

const TmdbMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  originalTitle: z.string(),
  overview: z.string(),
  releaseDate: z.string(),
  popularity: z.number(),
  voteAverage: z.number(),
  voteCount: z.number(),
  posterPath: z.string().nullable(),
  backdropPath: z.string().nullable(),
  genreIds: z.array(z.number()),
  adult: z.boolean(),
})

const TmdbVideoSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  site: z.string(),
  type: z.string(),
  official: z.boolean(),
  publishedAt: z.string(),
})

export const TmdbSearchResultSchema = z.object({
  page: z.number(),
  totalPages: z.number(),
  totalResults: z.number(),
  results: z.array(TmdbMovieSchema),
})

export const TmdbVideosResultSchema = z.object({
  id: z.number().optional(),
  results: z.array(TmdbVideoSchema),
})

const TmdbGenreSchema = z.object({
  id: z.number(),
  name: z.string(),
})

export const TmdbMovieDetailResultSchema = TmdbMovieSchema.extend({
  tagline: z.string(),
  runtime: z.number().nullable(),
  genres: z.array(TmdbGenreSchema),
  status: z.string(),
  homepage: z.string().nullable(),
  imdbId: z.string().nullable(),
  videos: TmdbVideosResultSchema.optional(),
})
