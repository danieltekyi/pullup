import { Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as cognito from 'aws-cdk-lib/aws-cognito'

interface Props extends StackProps {
  prefix: string
  stage: string
}

export class AuthStack extends Stack {
  readonly userPool: cognito.UserPool
  readonly userPoolClient: cognito.UserPoolClient

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props)
    const prod = props.stage === 'prod'

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${props.prefix}-user-pool`,
      selfSignUpEnabled: false,
      signInAliases: { email: true, username: false },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: prod ? cognito.Mfa.OPTIONAL : cognito.Mfa.OFF,
      mfaSecondFactor: { sms: false, otp: true },
      standardAttributes: {
        email: { required: true, mutable: false },
        fullname: { required: false, mutable: true },
      },
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      advancedSecurityMode: prod ? cognito.AdvancedSecurityMode.AUDIT : cognito.AdvancedSecurityMode.OFF,
    })

    for (const groupName of ['super-admin', 'manager', 'rider']) {
      new cognito.CfnUserPoolGroup(this, `Group${groupName}`, {
        userPoolId: this.userPool.userPoolId,
        groupName,
        description: `${groupName} role`,
      })
    }

    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: `${props.prefix}-web`,
      authFlows: {
        userSrp: true,
        userPassword: false,
        adminUserPassword: false,
      },
      generateSecret: false,
      preventUserExistenceErrors: true,
      accessTokenValidity: undefined,
      idTokenValidity: undefined,
      refreshTokenValidity: undefined,
    })

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId, exportName: `${props.prefix}-user-pool-id` })
    new CfnOutput(this, 'AppClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: `${props.prefix}-app-client-id`,
    })
  }
}
