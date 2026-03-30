import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import * as TmdbSearch from '#adapters/tmdb-search.adapter'
import { createTmdbClient } from '#adapters/tmdb.client'
import { RedisClient } from '#clients/redis'
import { SecretsClient, getSecret } from '#clients/secrets'
import * as RedisCache from '#lib/redis-cache'
import { searchMovies } from '#lib/search'
import { mapErrorToResponse } from '#middleware/error-mapper'
import { withRequestLogging } from '#middleware/request-logger'
import { securityHeaders } from '#middleware/security-headers'
import { inject } from '#shared/inject'
import { ok, okOr, safeTry } from '#shared/result'
import { validateSearch } from '#validators/search'

const deps = inject({
  tmdb: { searchMovies: TmdbSearch.searchMovies },
  cache: { get: RedisCache.get, set: RedisCache.set },
})(
  inject({
    httpClient: createTmdbClient,
    redisClient: () => RedisClient(),
  })(
    inject({
      secretClient: { getSecret },
    })(SecretsClient()),
  ),
)

export const handler = withRequestLogging(
  'search',
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> =>
    okOr(
      await safeTry(async function* () {
        const params = yield* ok(validateSearch(event.queryStringParameters ?? null))
        const result = yield* ok(searchMovies(deps)(params))
        return {
          statusCode: 200,
          headers: securityHeaders,
          body: JSON.stringify({ data: result.results, meta: result.meta }),
        }
      }),
      mapErrorToResponse,
    ),
)
