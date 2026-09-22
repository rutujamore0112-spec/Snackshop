import { Minus, Plus, ShoppingBag } from 'lucide-react'
import toast from 'react-hot-toast'
import { useCart } from '../lib/CartContext'

export default function ProductCard({ product }) {
  const { items, addToCart, decrementFromCart } = useCart()

  if (!product) return null

  const inCart = items[product.id] || 0
  const stock = Number(product.visibleStock ?? product.stock ?? 0)
  const available = Math.max(0, stock - inCart)
  const soldOut = stock <= 0 && inCart === 0
  const cannotAddMore = available <= 0

  const handleAdd = () => {
    if (cannotAddMore) {
      toast.error("That's all we have in stock at the moment")
      return
    }
    addToCart(product, 1)
    toast.success(`Added ${product.name}`)
  }

  const stockMessage = soldOut
    ? 'Currently out of stock'
    : available === 0
      ? 'All available stock is in your bag'
      : available === 1
        ? 'Last 1 available!'
        : available <= 4
          ? `Only ${available} left!`
          : 'Ready for pickup'

  const lowStock = available > 0 && available <= 4

  return (
    <article className={`product-card${soldOut ? ' is-sold-out' : ''}`}>
      <div className="product-image-container" style={product.bg ? { '--product-image-bg': product.bg } : undefined}>
        {soldOut && <span className="sold-out-label">Back soon</span>}
        {product.imageUrl || product.image ? (
          <img
            src={product.imageUrl || product.image}
            alt={product.name}
            className="product-image"
            loading="lazy"
            decoding="async"
            onError={event => { event.currentTarget.style.display = 'none' }}
          />
        ) : (
          <div className="product-image-fallback" aria-label="Product image unavailable">
            <ShoppingBag size={30} />
            <span>Image coming soon</span>
          </div>
        )}
      </div>

      <div className="product-card-content">
        <span className="product-category">{product.category || 'Snacks'}</span>
        <div className="product-name-container">
          <h3 className="product-name">{product.name}</h3>
        </div>

        <div className={`product-stock-message${lowStock ? ' stock-availability-badge is-low' : ''}${soldOut ? ' is-sold-out-message' : ''}`}>
          {lowStock && <span aria-hidden="true">⚡</span>}
          {stockMessage}
        </div>

        <div className="product-actions">
          <span className="product-price">₹{product.price}</span>
          {soldOut ? (
            <button type="button" className="product-sold-out-button" disabled>Sold out</button>
          ) : inCart === 0 ? (
            <button type="button" onClick={handleAdd} className="product-add-button">Add</button>
          ) : (
            <div className="quantity-selector" aria-label={`${product.name} quantity`}>
              <button type="button" onClick={() => decrementFromCart(product.id)} className="quantity-button" aria-label="Decrease quantity"><Minus size={15} /></button>
              <span className="quantity-number">{inCart}</span>
              <button type="button" onClick={handleAdd} className="quantity-button" aria-label="Increase quantity" disabled={cannotAddMore}><Plus size={15} /></button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
