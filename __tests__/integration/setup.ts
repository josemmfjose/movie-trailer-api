import { DeleteItemCommand, DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb'
import Redis from 'ioredis'

export const LOCALSTACK_ENDPOINT = 'http://localhost:4566'
export const TMDB_MOCK_URL = 'http://localhost:8080/3'
export const REDIS_HOST = 'localhost'
export const REDIS_PORT = 6379

export const dynamodb = new DynamoDBClient({
  endpoint: LOCALSTACK_ENDPOINT,
  region: 'us-east-1',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
})

export const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  lazyConnect: true,
})

export const createTestRedis = (db: number) =>
  new Redis({ host: REDIS_HOST, port: REDIS_PORT, db, lazyConnect: true })

export const TABLE_NAME = 'TrailerApiCache'

// Clean up between tests — uses flushdb (current db only) instead of flushall
export const flushRedis = async () => {
  await redis.connect().catch(() => {})
  await redis.flushdb()
}

export const createFlushRedis = (client: Redis) => async () => {
  await client.connect().catch(() => {})
  await client.flushdb()
}

export const flushDynamo = async () => {
  const scan = await dynamodb.send(new ScanCommand({ TableName: TABLE_NAME }))
  if (scan.Items) {
    for (const item of scan.Items) {
      if (item.PK && item.SK) {
        await dynamodb.send(
          new DeleteItemCommand({ TableName: TABLE_NAME, Key: { PK: item.PK, SK: item.SK } }),
        )
      }
    }
  }
}

export const seedTmdbMock = async (key: string, data: unknown) => {
  await fetch('http://localhost:8080/__seed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, data }),
  })
}

export const clearTmdbSeeds = async () => {
  await fetch('http://localhost:8080/__seed', { method: 'DELETE' })
}
