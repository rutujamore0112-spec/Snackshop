import { Loader2, ShieldCheck, Clock3 } from 'lucide-react'

const messages = {
  creating_payment: {
    title: 'Opening secure payment…',
    description: 'We’re preparing your order and opening Razorpay. This may take a few moments.',
    hint: 'Complete payment in the Razorpay window when it appears.',
  },
  razorpay: {
    title: 'Waiting for Razorpay…',
    description: 'Your secure checkout is open. Complete payment in the Razorpay window.',
    hint: 'Keep this page open until your payment is confirmed.',
  },
  confirming_payment: {
    title: 'Confirming your payment…',
    description: 'Razorpay returned your payment details. We’re verifying them and updating your order.',
    hint: 'Please keep this page open. Do not pay again.',
  },
  creating_cash: {
    title: 'Placing your order…',
    description: 'We’re reserving your snacks and preparing your cash order.',
    hint: 'Please keep this page open.',
  },
  cancelling_payment: {
    title: 'Returning to your cart…',
    description: 'We’re closing the payment and recording the cancellation.',
    hint: 'Your snacks will stay in your cart.',
  },
  verification_error: {
    title: 'Confirmation is still pending',
    description: 'We received payment details, but could not confirm the payment yet.',
    hint: 'Check the same payment again. Do not pay twice.',
  },
}

export default function CheckoutStatus({ step, orderId, paymentId, onRetry, retrying }) {
  const message = messages[step]
  if (!message) return null
  const pending = step === 'verification_error'
  return (
    <section className="checkout-status" role="status" aria-live="polite" aria-atomic="true">
      <div className="checkout-status-icon" aria-hidden="true">
        {!pending && <Loader2 className="checkout-status-spinner" size={88} strokeWidth={1.5} />}
        {pending ? <Clock3 size={30} /> : <ShieldCheck size={30} />}
      </div>
      <p className="checkout-status-label">SNACKSHOP CHECKOUT</p>
      <h3>{message.title}</h3>
      <p className="checkout-status-description">{message.description}</p>
      <p className="checkout-status-hint">{message.hint}</p>
      {pending && (
        <>
          <button className="checkout-status-retry" onClick={onRetry} disabled={retrying}>{retrying ? 'Checking…' : 'Check payment again'}</button>
          {paymentId && <p className="checkout-status-reference">Payment ID: {paymentId}</p>}
          {orderId && <p className="checkout-status-reference">Order reference: {orderId}</p>}
        </>
      )}
    </section>
  )
}
