import test from 'node:test'
import assert from 'node:assert/strict'
import { isVisibleAdminOrder, cancellationLabel } from '../src/lib/adminOrderViews.mjs'

test('admin sees Razorpay orders only after a confirmed payment', () => {
  const draft = { paymentMethod: 'razorpay', status: 'draft' }
  assert.equal(isVisibleAdminOrder(draft), false)
  assert.equal(isVisibleAdminOrder({ ...draft, razorpayOrderId: 'order_1' }), false)
  assert.equal(isVisibleAdminOrder({ ...draft, status: 'paid', paymentId: 'pay_1', paymentStatus: 'captured' }), true)
  assert.equal(isVisibleAdminOrder({ ...draft, status: 'utr_submitted', paymentId: 'pay_2', paymentStatus: 'test_captured' }), true)
  assert.equal(isVisibleAdminOrder({ ...draft, status: 'cancelled' }), false)
})

test('cash and legacy submitted UPI orders remain visible for verification', () => {
  assert.equal(isVisibleAdminOrder({ paymentMethod: 'cash', status: 'pending' }), true)
  assert.equal(isVisibleAdminOrder({ paymentMethod: 'upi', status: 'draft' }), false)
  assert.equal(isVisibleAdminOrder({ paymentMethod: 'upi', status: 'utr_submitted' }), true)
})

test('cancellation labels identify the actor', () => {
  assert.equal(cancellationLabel({ cancelledBy: 'customer', paymentMethod: 'razorpay' }), 'Razorpay checkout cancelled by customer')
  assert.equal(cancellationLabel({ cancelledBy: 'admin' }), 'Order cancelled by admin')
})
