import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { type AppError, InternalError } from '#shared/errors'
import type { ResultAsync } from '#shared/result'
import { fromPromise } from '#shared/result'
import { localStackConfig } from './localstack'

type SecretsDeps = {
  secretsClient: SecretsManagerClient
}

export const SecretsClient = () => {
  const client = new SecretsManagerClient(localStackConfig())
  return { getSecret: getSecret({ secretsClient: client }) }
}

export const getSecret = (deps: SecretsDeps) => {
  const cache = new Map<string, string>()

  return (secretId: string): ResultAsync<string, AppError> => {
    const cached = cache.get(secretId)
    if (cached) return Promise.resolve(cached)

    return fromPromise(
      (async () => {
        const result = await deps.secretsClient.send(
          new GetSecretValueCommand({ SecretId: secretId }),
        )

        const value = result.SecretString
        if (!value) {
          throw new Error(`Secret ${secretId} has no string value`)
        }

        cache.set(secretId, value)
        return value
      })(),
      (e) =>
        InternalError('SECRET_NOT_FOUND', {
          reason: e instanceof Error ? e.message : 'Unknown secret retrieval error',
        }),
    )
  }
}
