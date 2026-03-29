import type { AppError } from '../shared/errors'
import type { ResultAsync } from '../shared/result'
import { ok, safeTry } from '../shared/result'
import type { TmdbSearchResult } from '../shared/types'
import type { HttpClient } from './tmdb.client'
import { TmdbRawSearchResponseSchema, transformTmdbSearchResponse } from './tmdb.schemas'

type SearchDeps = {
  httpClient: HttpClient
}

export const searchMovies =
  (deps: SearchDeps) =>
  (query: string, page: number, language: string): ResultAsync<TmdbSearchResult, AppError> =>
    safeTry(async function* () {
      const path = `/search/movie?query=${encodeURIComponent(query)}&page=${page}&language=${language}`
      const raw = yield* ok(deps.httpClient.request(path, TmdbRawSearchResponseSchema))
      return transformTmdbSearchResponse(raw)
    })
