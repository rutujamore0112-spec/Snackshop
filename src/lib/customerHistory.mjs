export const CUSTOMER_ORDER_RETENTION_MS = 24 * 60 * 60 * 1000
export const CUSTOMER_REQUEST_RETENTION_MS = 72 * 60 * 60 * 1000

function timestampMillis(timestamp) {
  if (typeof timestamp?.toMillis === 'function') return timestamp.toMillis()
  if (typeof timestamp?.toDate === 'function') return timestamp.toDate().getTime()
  if (timestamp instanceof Date) return timestamp.getTime()
  if (typeof timestamp === 'number') return timestamp
  return null
}

export function isVisibleInCustomerHistory(record, retentionMs, now = Date.now()) {
  const createdAt = timestampMillis(record?.createdAt)
  if (createdAt === null || !Number.isFinite(createdAt)) return true
  return now - createdAt < retentionMs
}

export function customerVisibleOrders(orders = [], now = Date.now()) {
  return orders.filter(order => isVisibleInCustomerHistory(order, CUSTOMER_ORDER_RETENTION_MS, now))
}

export function customerVisibleRequests(requests = [], now = Date.now()) {
  return requests.filter(request => isVisibleInCustomerHistory(request, CUSTOMER_REQUEST_RETENTION_MS, now))
}
