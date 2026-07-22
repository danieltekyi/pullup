import { Hono } from 'hono'
import { z } from 'zod'
import type { AppVariables, Env } from '../env'
import { badRequest } from '../lib/errors'
import { createOrder } from '../repos/orders'

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

const createPublicOrderSchema = z.object({
  senderName: z.string().trim().min(1, 'Sender name is required'),
  senderPhone: z.string().trim().min(1, 'Sender phone is required'),
  senderAddress: z.string().trim().min(1, 'Sender address is required'),
  recipientName: z.string().trim().min(1, 'Recipient name is required'),
  recipientPhone: z.string().trim().min(1, 'Recipient phone is required'),
  recipientAddress: z.string().trim().min(1, 'Recipient address is required'),
  description: z.string().trim().min(1, 'Description is required'),
  weight: z.number().nonnegative().optional(),
  paymentMethod: z.enum(['prepaid', 'cod']).default('cod'),
  specialInstructions: z.string().trim().optional(),
})

app.post('/orders', async c => {
  try {
    const body = createPublicOrderSchema.parse(await c.req.json())
    const order = await createOrder(c.env, {
      branchId: 'default',
      status: 'pending',
      customerName: body.senderName,
      customerPhone: body.senderPhone,
      destination: body.recipientAddress,
      description: `${body.description} → Recipient: ${body.recipientName} (${body.recipientPhone})`,
      paymentMethod: body.paymentMethod,
      weight: body.weight,
      createdBy: 'customer-self-service',
    })

    return c.json(
      {
        ok: true,
        orderId: order.id,
        trackingUrl: `https://pullupcustomer.aegisassetllc.com/track?orderId=${order.id}`,
      },
      201,
    )
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw badRequest('Invalid order request', err.flatten())
    }
    throw err
  }
})

export default app
