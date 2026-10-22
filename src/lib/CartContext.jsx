import { createContext, useContext, useState, useCallback } from 'react'

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [items, setItems] = useState({})
  const [storedProducts, setStoredProducts] = useState({})

  const addToCart = useCallback((product, qty) => {
    setStoredProducts(prev => ({ ...prev, [product.id]: product }))
    setItems(prev => ({ ...prev, [product.id]: (prev[product.id] || 0) + qty }))
  }, [])

  const decrementFromCart = useCallback((productId) => {
    setItems(prev => {
      const current = prev[productId] || 0
      if (current <= 1) {
        const next = { ...prev }
        delete next[productId]
        return next
      }
      return { ...prev, [productId]: current - 1 }
    })
  }, [])

  const removeFromCart = useCallback((productId) => {
    setItems(prev => { const next = { ...prev }; delete next[productId]; return next })
  }, [])

  const clearCart = useCallback(() => setItems({}), [])
  const totalItems = Object.values(items).reduce((s, v) => s + v, 0)

  return (
    <CartContext.Provider value={{ items, storedProducts, addToCart, decrementFromCart, removeFromCart, clearCart, totalItems }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
