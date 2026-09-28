import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareCashOrder } from '../server/cashOrder.mjs'

const snapshot = data => ({ exists: true, data: () => data })

test('cash checkout prices products on the server and reserves only available stock', () => {
  const result = prepareCashOrder(
    [{ productId: 'snack1', qty: 2 }],
    [snapshot({ name: 'Snack', price: 12.5, stock: 5, reserved: 1 })],
    2500,
  )
  assert.equal(result.totalPaise, 2500)
  assert.equal(result.reservations[0], 3)
  assert.deepEqual(result.orderItems, [{ productId: 'snack1', name: 'Snack', price: 12.5, qty: 2 }])
  assert.throws(() => prepareCashOrder(
    [{ productId: 'snack1', qty: 5 }],
    [snapshot({ name: 'Snack', price: 12.5, stock: 5, reserved: 1 })],
    6250,
  ), /Only 4 Snack left/)
})

test('cash checkout refuses a changed price before reserving stock', () => {
  assert.throws(() => prepareCashOrder(
    [{ productId: 'snack1', qty: 1 }],
    [snapshot({ name: 'Snack', price: 15, stock: 5, reserved: 0 })],
    1200,
  ), /Product prices changed/)
})
