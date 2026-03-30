import type {
  MovieDetail,
  MovieSummary,
  PaginationMeta,
  TmdbMovie,
  TmdbMovieDetailResult,
  TmdbSearchResult,
  TmdbVideo,
  Trailer,
} from '#shared/types'

const tmdbImageUrl = (path: string | null, size: string): string | null =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null

export const transformMovieSummary = (movie: TmdbMovie): MovieSummary => ({
  id: movie.id,
  title: movie.title,
  overview: movie.overview,
  posterUrl: tmdbImageUrl(movie.posterPath, 'w500'),
  backdropUrl: tmdbImageUrl(movie.backdropPath, 'w1280'),
  releaseDate: movie.releaseDate || null,
  year: movie.releaseDate ? Number.parseInt(movie.releaseDate.substring(0, 4), 10) || null : null,
  rating: movie.voteAverage,
  voteCount: movie.voteCount,
  popularity: movie.popularity,
  genreIds: movie.genreIds,
  hasTrailer: null,
  trailerCount: null,
})

export const transformTrailers = (videos: TmdbVideo[]): Trailer[] =>
  videos
    .filter((v) => v.type === 'Trailer' && (v.site === 'YouTube' || v.site === 'Vimeo'))
    .sort((a, b) => (a.official === b.official ? 0 : a.official ? -1 : 1))
    .map((v) => ({
      id: v.id,
      name: v.name,
      source: v.site === 'YouTube' ? 'youtube' : 'vimeo',
      key: v.key,
      url:
        v.site === 'YouTube'
          ? `https://www.youtube.com/watch?v=${v.key}`
          : `https://vimeo.com/${v.key}`,
      thumbnailUrl:
        v.site === 'YouTube' ? `https://img.youtube.com/vi/${v.key}/hqdefault.jpg` : null,
      type: 'Trailer',
      official: v.official,
      publishedAt: v.publishedAt,
    }))

export const transformMovieDetail = (detail: TmdbMovieDetailResult): MovieDetail => ({
  ...transformMovieSummary(detail),
  tagline: detail.tagline,
  runtime: detail.runtime,
  genres: detail.genres,
  status: detail.status,
  homepage: detail.homepage,
  imdbId: detail.imdbId,
})

export const buildPaginationMeta = (
  tmdb: TmdbSearchResult,
  query: string,
  page: number,
): PaginationMeta => {
  const totalPages = Math.min(tmdb.totalPages, 500)
  return {
    pagination: {
      page: tmdb.page,
      pageSize: tmdb.results.length,
      totalResults: tmdb.totalResults,
      totalPages,
    },
    links: {
      self: `/v1/movies/search?q=${encodeURIComponent(query)}&page=${page}`,
      next:
        tmdb.page < totalPages
          ? `/v1/movies/search?q=${encodeURIComponent(query)}&page=${page + 1}`
          : null,
      prev: page > 1 ? `/v1/movies/search?q=${encodeURIComponent(query)}&page=${page - 1}` : null,
    },
  }
}
