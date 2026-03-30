import type { PickDeep } from 'type-fest'
import type { AppError } from '../shared/errors'
import type { ResultAsync } from '../shared/result'
import { ok, safeTry } from '../shared/result'
import { TTL } from '../shared/ttl'
import type {
  CacheStatus,
  Language,
  MovieDetailResponse,
  ServiceDeps,
  TmdbMovieDetailResult,
} from '../shared/types'
import { buildDetailCacheKey } from './cache-keys'
import { TmdbMovieDetailResultSchema } from './cache-schemas'
import { transformMovieDetail, transformTrailers } from './transformers'
import { withCache } from './with-cache'

export const getMovieDetail =
  (deps: PickDeep<ServiceDeps, 'tmdb.getDetail' | 'cache'>) =>
  (id: number, language: Language): ResultAsync<MovieDetailResponse, AppError> =>
    safeTry(async function* () {
      const cacheKey = buildDetailCacheKey(id, language)

      const { data, status } = yield* ok(
        withCache(deps, cacheKey, TTL.DETAIL.redis, TmdbMovieDetailResultSchema, () =>
          deps.tmdb.getDetail(id, language),
        ),
      )

      return buildResponse(data, status)
    })

const buildResponse = (
  tmdb: TmdbMovieDetailResult,
  cacheStatus: CacheStatus,
): MovieDetailResponse => ({
  movie: transformMovieDetail(tmdb),
  trailers: tmdb.videos ? transformTrailers(tmdb.videos.results) : [],
  meta: { cacheStatus },
})
