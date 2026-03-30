import type { AppError } from '#shared/errors'
import type { ResultAsync } from '#shared/result'
import { ok, safeTry } from '#shared/result'
import type { TmdbSearchResult } from '#shared/types'
import type { TmdbClient } from './tmdb.client'
import { TmdbRawSearchResponseSchema, transformTmdbSearchResponse } from './tmdb.schemas'

type SearchDeps = {
  tmdbClient: TmdbClient
}

export const searchMovies =
  (deps: SearchDeps) =>
  (query: string, page: number, language: string): ResultAsync<TmdbSearchResult, AppError> =>
    safeTry(async function* () {
      const path = `/search/movie?query=${encodeURIComponent(query)}&page=${page}&language=${language}`
      const raw = yield* ok(deps.tmdbClient.request(path, TmdbRawSearchResponseSchema))
      return transformTmdbSearchResponse(raw)
    })
