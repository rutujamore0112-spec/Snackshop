import { useState, useEffect, useCallback, useRef } from 'react'
import { onSnapshot, getDocsFromServer } from 'firebase/firestore'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { db } from '../lib/firebase'
import { inventoryQuery, isSoldOut, productAvailability, sortProducts } from '../lib/productCatalog.mjs'

function useProductFeed({ enabled = true, soldOut = false } = {}) {
  const key = `${soldOut}:${enabled}`
  const [state, setState] = useState({ key, products: [], loading: enabled, error: null })
  const sessionRef = useRef(0)

  const refresh = useCallback(async () => {
    const user = getAuth().currentUser
    const session = sessionRef.current
    if (!enabled || !user) return
    try {
      const snap = await getDocsFromServer(inventoryQuery(db, { soldOut }))
      if (session !== sessionRef.current || getAuth().currentUser?.uid !== user.uid) return
      setState({ key, products: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })), loading: false, error: null })
    } catch (err) {
      // A refresh failure must never turn a completed purchase into a failure.
      console.warn('Could not refresh stock after checkout:', err.code)
    }
  }, [enabled, soldOut, key])

  useEffect(() => {
    let unsubscribe = null
    if (!enabled) return undefined
    setState({ key, products: [], loading: true, error: null })
    const authUnsub = onAuthStateChanged(getAuth(), user => {
      const session = ++sessionRef.current
      unsubscribe?.()
      unsubscribe = null
      setState({ key, products: [], loading: Boolean(user), error: null })
      if (!user) return
      unsubscribe = onSnapshot(inventoryQuery(db, { soldOut }), snap => {
        if (session !== sessionRef.current) return
        setState({ key, products: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })), loading: false, error: null })
      }, error => {
        if (session !== sessionRef.current) return
        setState({ key, products: [], loading: false, error })
      })
    })
    return () => {
      sessionRef.current++
      authUnsub()
      unsubscribe?.()
    }
  }, [enabled, soldOut, key])

  const current = enabled && state.key === key ? state : { products: [], loading: enabled, error: null }
  return { ...current, products: sortProducts(current.products.filter(product => !soldOut || isSoldOut(product)).map(productAvailability)), refresh }
}

export function useProducts({ includeSoldOut = false } = {}) {
  const available = useProductFeed()
  const soldOut = useProductFeed({ enabled: includeSoldOut, soldOut: true })
  return {
    products: available.products, loading: available.loading, error: available.error,
    refreshProducts: available.refresh,
    soldOutProducts: soldOut.products, soldOutLoading: soldOut.loading, soldOutError: soldOut.error,
  }
}
