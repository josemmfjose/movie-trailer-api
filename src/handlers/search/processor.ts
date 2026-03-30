import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { PickDeep } from 'type-fest'
import { searchMovies } from '#lib/search'
import { mapErrorToResponse } from '#middleware/error-mapper'
import { securityHeaders } from '#middleware/security-headers'
import { ok, okOr, safeTry } from '#shared/result'
import type { ServiceDeps } from '#shared/types'
import { validateSearch } from '#validators/search'

export const searchProcessor =
  (deps: PickDeep<ServiceDeps, 'tmdb.searchMovies' | 'cache'>) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> =>
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
    )
