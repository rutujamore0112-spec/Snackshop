import test from 'node:test'
import assert from 'node:assert/strict'
import { financeTotals, financeMonth, financeDateBounds } from '../src/lib/finance.mjs'

test('finance totals include new and legacy transaction types', () => {
  const entries = [
    { type: 'procurement', amount: 100 },
    { type: 'cashback', amount: 10 },
    { type: 'refund', amount: 20 },
    { type: 'self', amount: 5 },
    { spent: 50, earned: 3, self: 2 },
  ]
  assert.deepEqual(financeTotals(entries, [{ status: 'paid', total: 200 }, { status: 'cancelled', total: 100 }]), {
    sales: 200, procurement: 150, earned: 3, refund: 20, cashback: 10, self: 7, profit: 80,
  })
})

test('finance periods follow transaction dates', () => {
  assert.equal(financeMonth({ transactionDate: '2026-09-12' }), '2026-09')
  assert.deepEqual(financeDateBounds(new Date(2026, 8, 29)), { min: '2025-01-01', max: '2026-09-29' })
})
