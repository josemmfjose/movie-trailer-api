import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { localStackConfig } from './localstack'

export const DynamoClient = () => {
  const client = new DynamoDBClient(localStackConfig())

  return {
    db: client,
    tableName: process.env.TRAILER_API_CACHE_TABLE ?? 'TrailerApiCache',
  }
}
