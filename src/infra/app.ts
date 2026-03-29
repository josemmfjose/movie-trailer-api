#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { MovieTrailerApiStack } from './stack'

const app = new cdk.App()

new MovieTrailerApiStack(app, 'MovieTrailerApiStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: 'Movie Trailer Search API',
})
