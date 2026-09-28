function checkoutError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode })
}

export function prepareCashOrder(items, products, expectedTotalPaise) {
  let totalPaise = 0
  const orderItems = []
  const reservations = []

  for (let i = 0; i < items.length; i++) {
    const product = products[i]
    if (!product?.exists) throw checkoutError('An item is no longer available', 409)
    const data = product.data()
    const stock = data.stock
    const reserved = data.reserved ?? 0
    const pricePaise = Math.round(Number(data.price) * 100)
    if (!Number.isSafeInteger(stock) || !Number.isSafeInteger(reserved) || reserved < 0
      || !Number.isSafeInteger(pricePaise) || pricePaise < 1
      || typeof data.name !== 'string' || !data.name.trim()) {
      throw checkoutError('An item is not available for ordering', 409)
    }
    if (stock - reserved < items[i].qty) {
      throw checkoutError(`Only ${Math.max(0, stock - reserved)} ${data.name} left`, 409)
    }
    totalPaise += pricePaise * items[i].qty
    orderItems.push({ productId: items[i].productId, name: data.name, qty: items[i].qty, price: pricePaise / 100 })
    reservations.push(reserved + items[i].qty)
  }
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 100 || totalPaise > 5000000) {
    throw checkoutError('Order total is outside the allowed range', 400)
  }
  if (totalPaise !== expectedTotalPaise) {
    throw checkoutError('Product prices changed; please refresh your cart', 409)
  }
  return { totalPaise, orderItems, reservations }
}
