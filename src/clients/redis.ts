import Redis from 'ioredis'

export const RedisClient = () => {
  const client = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  })

  return { client }
}
