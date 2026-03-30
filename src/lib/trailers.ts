import type { PickDeep } from 'type-fest'
import type { AppError } from '../shared/errors'
import type { ResultAsync } from '../shared/result'
import { ok, safeTry } from '../shared/result'
import { TTL } from '../shared/ttl'
import type {
  CacheStatus,
  Language,
  ServiceDeps,
  TmdbVideosResult,
  TrailersResponse,
} from '../shared/types'
import { buildTrailersCacheKey } from './cache-keys'
import { TmdbVideosResultSchema } from './cache-schemas'
import { transformTrailers } from './transformers'
import { withCache } from './with-cache'

export const getTrailers =
  (deps: PickDeep<ServiceDeps, 'tmdb.getTrailers' | 'cache'>) =>
  (id: number, language: Language): ResultAsync<TrailersResponse, AppError> =>
    safeTry(async function* () {
      const cacheKey = buildTrailersCacheKey(id, language)

      const { data, status } = yield* ok(
        withCache(deps, cacheKey, TTL.TRAILERS.redis, TmdbVideosResultSchema, () =>
          deps.tmdb.getTrailers(id, language),
        ),
      )

      return buildResponse(data, status)
    })

const buildResponse = (tmdb: TmdbVideosResult, cacheStatus: CacheStatus): TrailersResponse => ({
  trailers: transformTrailers(tmdb.results),
  meta: { cacheStatus },
})
