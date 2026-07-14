#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { DataStack } from '../lib/data-stack'
import { AuthStack } from '../lib/auth-stack'
import { ApiStack } from '../lib/api-stack'
import { WebStack } from '../lib/web-stack'

const app = new cdk.App()

const env = app.node.tryGetContext('env') || 'dev'
const account = process.env.CDK_DEFAULT_ACCOUNT
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1'
const stackEnv = { account, region }
const prefix = `pullup-${env}`

const data = new DataStack(app, `${prefix}-data`, {
  env: stackEnv,
  prefix,
  stage: env,
})

const auth = new AuthStack(app, `${prefix}-auth`, {
  env: stackEnv,
  prefix,
  stage: env,
})

const api = new ApiStack(app, `${prefix}-api`, {
  env: stackEnv,
  prefix,
  stage: env,
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
  dataStack: data,
})
api.addDependency(data)
api.addDependency(auth)

const web = new WebStack(app, `${prefix}-web`, {
  env: stackEnv,
  prefix,
  stage: env,
  apiDomain: api.apiUrl,
})
web.addDependency(api)

cdk.Tags.of(app).add('app', 'pullup')
cdk.Tags.of(app).add('env', env)
cdk.Tags.of(app).add('managed-by', 'cdk')
