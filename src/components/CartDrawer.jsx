import { useState, useEffect, useRef } from 'react'
import { X, Trash2, CheckCircle, ArrowRight, Banknote, ShoppingCart, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'
import { collection, doc, serverTimestamp, runTransaction, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCart } from '../lib/CartContext'
import { useAuth } from '../lib/AuthContext'
import { updateOrderStatus } from '../lib/orders'
import { razorpayEnabled, openRazorpayCheckout, verifyRazorpayPayment } from '../lib/razorpay'
import CheckoutStatus from './CheckoutStatus'

const TIMER_SECONDS = 120 
const PENDING_PAYMENT_KEY = 'snackshop:pending-razorpay-verification'

function rememberPayment(uid, orderId, payment) {
  try {
    sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify({ uid, orderId, payment, savedAt: Date.now() }))
  } catch { /* Verification still works in this session. */ }
}

function forgetPayment() {
  try { sessionStorage.removeItem(PENDING_PAYMENT_KEY) } catch { /* Storage may be unavailable. */ }
}

export default function CartDrawer({ products, open, onClose }) {
  const { items, addToCart, decrementFromCart, removeFromCart, clearCart } = useCart()
  const { profile, user } = useAuth()
  const customerName = user?.displayName || profile?.name || user?.email?.split('@')[0] || profile?.email?.split('@')[0] || 'Customer'
  
  const [step, setStep] = useState('cart')
  const [orderId, setOrderId] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const busyRef = useRef(false)
  const paymentReceivedRef = useRef(null)
  const [razorpayResult, setRazorpayResult] = useState(null)

  const [finalTotal, setFinalTotal] = useState(0)
  const [finalName, setFinalName] = useState('')

  const cartProducts = products.filter(p => items[p.id])
  const total = cartProducts.reduce((s, p) => s + p.price * items[p.id], 0)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, step]) 

  const handleProceed = () => {
    if (cartProducts.length === 0) { toast.error('Cart is empty'); return }
    setStep('method')
  }

  const createOrder = async (paymentMethod) => {
    if (busyRef.current) return null
    if (!user?.uid || cartProducts.length === 0) {
      toast.error('Please sign in and add items to your cart')
      return null
    }
    busyRef.current = true
    setSubmitting(true)
    const orderItems = cartProducts.map(p => ({
      productId: p.id, name: p.name, qty: items[p.id], price: p.price,
    }))

    const orderRef = doc(collection(db, 'orders'))
    const expiresAtMillis = Date.now() + TIMER_SECONDS * 1000

    try {
      await runTransaction(db, async (tx) => {
        const productRefs = orderItems.map(it => doc(db, 'products', it.productId))
        const productSnaps = await Promise.all(productRefs.map(ref => tx.get(ref)))

        for (let i = 0; i < orderItems.length; i++) {
          const snap = productSnaps[i]
          const it = orderItems[i]
          if (!snap.exists()) throw new Error(`${it.name} is no longer available`)
          
          const data = snap.data()
          if (!Number.isInteger(it.qty) || it.qty <= 0) throw new Error('Invalid item quantity')
          const available = (data.stock || 0) - (data.reserved || 0)
          if (available < it.qty) {
            throw new Error(available <= 0 ? `${it.name} just sold out` : `Only ${available} ${it.name} left`)
          }
        }

        if (paymentMethod === 'cash') {
          productSnaps.forEach((snap, i) => {
            const data = snap.data()
            tx.update(productRefs[i], { reserved: (data.reserved || 0) + orderItems[i].qty })
          })
        }

        tx.set(orderRef, {
          customerName, 
          userId: user?.uid || profile?.id || null, 
          items: orderItems, 
          total,
          status: paymentMethod === 'razorpay' ? 'draft' : 'pending',
          reservationActive: paymentMethod === 'cash',
          paymentMethod, 
          createdAt: serverTimestamp(),
          ...(paymentMethod === 'razorpay' ? { expiresAt: Timestamp.fromMillis(expiresAtMillis) } : {}),
        })
      })

      setOrderId(orderRef.id)
      setFinalTotal(total)
      setFinalName(customerName)
      return orderRef.id
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Could not create order, try again')
      return null
    } finally {
      busyRef.current = false
      setSubmitting(false)
    }
  }

  const handleChooseCash = async () => {
    setStep('creating_cash')
    const id = await createOrder('cash')
    if (id) {
      clearCart()
      setStep('cash_pending')
    } else setStep('method')
  }

  const releaseOrder = async (id) => {
    if (!id) return true
    try {
      await updateOrderStatus(id, 'cancelled', 'customer')
      return true
    } catch (err) {
      console.error('Could not release order:', err)
      toast.error('Could not cancel order. Please retry or cancel it from My orders.')
      return false
    }
  }

  const handleRazorpay = async () => {
    setStep('creating_payment')
    const id = await createOrder('razorpay')
    if (!id) { setStep('method'); return }

    setStep('razorpay')
    busyRef.current = true
    setSubmitting(true)
    try {
      const result = await openRazorpayCheckout({
        user,
        firestoreOrderId: id,
        customerName,
        email: user?.email,
        onPaymentReceived: payment => {
          paymentReceivedRef.current = payment
          rememberPayment(user.uid, id, payment)
          setStep('confirming_payment')
        },
      })
      setRazorpayResult(result)
      forgetPayment()
      clearCart()
      setStep('done')
      toast.success(result.test ? 'Test payment verified; no real order was placed' : result.review ? 'Payment received; order needs review' : 'Payment verified')
    } catch (err) {
      console.error('Razorpay checkout failed:', err)
      if (paymentReceivedRef.current) {
        setStep('verification_error')
        toast.error('Payment received. Confirmation is pending; keep your payment ID.')
      } else {
        setStep('cancelling_payment')
        await releaseOrder(id)
        setOrderId(null)
        setStep('method')
        toast.error(err.message || 'Payment was not completed')
      }
    } finally {
      busyRef.current = false
      setSubmitting(false)
    }
  }

  const retryVerification = async () => {
    if (!orderId || !paymentReceivedRef.current || busyRef.current) return
    busyRef.current = true
    setSubmitting(true)
    setStep('confirming_payment')
    try {
      const result = await verifyRazorpayPayment(user, orderId, paymentReceivedRef.current)
      setRazorpayResult(result)
      forgetPayment()
      clearCart()
      setStep('done')
    } catch (error) {
      setStep('verification_error')
      toast.error(error.message)
    } finally {
      busyRef.current = false
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (!user?.uid) return
    let pending
    try { pending = JSON.parse(sessionStorage.getItem(PENDING_PAYMENT_KEY) || 'null') } catch { forgetPayment(); return }
    if (!pending || pending.uid !== user.uid) return
    if (!pending.orderId || !pending.payment?.razorpay_signature || Date.now() - pending.savedAt > 24 * 60 * 60 * 1000) {
      forgetPayment()
      return
    }
    let active = true
    paymentReceivedRef.current = pending.payment
    setOrderId(pending.orderId)
    setStep('confirming_payment')
    busyRef.current = true
    setSubmitting(true)
    verifyRazorpayPayment(user, pending.orderId, pending.payment).then(result => {
      if (!active) return
      setRazorpayResult(result)
      forgetPayment()
      clearCart()
      setStep('done')
      toast.success('Your payment was confirmed')
    }).catch(error => {
      if (!active) return
      console.error('Payment recovery failed:', error)
      setStep('verification_error')
    }).finally(() => {
      if (active) { busyRef.current = false; setSubmitting(false) }
    })
    return () => { active = false }
  }, [user?.uid])

  const handleCancelOrder = async () => {
    if (busyRef.current || paymentReceivedRef.current) return
    busyRef.current = true
    setCancelling(true)
    const released = await releaseOrder(orderId)
    busyRef.current = false
    setCancelling(false)
    if (!released) return false
    toast('Order cancelled')
    setStep('cart')
    setOrderId(null)
    return true
  }

  const resetAndClose = (keepCart = true) => {
    setStep('cart')
    setOrderId(null)
    paymentReceivedRef.current = null
    setRazorpayResult(null)
    if (!keepCart) clearCart()
    onClose()
  }

  const handleClose = async () => {
    if (busyRef.current) return
    if (['creating_payment', 'confirming_payment', 'creating_cash', 'cancelling_payment'].includes(step)) return
    if (step === 'verification_error') { onClose(); return }
    if (step === 'razorpay' && orderId && !paymentReceivedRef.current && !(await handleCancelOrder())) return
    resetAndClose()
  }

  if (!open) return null
  const showCheckoutScreen = ['creating_payment', 'razorpay', 'confirming_payment', 'creating_cash', 'cancelling_payment'].includes(step)

  return (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 40, backdropFilter: 'blur(3px)' }} />
      <div className="cart-drawer" style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: 420, background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 50, display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideIn 0.22s ease' }}>
        <style>{`
          @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
          @keyframes popIn { from { transform: scale(0.88); opacity: 0 } to { transform: scale(1); opacity: 1 } }
          @keyframes pulseRed { 0%,100%{opacity:1} 50%{opacity:0.4} }
        `}</style>

        {/* Header */}
        <div className="cart-drawer-header" style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ fontFamily: 'Syne', fontSize: 19, fontWeight: 700 }}>
            {step === 'cart' && 'Your Cart'}
            {step === 'method' && 'Choose Payment'}
            {step === 'razorpay' && 'Razorpay Checkout'}
            {['creating_payment', 'confirming_payment', 'cancelling_payment'].includes(step) && 'Razorpay Checkout'}
            {step === 'creating_cash' && 'Pay by Cash'}
            {step === 'verification_error' && 'Payment received'}
            {step === 'cash_pending' && 'Pay by Cash'}
            {step === 'done' && 'Order Placed!'}
          </h2>
          <button onClick={handleClose} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, color: 'var(--text)', display: 'flex' }}>
            <X size={17} />
          </button>
        </div>

        {/* Content */}
        <div className="custom-scrollbar cart-drawer-content" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px', WebkitOverflowScrolling: 'touch' }}>

          {/* CART */}
          {step === 'cart' && (
            <>
              {cartProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-hint)' }}>
                  <ShoppingCart size={48} style={{ opacity: 0.2, margin: '0 auto 16px', display: 'block' }} />
                  <p style={{ fontSize: 15, fontFamily: 'Syne', fontWeight: 600, color: 'var(--text-secondary)' }}>Your cart is empty</p>
                  <p style={{ fontSize: 13, marginTop: 4 }}>Add some snacks to get started!</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', borderRadius: 10, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: 'var(--text-secondary)' }}>
                    Ordering as <strong style={{ color: 'var(--text)' }}>{customerName}</strong>
                  </div>
                  {cartProducts.map(p => (
                    <div className="cart-product-row" key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>₹{p.price} × {items[p.id]}</div>
                      </div>
                      <div className="cart-product-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>₹{p.price * items[p.id]}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--surface2)', borderRadius: 8 }}>
                          <button onClick={() => decrementFromCart(p.id)} style={{ background: 'none', border: 'none', padding: '6px 9px', color: 'var(--text)', fontWeight: 700, cursor: 'pointer', display: 'flex' }}>−</button>
                          <span style={{ fontWeight: 700, fontSize: 13, minWidth: 16, textAlign: 'center' }}>{items[p.id]}</span>
                          <button onClick={() => addToCart(p, 1)} disabled={(p.visibleStock ?? p.stock ?? 0) - items[p.id] <= 0} style={{ background: 'none', border: 'none', padding: '6px 9px', color: 'var(--text)', fontWeight: 700, cursor: 'pointer', display: 'flex', opacity: (p.visibleStock ?? p.stock ?? 0) - items[p.id] <= 0 ? 0.35 : 1 }}>+</button>
                        </div>
                        <button onClick={() => removeFromCart(p.id)} style={{ background: 'var(--danger-dim)', border: 'none', borderRadius: 6, padding: 6, color: 'var(--danger)', display: 'flex' }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* METHOD CHOICE */}
          {step === 'method' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'popIn 0.3s ease' }}>
              <div style={{ display: 'inline-flex', gap: 12, background: 'var(--surface2)', borderRadius: 100, padding: '8px 20px', marginBottom: 6, fontSize: 13, alignItems: 'center', alignSelf: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{cartProducts.length} item{cartProducts.length > 1 ? 's' : ''}</span>
                <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
                <span style={{ fontFamily: 'Syne', fontWeight: 800, color: 'var(--accent)', fontSize: 16 }}>₹{total}</span>
              </div>
              {razorpayEnabled && (
                <button onClick={handleRazorpay} disabled={submitting} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 14, textAlign: 'left', color: 'var(--text)' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><CreditCard size={18} color="var(--accent)" /></div>
                  <div style={{ flex: 1 }}><div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14 }}>Pay with Razorpay</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Secure online payment</div></div>
                  <ArrowRight size={15} color="var(--text-hint)" />
                </button>
              )}
              <button onClick={handleChooseCash} disabled={submitting} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 14, textAlign: 'left', color: 'var(--text)' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Banknote size={18} color="var(--success)" /></div>
                <div style={{ flex: 1 }}><div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14 }}>Pay by Cash</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Pay the admin directly on pickup</div></div>
                <ArrowRight size={15} color="var(--text-hint)" />
              </button>
              <button onClick={() => setStep('cart')} style={{ marginTop: 4, padding: 10, background: 'none', border: 'none', color: 'var(--text-hint)', fontSize: 13 }}>← Back to cart</button>
            </div>
          )}

          {step === 'verification_error' && (
            <CheckoutStatus step={step} orderId={orderId} paymentId={paymentReceivedRef.current?.razorpay_payment_id} onRetry={retryVerification} retrying={submitting} />
          )}

          {/* CASH PENDING */}
          {step === 'cash_pending' && (
            <div style={{ textAlign: 'center', padding: '50px 20px', animation: 'popIn 0.35s ease' }}>
              <Banknote size={62} color="var(--success)" style={{ margin: '0 auto 16px', display: 'block' }} />
              <h3 style={{ fontFamily: 'Syne', fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Order placed!</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7, maxWidth: 280, margin: '0 auto' }}>
                Pay <strong style={{ color: 'var(--accent)' }}>₹{finalTotal}</strong> in cash to the admin on pickup. Rutuja will verify and confirm your order — stock updates automatically once confirmed.
              </p>
              <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '12px 16px', marginTop: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
                Order by <strong style={{ color: 'var(--text)' }}>{finalName}</strong> · <strong style={{ color: 'var(--accent)', fontFamily: 'Syne' }}>₹{finalTotal}</strong>
              </div>
              <button onClick={() => resetAndClose()} style={{ marginTop: 24, padding: '11px 28px', background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: 100, fontFamily: 'Syne', fontWeight: 700, fontSize: 14 }}>Back to shop</button>
            </div>
          )}

          {/* DONE */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '50px 20px', animation: 'popIn 0.35s ease' }}>
              <CheckCircle size={62} color="var(--success)" style={{ margin: '0 auto 16px', display: 'block' }} />
              <h3 style={{ fontFamily: 'Syne', fontSize: 22, fontWeight: 800, marginBottom: 10 }}>{razorpayResult?.test ? 'Test payment verified!' : 'Order submitted!'}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7, maxWidth: 280, margin: '0 auto' }}>
                {razorpayResult ? (razorpayResult.test ? 'This was a Razorpay test transaction. No real money was charged, and no stock was deducted.' : razorpayResult.review ? 'Your payment was captured. The shop will review stock before accepting your order or arranging a refund.' : 'Your payment was verified and stock was updated. The shop will accept your order shortly.') : 'Rutuja will verify your payment and confirm your order. Stock updates automatically once confirmed.'}
              </p>
              <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '12px 16px', marginTop: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
                Order by <strong style={{ color: 'var(--text)' }}>{finalName}</strong> · <strong style={{ color: 'var(--accent)', fontFamily: 'Syne' }}>₹{finalTotal}</strong>
              </div>
              <button onClick={() => resetAndClose()} style={{ marginTop: 24, padding: '11px 28px', background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: 100, fontFamily: 'Syne', fontWeight: 700, fontSize: 14 }}>Back to shop</button>
            </div>
          )}
        </div>

        {/* Footers */}
        {step === 'cart' && cartProducts.length > 0 && (
          <div className="cart-drawer-footer" style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Total</span>
              <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22 }}>₹{total}</span>
            </div>
            <button onClick={handleProceed} style={{ width: '100%', padding: 13, borderRadius: 12, background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: 'Syne', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              Proceed to buy <ArrowRight size={16} />
            </button>
          </div>
        )}

      </div>
      {showCheckoutScreen && <div className="checkout-status-screen"><CheckoutStatus step={step} orderId={orderId} paymentId={paymentReceivedRef.current?.razorpay_payment_id} /></div>}
    </>
  )
}
