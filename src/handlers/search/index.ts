import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { searchMovies as tmdbSearchMovies } from '#adapters/tmdb-search.adapter'
import { createTmdbClient } from '#adapters/tmdb.client'
import { DynamoClient } from '#clients/dynamo'
import { RedisClient } from '#clients/redis'
import { SecretsClient } from '#clients/secrets'
import { getItem, putItem } from '#data/repositories/cache.repository'
import { get as redisGet, set as redisSet } from '#lib/redis-cache'
import { searchMovies } from '#lib/search'
import { get as cacheGet, set as cacheSet } from '#lib/two-tier-cache'
import { mapErrorToResponse } from '#middleware/error-mapper'
import { withRequestLogging } from '#middleware/request-logger'
import { securityHeaders } from '#middleware/security-headers'
import { inject } from '#shared/inject'
import { ok, okOr, safeTry } from '#shared/result'
import { validateSearch } from '#validators/search'

const deps = inject({
  tmdb: { searchMovies: tmdbSearchMovies },
  cache: { get: cacheGet, set: cacheSet },
})(
  inject({
    tmdbClient: createTmdbClient,
    redis: { get: redisGet, set: redisSet },
    dynamo: { getItem, putItem },
  })({
    secretClient: SecretsClient(),
    redisClient: RedisClient(),
    dynamoClient: DynamoClient(),
  }),
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
