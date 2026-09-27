export const razorpayEnabled = true

let checkoutScriptPromise

function loadCheckoutScript() {
  if (window.Razorpay) return Promise.resolve()

  if (!checkoutScriptPromise) {
    checkoutScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true

      script.onload = resolve
      script.onerror = () => reject(
        new Error('Razorpay Checkout could not load')
      )

      document.head.appendChild(script)
    }).catch(error => {
      checkoutScriptPromise = null
      throw error
    })
  }

  return checkoutScriptPromise
}

async function post(path, body, token) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(body),
  })

  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(result.error || 'Payment request failed')
  }

  return result
}

export async function verifyRazorpayPayment(
  user,
  firestoreOrderId,
  payment
) {
  const token = await user.getIdToken()

  return post(
    '/api/razorpay/verify-payment',
    {
      firestoreOrderId,
      razorpayPaymentId: payment.razorpay_payment_id,
      razorpayOrderId: payment.razorpay_order_id,
      razorpaySignature: payment.razorpay_signature,
    },
    token
  )
}

export async function openRazorpayCheckout({
  user,
  firestoreOrderId,
  customerName,
  email,
  onOrderCreated,
  onPaymentReceived,
}) {
  if (!razorpayEnabled) {
    throw new Error('Razorpay checkout is disabled')
  }

  const token = await user.getIdToken()

  const order = await post(
    '/api/razorpay/create-order',
    { firestoreOrderId },
    token
  )

  onOrderCreated?.(order.expiresAtMillis)

  await loadCheckoutScript()

  const payment = await new Promise((resolve, reject) => {
    let settled = false

    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.razorpayOrderId,
      name: 'SnackShop',

      prefill: {
        name: customerName,
        email: email || '',
      },

      theme: {
        color: '#147fbd',
      },

      handler: result => {
        settled = true
        resolve(result)
      },

      modal: {
        ondismiss: () => {
          if (!settled) {
            reject(new Error('Payment cancelled'))
          }
        },
      },
    })

    checkout.on('payment.failed', response => {
      if (!settled) {
        settled = true

        reject(
          new Error(
            response.error?.description || 'Payment failed'
          )
        )

        checkout.close()
      }
    })

    checkout.open()
  })

  onPaymentReceived?.(payment)

  if (payment.razorpay_order_id !== order.razorpayOrderId) {
    throw new Error('Razorpay order mismatch')
  }

  return verifyRazorpayPayment(
    user,
    firestoreOrderId,
    payment
  )
}