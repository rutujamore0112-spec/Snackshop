import test from 'node:test'
import assert from 'node:assert/strict'
import { customerVisibleOrders, customerVisibleRequests } from '../src/lib/customerHistory.mjs'

const HOUR = 60 * 60 * 1000
const NOW = Date.UTC(2026, 8, 24, 12)

test('customers see orders for 24 hours while older orders are hidden', () => {
  const orders = [
    { id: 'recent', createdAt: { toMillis: () => NOW - (23 * HOUR) } },
    { id: 'expired', createdAt: { toMillis: () => NOW - (24 * HOUR) } },
  ]
  assert.deepEqual(customerVisibleOrders(orders, NOW).map(order => order.id), ['recent'])
})

test('customers see requests for 72 hours while older requests are hidden', () => {
  const requests = [
    { id: 'recent', createdAt: new Date(NOW - (71 * HOUR)) },
    { id: 'expired', createdAt: new Date(NOW - (73 * HOUR)) },
  ]
  assert.deepEqual(customerVisibleRequests(requests, NOW).map(request => request.id), ['recent'])
})

test('records waiting for a server timestamp stay visible', () => {
  assert.equal(customerVisibleOrders([{ id: 'pending' }], NOW).length, 1)
  assert.equal(customerVisibleRequests([{ id: 'pending' }], NOW).length, 1)
})
