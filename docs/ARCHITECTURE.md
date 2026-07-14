# Architecture

## System diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                         Client (PWA)                                │
│                                                                     │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐   │
│  │  Admin Console │    │  Rider Mobile  │    │  Public /track │   │
│  │  React + Tailw │    │  (offline-1st) │    │  page          │   │
│  └────────────────┘    └────────────────┘    └────────────────┘   │
│         │                     │                     │              │
│         └─── Amplify Auth ────┴──── IndexedDB Q ────┘              │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ HTTPS (CloudFront + WAF)
                       ▼
┌────────────────────────────────────────────────────────────────────┐
│                       AWS (single-region)                           │
│                                                                     │
│  ┌────────┐   ┌────────┐   ┌────────────┐   ┌────────────────┐   │
│  │Cognito │   │API Gate│   │  Lambda    │   │  DynamoDB      │   │
│  │(JWTs,  │   │(HTTP)  │   │  Express   │   │  14 tables     │   │
│  │ groups)│   │        │   │ handler.ts │   │  + GSIs + PITR │   │
│  └────────┘   └────────┘   └────────────┘   └────────────────┘   │
│                                    │                                │
│                                    ├─── S3 (proof of delivery)     │
│                                    ├─── Secrets Manager             │
│                                    └─── CloudWatch Logs             │
└────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
     ┌─────────────────────────────────────────────────────┐
     │  Third-party integrations (all optional / adapter)  │
     │                                                     │
     │  SMTP (Gmail)  Africa's Talking  Twilio WhatsApp    │
     │  Google Maps   M-Pesa Daraja     Tracker device API │
     │  Sentry        Partner GET / PUT                    │
     └─────────────────────────────────────────────────────┘
```

## Request flow — rider marks delivery

```
Rider taps "Delivered"
   │
   ▼ (online)
POST /api/orders/{id}/status  {status: awaiting_confirmation, proof: {…}}
   │
   ├── auth: RS256 JWT verify + issuer + audience + token_use
   ├── validate: Zod schema
   ├── scope: order.assignedTo === user.riderId ?
   ├── update: DynamoDB UpdateExpression + version check
   ├── log: OrderEvents put (audit trail)
   ├── customer SMS via Africa's Talking (fire-and-forget)
   └── 200 OK
   
   ▼ (offline)
enqueue({type: 'status', orderId, payload: {…}}) → IndexedDB
   │
   ▼ (later, 'online' event)
POST /api/sync {actions: [...]}
   │
   ├── per-action loop, catch each error
   └── returns [{clientActionId, ok, reason}]
   
Client dequeues only those with ok=true (fixes v1 bug).
```

## Data model

Every entity carries: `id`, `createdAt`, `updatedAt`, `version`, `deletedAt?`. This enables:
- Optimistic concurrency (`version`)
- Soft delete (`deletedAt`)
- Last-write-wins conflict resolution (`updatedAt`)
- Immutable audit via `OrderEvents`

## Stacks

See [../infra/cdk/README.md](../infra/cdk/README.md) for stack layout.

## Extensibility

- **New notification channel** — add a file in `apps/backend/src/services/notifications/` that exports a `send(...)` function; import it from routes as needed
- **New route** — create in `apps/backend/src/routes/`, mount in `server.ts`. Always use `asyncHandler` + Zod validation.
- **New page** — add to `apps/frontend/src/pages/`, register in `App.tsx`, add to `NAV` in `AdminLayout.tsx` with an appropriate `MenuKey`
