import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { PickDeep } from 'type-fest'
import { getMovieDetail } from '#lib/detail'
import { mapErrorToResponse } from '#middleware/error-mapper'
import { detectLanguage } from '#middleware/locale'
import { securityHeaders } from '#middleware/security-headers'
import { ok, okOr, safeTry } from '#shared/result'
import type { ServiceDeps } from '#shared/types'
import { validateMovieId } from '#validators/detail'

export const detailProcessor =
  (deps: PickDeep<ServiceDeps, 'tmdb.getDetail' | 'cache'>) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> =>
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
    )
