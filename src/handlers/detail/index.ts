import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { getDetail as tmdbGetDetail } from '#adapters/tmdb-detail.adapter'
import { createTmdbClient } from '#adapters/tmdb.client'
import { DynamoClient } from '#clients/dynamo'
import { RedisClient } from '#clients/redis'
import { SecretsClient } from '#clients/secrets'
import { getItem, putItem } from '#data/repositories/cache.repository'
import { getMovieDetail } from '#lib/detail'
import { get as redisGet, set as redisSet } from '#lib/redis-cache'
import { get as cacheGet, set as cacheSet } from '#lib/two-tier-cache'
import { mapErrorToResponse } from '#middleware/error-mapper'
import { detectLanguage } from '#middleware/locale'
import { withRequestLogging } from '#middleware/request-logger'
import { securityHeaders } from '#middleware/security-headers'
import { inject } from '#shared/inject'
import { ok, okOr, safeTry } from '#shared/result'
import { validateMovieId } from '#validators/detail'

const deps = inject({
  tmdb: { getDetail: tmdbGetDetail },
  cache: { get: cacheGet, set: cacheSet },
})(
  inject({
    httpClient: createTmdbClient,
    redis: { get: redisGet, set: redisSet },
    dynamo: { getItem, putItem },
  })({
    secretClient: SecretsClient(),
    redisClient: RedisClient(),
    dynamoClient: DynamoClient(),
  }),
)

export const handler = withRequestLogging(
  'detail',
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> =>
    okOr(
      await safeTry(async function* () {
        const movieId = yield* ok(validateMovieId(event.pathParameters?.id))
        const language = detectLanguage(event.queryStringParameters, event.headers)
        const result = yield* ok(getMovieDetail(deps)(movieId, language))
        return {
          statusCode: 200,
          headers: securityHeaders,
          body: JSON.stringify({
            data: result.movie,
            trailers: result.trailers,
            meta: result.meta,
          }),
        }
      }),
      mapErrorToResponse,
    ),
)
