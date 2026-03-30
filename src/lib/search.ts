import type { PickDeep } from 'type-fest'
import type { AppError } from '#shared/errors'
import type { ResultAsync } from '#shared/result'
import { ok, safeTry } from '#shared/result'
import { TTL } from '#shared/ttl'
import type { CacheStatus, SearchResponse, ServiceDeps, TmdbSearchResult } from '#shared/types'
import type { SearchParams } from '#validators/search'
import { buildSearchCacheKey } from './cache-keys'
import { TmdbSearchResultSchema } from './cache-schemas'
import { buildPaginationMeta, transformMovieSummary } from './transformers'
import { withCache } from './with-cache'

export const searchMovies =
  (deps: PickDeep<ServiceDeps, 'tmdb.searchMovies' | 'cache'>) =>
  (params: SearchParams): ResultAsync<SearchResponse, AppError> =>
    safeTry(async function* () {
      const cacheKey = buildSearchCacheKey({
        q: params.q,
        page: params.page,
        language: params.language,
      })

      const { data, status } = yield* ok(
        withCache(deps, cacheKey, TTL.SEARCH.redis, TmdbSearchResultSchema, () =>
          deps.tmdb.searchMovies(params.q, params.page, params.language),
        ),
      )

      return buildResponse(data, params, status)
    })

const buildResponse = (
  tmdb: TmdbSearchResult,
  params: SearchParams,
  cacheStatus: CacheStatus,
): SearchResponse => ({
  results: tmdb.results.map(transformMovieSummary),
  meta: {
    ...buildPaginationMeta(tmdb, params.q, params.page),
    cacheStatus,
  },
})
