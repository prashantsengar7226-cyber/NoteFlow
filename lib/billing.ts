import { env } from './platform';
import { z } from 'zod';
import { AppError } from './core';
import { account, db, boundedBody } from './server';
import { providerJson } from './provider';

export function billingConfig() {
  const vars = env as unknown as Record<string, string | undefined>;
  const amount = Number(vars.PRO_PRICE_PAISE || 0);
  const key = vars.RAZORPAY_KEY_ID?.trim() || '';
  const secret = vars.RAZORPAY_KEY_SECRET?.trim() || '';
  const webhookSecret = vars.RAZORPAY_WEBHOOK_SECRET?.trim() || '';
  const commercial = vars.MONETIZATION_MODE === 'one_time';
  const configured =
    /^rzp_(test|live)_[A-Za-z0-9]+$/.test(key) &&
    !!secret &&
    !!webhookSecret &&
    Number.isSafeInteger(amount) &&
    amount >= 100 &&
    amount <= 100_000_000;
  return {
    key,
    secret,
    webhookSecret,
    amount,
    currency: 'INR',
    commercial,
    keyMode: key.startsWith('rzp_test_') ? 'test' : 'live',
    enabled: commercial && vars.BILLING_ENABLED === 'true' && configured,
  };
}
export function publicBilling() {
  const c = billingConfig();
  return {
    enabled: c.enabled,
    launch: !c.commercial,
    model: 'one_time' as const,
    amount: c.enabled ? c.amount : null,
    currency: c.currency,
    testMode: c.enabled && c.keyMode === 'test',
  };
}
type Order = {
  id: string;
  owner: string;
  key_mode: string;
  provider_order_id: string | null;
  payment_id: string | null;
  state: string;
  amount: number;
  currency: string;
  created_at: number;
  updated_at: number;
};
const paymentSchema = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
  amount: z.number().int().positive(),
  currency: z.string(),
  status: z.string(),
  captured: z.boolean(),
  amount_refunded: z.number().int().nonnegative(),
});
type Payment = z.infer<typeof paymentSchema>;

async function razorpay(path: string, payload?: Record<string, unknown>) {
  const c = billingConfig();
  if (!c.key || !c.secret)
    throw new AppError(
      503,
      'BILLING_UNAVAILABLE',
      'Payment verification is temporarily unavailable.',
    );
  let response: Response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/${path}`, {
      method: payload ? 'POST' : 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Basic ${btoa(`${c.key}:${c.secret}`)}`,
        'Content-Type': 'application/json',
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
  } catch {
    throw new AppError(
      503,
      'BILLING_NETWORK',
      'The payment service could not be reached. Check your purchase history before trying again.',
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new AppError(
      503,
      'BILLING_PROVIDER',
      'The payment service is temporarily unavailable. No access was granted.',
    );
  }
  return providerJson(response, 100_000);
}
async function ownedOrder(owner: string, id: string) {
  const row = await db()
    .prepare('SELECT * FROM billing_orders WHERE id=? AND owner=?')
    .bind(id, owner)
    .first<Order>();
  if (!row)
    throw new AppError(404, 'ORDER_NOT_FOUND', 'This purchase could not be found in your account.');
  if (row.key_mode !== billingConfig().keyMode)
    throw new AppError(
      409,
      'PAYMENT_MODE',
      'This purchase belongs to a different payment environment.',
    );
  return row;
}
export async function createCheckout(owner: string) {
  const c = billingConfig();
  if (!c.enabled)
    throw new AppError(
      403,
      'BILLING_DISABLED',
      'Checkout is not open. During the free launch, all available tools are included.',
    );
  await account(owner);
  const id = crypto.randomUUID(),
    now = Date.now();
  // One active order per account/environment, enforced by a partial UNIQUE index.
  const claimed = await db()
    .prepare(
      'INSERT INTO billing_orders(id,owner,key_mode,amount,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING id',
    )
    .bind(id, owner, c.keyMode, c.amount, c.currency, now, now)
    .first();
  const row = await db()
    .prepare(
      "SELECT * FROM billing_orders WHERE owner=? AND key_mode=? AND state IN ('creating','created','paid') LIMIT 1",
    )
    .bind(owner, c.keyMode)
    .first<Order>();
  if (!row)
    throw new AppError(
      503,
      'CHECKOUT_PENDING',
      'Checkout could not be prepared. Please try later.',
    );
  if (row.state === 'paid')
    throw new AppError(409, 'ALREADY_PURCHASED', 'Pro access is already active on your account.');
  if (claimed) {
    // Never automatically repeat order creation after an unknown provider outcome.
    const order = await razorpay('orders', {
      amount: row.amount,
      currency: row.currency,
      receipt: row.id,
      partial_payment: false,
    });
    if (
      !z
        .string()
        .regex(/^order_[A-Za-z0-9]+$/)
        .safeParse(order.id).success ||
      order.amount !== row.amount ||
      order.currency !== row.currency
    )
      throw new AppError(
        502,
        'INVALID_ORDER',
        'The payment service returned an unexpected order. Contact support before retrying.',
      );
    await db()
      .prepare(
        "UPDATE billing_orders SET provider_order_id=?,state='created',updated_at=? WHERE id=? AND state='creating'",
      )
      .bind(order.id as string, Date.now(), row.id)
      .run();
    row.provider_order_id = order.id as string;
  }
  if (!row.provider_order_id)
    throw new AppError(
      409,
      'CHECKOUT_PENDING',
      'An order is still being prepared. Check your purchase history; if this persists, contact the site owner.',
    );
  return {
    purchaseId: row.id,
    orderId: row.provider_order_id,
    key: c.key,
    amount: row.amount,
    currency: row.currency,
    testMode: c.keyMode === 'test',
  };
}
export async function verifyHmac(secret: string, bytes: Uint8Array, signature: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const digest = Uint8Array.from(signature.match(/../g)!, (s) => parseInt(s, 16));
  return crypto.subtle.verify('HMAC', key, digest, new Uint8Array(bytes));
}
async function applyPayment(
  row: Order,
  payment: Payment,
  event?: { id: string; kind: string },
  disputed = false,
) {
  if (
    payment.order_id !== row.provider_order_id ||
    payment.amount !== row.amount ||
    payment.currency !== row.currency
  )
    throw new AppError(409, 'PAYMENT_MISMATCH', 'The payment does not match the account order.');
  if (row.payment_id && row.payment_id !== payment.id)
    throw new AppError(
      409,
      'PAYMENT_MISMATCH',
      'A different payment is already recorded for this order.',
    );
  const refunded = payment.amount_refunded >= payment.amount || payment.status === 'refunded';
  const state = disputed
    ? 'disputed'
    : refunded
      ? 'refunded'
      : payment.status === 'captured' && payment.captured
        ? 'paid'
        : null;
  const statements = [];
  if (state)
    statements.push(
      db()
        .prepare(
          // Refund/dispute are terminal. A stale capture callback cannot restore access.
          `UPDATE billing_orders SET payment_id=?,state=?,updated_at=? WHERE id=? AND (payment_id IS NULL OR payment_id=?) ${state === 'paid' ? "AND state NOT IN ('refunded','disputed')" : ''}`,
        )
        .bind(payment.id, state, Date.now(), row.id, payment.id),
    );
  if (event)
    statements.push(
      db()
        .prepare(
          'INSERT INTO billing_events(id,kind,processed_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING',
        )
        .bind(event.id, event.kind, Date.now()),
    );
  if (statements.length) await db().batch(statements);
  return {
    state: (await db()
      .prepare('SELECT state FROM billing_orders WHERE id=?')
      .bind(row.id)
      .first<{ state: string }>())!.state,
  };
}
export const verifyInput = z
  .object({
    purchaseId: z.string().uuid(),
    razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
    razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
    razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();
export async function verifyCheckout(owner: string, input: z.infer<typeof verifyInput>) {
  const row = await ownedOrder(owner, input.purchaseId);
  if (row.provider_order_id !== input.razorpay_order_id)
    throw new AppError(409, 'PAYMENT_MISMATCH', 'The payment order does not match.');
  const valid = await verifyHmac(
    billingConfig().secret,
    new TextEncoder().encode(`${row.provider_order_id}|${input.razorpay_payment_id}`),
    input.razorpay_signature,
  );
  if (!valid)
    throw new AppError(400, 'PAYMENT_SIGNATURE', 'The payment signature could not be verified.');
  const payment = paymentSchema.parse(await razorpay(`payments/${input.razorpay_payment_id}`));
  if (payment.id !== input.razorpay_payment_id)
    throw new AppError(409, 'PAYMENT_MISMATCH', 'The payment ID does not match.');
  return applyPayment(row, payment);
}
export async function refreshPurchase(owner: string, purchaseId: string) {
  const row = await ownedOrder(owner, purchaseId);
  if (!row.provider_order_id) return { state: row.state };
  const data = await razorpay(`orders/${row.provider_order_id}/payments`);
  const payments = z.object({ items: z.array(paymentSchema).max(100) }).parse(data).items;
  const payment =
    payments.find((p) => p.id === row.payment_id) ??
    payments.find((p) => p.status === 'captured' || p.status === 'refunded');
  return payment ? applyPayment(row, payment) : { state: row.state };
}
export async function handleWebhook(request: Request) {
  const c = billingConfig();
  if (!c.webhookSecret)
    throw new AppError(503, 'WEBHOOK_UNAVAILABLE', 'Webhook is not configured.');
  const bytes = await boundedBody(request, 256_000);
  if (
    !(await verifyHmac(c.webhookSecret, bytes, request.headers.get('x-razorpay-signature') || ''))
  )
    throw new AppError(400, 'WEBHOOK_SIGNATURE', 'Invalid webhook signature.');
  const eventId = request.headers.get('x-razorpay-event-id');
  if (!eventId || eventId.length > 200)
    throw new AppError(400, 'WEBHOOK_EVENT', 'Missing event identity.');
  if (await db().prepare('SELECT id FROM billing_events WHERE id=?').bind(eventId).first())
    return { received: true, duplicate: true };
  let event: { event: string; payload: Record<string, { entity?: Record<string, unknown> }> };
  try {
    event = z
      .object({
        event: z.string(),
        payload: z.record(z.string(), z.object({ entity: z.record(z.string(), z.unknown()).optional() })),
      })
      .parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new AppError(400, 'WEBHOOK_BODY', 'Invalid event body.');
  }
  const allowed = [
    'payment.captured',
    'refund.processed',
    'payment.dispute.created',
    'payment.dispute.lost',
  ];
  if (!allowed.includes(event.event)) return { received: true, ignored: true };
  const paymentId =
    event.payload.payment?.entity?.id ??
    event.payload.refund?.entity?.payment_id ??
    event.payload.dispute?.entity?.payment_id;
  if (typeof paymentId !== 'string' || !/^pay_[A-Za-z0-9]+$/.test(paymentId))
    throw new AppError(400, 'WEBHOOK_PAYMENT', 'Missing payment identity.');
  const suppliedOrder = event.payload.payment?.entity?.order_id;
  let row = await db()
    .prepare('SELECT * FROM billing_orders WHERE payment_id=?')
    .bind(paymentId)
    .first<Order>();
  if (!row && typeof suppliedOrder === 'string')
    row = await db()
      .prepare('SELECT * FROM billing_orders WHERE provider_order_id=?')
      .bind(suppliedOrder)
      .first<Order>();
  // Fetch only signed events; recover refunds that arrived before the capture webhook.
  const payment = paymentSchema.parse(await razorpay(`payments/${paymentId}`));
  if (payment.id !== paymentId)
    throw new AppError(409, 'PAYMENT_MISMATCH', 'Unexpected payment identity.');
  if (!row)
    row = await db()
      .prepare('SELECT * FROM billing_orders WHERE provider_order_id=?')
      .bind(payment.order_id)
      .first<Order>();
  if (!row || row.key_mode !== c.keyMode) return { received: true, ignored: true };
  await applyPayment(
    row,
    payment,
    { id: eventId, kind: event.event },
    event.event.startsWith('payment.dispute.'),
  );
  return { received: true };
}
