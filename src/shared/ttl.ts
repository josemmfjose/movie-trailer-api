export const TTL = {
  SEARCH: {
    redis: 5 * 60_000, // 5 min
    dynamo: { fresh: 5 * 60_000, stale: 15 * 60_000 },
  },
  DETAIL: {
    redis: 60 * 60_000, // 1 hr
    dynamo: { fresh: 60 * 60_000, stale: 6 * 3_600_000 },
  },
  TRAILERS: {
    redis: 30 * 60_000, // 30 min
    dynamo: { fresh: 30 * 60_000, stale: 2 * 3_600_000 },
  },
} as const
