import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import * as TmdbDetail from '../../adapters/tmdb-detail.adapter'
import { createTmdbClient } from '../../adapters/tmdb.client'
import { RedisClient } from '../../clients/redis'
import { SecretsClient, getSecret } from '../../clients/secrets'
import { getMovieDetail } from '../../lib/detail'
import * as RedisCache from '../../lib/redis-cache'
import { mapErrorToResponse } from '../../middleware/error-mapper'
import { detectLanguage } from '../../middleware/locale'
import { withRequestLogging } from '../../middleware/request-logger'
import { securityHeaders } from '../../middleware/security-headers'
import { inject } from '../../shared/inject'
import { ok, okOr, safeTry } from '../../shared/result'
import { validateMovieId } from '../../validators/detail'

const deps = inject({
  tmdb: { getDetail: TmdbDetail.getDetail },
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
