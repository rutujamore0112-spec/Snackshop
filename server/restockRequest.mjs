import { createHash } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'

const fail = message => { throw Object.assign(new Error(message), { status: 400 }) }

export async function requestRestock(db, user, { productId, customerName }) {
  if (typeof productId !== 'string' || !/^[A-Za-z0-9_-]{1,150}$/.test(productId)) fail('Invalid product')
  // One active request per customer/product, including network retries.
  const id = `restock_${createHash('sha256').update(JSON.stringify([user.uid, productId])).digest('hex')}`
  const requestRef = db.collection('requests').doc(id)
  return db.runTransaction(async tx => {
    const [product, existing] = await tx.getAll(db.collection('products').doc(productId), requestRef)
    if (!product.exists) fail('This product no longer exists')
    if (Number(product.data().stock || 0) > 0) fail('This product is already back in stock')
    if (existing.exists && existing.data().status !== 'completed' && !existing.data().resolved) {
      return { requested: true, alreadyRequested: true }
    }
    const name = String(user.name || customerName || user.email?.split('@')[0] || 'Customer').trim().slice(0, 120) || 'Customer'
    tx.set(requestRef, {
      userId: user.uid, customerName: name, productId,
      productName: String(product.data().name || 'Snack').slice(0, 150),
      type: 'restock', message: `Please restock ${String(product.data().name || 'this snack').slice(0, 150)}.`,
      status: 'pending', resolved: false, createdAt: Timestamp.now(),
    })
    return { requested: true, alreadyRequested: false }
  })
}
