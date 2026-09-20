import test from 'node:test'
import assert from 'node:assert/strict'
import { transitionOrder } from '../src/lib/orderLifecycle.mjs'

function fixture(status = 'draft', items = [{ productId: 'p', qty: 2 }]) {
  let data = { order: { status, paymentMethod: 'upi', items }, p: { stock: 10, reserved: 5 } }
  return {
    read: () => structuredClone(data),
    async act(status, failCommit = false) {
      const pending = structuredClone(data)
      let writing = false
      const tx = {
        async get(ref) {
          assert.equal(writing, false, 'all transaction reads must precede writes')
          return { exists: () => Boolean(pending[ref]), data: () => structuredClone(pending[ref]) }
        },
        update(ref, update) { writing = true; Object.assign(pending[ref], update) },
        delete(ref) { writing = true; delete pending[ref] },
      }
      await transitionOrder(tx, 'order', id => id, status, status === 'cancelled' ? 'customer' : undefined)
      if (failCommit) throw new Error('permission-denied')
      data = pending
    },
  }
}

test('UPI submission preserves reservation and moves to admin verification', async () => {
  const f = fixture()
  await f.act('utr_submitted')
  assert.equal(f.read().order.status, 'utr_submitted')
  assert.deepEqual(f.read().p, { stock: 10, reserved: 5 })
  await f.act('paid')
  assert.deepEqual(f.read().p, { stock: 8, reserved: 3 })
  await f.act('paid')
  assert.deepEqual(f.read().p, { stock: 8, reserved: 3 })
})

test('cancelled drafts cannot be revived by late payment submission', async () => {
  const f = fixture()
  await f.act('cancelled')
  await assert.rejects(f.act('utr_submitted'), /already cancelled/)
  await assert.rejects(f.act('paid'), /already cancelled/)
  await f.act('cancelled')
  assert.deepEqual(f.read().p, { stock: 10, reserved: 3 })
})

test('confirmation wins over a late cancellation without releasing other reservations', async () => {
  const f = fixture('pending')
  await f.act('paid')
  await assert.rejects(f.act('cancelled'), /already paid/)
  assert.deepEqual(f.read().p, { stock: 8, reserved: 3 })
})

test('unsubmitted UPI payment cannot be confirmed', async () => {
  const f = fixture()
  await assert.rejects(f.act('paid'), /not submitted/)
  assert.deepEqual(f.read().p, { stock: 10, reserved: 5 })
})

test('active deletion releases stock, and failed commits preserve the order and reservation', async () => {
  const f = fixture()
  const before = f.read()
  await assert.rejects(f.act('delete', true), /permission-denied/)
  assert.deepEqual(f.read(), before)
  await f.act('delete')
  assert.equal(f.read().order, undefined)
  assert.deepEqual(f.read().p, { stock: 10, reserved: 3 })
})

test('deleting a settled order does not release stock twice', async () => {
  const f = fixture('pending')
  await f.act('paid')
  await f.act('delete')
  assert.deepEqual(f.read().p, { stock: 8, reserved: 3 })
})

test('legacy items without product IDs do not misalign released quantities', async () => {
  const f = fixture('draft', [{ name: 'Legacy', qty: 9 }, { productId: 'p', qty: 2 }])
  await f.act('cancelled')
  assert.deepEqual(f.read().p, { stock: 10, reserved: 3 })
})

test('repeated product IDs release their combined quantity', async () => {
  const f = fixture('draft', [{ productId: 'p', qty: 1 }, { productId: 'p', qty: 2 }])
  await f.act('cancelled')
  assert.deepEqual(f.read().p, { stock: 10, reserved: 2 })
})
