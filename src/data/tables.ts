export const tables = {
  trailerApiCache: {
    name: 'TrailerApiCache',
    primaryKey: 'PK',
    rangeKey: 'SK',
    envKeyName: 'TRAILER_API_CACHE_TABLE',
    attributes: [
      { name: 'GSI1PK', type: 'S' as const },
      { name: 'GSI1SK', type: 'S' as const },
    ],
    indexes: [
      {
        name: 'GSI1',
        hashKey: 'GSI1PK',
        rangeKey: 'GSI1SK',
        projectionType: 'ALL' as const,
      },
    ],
  },
} as const
