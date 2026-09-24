import test from 'node:test'
import assert from 'node:assert/strict'
import { hasUnreadRequestUpdate, requestStatus, unreadRequestUpdates } from '../src/lib/requestNotifications.mjs'

test('pending requests do not create customer notifications', () => {
  assert.equal(hasUnreadRequestUpdate({ status: 'pending', customerSeenStatus: 'pending' }), false)
})

test('in-progress and stocked requests stay unread until that status is acknowledged', () => {
  assert.equal(hasUnreadRequestUpdate({ status: 'in_progress', customerSeenStatus: 'pending' }), true)
  assert.equal(hasUnreadRequestUpdate({ status: 'in_progress', customerSeenStatus: 'in_progress' }), false)
  assert.equal(hasUnreadRequestUpdate({ status: 'completed', customerSeenStatus: 'in_progress' }), true)
  assert.equal(hasUnreadRequestUpdate({ status: 'completed', customerSeenStatus: 'completed' }), false)
})

test('legacy resolved requests map to completed and can surface once', () => {
  const requests = [
    { id: 'one', resolved: true },
    { id: 'two', status: 'completed', customerSeenStatus: 'completed' },
  ]
  assert.equal(requestStatus(requests[0]), 'completed')
  assert.deepEqual(unreadRequestUpdates(requests).map(request => request.id), ['one'])
})
