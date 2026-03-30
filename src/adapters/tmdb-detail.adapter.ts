import type { AppError } from '#shared/errors'
import type { ResultAsync } from '#shared/result'
import { ok, safeTry } from '#shared/result'
import type { TmdbMovieDetailResult, TmdbVideosResult } from '#shared/types'
import type { TmdbClient } from './tmdb.client'
import {
  TmdbRawMovieDetailSchema,
  TmdbRawVideosResponseSchema,
  transformTmdbMovieDetail,
  transformTmdbVideosResponse,
} from './tmdb.schemas'

type DetailDeps = {
  tmdbClient: TmdbClient
}

export const getDetail =
  (deps: DetailDeps) =>
  (id: number, language: string): ResultAsync<TmdbMovieDetailResult, AppError> =>
    safeTry(async function* () {
      const path = `/movie/${id}?language=${language}&append_to_response=videos`
      const raw = yield* ok(deps.tmdbClient.request(path, TmdbRawMovieDetailSchema))
      return transformTmdbMovieDetail(raw)
    })

export const getTrailers =
  (deps: DetailDeps) =>
  (id: number, language: string): ResultAsync<TmdbVideosResult, AppError> =>
    safeTry(async function* () {
      const path = `/movie/${id}/videos?language=${language}`
      const raw = yield* ok(deps.tmdbClient.request(path, TmdbRawVideosResponseSchema))
      return transformTmdbVideosResponse(raw)
    })
