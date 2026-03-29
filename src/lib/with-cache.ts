import type { PickDeep } from 'type-fest'
import type { AppError } from '../shared/errors'
import { logger } from '../shared/logger'
import type { ResultAsync } from '../shared/result'
import { isError, ok, safeTry } from '../shared/result'
import type { CacheStatus, ServiceDeps } from '../shared/types'

export const withCache = <T>(
  deps: PickDeep<ServiceDeps, 'cache'>,
  cacheKey: string,
  ttlMs: number,
  fetch: () => ResultAsync<T, AppError>,
): ResultAsync<{ data: T; status: CacheStatus }, AppError> =>
  safeTry(async function* () {
    // Cache read — handle errors gracefully, don't propagate
    const cached = await deps.cache.get<T>(cacheKey)
    if (!isError(cached) && cached != null) {
      logger.debug('cache_hit', { key: cacheKey })
      return { data: cached, status: 'HIT' }
    }
    if (isError(cached)) {
      logger.warn('cache_read_error', { key: cacheKey, error: cached.message })
    }

    // Fetch — propagate errors
    const result = yield* ok(fetch())

    // Fire-and-forget cache write
    deps.cache
      .set(cacheKey, result, ttlMs)
      .then((writeResult) => {
        if (isError(writeResult)) {
          logger.warn('cache_write_error', { key: cacheKey, error: writeResult.message })
        }
      })
      .catch((err) => {
        logger.warn('cache_write_error', { key: cacheKey, error: String(err) })
      })

    return { data: result, status: 'MISS' }
  })
