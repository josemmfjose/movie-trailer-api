import { getTrailers as tmdbGetTrailers } from '#adapters/tmdb-detail.adapter'
import { createTmdbClient } from '#adapters/tmdb.client'
import { DynamoClient } from '#clients/dynamo'
import { RedisClient } from '#clients/redis'
import { SecretsClient } from '#clients/secrets'
import { getItem, putItem } from '#data/repositories/cache.repository'
import { get as redisGet, set as redisSet } from '#lib/redis-cache'
import { get as cacheGet, set as cacheSet } from '#lib/two-tier-cache'
import { withRequestLogging } from '#middleware/request-logger'
import { inject } from '#shared/inject'
import { trailersProcessor } from './processor'

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

export const handler = withRequestLogging('trailers', trailersProcessor(deps))
