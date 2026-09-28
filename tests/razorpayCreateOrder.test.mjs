import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/razorpay/create-order.mjs'

test('create-order refuses test credentials before creating an order', async () => {
  const previousId = process.env.RAZORPAY_KEY_ID
  const previousSecret = process.env.RAZORPAY_KEY_SECRET
  process.env.RAZORPAY_KEY_ID = 'rzp_test_example'
  process.env.RAZORPAY_KEY_SECRET = 'secret'
  try {
    let status
    let body
    const response = {
      status(code) { status = code; return this },
      json(value) { body = value; return this },
    }
    await handler({ method: 'POST', body: { firestoreOrderId: 'order1' } }, response)
    assert.equal(status, 503)
    assert.match(body.error, /awaiting live credentials/)
  } finally {
    if (previousId === undefined) delete process.env.RAZORPAY_KEY_ID
    else process.env.RAZORPAY_KEY_ID = previousId
    if (previousSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET
    else process.env.RAZORPAY_KEY_SECRET = previousSecret
  }
})
