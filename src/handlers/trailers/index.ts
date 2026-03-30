import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { getTrailers as tmdbGetTrailers } from '#adapters/tmdb-detail.adapter'
import { createTmdbClient } from '#adapters/tmdb.client'
import { DynamoClient } from '#clients/dynamo'
import { RedisClient } from '#clients/redis'
import { SecretsClient } from '#clients/secrets'
import { getItem, putItem } from '#data/repositories/cache.repository'
import { get as redisGet, set as redisSet } from '#lib/redis-cache'
import { get as cacheGet, set as cacheSet } from '#lib/two-tier-cache'
import { getTrailers } from '#lib/trailers'
import { mapErrorToResponse } from '#middleware/error-mapper'
import { detectLanguage } from '#middleware/locale'
import { withRequestLogging } from '#middleware/request-logger'
import { securityHeaders } from '#middleware/security-headers'
import { inject } from '#shared/inject'
import { ok, okOr, safeTry } from '#shared/result'
import { validateMovieId } from '#validators/detail'

const deps = inject({
  tmdb: { getTrailers: tmdbGetTrailers },
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
  'trailers',
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> =>
    okOr(
      await safeTry(async function* () {
        const movieId = yield* ok(validateMovieId(event.pathParameters?.id))
        const language = detectLanguage(event.queryStringParameters, event.headers)
        const result = yield* ok(getTrailers(deps)(movieId, language))
        return {
          statusCode: 200,
          headers: securityHeaders,
          body: JSON.stringify({ data: result.trailers, meta: result.meta }),
        }
      }),
      mapErrorToResponse,
    ),
)
