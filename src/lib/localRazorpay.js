export const localRazorpayEnabled = import.meta.env.DEV && import.meta.env.VITE_RAZORPAY_LOCAL_ENABLED === 'true'

let checkoutScriptPromise

function loadCheckoutScript() {
  if (window.Razorpay) return Promise.resolve()
  if (!checkoutScriptPromise) {
    checkoutScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.onload = resolve
      script.onerror = () => reject(new Error('Razorpay Checkout could not load'))
      document.head.appendChild(script)
    })
  }
  return checkoutScriptPromise
}

async function post(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Local Razorpay request failed')
  return result
}

export async function openLocalRazorpayCheckout({ amountRupees, receipt, customerName, email }) {
  if (!localRazorpayEnabled) throw new Error('Local Razorpay checkout is disabled')
  const amount = Math.round(Number(amountRupees) * 100)
  const order = await post('/api/local-razorpay/create-order', { amount, receipt })
  await loadCheckoutScript()

  const payment = await new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: 'SnackShop',
      description: 'Local test checkout',
      prefill: { name: customerName, email: email || '' },
      theme: { color: '#147fbd' },
      handler: resolve,
      modal: { ondismiss: () => reject(new Error('Test payment cancelled')) },
    })
    checkout.on('payment.failed', response => reject(new Error(response.error?.description || 'Test payment failed')))
    checkout.open()
  })

  await post('/api/local-razorpay/verify-payment', {
    razorpayOrderId: payment.razorpay_order_id,
    razorpayPaymentId: payment.razorpay_payment_id,
    razorpaySignature: payment.razorpay_signature,
  })
  return payment
}
