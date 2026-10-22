import test from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp, deleteApp } from 'firebase/app'
import { getFirestore, collection, query, where, queryEqual } from 'firebase/firestore'
import { Timestamp } from 'firebase-admin/firestore'
import { database } from './helpers/firestore.mjs'
import { mutateOrder } from '../api/shop.mjs'
import { requestRestock } from '../server/restockRequest.mjs'
import { inventoryQuery, isSoldOut, productAvailability } from '../src/lib/productCatalog.mjs'

const user = { uid: 'customer', name: 'Customer' }
const product = { name: 'Chips', category: 'chips', stock: 1, reserved: 0, price: 20 }
const create = { orderId: 'last-unit', items: [{ productId: 'snack', qty: 1 }] }

test('default query excludes sold-out documents; requested categories are filtered on the server', async () => {
  const app = initializeApp({ projectId: 'catalog-query-test', apiKey: 'test', appId: 'test' }, 'catalog-query-test')
  try {
    const db = getFirestore(app), products = collection(db, 'products')
    assert.ok(queryEqual(inventoryQuery(db), query(products, where('stock', '>', 0))))
    assert.ok(queryEqual(inventoryQuery(db, { soldOut: true }), query(products, where('stock', '<=', 0))))
    assert.ok(queryEqual(inventoryQuery(db, { soldOut: true, category: 'chips' }), query(products, where('stock', '<=', 0), where('category', '==', 'chips'))))
  } finally { await deleteApp(app) }
})

test('last cash unit stays on the shelves while reserved, and cannot be ordered twice', async () => {
  const db = database({ 'products/snack': product }, { retry: true })
  await mutateOrder(db, user, 'create', create)
  const reserved = productAvailability(db.data.get('products/snack'))
  assert.equal(isSoldOut(reserved), false)
  assert.equal(reserved.visibleStock, 0)
  assert.equal(reserved.stock, 1)
  await assert.rejects(mutateOrder(db, { uid: 'another-customer' }, 'create', { ...create, orderId: 'another-order' }), /insufficient stock/)
  assert.equal(db.data.has('orders/another-order'), false)
  await mutateOrder(db, user, 'create', create)
  assert.equal(db.data.get('products/snack').reserved, 1)
})

for (const action of ['cancel', 'reject']) {
  test(`${action} restores availability without moving the last cash unit to sold out`, async () => {
    const db = database({ 'products/snack': product }, { retry: true })
    await mutateOrder(db, user, 'create', create)
    await mutateOrder(db, user, action, { orderId: create.orderId })
    const available = productAvailability(db.data.get('products/snack'))
    assert.equal(isSoldOut(available), false)
    assert.equal(available.visibleStock, 1)
    assert.equal(db.data.get(`orders/${create.orderId}`).status, 'cancelled')
  })
}

for (const selection of [{ type: 'full' }, { type: 'partial', amount: 5 }, { type: 'loan' }]) {
  test(`admin cash acceptance (${selection.type}) moves the last unit to sold out exactly once`, async () => {
    const db = database({ 'products/snack': product }, { retry: true })
    await mutateOrder(db, user, 'create', create)
    const pay = { orderId: create.orderId, expectedStatus: 'pending', expectedCollected: 0, selection }
    await mutateOrder(db, user, 'pay', pay)
    assert.equal(isSoldOut(db.data.get('products/snack')), true)
    assert.equal(db.data.get('products/snack').reserved, 0)
    assert.equal(db.data.get(`orders/${create.orderId}`).accepted, true)
    await mutateOrder(db, user, 'pay', pay)
    assert.equal(db.data.get('products/snack').stock, 0)
    if (selection.type !== 'full') {
      const order = db.data.get(`orders/${create.orderId}`)
      await mutateOrder(db, user, 'pay', { ...pay, expectedStatus: order.status, expectedCollected: order.amountPaid, selection: { type: 'full' } })
      assert.equal(db.data.get('products/snack').stock, 0)
    }
    assert.deepEqual(await mutateOrder(db, user, 'cancel', { orderId: create.orderId }), { cancelled: false })
  })
}

test('restock requests notify the existing inbox, deduplicate retries, and keep customers separate', async () => {
  const db = database({ 'products/snack': { ...product, stock: 0 } }, { retry: true })
  assert.deepEqual(await requestRestock(db, user, { productId: 'snack' }), { requested: true, alreadyRequested: false })
  assert.deepEqual(await requestRestock(db, user, { productId: 'snack' }), { requested: true, alreadyRequested: true })
  let requests = [...db.data.entries()].filter(([path]) => path.startsWith('requests/'))
  assert.equal(requests.length, 1)
  const [path, request] = requests[0]
  assert.equal(request.userId, user.uid)
  assert.equal(request.productId, 'snack')
  assert.equal(request.type, 'restock')
  assert.equal(request.message, 'Please restock Chips.')
  assert.equal(request.resolved, false)
  assert.equal(request.status, 'pending')
  assert.ok(request.createdAt instanceof Timestamp)
  await requestRestock(db, { uid: 'other' }, { productId: 'snack' })
  assert.equal([...db.data.keys()].filter(path => path.startsWith('requests/')).length, 2)
  db.data.set(path, { ...request, status: 'completed', resolved: true, customerSeenAt: Timestamp.now() })
  await requestRestock(db, user, { productId: 'snack' })
  assert.equal(db.data.get(path).status, 'pending')
  assert.equal('customerSeenAt' in db.data.get(path), false)
})

test('restock rejects available, reserved-only, missing, and invalid products without writing requests', async () => {
  for (const stock of [1, 10]) {
    const db = database({ 'products/snack': { ...product, stock, reserved: stock } })
    await assert.rejects(requestRestock(db, user, { productId: 'snack' }), /already back in stock/)
    assert.equal(db.data.size, 1)
  }
  const db = database({})
  await assert.rejects(requestRestock(db, user, { productId: 'missing' }), /no longer exists/)
  await assert.rejects(requestRestock(db, user, { productId: '../snack' }), /Invalid product/)
  assert.equal(db.data.size, 0)
})
