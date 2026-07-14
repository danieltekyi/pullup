import { Stack, StackProps, CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejsLambda from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2'
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as secrets from 'aws-cdk-lib/aws-secretsmanager'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as path from 'path'
import type { DataStack } from './data-stack'

interface Props extends StackProps {
  prefix: string
  stage: string
  userPool: cognito.UserPool
  userPoolClient: cognito.UserPoolClient
  dataStack: DataStack
}

export class ApiStack extends Stack {
  readonly apiUrl: string
  readonly httpApi: apigw.HttpApi

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props)
    const prod = props.stage === 'prod'

    // Secrets: TRACKER_LINK_SECRET, SMTP_PASS, partner keys, tracker keys, etc.
    const trackerSecret = new secrets.Secret(this, 'TrackerLinkSecret', {
      secretName: `${props.prefix}/tracker-link-secret`,
      description: 'HMAC secret for signing tracker JWTs',
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
      },
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    })

    const appSecrets = new secrets.Secret(this, 'AppSecrets', {
      secretName: `${props.prefix}/app-secrets`,
      description: 'SMTP, Twilio, Africa Talking, VAPID, tracker API, Google Maps',
      secretObjectValue: {},
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    })

    const fn = new nodejsLambda.NodejsFunction(this, 'ApiFn', {
      functionName: `${props.prefix}-api`,
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../../apps/backend/src/handler.ts'),
      handler: 'handler',
      timeout: Duration.seconds(20),
      memorySize: 512,
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        NODE_ENV: prod ? 'production' : 'development',
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
        COGNITO_REGION: this.region,
        COGNITO_USER_POOL_ID: props.userPool.userPoolId,
        COGNITO_APP_CLIENT_ID: props.userPoolClient.userPoolClientId,
        TABLE_ORDERS: props.dataStack.orders.tableName,
        TABLE_ORDER_EVENTS: props.dataStack.orderEvents.tableName,
        TABLE_RIDERS: props.dataStack.riders.tableName,
        TABLE_FLEET: props.dataStack.fleet.tableName,
        TABLE_PARTNERS: props.dataStack.partners.tableName,
        TABLE_EXPENDITURES: props.dataStack.expenditures.tableName,
        TABLE_USERS: props.dataStack.users.tableName,
        TABLE_BRANCHES: props.dataStack.branches.tableName,
        TABLE_PERMISSIONS: props.dataStack.permissions.tableName,
        TABLE_PARAMS: props.dataStack.params.tableName,
        TABLE_ZONES: props.dataStack.zones.tableName,
        TABLE_ZONE_RATES: props.dataStack.zoneRates.tableName,
        TABLE_CUSTOMERS: props.dataStack.customers.tableName,
        TABLE_PUSH_SUBS: props.dataStack.pushSubs.tableName,
        BUCKET_PROOF: props.dataStack.proofBucket.bucketName,
        TRACKER_LINK_SECRET_ARN: trackerSecret.secretArn,
        APP_SECRETS_ARN: appSecrets.secretArn,
        ALLOWED_ORIGINS: prod ? 'https://pullup.app' : '*',
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: true,
        target: 'node20',
        format: nodejsLambda.OutputFormat.CJS,
      },
    })

    for (const t of props.dataStack.allTables()) t.grantReadWriteData(fn)
    props.dataStack.proofBucket.grantReadWrite(fn)
    trackerSecret.grantRead(fn)
    appSecrets.grantRead(fn)

    // Cognito admin permissions for user provisioning
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:AdminAddUserToGroup',
          'cognito-idp:AdminDisableUser',
          'cognito-idp:AdminEnableUser',
          'cognito-idp:AdminDeleteUser',
          'cognito-idp:AdminGetUser',
        ],
        resources: [props.userPool.userPoolArn],
      }),
    )

    this.httpApi = new apigw.HttpApi(this, 'HttpApi', {
      apiName: `${props.prefix}-api`,
      corsPreflight: {
        allowOrigins: prod ? ['https://pullup.app'] : ['*'],
        allowMethods: [apigw.CorsHttpMethod.ANY],
        allowHeaders: ['authorization', 'content-type', 'x-api-key'],
        maxAge: Duration.hours(1),
      },
    })
    this.httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigw.HttpMethod.ANY],
      integration: new integrations.HttpLambdaIntegration('LambdaIntegration', fn),
    })

    this.apiUrl = this.httpApi.apiEndpoint
    new CfnOutput(this, 'ApiUrl', { value: this.apiUrl })
    new CfnOutput(this, 'TrackerSecretArn', { value: trackerSecret.secretArn })
    new CfnOutput(this, 'AppSecretsArn', { value: appSecrets.secretArn })
  }
}
