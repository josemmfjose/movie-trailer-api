# Movie Trailer Search API

REST API for searching movies and watching trailers, powered by TMDB.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/movies/search?q=inception&page=1` | Search movies with pagination |
| GET | `/v1/movies/{id}` | Movie detail with trailers |
| GET | `/v1/movies/{id}/trailers` | Standalone trailers for a movie |

All endpoints support `?language=es-ES` and `Accept-Language` header for locale.

## Architecture

```
Client -> CloudFront CDN -> API Gateway (throttled) -> Lambda -> Redis (L1) -> TMDB API
                                                          |
                                                          v
                                                     DynamoDB (L2)
```

- **Lambda** (Node.js 20, ARM64) - per-endpoint functions with least-privilege IAM
- **API Gateway HTTP API v2** - rate-limited (50 req/s sustained, 100 burst)
- **CloudFront** - global edge caching, HTTPS-only, cache by query string + Accept-Language
- **Two-tier cache** - Redis L1 (hot, 5min–1hr TTL) with DynamoDB L2 fallback (persistent, freshness-aware). L2 hits backfill Redis automatically.
- **Secrets Manager** - TMDB API key, cached in-process
- **CloudWatch alarms** - error rate, p99 latency, throttles per Lambda + API Gateway 5xx

### Resilience

- **Circuit breaker** on TMDB client (5 failures -> open, 30s reset, 2 half-open successes to close)
- **Retry with jittered backoff** (2 retries, 200ms base, 2s max) for 5xx and network errors
- **3s request timeout** with AbortController
- **Fire-and-forget cache writes** - never block the response on cache failures
- **Graceful degradation** - cache read errors are logged and skipped, never propagated

### Patterns

- **Result type** with generator composition (`safeTry`/`yield* ok()`) for typed error handling without try-catch
- **Typed DI** via `inject()` — compile-time safe, enforces dependency key names, no runtime container
- **Processor/handler split** — processors own the full request lifecycle (validation -> business logic -> error mapping -> response), handlers just wire real deps. Processors are testable with injected deps and fake events.
- **Structured error taxonomy** — `ApiError` (visible to client) vs `InternalError` (logged only) with exhaustive status mapping
- **Schema-validated caching** — Redis and DynamoDB cache reads are validated with Zod before returning, preventing corrupt cached data from propagating

## Prerequisites

- [Bun](https://bun.sh/) (v1.1+) - runtime and package manager
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose - required for all integration/e2e tests and local deployment
- [AWS CDK](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html) - only for deploying to AWS (installed as a devDependency)

## Quick Start

```bash
bun install                                      # install dependencies
docker compose -f docker-compose.test.yml up -d  # start LocalStack + Redis + TMDB mock
bun run test                                     # run ALL tests (184 tests)
```

That's it. The Docker Compose stack provides everything the tests need:

| Service        | Port | Purpose                                      |
|----------------|------|----------------------------------------------|
| LocalStack     | 4566 | DynamoDB, Secrets Manager (AWS services mock) |
| Redis          | 6379 | Hot cache layer (L1)                          |
| TMDB Mock      | 8080 | Stubs TMDB API responses for integration tests|

## TMDB API Setup

The E2E tests hit the real TMDB API. To run them, create a `.env` file in the project root:

1. Register at [themoviedb.org](https://www.themoviedb.org/signup)
2. Go to Settings > API and request an API key
3. Create `.env`:

```env
TMDB_READ_ACCESS_TOKEN=<your API Read Access Token (v4 Bearer)>
TMDB_API_KEY=<your API Key (v3 auth)>
```

The `.env` is loaded automatically by vitest. In production, the key is stored in AWS Secrets Manager (`tmdb-api-key`) and never exposed to clients.

## Running Tests

All tests run against Docker infrastructure. **Start the containers first.**

```bash
docker compose -f docker-compose.test.yml up -d  # required before running tests
```

| Command                  | What it runs                        | Needs Docker? | Needs `.env`? |
|--------------------------|-------------------------------------|---------------|---------------|
| `bun run test`           | All unit + integration + e2e tests  | Yes           | Yes (for e2e) |
| `bun run test:unit`      | Unit tests only                     | No            | No            |
| `bun run test:integration` | Integration tests                 | Yes           | No            |
| `bun run test:e2e`       | E2E against real TMDB               | Yes           | Yes           |
| `bun run test:coverage`  | All tests with V8 coverage report   | Yes           | Yes (for e2e) |

Tear down containers when done:

```bash
docker compose -f docker-compose.test.yml down
```

## Invoking Handlers Locally

With Docker containers running, you can invoke any Lambda handler directly against local services (LocalStack, Redis, TMDB mock):

```bash
bun run scripts/invoke.ts search   'q=inception&page=1'
bun run scripts/invoke.ts detail   27205
bun run scripts/invoke.ts trailers 27205
```

Supports the same query parameters as the real API, including language:

```bash
bun run scripts/invoke.ts search 'q=batman&page=1&language=es-ES'
```

The script builds a fake `APIGatewayProxyEventV2` and calls the handler function directly — no API Gateway or CDK deploy needed.

## Available Scripts

| Command                    | Description                                             |
|----------------------------|---------------------------------------------------------|
| `bun run build`            | Bundle Lambdas with esbuild                             |
| `bun run lint`             | Lint and auto-fix with Biome                            |
| `bun run typecheck`        | Type-check with `tsc --noEmit`                          |
| `bun run cdk:synth`        | Synthesize the CDK CloudFormation template              |
| `bun run cdk:deploy`       | Deploy to AWS                                           |
| `bun run cdk:local:deploy` | Deploy to LocalStack and seed the TMDB secret           |
| `bun run redis:cli`        | Interactive Redis CLI session                           |
| `bun run redis:keys`       | List all cached Redis keys                              |
| `bun run dynamo:scan`      | Scan the DynamoDB cache table                           |

## Project Structure

```
src/
  adapters/       # TMDB API adapters (search, detail, trailers) + tests
  clients/        # AWS SDK + Redis client factories
  data/           # DynamoDB cache repository + schemas
  handlers/       # Lambda entry points + processors
  infra/          # CDK stack (Lambdas, API Gateway, CloudFront, alarms)
  lib/            # Business logic, two-tier cache, transformers + tests
  middleware/     # Security headers, error mapping, request logging, locale + tests
  shared/         # Result type, inject(), types, logger, errors + tests
  validators/     # Zod schemas for request validation + tests
mocks/
  tmdb/           # TMDB mock server (Docker) + JSON fixtures
__tests__/
  integration/    # Tests against LocalStack + Redis + TMDB mock
  e2e/            # Tests against real TMDB API
```

Path aliases (`#shared/*`, `#adapters/*`, etc.) are configured in `tsconfig.json` and `vitest.config.ts`.
