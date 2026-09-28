import { FieldValue } from 'firebase-admin/firestore'

// Called by both the checkout callback and the captured-payment webhook.
// A captured payment is recorded even if stock can no longer be fulfilled.
export async function settleCapturedPayment(db, orderRef, payment) {
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(orderRef)
    if (!snapshot.exists) throw new Error('Order not found')
    const order = snapshot.data()
    if (!['razorpay', 'upi'].includes(order.paymentMethod) || order.razorpayOrderId !== payment.order_id
      || Number(order.razorpayAmount) !== Number(payment.amount)
      || payment.currency !== 'INR' || order.razorpayCurrency !== 'INR') {
      throw new Error('Payment does not match the order')
    }
    if (order.paymentId === payment.id && ['paid', 'utr_submitted'].includes(order.status)) {
      return { status: order.status, review: order.paymentStatus === 'captured_needs_review', test: order.paymentStatus === 'test_captured' }
    }
    if (order.status === 'paid' || (order.paymentId && order.paymentId !== payment.id)) {
      throw new Error('Order already has a different payment')
    }

    // Test-mode captures prove the integration without consuming real stock.
    if (process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')) {
      transaction.update(orderRef, {
        status: 'utr_submitted',
        paymentId: payment.id,
        paymentStatus: 'test_captured',
        paidAt: FieldValue.serverTimestamp(),
        cancelledBy: FieldValue.delete(),
        cancelledAt: FieldValue.delete(),
      })
      return { status: 'utr_submitted', review: false, test: true }
    }

    if (order.status !== 'draft') {
      transaction.update(orderRef, {
        status: 'utr_submitted',
        reservationActive: false,
        paymentId: payment.id,
        paymentStatus: 'captured_needs_review',
        paidAt: FieldValue.serverTimestamp(),
        cancelledBy: FieldValue.delete(),
        cancelledAt: FieldValue.delete(),
      })
      return { status: 'utr_submitted', review: true }
    }

    const quantities = new Map()
    for (const item of order.items || []) {
      if (typeof item.productId !== 'string' || !Number.isInteger(item.qty) || item.qty <= 0) {
        throw new Error('Invalid order item')
      }
      quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.qty)
    }
    if (!quantities.size) throw new Error('Order has no items')

    const products = []
    for (const [id, qty] of quantities) {
      const ref = db.collection('products').doc(id)
      const product = await transaction.get(ref)
      products.push({ ref, qty, product })
    }
    const reservedByOrder = order.reservationActive === true
    const canFulfil = products.every(({ qty, product }) => {
      if (!product.exists) return false
      const { stock, reserved = 0 } = product.data()
      return Number.isSafeInteger(stock) && Number.isSafeInteger(reserved)
        && stock >= qty && (reservedByOrder ? reserved >= qty : stock - reserved >= qty)
    })

    if (!canFulfil) {
      transaction.update(orderRef, {
        status: 'utr_submitted',
        paymentId: payment.id,
        paymentStatus: 'captured_needs_review',
        paidAt: FieldValue.serverTimestamp(),
      })
      return { status: 'utr_submitted', review: true }
    }

    for (const { ref, qty, product } of products) {
      const { stock, reserved = 0 } = product.data()
      transaction.update(ref, {
        stock: stock - qty,
        ...(reservedByOrder ? { reserved: reserved - qty } : {}),
      })
    }
    transaction.update(orderRef, {
      status: 'paid',
      reservationActive: false,
      paymentId: payment.id,
      paymentStatus: 'captured',
      paidAt: FieldValue.serverTimestamp(),
    })
    return { status: 'paid', review: false }
  })
}
