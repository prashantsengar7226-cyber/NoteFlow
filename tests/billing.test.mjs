import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { env, context } from '../.test-runtime/harness.mjs';
import * as billingRoute from '../.test-runtime/billing-route.mjs';
import * as webhook from '../.test-runtime/billing-webhook.mjs';
import * as accountRoute from '../.test-runtime/account.mjs';
import { account, consumeService } from '../.test-runtime/server.mjs';
import { createCheckout, verifyCheckout, refreshPurchase } from '../.test-runtime/billing.mjs';
const sign = (text, secret='test-secret') => createHmac('sha256',secret).update(text).digest('hex');
function configured() {
  env.MONETIZATION_MODE='one_time';env.BILLING_ENABLED='true';env.PRO_PRICE_PAISE='99000';
  env.RAZORPAY_KEY_ID='rzp_test_fixture';env.RAZORPAY_KEY_SECRET='test-secret';env.RAZORPAY_WEBHOOK_SECRET='webhook-secret';
}
function clear() { for(const key of ['MONETIZATION_MODE','BILLING_ENABLED','PRO_PRICE_PAISE','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET']) delete env[key]; }
async function call(route, method, input, owner='buyer', headers={}) {
  const response=await context.run(owner,()=>route[method](new Request('https://app.example/api/billing',{method,headers:{'Content-Type':'application/json',Origin:'https://app.example',...headers},...(input?{body:JSON.stringify(input)}:{})})));
  return {status:response.status,data:await response.json()};
}
let sequence=0;
function fixture(status='captured') {
  const orderId='order_fixture'+(++sequence),paymentId='pay_fixture'+sequence;
  let calls=0;
  const payment={id:paymentId,order_id:orderId,amount:99000,currency:'INR',status,captured:status==='captured',amount_refunded:0};
  return {payment,orderId,paymentId,get calls(){return calls;},fetch:async(url,init)=>{
    calls++;
    assert.equal(init.redirect,'manual');
    if(url.endsWith('/orders')) {const payload=JSON.parse(init.body);assert.equal(payload.amount,99000);assert.equal(payload.currency,'INR');return Response.json({id:orderId,amount:99000,currency:'INR'});}
    if(url.endsWith('/payments')&&url.includes('/orders/'))return Response.json({items:[payment]});
    return Response.json(payment);
  }};
}
const verification=(order,f)=>({purchaseId:order.purchaseId,razorpay_order_id:f.orderId,razorpay_payment_id:f.paymentId,razorpay_signature:sign(f.orderId+'|'+f.paymentId)});
async function event(kind,f,id) {
  const payload=JSON.stringify({event:kind,payload:{payment:{entity:f.payment}}});
  const response=await webhook.POST(new Request('https://app.example/api/billing-webhook',{method:'POST',headers:{'Content-Type':'application/json','x-razorpay-signature':sign(payload,'webhook-secret'),'x-razorpay-event-id':id},body:payload}));
  return {status:response.status,data:await response.json()};
}

test('free launch keeps tools available and blocks checkout regardless of a client plan or price',async()=>{
  clear();
  const original=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;throw new Error('must not call provider');};
  try {
    assert.equal((await account('launch')).access,'full');
    assert.equal((await call(billingRoute,'POST',{action:'checkout'},'launch')).data.code,'BILLING_DISABLED');
    assert.equal((await call(billingRoute,'POST',{action:'checkout',amount:1,plan:'pro_once'},'launch')).status,400);
    assert.equal(requests,0);
    const data=(await call(accountRoute,'GET',null,'launch')).data;
    assert.equal(data.billing.launch,true);assert.equal(data.billing.amount,null);assert.deepEqual(data.purchases,[]);
  } finally {globalThis.fetch=original;}
});
test('checkout requires authentication, same-origin writes, explicit configuration and a positive server price',async()=>{
  configured();
  try {
    assert.equal((await call(billingRoute,'POST',{action:'checkout'},null)).status,401);
    assert.equal((await call(billingRoute,'POST',{action:'checkout'},'origin',{Origin:'https://evil.example'})).status,403);
    env.PRO_PRICE_PAISE='0';assert.equal((await call(billingRoute,'POST',{action:'checkout'},'zero')).data.code,'BILLING_DISABLED');
    env.PRO_PRICE_PAISE='99000';delete env.RAZORPAY_WEBHOOK_SECRET;assert.equal((await call(billingRoute,'POST',{action:'checkout'},'missing')).data.code,'BILLING_DISABLED');
  } finally {clear();}
});
test('a single active order is reused and only a verified captured payment grants account access',async()=>{
  configured();const original=globalThis.fetch;const f=fixture();globalThis.fetch=f.fetch;
  try {
    const order=await createCheckout('captured');
    assert.equal(order.amount,99000);assert.equal((await createCheckout('captured')).orderId,order.orderId);assert.equal(f.calls,1);
    assert.equal((await account('captured')).access,'basic');
    await assert.rejects(consumeService('captured','ai'),{code:'PLAN_REQUIRED'});
    await assert.rejects(verifyCheckout('captured',{...verification(order,f),razorpay_signature:'0'.repeat(64)}),{code:'PAYMENT_SIGNATURE'});
    assert.equal(f.calls,1);
    await assert.rejects(verifyCheckout('other-owner',verification(order,f)),{code:'ORDER_NOT_FOUND'});
    assert.equal((await verifyCheckout('captured',verification(order,f))).state,'paid');
    assert.equal((await account('captured')).id,'pro_once');
    assert.equal((await verifyCheckout('captured',verification(order,f))).state,'paid');
    await assert.rejects(createCheckout('captured'),{code:'ALREADY_PURCHASED'});
    env.RAZORPAY_KEY_ID='rzp_live_fixture';assert.equal((await account('captured')).id,'free','test purchases must not grant live access');
  } finally {globalThis.fetch=original;clear();}
});
test('authorized or mismatched payments do not unlock tools',async()=>{
  configured();const original=globalThis.fetch;const f=fixture('authorized');globalThis.fetch=f.fetch;
  try {
    const order=await createCheckout('authorized');
    assert.equal((await verifyCheckout('authorized',verification(order,f))).state,'created');
    assert.equal((await account('authorized')).access,'basic');
    f.payment.status='captured';f.payment.captured=true;f.payment.amount=1;
    await assert.rejects(verifyCheckout('authorized',verification(order,f)),{code:'PAYMENT_MISMATCH'});
    f.payment.amount=99000;f.payment.currency='USD';
    await assert.rejects(verifyCheckout('authorized',verification(order,f)),{code:'PAYMENT_MISMATCH'});
  } finally {globalThis.fetch=original;clear();}
});
test('webhook raw-body signatures, duplicate delivery and full refunds are handled safely',async()=>{
  configured();const original=globalThis.fetch;const f=fixture();globalThis.fetch=f.fetch;
  try {
    const order=await createCheckout('webhook-buyer');
    const bad=await webhook.POST(new Request('https://app.example/api/billing-webhook',{method:'POST',headers:{'x-razorpay-signature':'0'.repeat(64)},body:'{}'}));assert.equal(bad.status,400);
    assert.equal((await event('payment.captured',f,'event-captured')).status,200);
    assert.equal((await account('webhook-buyer')).id,'pro_once');
    const before=f.calls;assert.equal((await event('payment.captured',f,'event-captured')).data.duplicate,true);assert.equal(f.calls,before);
    f.payment.amount_refunded=99000;f.payment.status='refunded';
    assert.equal((await event('refund.processed',f,'event-refund')).status,200);
    assert.equal((await account('webhook-buyer')).id,'free');
    f.payment.amount_refunded=0;f.payment.status='captured';
    assert.equal((await verifyCheckout('webhook-buyer',verification(order,f))).state,'refunded','stale callback must not undo revocation');
    assert.equal((await account('webhook-buyer')).id,'free');
  } finally {globalThis.fetch=original;clear();}
});
test('refund before capture and dispute events cannot create paid access',async()=>{
  configured();const original=globalThis.fetch;const f=fixture();globalThis.fetch=f.fetch;
  try {
    await createCheckout('refund-first');f.payment.amount_refunded=99000;f.payment.status='refunded';
    await event('refund.processed',f,'event-refund-first');
    assert.equal((await account('refund-first')).id,'free');
    f.payment.amount_refunded=0;f.payment.status='captured';await event('payment.captured',f,'event-late-capture');
    assert.equal((await account('refund-first')).id,'free');
  } finally {globalThis.fetch=original;clear();}
});
test('purchase reconciliation is owner-scoped and fixes an interrupted checkout callback',async()=>{
  configured();const original=globalThis.fetch;const f=fixture();globalThis.fetch=f.fetch;
  try {
    const order=await createCheckout('reconcile');
    await assert.rejects(refreshPurchase('other',order.purchaseId),{code:'ORDER_NOT_FOUND'});
    assert.equal((await refreshPurchase('reconcile',order.purchaseId)).state,'paid');
    assert.equal((await account('reconcile')).id,'pro_once');
    const other=(await call(accountRoute,'GET',null,'other')).data;
    assert.deepEqual(other.purchases,[]);assert.equal(other.profile.email,'other@test.example');
    await event('payment.dispute.created',f,'event-dispute');
    assert.equal((await account('reconcile')).id,'free');
    assert.equal((await refreshPurchase('reconcile',order.purchaseId)).state,'disputed');
  } finally {globalThis.fetch=original;clear();}
});
test('unknown order-creation outcome is not automatically retried',async()=>{
  configured();const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('network interrupted');};
  try {
    await assert.rejects(createCheckout('unknown-outcome'),{code:'BILLING_NETWORK'});
    await assert.rejects(createCheckout('unknown-outcome'),{code:'CHECKOUT_PENDING'});
    assert.equal(calls,1);
  } finally {globalThis.fetch=original;clear();}
});

test('missing signatures and tampered signed bodies fail before provider calls or event writes',async()=>{
  configured();const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('must not fetch');};
  try {
    for(const headers of [{},{'x-razorpay-signature':'invalid'},{'x-razorpay-signature':sign('{}','webhook-secret')}]) {
      const r=await webhook.POST(new Request('https://app.example/api/billing-webhook',{method:'POST',headers:{...headers,'x-razorpay-event-id':'tampered-event'},body:'{"changed":true}'}));
      assert.equal(r.status,400);
      assert.equal((await r.json()).code,'WEBHOOK_SIGNATURE');
    }
    assert.equal(calls,0);
    assert.equal(await env.DB.prepare('SELECT id FROM billing_events WHERE id=?').bind('tampered-event').first(),null);
  } finally {globalThis.fetch=original;clear();}
});

test('concurrent duplicate capture events grant only one entitlement and one event record',async()=>{
  configured();const original=globalThis.fetch;const f=fixture();globalThis.fetch=f.fetch;
  try {
    await createCheckout('concurrent-events');
    const responses=await Promise.all([event('payment.captured',f,'concurrent-event'),event('payment.captured',f,'concurrent-event')]);
    assert.ok(responses.every(r=>r.status===200));
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM billing_events WHERE id=?').bind('concurrent-event').first()).n,1);
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM billing_orders WHERE owner=? AND state='paid'").bind('concurrent-events').first()).n,1);
    assert.equal((await account('concurrent-events')).id,'pro_once');
  } finally {globalThis.fetch=original;clear();}
});

test('partial refunds preserve purchase and full refunds revoke it',async()=>{
  configured();const original=globalThis.fetch;const f=fixture();globalThis.fetch=f.fetch;
  try {
    const order=await createCheckout('partial-refund');
    await verifyCheckout('partial-refund',verification(order,f));
    f.payment.amount_refunded=100;
    assert.equal((await event('refund.processed',f,'partial-refund-event')).status,200);
    assert.equal((await account('partial-refund')).id,'pro_once');
    f.payment.amount_refunded=99000;f.payment.status='refunded';
    assert.equal((await event('refund.processed',f,'full-refund-event')).status,200);
    assert.equal((await account('partial-refund')).id,'free');
  } finally {globalThis.fetch=original;clear();}
});

test('a signed webhook with mismatched provider payment identity cannot grant access',async()=>{
  configured();const original=globalThis.fetch;const f=fixture();globalThis.fetch=f.fetch;
  try {
    await createCheckout('wrong-payment-id');
    globalThis.fetch=async()=>Response.json({...f.payment,id:'pay_wrong'});
    const response=await event('payment.captured',f,'wrong-payment-event');
    assert.equal(response.status,409);
    assert.equal((await account('wrong-payment-id')).id,'free');
    assert.equal(await env.DB.prepare('SELECT id FROM billing_events WHERE id=?').bind('wrong-payment-event').first(),null);
  } finally {globalThis.fetch=original;clear();}
});
