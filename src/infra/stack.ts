import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cdk from 'aws-cdk-lib'
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2'
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import type { Construct } from 'constructs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const HANDLERS_DIR = path.join(__dirname, '..', 'handlers')

export class MovieTrailerApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // --- DynamoDB Table ---
    const cacheTable = new dynamodb.Table(this, 'TrailerApiCache', {
      tableName: 'TrailerApiCache',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    // --- Secrets Manager ---
    const tmdbSecret = new secretsmanager.Secret(this, 'TmdbApiKey', {
      secretName: 'tmdb-api-key',
      description: 'TMDB API key for movie trailer search',
    })

    // --- Shared Lambda config ---
    const sharedEnv: Record<string, string> = {
      NODE_OPTIONS: '--enable-source-maps',
      TRAILER_API_CACHE_TABLE: cacheTable.tableName,
      TMDB_SECRET_NAME: tmdbSecret.secretName,
      REDIS_HOST: cdk.Fn.importValue('RedisEndpoint').toString() || 'localhost',
      REDIS_PORT: '6379',
    }

    const bundling: nodejs.BundlingOptions = {
      minify: true,
      sourceMap: true,
      target: 'node22',
      format: nodejs.OutputFormat.ESM,
      mainFields: ['module', 'main'],
      esbuildArgs: { '--tree-shaking': 'true' },
    }

    const depsLockFilePath = path.join(__dirname, '..', '..', 'bun.lock')

    // --- Lambda: Search ---
    const searchFn = new nodejs.NodejsFunction(this, 'SearchHandler', {
      functionName: 'movie-trailer-search',
      entry: path.join(HANDLERS_DIR, 'search', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(29),
      environment: sharedEnv,
      bundling,
      depsLockFilePath,
    })

    // --- Lambda: Detail ---
    const detailFn = new nodejs.NodejsFunction(this, 'DetailHandler', {
      functionName: 'movie-trailer-detail',
      entry: path.join(HANDLERS_DIR, 'detail', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(29),
      environment: sharedEnv,
      bundling,
      depsLockFilePath,
    })

    // --- Lambda: Trailers ---
    const trailersFn = new nodejs.NodejsFunction(this, 'TrailersHandler', {
      functionName: 'movie-trailer-trailers',
      entry: path.join(HANDLERS_DIR, 'trailers', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(29),
      environment: sharedEnv,
      bundling,
      depsLockFilePath,
    })

    // --- IAM: Least privilege per Lambda ---
    const lambdas = [searchFn, detailFn, trailersFn]

    for (const fn of lambdas) {
      // DynamoDB: only GetItem + PutItem + Query (no Scan, no DeleteTable)
      cacheTable.grant(fn, 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query')

      // Secrets Manager: only read the TMDB key
      tmdbSecret.grantRead(fn)
    }

    // --- API Gateway HTTP API (v2) ---
    const httpApi = new apigateway.HttpApi(this, 'MovieTrailerApi', {
      apiName: 'movie-trailer-api',
      description: 'Movie Trailer Search API',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigateway.CorsHttpMethod.GET, apigateway.CorsHttpMethod.OPTIONS],
        allowHeaders: ['Content-Type', 'Accept-Language', 'X-Api-Key'],
        maxAge: cdk.Duration.hours(1),
      },
    })

    // Routes
    httpApi.addRoutes({
      path: '/v1/movies/search',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('SearchIntegration', searchFn),
    })

    httpApi.addRoutes({
      path: '/v1/movies/{id}',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('DetailIntegration', detailFn),
    })

    httpApi.addRoutes({
      path: '/v1/movies/{id}/trailers',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('TrailersIntegration', trailersFn),
    })

    // --- API Gateway Throttling ---
    const stage = httpApi.defaultStage?.node.defaultChild as apigateway.CfnStage
    stage.defaultRouteSettings = {
      throttlingBurstLimit: 100,
      throttlingRateLimit: 50,
    }

    // --- CloudFront CDN (global edge caching) ---
    const apiDomain = cdk.Fn.select(2, cdk.Fn.split('/', httpApi.apiEndpoint))

    const distribution = new cloudfront.Distribution(this, 'CdnDistribution', {
      defaultBehavior: {
        origin: new origins.HttpOrigin(apiDomain),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        cachePolicy: new cloudfront.CachePolicy(this, 'ApiCachePolicy', {
          cachePolicyName: 'MovieTrailerApiCache',
          defaultTtl: cdk.Duration.minutes(1),
          maxTtl: cdk.Duration.minutes(10),
          minTtl: cdk.Duration.seconds(0),
          queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
          headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Accept-Language'),
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    })

    // --- CloudWatch Alarms ---
    for (const fn of lambdas) {
      // Error rate: fires if >5 errors in a 5-minute window
      fn.metricErrors({ period: cdk.Duration.minutes(5) }).createAlarm(this, `${fn.node.id}ErrorAlarm`, {
        alarmName: `${fn.functionName}-error-rate`,
        threshold: 5,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      })

      // P99 latency: fires if >10s for 2 consecutive periods
      fn.metricDuration({ statistic: 'p99', period: cdk.Duration.minutes(5) }).createAlarm(
        this,
        `${fn.node.id}LatencyAlarm`,
        {
          alarmName: `${fn.functionName}-p99-latency`,
          threshold: 10_000,
          evaluationPeriods: 2,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        },
      )

      // Throttles: fires if any invocations are throttled
      fn.metricThrottles({ period: cdk.Duration.minutes(5) }).createAlarm(
        this,
        `${fn.node.id}ThrottleAlarm`,
        {
          alarmName: `${fn.functionName}-throttles`,
          threshold: 0,
          evaluationPeriods: 1,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        },
      )
    }

    // API Gateway 5xx rate: fires if >10 server errors in 5 minutes
    new cloudwatch.Alarm(this, 'ApiGateway5xxAlarm', {
      alarmName: 'movie-trailer-api-5xx',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5xx',
        dimensionsMap: { ApiId: httpApi.httpApiId },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    })

    // --- Outputs ---
    new cdk.CfnOutput(this, 'CdnUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL (global edge)',
    })

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'API Gateway endpoint URL (origin)',
    })

    new cdk.CfnOutput(this, 'CacheTableName', {
      value: cacheTable.tableName,
      description: 'DynamoDB cache table name',
    })

    new cdk.CfnOutput(this, 'SearchFunctionArn', {
      value: searchFn.functionArn,
    })

    new cdk.CfnOutput(this, 'DetailFunctionArn', {
      value: detailFn.functionArn,
    })

    new cdk.CfnOutput(this, 'TrailersFunctionArn', {
      value: trailersFn.functionArn,
    })
  }
}
