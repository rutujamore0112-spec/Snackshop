import { useEffect, useRef, useState } from 'react'
import { Search, ShoppingBag, Store, DoorClosed } from 'lucide-react'
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
import HeaderSearch from '../components/HeaderSearch'
import ProfileMenu from '../components/ProfileMenu'
import useThemePreference from '../lib/useThemePreference'
import useRequestNotifications from '../lib/useRequestNotifications'

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
  const [profileRequestSignal, setProfileRequestSignal] = useState(0)
  const [requestDraft, setRequestDraft] = useState('')
  const productsGridRef = useRef(null)
  const { unreadCount, markRequestUpdatesRead } = useRequestNotifications(user?.uid)

  useEffect(() => onSnapshot(
    doc(db, 'settings', 'shopStatus'),
    snap => setShopOpen(snap.exists() ? snap.data().open !== false : true),
    err => console.error('Shop status error:', err),
  ), [])

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = products
    .filter(product =>
      (normalizedQuery || tab === 'all' || product.category === tab) &&
      [product.name, product.category].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)
    )
    .sort((a, b) => Number((a.visibleStock ?? a.stock ?? 0) <= 0) - Number((b.visibleStock ?? b.stock ?? 0) <= 0))
  const displayName = profile?.name || user?.displayName || user?.email?.split('@')[0] || 'Customer'
  const showSearchResults = () => productsGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const requestSearchedProduct = value => {
    setRequestDraft(value)
    setProfileRequestSignal(signal => signal + 1)
  }

  return (
    <div className="shop-shell" data-theme={theme}>
      <header className="store-header">
        <div className="shop-header-inner">
          <a className="store-brand" href="/" aria-label="SnackShop home"><span className="brand-stamp">S.</span>SnackShop<span className="brand-dot">.</span></a>
          <span className="header-note">Your campus corner shop.</span>
          <span className={`pickup-status shop-header-status ${shopOpen ? '' : 'closed'}`}>
            {shopOpen ? <Store size={12} /> : <DoorClosed size={12} />}
            {shopOpen ? 'Open for pickup' : 'Pickup paused'}
          </span>
          <div className="shop-header-actions">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <motion.button className="bag-button" whileTap={{ scale: 0.96 }} onClick={() => setCartOpen(true)} aria-label={`Open cart with ${totalItems} items`}>
              <ShoppingBag size={17} /><span className="bag-label">Your bag</span><span className="bag-count">{totalItems}</span>
            </motion.button>
            <HeaderSearch query={query} onQueryChange={setQuery} resultCount={filtered.length} onShowResults={showSearchResults} onRequestProduct={requestSearchedProduct} />
            <ProfileMenu
              displayName={displayName}
              email={profile?.email || user?.email}
              photoURL={profile?.photoURL || user?.photoURL}
              theme={theme}
              onToggleTheme={toggleTheme}
              onLogout={() => signOut(auth)}
              requestUpdateCount={unreadCount}
              onRequestHistoryOpen={markRequestUpdatesRead}
              openRequestSignal={profileRequestSignal}
              requestFormContent={<RequestForm embedded showHistory={false} initialMessage={requestDraft} />}
              ordersContent={<MyOrders embedded />}
              requestsContent={<RequestForm historyOnly />}
            />
          </div>
        </div>
      </header>

      <main className="shop-main">
        <span className={`pickup-status mobile-pickup-status ${shopOpen ? '' : 'closed'}`} role="status">
          {shopOpen ? <Store size={12} /> : <DoorClosed size={12} />}
          {shopOpen ? 'Open for pickup' : 'Pickup paused'}
        </span>
        <motion.section className="store-hero" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div><span className="eyebrow">YOUR CAMPUS CORNER SHOP</span><h1>Hey {displayName.split(' ')[0]},<br /><span>what's snacking?</span></h1><p>Live stock, quick ordering, and easy pickup for every craving.</p></div>
          <div className="hero-badge" aria-hidden="true">
            <span className="hero-badge-kicker">THE SNACK BREAK CLUB</span>
            <ShoppingBag size={38} />
            <strong>Small bag.<br />Big mood.</strong>
            <span className="hero-badge-footer">ORDER · PAY · PICK UP</span>
          </div>
        </motion.section>

        {!shopOpen && <div className="shop-notice"><DoorClosed size={16} /> You can still order. Pickup resumes when the shop reopens.</div>}

        <section className="catalog-section" aria-label="Browse snacks">
          <div className="catalog-heading">
            <div><span className="eyebrow">ON THE SHELVES</span><h2>{query ? `Results for “${query}”` : 'Find your favourite'}<span>.</span></h2></div>
          </div>
          <div className="catalog-toolbar">
            <div className="shop-categories" aria-label="Product categories">
              {CATEGORIES.map(category => <button key={category} className={`category-button ${tab === category ? 'selected' : ''}`} onClick={() => setTab(category)} aria-pressed={tab === category}>{category === 'all' ? 'Everything' : category.charAt(0).toUpperCase() + category.slice(1)}{tab === category && <motion.span className="category-marker" layoutId="category-marker" />}</button>)}
            </div>
            <span className="product-result-count">{loading ? 'Loading…' : `${filtered.length} ${filtered.length === 1 ? 'item' : 'items'}`}</span>
          </div>
          {error && <div className="shop-notice">We couldn't load the shelves. Refresh to try again.</div>}
          {loading ? (
            <div className="products-grid">{Array.from({ length: 8 }, (_, index) => <div className="product-skeleton" key={index} />)}</div>
          ) : filtered.length === 0 ? (
            <div className="catalog-empty"><Search size={24} /><h3>No snacks found</h3><p>Try another name or category.</p><button onClick={() => { setQuery(''); setTab('all') }}>Show everything</button></div>
          ) : (
            <AnimatePresence mode="popLayout"><motion.div ref={productsGridRef} layout className="products-grid">{filtered.map(product => <motion.div key={product.id} layout style={{ minWidth: 0, height: '100%' }}><ProductCard product={product} /></motion.div>)}</motion.div></AnimatePresence>
          )}
        </section>

        <footer className="store-footer"><strong>SnackShop.</strong><span>A small shop for your everyday breaks.</span><span>Built by Rutuja.</span></footer>
      </main>
      <MyOrders watchOnly />
      <CartDrawer products={products} open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  )
}

export default function ShopPage() {
  return <CartProvider><Shop /></CartProvider>
}
