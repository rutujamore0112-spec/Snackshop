import test from 'node:test'
import assert from 'node:assert/strict'
import { settleCapturedPayment } from '../server/settleRazorpay.mjs'

function fixture({ stock = 4, reserved = 0, status = 'draft', paymentId } = {}) {
  const order = {
    paymentMethod: 'razorpay', razorpayOrderId: 'order_1', razorpayAmount: 2500,
    razorpayCurrency: 'INR', status, reservationActive: false,
    items: [{ productId: 'snack_1', qty: 2 }], ...(paymentId ? { paymentId } : {}),
  }
  const product = { stock, reserved }
  const orderRef = { id: 'draft_1', kind: 'order' }
  const productRef = { id: 'snack_1', kind: 'product' }
  const db = {
    collection(name) {
      assert.equal(name, 'products')
      return { doc(id) { assert.equal(id, 'snack_1'); return productRef } }
    },
    async runTransaction(callback) {
      const changes = []
      const tx = {
        async get(ref) {
          return { exists: true, data: () => ref.kind === 'order' ? order : product }
        },
        update(ref, data) { changes.push({ ref, data }) },
      }
      const result = await callback(tx)
      for (const { ref, data } of changes) Object.assign(ref.kind === 'order' ? order : product, data)
      return result
    },
  }
  return { db, orderRef, order, product }
}

const payment = { id: 'pay_1', order_id: 'order_1', amount: 2500, currency: 'INR' }

test('test-mode capture records payment without consuming real inventory', async () => {
  const previous = process.env.RAZORPAY_KEY_ID
  process.env.RAZORPAY_KEY_ID = 'rzp_test_example'
  try {
    const { db, orderRef, order, product } = fixture()
    const result = await settleCapturedPayment(db, orderRef, payment)
    assert.deepEqual(result, { status: 'utr_submitted', review: false, test: true })
    assert.equal(order.paymentStatus, 'test_captured')
    assert.equal(order.paymentId, 'pay_1')
    assert.deepEqual(product, { stock: 4, reserved: 0 })
    assert.deepEqual(await settleCapturedPayment(db, orderRef, payment), result)
  } finally {
    if (previous === undefined) delete process.env.RAZORPAY_KEY_ID
    else process.env.RAZORPAY_KEY_ID = previous
  }
})

test('captured live payment deducts stock once, or flags insufficient stock for review', async () => {
  const previous = process.env.RAZORPAY_KEY_ID
  process.env.RAZORPAY_KEY_ID = 'rzp_live_example'
  try {
    const good = fixture()
    assert.deepEqual(await settleCapturedPayment(good.db, good.orderRef, payment), { status: 'paid', review: false })
    assert.equal(good.product.stock, 2)
    assert.deepEqual(await settleCapturedPayment(good.db, good.orderRef, payment), { status: 'paid', review: false, test: false })
    assert.equal(good.product.stock, 2)

    const short = fixture({ stock: 1 })
    assert.deepEqual(await settleCapturedPayment(short.db, short.orderRef, payment), { status: 'utr_submitted', review: true })
    assert.equal(short.order.paymentStatus, 'captured_needs_review')
    assert.equal(short.product.stock, 1)
  } finally {
    if (previous === undefined) delete process.env.RAZORPAY_KEY_ID
    else process.env.RAZORPAY_KEY_ID = previous
  }
})
