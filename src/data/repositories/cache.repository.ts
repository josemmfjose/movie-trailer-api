import {
  DeleteItemCommand,
  type DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { type AppError, InternalError } from '../../shared/errors'
import type { ResultAsync } from '../../shared/result'
import { fromPromise } from '../../shared/result'
import { type CacheEntry, CacheEntrySchema, cacheKeys } from '../schemas/cache-entry'

type CacheDeps = {
  dynamoClient: {
    db: DynamoDBClient
    tableName: string
  }
}

export const getItem =
  (deps: CacheDeps) =>
  (
    entityType: string,
    cacheKey: string,
    language: string,
  ): ResultAsync<CacheEntry | null, AppError> =>
    fromPromise(
      (async () => {
        const { db, tableName } = deps.dynamoClient
        const result = await db.send(
          new GetItemCommand({
            TableName: tableName,
            Key: marshall({
              PK: cacheKeys.pk(entityType, language),
              SK: cacheKeys.sk(cacheKey),
            }),
          }),
        )

        if (!result.Item) return null

        const raw = unmarshall(result.Item)
        return CacheEntrySchema.parse(raw)
      })(),
      (e) =>
        InternalError('CACHE_READ_ERROR', {
          reason: e instanceof Error ? e.message : 'Unknown DynamoDB read error',
        }),
    )

export const putItem =
  (deps: CacheDeps) =>
  (entry: CacheEntry): ResultAsync<void, AppError> =>
    fromPromise(
      (async () => {
        const { db, tableName } = deps.dynamoClient
        await db.send(
          new PutItemCommand({
            TableName: tableName,
            Item: marshall(
              {
                PK: cacheKeys.pk(entry.entityType, entry.language),
                SK: cacheKeys.sk(entry.cacheKey),
                GSI1PK: cacheKeys.gsi1pk(entry.entityType),
                GSI1SK: cacheKeys.gsi1sk(entry.freshUntil),
                ...entry,
              },
              { removeUndefinedValues: true },
            ),
          }),
        )
      })(),
      (e) =>
        InternalError('CACHE_WRITE_ERROR', {
          reason: e instanceof Error ? e.message : 'Unknown DynamoDB write error',
        }),
    )

export const deleteItem =
  (deps: CacheDeps) =>
  (entityType: string, cacheKey: string, language: string): ResultAsync<void, AppError> =>
    fromPromise(
      (async () => {
        const { db, tableName } = deps.dynamoClient
        await db.send(
          new DeleteItemCommand({
            TableName: tableName,
            Key: marshall({
              PK: cacheKeys.pk(entityType, language),
              SK: cacheKeys.sk(cacheKey),
            }),
          }),
        )
      })(),
      (e) =>
        InternalError('CACHE_WRITE_ERROR', {
          reason: e instanceof Error ? e.message : 'Unknown DynamoDB delete error',
        }),
    )
