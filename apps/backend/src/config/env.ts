import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  AWS_REGION: z.string().default('us-east-1'),

  COGNITO_REGION: z.string().default('us-east-1'),
  COGNITO_USER_POOL_ID: z.string().min(1),
  COGNITO_APP_CLIENT_ID: z.string().min(1),

  TABLE_ORDERS: z.string().default('pullup-orders'),
  TABLE_ORDER_EVENTS: z.string().default('pullup-order-events'),
  TABLE_RIDERS: z.string().default('pullup-riders'),
  TABLE_FLEET: z.string().default('pullup-fleet'),
  TABLE_PARTNERS: z.string().default('pullup-partners'),
  TABLE_EXPENDITURES: z.string().default('pullup-expenditures'),
  TABLE_USERS: z.string().default('pullup-users'),
  TABLE_BRANCHES: z.string().default('pullup-branches'),
  TABLE_PERMISSIONS: z.string().default('pullup-permissions'),
  TABLE_PARAMS: z.string().default('pullup-params'),
  TABLE_ZONES: z.string().default('pullup-zones'),
  TABLE_ZONE_RATES: z.string().default('pullup-zone-rates'),
  TABLE_CUSTOMERS: z.string().default('pullup-customers'),
  TABLE_PUSH_SUBS: z.string().default('pullup-push-subs'),

  BUCKET_PROOF: z.string().default('pullup-proof-of-delivery'),

  TRACKER_LINK_SECRET: z.string().min(32),
  FRONTEND_BASE_URL: z.string().url().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  TRACKER_API_URL: z.string().optional(),
  TRACKER_API_KEY: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  FROM_EMAIL: z.string().optional(),

  AT_USERNAME: z.string().optional(),
  AT_API_KEY: z.string().optional(),
  AT_SENDER_ID: z.string().optional(),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:ops@pullup.app'),

  SENTRY_DSN: z.string().optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().default(200),
  RATE_LIMIT_TRACKER_MAX: z.coerce.number().default(10),

  GOOGLE_MAPS_API_KEY: z.string().optional(),

  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_SHORTCODE: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),
})

export type Env = z.infer<typeof schema>

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:')
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  // In production Lambdas, missing required vars should fail fast.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Environment validation failed')
  }
}

// Fallback with defaults so tests can still run without a full env.
export const env: Env = parsed.success
  ? parsed.data
  : (schema.parse({
      COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID || 'test-pool',
      COGNITO_APP_CLIENT_ID: process.env.COGNITO_APP_CLIENT_ID || 'test-client',
      TRACKER_LINK_SECRET:
        process.env.TRACKER_LINK_SECRET || 'test-secret-must-be-at-least-32-chars',
    }) as Env)

export const TABLES = {
  orders: env.TABLE_ORDERS,
  orderEvents: env.TABLE_ORDER_EVENTS,
  riders: env.TABLE_RIDERS,
  fleet: env.TABLE_FLEET,
  partners: env.TABLE_PARTNERS,
  expenditures: env.TABLE_EXPENDITURES,
  users: env.TABLE_USERS,
  branches: env.TABLE_BRANCHES,
  permissions: env.TABLE_PERMISSIONS,
  params: env.TABLE_PARAMS,
  zones: env.TABLE_ZONES,
  zoneRates: env.TABLE_ZONE_RATES,
  customers: env.TABLE_CUSTOMERS,
  pushSubs: env.TABLE_PUSH_SUBS,
} as const
