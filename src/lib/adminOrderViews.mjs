export const isCapturedRazorpayOrder = order =>
  Boolean(order.paymentId) && ['captured', 'captured_needs_review', 'test_captured'].includes(order.paymentStatus)

export function isVisibleAdminOrder(order) {
  if (order.status === 'cancelled') return false
  if (order.paymentMethod === 'cash') return true
  if (order.paymentMethod === 'razorpay') return isCapturedRazorpayOrder(order)
  // Older QR orders still need to be handled until they are resolved.
  if (order.paymentMethod === 'upi') {
    return isCapturedRazorpayOrder(order) || ['utr_submitted', 'paid'].includes(order.status)
  }
  return false
}

export function cancellationLabel(order) {
  if (order.cancelledBy === 'admin') return 'Order cancelled by admin'
  if (order.cancelledBy === 'timeout') return 'Payment window expired'
  if (order.paymentMethod === 'razorpay' || order.razorpayOrderId) return 'Razorpay checkout cancelled by customer'
  return 'Order cancelled by customer'
}
