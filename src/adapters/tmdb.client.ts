import type { output as ZodOutput, ZodTypeAny } from 'zod'
import { type AppError, InternalError } from '#shared/errors'
import type { ResultAsync } from '#shared/result'
import { ok, safeTry } from '#shared/result'

// --- Circuit Breaker ---

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

type CircuitBreaker = {
  state: CircuitState
  failures: number
  successes: number
  lastFailureTime: number
}

type CircuitBreakerConfig = {
  failureThreshold: number
  resetTimeout: number
  halfOpenSuccessThreshold: number
}

const defaultCircuitConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 30_000,
  halfOpenSuccessThreshold: 2,
}

const createCircuitBreaker = (): CircuitBreaker => ({
  state: 'CLOSED',
  failures: 0,
  successes: 0,
  lastFailureTime: 0,
})

const getEffectiveState = (breaker: CircuitBreaker, config: CircuitBreakerConfig): CircuitState => {
  if (breaker.state === 'OPEN' && Date.now() - breaker.lastFailureTime >= config.resetTimeout) {
    return 'HALF_OPEN'
  }
  return breaker.state
}

const onSuccess = (breaker: CircuitBreaker, config: CircuitBreakerConfig): void => {
  const effective = getEffectiveState(breaker, config)

  if (effective === 'HALF_OPEN') {
    breaker.successes += 1
    if (breaker.successes >= config.halfOpenSuccessThreshold) {
      breaker.state = 'CLOSED'
      breaker.failures = 0
      breaker.successes = 0
    } else {
      breaker.state = 'HALF_OPEN'
    }
  } else {
    breaker.failures = 0
    breaker.successes = 0
  }
}

const onFailure = (breaker: CircuitBreaker, config: CircuitBreakerConfig): void => {
  const effective = getEffectiveState(breaker, config)

  if (effective === 'HALF_OPEN') {
    breaker.state = 'OPEN'
    breaker.failures = config.failureThreshold
    breaker.successes = 0
    breaker.lastFailureTime = Date.now()
  } else {
    breaker.failures += 1
    if (breaker.failures >= config.failureThreshold) {
      breaker.state = 'OPEN'
      breaker.lastFailureTime = Date.now()
    }
    breaker.successes = 0
  }
}

// --- Retry Logic ---

type RetryConfig = {
  maxRetries: number
  baseDelay: number
  maxDelay: number
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 2,
  baseDelay: 200,
  maxDelay: 2_000,
}

const isRetryable = (status: number): boolean => status >= 500

const jitteredDelay = (attempt: number, config: RetryConfig): number =>
  Math.random() * Math.min(config.maxDelay, config.baseDelay * 2 ** attempt)

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// --- HTTP Client ---

export type SecretClient = {
  getSecret: (name: string) => ResultAsync<string, AppError>
}

export type TmdbClient = {
  request: <S extends ZodTypeAny>(path: string, schema: S) => ResultAsync<ZodOutput<S>, AppError>
}

export type TmdbClientDeps = {
  secretClient: SecretClient
}

export type TmdbClientConfig = {
  baseUrl?: string
  timeoutMs?: number
  circuitBreaker?: CircuitBreakerConfig
  retry?: RetryConfig
  secretName?: string
}

export const createTmdbClient = (
  deps: TmdbClientDeps,
  config: TmdbClientConfig = {},
): TmdbClient => {
  const baseUrl = config.baseUrl ?? process.env.TMDB_BASE_URL ?? 'https://api.themoviedb.org/3'
  const timeoutMs = config.timeoutMs ?? 3_000
  const circuitConfig = { ...defaultCircuitConfig, ...config.circuitBreaker }
  const retryConfig = { ...defaultRetryConfig, ...config.retry }
  const secretName = config.secretName ?? 'tmdb-api-key'

  const breaker = createCircuitBreaker()

  const getApiKey = (): ResultAsync<string, AppError> => deps.secretClient.getSecret(secretName)

  const executeFetch = async (url: string, apiKey: string): Promise<Response> => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      return await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  const fetchWithRetry = async (url: string, apiKey: string): Promise<Response> => {
    let lastError: unknown

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        const response = await executeFetch(url, apiKey)

        if (response.ok || !isRetryable(response.status)) {
          return response
        }

        // 5xx: retryable
        lastError = new Error(`TMDB responded with ${response.status}`)

        if (attempt < retryConfig.maxRetries) {
          await sleep(jitteredDelay(attempt, retryConfig))
        }
      } catch (err) {
        // Network / abort errors are retryable
        lastError = err

        if (attempt < retryConfig.maxRetries) {
          await sleep(jitteredDelay(attempt, retryConfig))
        }
      }
    }

    throw lastError
  }

  const request = <S extends ZodTypeAny>(
    path: string,
    schema: S,
  ): ResultAsync<ZodOutput<S>, AppError> =>
    safeTry(async function* () {
      const effective = getEffectiveState(breaker, circuitConfig)
      if (effective === 'OPEN') {
        return InternalError('CIRCUIT_OPEN', {
          reason: `Circuit breaker is open, retry after ${circuitConfig.resetTimeout}ms`,
        })
      }

      if (breaker.state === 'OPEN' && effective === 'HALF_OPEN') {
        breaker.state = 'HALF_OPEN'
        breaker.successes = 0
      }

      const apiKey = yield* ok(getApiKey())
      const url = `${baseUrl}${path}`

      try {
        const response = await fetchWithRetry(url, apiKey)

        if (response.status === 404) {
          return InternalError('TMDB_NOT_FOUND', { reason: 'not found' })
        }

        if (response.status === 429) {
          onFailure(breaker, circuitConfig)
          return InternalError('TMDB_RATE_LIMITED', {
            reason: 'TMDB rate limit exceeded',
          })
        }

        if (!response.ok) {
          onFailure(breaker, circuitConfig)
          return InternalError('TMDB_UNAVAILABLE', {
            reason: `TMDB responded with ${response.status}`,
          })
        }

        const json: unknown = await response.json()
        const parsed = schema.safeParse(json)

        if (!parsed.success) {
          onFailure(breaker, circuitConfig)
          return InternalError('TMDB_UNAVAILABLE', {
            reason: 'Invalid response shape from TMDB',
            zodErrors: parsed.error.flatten(),
          })
        }

        onSuccess(breaker, circuitConfig)
        return parsed.data
      } catch (err) {
        onFailure(breaker, circuitConfig)
        return InternalError('TMDB_UNAVAILABLE', {
          reason: err instanceof Error ? err.message : 'Unknown fetch error',
        })
      }
    })

  return { request }
}
