#!/bin/bash
# Idempotent bootstrap for LocalStack.
# Creates resources needed for integration tests.
# CDK deploy can also create these -- both paths are safe (idempotent).

echo "Creating DynamoDB table (if not exists)..."
awslocal dynamodb create-table \
  --table-name TrailerApiCache \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S \
    AttributeName=GSI1SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes '[{
    "IndexName":"GSI1",
    "KeySchema":[{"AttributeName":"GSI1PK","KeyType":"HASH"},{"AttributeName":"GSI1SK","KeyType":"RANGE"}],
    "Projection":{"ProjectionType":"ALL"}
  }]' \
  --billing-mode PAY_PER_REQUEST 2>/dev/null || echo "Table already exists, skipping."

awslocal dynamodb update-time-to-live \
  --table-name TrailerApiCache \
  --time-to-live-specification Enabled=true,AttributeName=ttl 2>/dev/null || true

echo "Creating TMDB API key secret (if not exists)..."
awslocal secretsmanager create-secret \
  --name tmdb-api-key \
  --secret-string '{"apiKey":"test-tmdb-key-for-integration"}' 2>/dev/null || echo "Secret already exists, skipping."

echo "LocalStack setup complete!"
