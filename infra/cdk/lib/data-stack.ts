import { Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as s3 from 'aws-cdk-lib/aws-s3'

interface Props extends StackProps {
  prefix: string
  stage: string
}

export class DataStack extends Stack {
  readonly orders: dynamodb.Table
  readonly orderEvents: dynamodb.Table
  readonly riders: dynamodb.Table
  readonly fleet: dynamodb.Table
  readonly partners: dynamodb.Table
  readonly expenditures: dynamodb.Table
  readonly users: dynamodb.Table
  readonly branches: dynamodb.Table
  readonly permissions: dynamodb.Table
  readonly params: dynamodb.Table
  readonly zones: dynamodb.Table
  readonly zoneRates: dynamodb.Table
  readonly customers: dynamodb.Table
  readonly pushSubs: dynamodb.Table
  readonly proofBucket: s3.Bucket

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props)
    const prod = props.stage === 'prod'
    const removalPolicy = prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY

    const common: Partial<dynamodb.TableProps> = {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy,
    }

    this.orders = new dynamodb.Table(this, 'Orders', {
      ...common,
      tableName: `${props.prefix}-orders`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    })
    this.orders.addGlobalSecondaryIndex({
      indexName: 'gsi_branch_created',
      partitionKey: { name: 'branchId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    })
    this.orders.addGlobalSecondaryIndex({
      indexName: 'gsi_rider_created',
      partitionKey: { name: 'assignedTo', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    })
    this.orders.addGlobalSecondaryIndex({
      indexName: 'gsi_partner_ref',
      partitionKey: { name: 'partnerId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'partnerOrderId', type: dynamodb.AttributeType.STRING },
    })

    this.orderEvents = new dynamodb.Table(this, 'OrderEvents', {
      ...common,
      tableName: `${props.prefix}-order-events`,
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    })

    this.riders = new dynamodb.Table(this, 'Riders', {
      ...common,
      tableName: `${props.prefix}-riders`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    })
    this.riders.addGlobalSecondaryIndex({
      indexName: 'gsi_branch',
      partitionKey: { name: 'branchId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'name', type: dynamodb.AttributeType.STRING },
    })

    this.fleet = new dynamodb.Table(this, 'Fleet', {
      ...common,
      tableName: `${props.prefix}-fleet`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    })
    this.fleet.addGlobalSecondaryIndex({
      indexName: 'gsi_branch',
      partitionKey: { name: 'branchId', type: dynamodb.AttributeType.STRING },
    })

    this.partners = new dynamodb.Table(this, 'Partners', {
      ...common,
      tableName: `${props.prefix}-partners`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    })

    this.expenditures = new dynamodb.Table(this, 'Expenditures', {
      ...common,
      tableName: `${props.prefix}-expenditures`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    })
    this.expenditures.addGlobalSecondaryIndex({
      indexName: 'gsi_branch_date',
      partitionKey: { name: 'branchId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'date', type: dynamodb.AttributeType.STRING },
    })

    this.users = new dynamodb.Table(this, 'Users', {
      ...common,
      tableName: `${props.prefix}-users`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    })
    this.users.addGlobalSecondaryIndex({
      indexName: 'gsi_email',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
    })
    this.users.addGlobalSecondaryIndex({
      indexName: 'gsi_branch',
      partitionKey: { name: 'branchId', type: dynamodb.AttributeType.STRING },
    })

    this.branches = new dynamodb.Table(this, 'Branches', {
      ...common,
      tableName: `${props.prefix}-branches`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    })

    this.permissions = new dynamodb.Table(this, 'Permissions', {
      ...common,
      tableName: `${props.prefix}-permissions`,
      partitionKey: { name: 'role', type: dynamodb.AttributeType.STRING },
    })

    this.params = new dynamodb.Table(this, 'Params', {
      ...common,
      tableName: `${props.prefix}-params`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    })

    this.zones = new dynamodb.Table(this, 'Zones', {
      ...common,
      tableName: `${props.prefix}-zones`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    })

    this.zoneRates = new dynamodb.Table(this, 'ZoneRates', {
      ...common,
      tableName: `${props.prefix}-zone-rates`,
      partitionKey: { name: 'key', type: dynamodb.AttributeType.STRING },
    })

    this.customers = new dynamodb.Table(this, 'Customers', {
      ...common,
      tableName: `${props.prefix}-customers`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
    })
    this.customers.addGlobalSecondaryIndex({
      indexName: 'gsi_branch',
      partitionKey: { name: 'branchId', type: dynamodb.AttributeType.STRING },
    })
    this.customers.addGlobalSecondaryIndex({
      indexName: 'gsi_phone',
      partitionKey: { name: 'phone', type: dynamodb.AttributeType.STRING },
    })

    this.pushSubs = new dynamodb.Table(this, 'PushSubs', {
      ...common,
      tableName: `${props.prefix}-push-subs`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'endpoint', type: dynamodb.AttributeType.STRING },
    })

    this.proofBucket = new s3.Bucket(this, 'ProofBucket', {
      bucketName: `${props.prefix}-proof-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: prod,
      removalPolicy,
      autoDeleteObjects: !prod,
      lifecycleRules: [
        {
          id: 'expire-old-proofs',
          expiration: Duration.days(prod ? 365 * 2 : 30),
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 300,
        },
      ],
    })
  }

  allTables(): dynamodb.Table[] {
    return [
      this.orders,
      this.orderEvents,
      this.riders,
      this.fleet,
      this.partners,
      this.expenditures,
      this.users,
      this.branches,
      this.permissions,
      this.params,
      this.zones,
      this.zoneRates,
      this.customers,
      this.pushSubs,
    ]
  }
}
