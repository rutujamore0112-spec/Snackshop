import { useEffect, useState } from 'react'
import { LogOut, Search, ShoppingBag, Store, DoorClosed, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { useAuth } from '../lib/AuthContext'
import { CartProvider, useCart } from '../lib/CartContext'
import { useProducts } from '../hooks/useProducts'
import ProductCard from '../components/ProductCard'
import CartDrawer from '../components/CartDrawer'
import RequestForm from '../components/RequestForm'
import MyOrders from '../components/MyOrders'
import ThemeToggle from '../components/ThemeToggle'
import useThemePreference from '../lib/useThemePreference'

const CATEGORIES = ['all', 'chips', 'biscuits', 'sweets', 'namkeen', 'drinks', 'noodles']

function Shop() {
  const { products, loading, error } = useProducts()
  const { totalItems } = useCart()
  const { profile, user } = useAuth()
  const { theme, toggleTheme } = useThemePreference()
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [shopOpen, setShopOpen] = useState(true)

  useEffect(() => onSnapshot(
    doc(db, 'settings', 'shopStatus'),
    snap => setShopOpen(snap.exists() ? snap.data().open !== false : true),
    err => console.error('Shop status error:', err),
  ), [])

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = products.filter(product =>
    (tab === 'all' || product.category === tab) &&
    (product.name || '').toLowerCase().includes(normalizedQuery)
  )
  const displayName = profile?.name || user?.displayName || user?.email?.split('@')[0] || 'Customer'

  return (
    <div className="shop-shell" data-theme={theme}>
      <header className="store-header">
        <div className="shop-header-inner">
          <a className="store-brand" href="/" aria-label="SnackShop home"><span className="brand-stamp">S</span>SnackShop</a>
          <span className={`pickup-status hide-on-mobile ${shopOpen ? '' : 'closed'}`}>
            {shopOpen ? <Store size={12} /> : <DoorClosed size={12} />}
            {shopOpen ? 'Open for pickup' : 'Pickup paused'}
          </span>
          <div className="shop-header-actions">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <motion.button className="bag-button" whileTap={{ scale: 0.96 }} onClick={() => setCartOpen(true)} aria-label={`Open cart with ${totalItems} items`}>
              <ShoppingBag size={17} /><span className="bag-label">Your bag</span><span className="bag-count">{totalItems}</span>
            </motion.button>
            <motion.button className="logout-button" whileTap={{ scale: 0.94 }} onClick={() => signOut(auth)} title="Sign out" aria-label="Sign out"><LogOut size={16} /></motion.button>
          </div>
        </div>
      </header>

      <main className="shop-main">
        <nav className="customer-history-nav" aria-label="Your activity"><a href="#my-orders">My orders</a><a href="#my-requests">My requests</a></nav>
        <motion.section className="store-hero" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div><span className="eyebrow">YOUR CAMPUS CORNER SHOP</span><h1>Hey {displayName.split(' ')[0]},<br /><span>what's snacking?</span></h1><p>Live stock, quick ordering, and easy pickup for every craving.</p></div>
          <div className="hero-badge" aria-hidden="true"><ShoppingBag size={42} /><strong>Small bag.<br />Big mood.</strong></div>
        </motion.section>

        {!shopOpen && <div className="shop-notice"><DoorClosed size={16} /> You can still order. Pickup resumes when the shop reopens.</div>}

        <section className="catalog-section" aria-label="Browse snacks">
          <div className="catalog-heading">
            <div><span className="eyebrow">ON THE SHELVES</span><h2>Find your favourite<span>.</span></h2></div>
            <label className="search-box"><Search size={17} /><input type="search" aria-label="Search snacks" placeholder="Looking for something?" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}</label>
          </div>
          <div className="catalog-toolbar">
            <div className="shop-categories" aria-label="Product categories">
              {CATEGORIES.map(category => <button key={category} className={`category-button ${tab === category ? 'selected' : ''}`} onClick={() => setTab(category)} aria-pressed={tab === category}>{category === 'all' ? 'Everything' : category.charAt(0).toUpperCase() + category.slice(1)}{tab === category && <motion.span className="category-marker" layoutId="category-marker" />}</button>)}
            </div>
            <span className="product-result-count">{loading ? 'Loading…' : `${filtered.length} ${filtered.length === 1 ? 'item' : 'items'}`}</span>
          </div>
          {error && <div className="shop-notice">We couldn't load the shelves. Refresh to try again.</div>}
          {loading ? (
            <div className="products-grid">{Array.from({ length: 10 }, (_, index) => <div className="product-skeleton" key={index} />)}</div>
          ) : filtered.length === 0 ? (
            <div className="catalog-empty"><Search size={24} /><h3>No snacks found</h3><p>Try another name or category.</p><button onClick={() => { setQuery(''); setTab('all') }}>Show everything</button></div>
          ) : (
            <AnimatePresence mode="popLayout"><motion.div layout className="products-grid">{filtered.map(product => <motion.div key={product.id} layout style={{ minWidth: 0, height: '100%' }}><ProductCard product={product} /></motion.div>)}</motion.div></AnimatePresence>
          )}
        </section>

        <div className="shop-community"><div id="my-orders"><MyOrders /></div><div id="my-requests"><RequestForm /></div></div>
        <footer className="store-footer"><strong>SnackShop.</strong><span>A small shop for your everyday breaks.</span><span>Built by Rutuja.</span></footer>
      </main>
      <CartDrawer products={products} open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  )
}

export default function ShopPage() {
  return <CartProvider><Shop /></CartProvider>
}
