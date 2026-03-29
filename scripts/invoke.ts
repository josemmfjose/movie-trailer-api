/**
 * Invoke Lambda handlers locally with a fake API Gateway event.
 *
 * Usage:
 *   bun run scripts/invoke.ts search 'q=inception&page=1'
 *   bun run scripts/invoke.ts detail 550
 *   bun run scripts/invoke.ts trailers 550
 *   bun run scripts/invoke.ts search 'q=batman&language=es-ES'
 */
import type { APIGatewayProxyEventV2 } from 'aws-lambda'

const [handlerName, arg] = process.argv.slice(2)

if (!handlerName || !arg) {
  console.log(`Usage:
  bun run scripts/invoke.ts search  'q=inception&page=1'
  bun run scripts/invoke.ts detail  550
  bun run scripts/invoke.ts trailers 550`)
  process.exit(1)
}

// Point AWS SDK at LocalStack, handlers at local services
process.env.AWS_ENDPOINT_URL ??= 'http://localhost:4566'
process.env.TMDB_SECRET_NAME ??= 'tmdb-api-key'
process.env.TMDB_BASE_URL ??= 'http://localhost:8080/3'
process.env.REDIS_HOST ??= 'localhost'
process.env.REDIS_PORT ??= '6379'

const fakeEvent = (overrides: Partial<APIGatewayProxyEventV2>): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'GET /',
    rawPath: '/',
    rawQueryString: '',
    headers: {},
    queryStringParameters: undefined,
    pathParameters: undefined,
    isBase64Encoded: false,
    requestContext: {
      accountId: '000000000000',
      apiId: 'local',
      http: { method: 'GET', path: '/', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'invoke.ts' },
      requestId: 'local-invoke',
      routeKey: 'GET /',
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    ...overrides,
  }) as APIGatewayProxyEventV2

async function main() {
  let event: APIGatewayProxyEventV2
  let mod: { handler: (event: APIGatewayProxyEventV2) => Promise<unknown> }

  switch (handlerName) {
    case 'search': {
      const params = Object.fromEntries(new URLSearchParams(arg))
      event = fakeEvent({
        rawPath: '/v1/movies/search',
        rawQueryString: arg,
        queryStringParameters: params,
      })
      mod = await import('../src/handlers/search/index.ts')
      break
    }
    case 'detail': {
      event = fakeEvent({
        rawPath: `/v1/movies/${arg}`,
        pathParameters: { id: arg },
      })
      mod = await import('../src/handlers/detail/index.ts')
      break
    }
    case 'trailers': {
      event = fakeEvent({
        rawPath: `/v1/movies/${arg}/trailers`,
        pathParameters: { id: arg },
      })
      mod = await import('../src/handlers/trailers/index.ts')
      break
    }
    default:
      console.error(`Unknown handler: ${handlerName}. Use: search, detail, trailers`)
      process.exit(1)
  }

  const result = await mod.handler(event)
  const body = typeof result === 'object' && result !== null && 'body' in result
    ? JSON.parse((result as { body: string }).body)
    : result
  console.log(JSON.stringify(body, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
