import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { PickDeep } from 'type-fest'
import { getTrailers } from '#lib/trailers'
import { mapErrorToResponse } from '#middleware/error-mapper'
import { detectLanguage } from '#middleware/locale'
import { securityHeaders } from '#middleware/security-headers'
import { ok, okOr, safeTry } from '#shared/result'
import type { ServiceDeps } from '#shared/types'
import { validateMovieId } from '#validators/detail'

export const trailersProcessor =
  (deps: PickDeep<ServiceDeps, 'tmdb.getTrailers' | 'cache'>) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> =>
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
    )
