import type { ZodTypeAny, output as ZodOutput } from 'zod'
import type { AppError } from './errors'
import type { ResultAsync } from './result'

// --- Branded Types ---

export type Language = string & { readonly __brand: 'Language' }

// --- Domain Types ---

export type MovieSummary = {
  id: number
  title: string
  overview: string
  posterUrl: string | null
  backdropUrl: string | null
  releaseDate: string | null
  year: number | null
  rating: number
  voteCount: number
  popularity: number
  genreIds: number[]
  hasTrailer: boolean | null
  trailerCount: number | null
}

export type MovieDetail = MovieSummary & {
  tagline: string
  runtime: number | null
  genres: { id: number; name: string }[]
  status: string
  homepage: string | null
  imdbId: string | null
}

export type Trailer = {
  id: string
  name: string
  source: 'youtube' | 'vimeo'
  key: string
  url: string
  thumbnailUrl: string | null
  type: 'Trailer'
  official: boolean
  publishedAt: string
}

export type SearchResponse = {
  results: MovieSummary[]
  meta: PaginationMeta & { cacheStatus: CacheStatus }
}

export type MovieDetailResponse = {
  movie: MovieDetail
  trailers: Trailer[]
  meta: { cacheStatus: CacheStatus }
}

export type TrailersResponse = {
  trailers: Trailer[]
  meta: { cacheStatus: CacheStatus }
}

export type CacheStatus = 'HIT' | 'MISS'

export type PaginationMeta = {
  pagination: {
    page: number
    pageSize: number
    totalResults: number
    totalPages: number
  }
  links: {
    self: string
    next: string | null
    prev: string | null
  }
}

// --- Service Interfaces ---

export type ServiceDeps = {
  tmdb: MovieDataProvider
  cache: CacheService
}

export type MovieDataProvider = {
  searchMovies: (
    query: string,
    page: number,
    language: Language,
  ) => ResultAsync<TmdbSearchResult, AppError>
  getDetail: (id: number, language: Language) => ResultAsync<TmdbMovieDetailResult, AppError>
  getTrailers: (id: number, language: Language) => ResultAsync<TmdbVideosResult, AppError>
}

export type CacheService = {
  get: <S extends ZodTypeAny>(key: string, schema: S) => ResultAsync<ZodOutput<S> | null, AppError>
  set: <T>(key: string, data: T, ttlMs: number) => ResultAsync<void, AppError>
}

// --- TMDB Response Types (used by adapters, mapped from Zod schemas) ---

export type TmdbSearchResult = {
  page: number
  totalPages: number
  totalResults: number
  results: TmdbMovie[]
}

export type TmdbMovie = {
  id: number
  title: string
  originalTitle: string
  overview: string
  releaseDate: string
  popularity: number
  voteAverage: number
  voteCount: number
  posterPath: string | null
  backdropPath: string | null
  genreIds: number[]
  adult: boolean
}

export type TmdbMovieDetailResult = TmdbMovie & {
  tagline: string
  runtime: number | null
  genres: { id: number; name: string }[]
  status: string
  homepage: string | null
  imdbId: string | null
  videos?: TmdbVideosResult
}

export type TmdbVideosResult = {
  id?: number
  results: TmdbVideo[]
}

export type TmdbVideo = {
  id: string
  key: string
  name: string
  site: string
  type: string
  official: boolean
  publishedAt: string
}
