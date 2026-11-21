import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))));
}
function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not authenticated' }, 401);
  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!keyId || !keySecret) return json({ error: 'Razorpay server keys are not configured.' }, 503);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Invalid session' }, 401);

  const body = await req.json().catch(() => null);
  const localId = body?.local_order_id;
  const paymentId = body?.razorpay_payment_id;
  const razorOrderId = body?.razorpay_order_id;
  const signature = body?.razorpay_signature;
  if (![localId, paymentId, razorOrderId, signature].every((v) => typeof v === 'string' && v.length > 0)) return json({ error: 'Missing payment verification fields.' }, 400);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: order, error: orderError } = await admin.from('orders').select('id,buyer_id,amount,status,razorpay_order_id')
    .eq('id', localId).eq('buyer_id', user.id).single();
  if (orderError || !order || order.razorpay_order_id !== razorOrderId || Number(order.amount) !== 600) return json({ error: 'Payment order does not match this account.' }, 403);

  // Use the order ID stored by our server, not an order ID supplied by the browser.
  const expected = await hmacHex(keySecret, `${order.razorpay_order_id}|${paymentId}`);
  if (!constantTimeEqual(expected, signature)) return json({ error: 'Payment signature verification failed.' }, 400);

  // A valid signature alone is not enough: confirm the payment is captured at Razorpay.
  const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { 'Authorization': `Basic ${btoa(`${keyId}:${keySecret}`)}` },
  });
  const payment = await paymentResponse.json().catch(() => ({}));
  if (!paymentResponse.ok || payment.order_id !== order.razorpay_order_id || payment.status !== 'captured' || payment.currency !== 'INR' || Number(payment.amount) !== 60000) {
    return json({ verified: false, error: 'Razorpay has not confirmed a captured ₹600 payment yet. Your order will update when payment is captured.' }, 409);
  }

  const { error: updateError } = await admin.from('orders').update({
    status: 'paid', retail_verified: true, razorpay_payment_id: paymentId, payment_verified_at: new Date().toISOString(), verified_at: new Date().toISOString(),
  }).eq('id', order.id).eq('razorpay_order_id', razorOrderId);
  if (updateError) return json({ error: 'Payment was verified, but order update failed. The webhook will retry confirmation.' }, 500);
  return json({ verified: true, message: 'Payment captured and verified.' });
});
