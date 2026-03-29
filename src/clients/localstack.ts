export const localStackConfig = () => {
  const endpoint = process.env.LOCALSTACK_ENDPOINT || process.env.AWS_ENDPOINT_URL
  return endpoint
    ? { endpoint, region: 'us-east-1', credentials: { accessKeyId: 'test', secretAccessKey: 'test' } }
    : {}
}
