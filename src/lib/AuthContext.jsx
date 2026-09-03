import { createContext, useContext, useState, useEffect } from 'react'

import { onAuthStateChanged } from 'firebase/auth'

import { doc, getDoc } from 'firebase/firestore'

import { auth, db } from './firebase'

const AuthContext = createContext(null)

// Admin email
const ADMIN_EMAIL = 'rutujamore0112@gmail.com'

export function AuthProvider({ children }) {

  const [user, setUser] = useState(null)

  const [profile, setProfile] = useState(null)

  const [loading, setLoading] = useState(true)

  useEffect(() => {

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {

      setUser(firebaseUser)

      if (firebaseUser) {

        try {

          const snap = await getDoc(doc(db, 'users', firebaseUser.uid))

          if (snap.exists()) {

            setProfile({ id: snap.id, ...snap.data() })

          } else {

            setProfile({
              id: firebaseUser.uid,
              email: firebaseUser.email,
              role: 'customer'
            })

          }

        } catch {

          setProfile({
            id: firebaseUser.uid,
            email: firebaseUser.email,
            role: 'customer'
          })

        }

      } else {

        setProfile(null)

      }

      setLoading(false)

    })

    return () => unsub()

  }, [])

  // Admin check
  const isAdmin =
    profile?.role === 'admin' ||
    user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()

  return (

    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAdmin
      }}
    >

      {children}

    </AuthContext.Provider>

  )

}

export const useAuth = () => useContext(AuthContext)