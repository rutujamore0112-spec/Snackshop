import { ArrowRight, ShoppingBag } from 'lucide-react'
import { motion } from 'framer-motion'

const formatCurrency = value => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
}).format(value)

export default function FloatingCartBar({ itemCount, total, onOpen }) {
  return (
    <motion.div
      className="floating-cart-dock"
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 28 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
    >
      <button
        type="button"
        className="floating-cart-bar"
        onClick={onOpen}
        aria-label={`View cart with ${itemCount} ${itemCount === 1 ? 'item' : 'items'}, total ${formatCurrency(total)}`}
      >
        <span className="floating-cart-icon" aria-hidden="true"><ShoppingBag size={22} /></span>
        <span className="floating-cart-summary">
          <strong>{itemCount} {itemCount === 1 ? 'item' : 'items'}</strong>
          <span>{formatCurrency(total)}</span>
        </span>
        <span className="floating-cart-action">View cart <ArrowRight size={21} aria-hidden="true" /></span>
      </button>
    </motion.div>
  )
}
