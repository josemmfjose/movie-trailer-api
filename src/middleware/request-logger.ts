import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { logger } from '#shared/logger'

export const withRequestLogging =
  (handlerName: string, fn: (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const start = performance.now()
    const { rawPath, rawQueryString, requestContext } = event
    const method = requestContext?.http?.method ?? 'UNKNOWN'

    try {
      const result = await fn(event)
      const duration = Math.round(performance.now() - start)
      const statusCode =
        typeof result === 'object' && result !== null && 'statusCode' in result
          ? result.statusCode
          : 200

      logger.info('request_completed', {
        handler: handlerName,
        method,
        path: rawPath,
        query: rawQueryString || undefined,
        statusCode,
        durationMs: duration,
      })

      return result
    } catch (err) {
      const duration = Math.round(performance.now() - start)

      logger.error('request_failed', {
        handler: handlerName,
        method,
        path: rawPath,
        query: rawQueryString || undefined,
        durationMs: duration,
        error: err instanceof Error ? err.message : String(err),
      })

      throw err
    }
  }
