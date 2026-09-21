import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createLocalRazorpayOrder, verifyLocalRazorpayPayment } from '../server/localRazorpay.mjs'

const env = {
  RAZORPAY_LOCAL_ENABLED: 'true',
  RAZORPAY_KEY_ID: 'rzp_test_example',
  RAZORPAY_KEY_SECRET: 'test_secret',
}

test('local checkout rejects live Razorpay keys', async () => {
  await assert.rejects(() => createLocalRazorpayOrder({ ...env, RAZORPAY_KEY_ID: 'rzp_live_example' }, { amount: 100 }), /test-mode/)
})

test('local checkout creates INR orders in paise without exposing the secret', async () => {
  let request
  const result = await createLocalRazorpayOrder(env, { amount: 1250, receipt: 'draft_123' }, async (url, options) => {
    request = { url, options }
    return { ok: true, json: async () => ({ id: 'order_test123' }) }
  })
  assert.equal(request.url, 'https://api.razorpay.com/v1/orders')
  assert.deepEqual(JSON.parse(request.options.body), { amount: 1250, currency: 'INR', receipt: 'draft_123' })
  assert.deepEqual(result, { keyId: 'rzp_test_example', orderId: 'order_test123', amount: 1250, currency: 'INR' })
  assert.equal(JSON.stringify(result).includes(env.RAZORPAY_KEY_SECRET), false)
})

test('local checkout verifies Razorpay signatures', () => {
  const razorpayOrderId = 'order_test123'
  const razorpayPaymentId = 'pay_test123'
  const razorpaySignature = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex')
  assert.deepEqual(verifyLocalRazorpayPayment(env, { razorpayOrderId, razorpayPaymentId, razorpaySignature }), { verified: true })
  assert.throws(() => verifyLocalRazorpayPayment(env, { razorpayOrderId, razorpayPaymentId, razorpaySignature: 'bad' }), /Invalid/)
})
