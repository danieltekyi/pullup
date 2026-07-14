import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as cf from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as wafv2 from 'aws-cdk-lib/aws-wafv2'

interface Props extends StackProps {
  prefix: string
  stage: string
  apiDomain: string
}

export class WebStack extends Stack {
  readonly bucket: s3.Bucket
  readonly distribution: cf.Distribution

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props)
    const prod = props.stage === 'prod'

    this.bucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `${props.prefix}-web-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !prod,
    })

    // WAF (must be created in us-east-1 for CloudFront association)
    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: `${props.prefix}-web-acl`,
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${props.prefix}-web-acl`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesCommonRuleSet' },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'common-rule-set',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'RateLimitAll',
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: { limit: 2000, aggregateKeyType: 'IP' },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'rate-limit-all',
            sampledRequestsEnabled: true,
          },
        },
      ],
    })

    this.distribution = new cf.Distribution(this, 'Distribution', {
      comment: `${props.prefix} PullUp web`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cf.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cf.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors: {
        // No-cache the app shell and PWA manifest.
        'index.html': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cf.CachePolicy.CACHING_DISABLED,
          compress: true,
        },
        'sw.js': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cf.CachePolicy.CACHING_DISABLED,
          compress: true,
        },
        'manifest.webmanifest': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cf.CachePolicy.CACHING_DISABLED,
          compress: true,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        // SPA rewrite: 403/404 from S3 return index.html so React Router can handle deep links.
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(5) },
      ],
      webAclId: webAcl.attrArn,
      priceClass: prod ? cf.PriceClass.PRICE_CLASS_ALL : cf.PriceClass.PRICE_CLASS_100,
    })

    new CfnOutput(this, 'BucketName', { value: this.bucket.bucketName })
    new CfnOutput(this, 'DistributionUrl', { value: `https://${this.distribution.distributionDomainName}` })
    new CfnOutput(this, 'DistributionId', { value: this.distribution.distributionId })
    new CfnOutput(this, 'ApiUrlForFrontend', { value: props.apiDomain })
  }
}
