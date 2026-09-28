import test from 'node:test'
import assert from 'node:assert/strict'
import { razorpayConfiguration } from '../server/razorpayConfig.mjs'

test('live checkout requires live credentials; webhook remains optional', () => {
  assert.deepEqual(razorpayConfiguration({ RAZORPAY_KEY_ID: 'rzp_live_example', RAZORPAY_KEY_SECRET: 'secret', RAZORPAY_WEBHOOK_SECRET: 'webhook' }), {
    mode: 'live', credentialsConfigured: true, webhookConfigured: true, liveReady: true,
  })
  assert.equal(razorpayConfiguration({ RAZORPAY_KEY_ID: 'rzp_live_example', RAZORPAY_KEY_SECRET: 'secret' }).liveReady, true)
  assert.equal(razorpayConfiguration({ RAZORPAY_KEY_ID: 'rzp_test_example', RAZORPAY_KEY_SECRET: 'secret', RAZORPAY_WEBHOOK_SECRET: 'webhook' }).liveReady, false)
})
