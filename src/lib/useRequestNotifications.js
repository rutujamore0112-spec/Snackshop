import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import { requestStatus, unreadRequestUpdates } from './requestNotifications.mjs'

export default function useRequestNotifications(uid) {
  const [unreadCount, setUnreadCount] = useState(0)
  const unreadRef = useRef([])
  const markingRef = useRef(false)

  useEffect(() => {
    if (!uid) {
      unreadRef.current = []
      setUnreadCount(0)
      return undefined
    }

    const requestsQuery = query(
      collection(db, 'requests'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
    )

    return onSnapshot(requestsQuery, snapshot => {
      const requests = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      const unread = unreadRequestUpdates(requests)
      unreadRef.current = unread
      setUnreadCount(unread.length)
    }, error => console.error('Request notification listener:', error))
  }, [uid])

  const markRequestUpdatesRead = useCallback(async () => {
    if (!uid || markingRef.current || unreadRef.current.length === 0) return
    markingRef.current = true
    const updates = [...unreadRef.current]
    setUnreadCount(0)

    try {
      for (let start = 0; start < updates.length; start += 400) {
        const batch = writeBatch(db)
        updates.slice(start, start + 400).forEach(request => {
          batch.update(doc(db, 'requests', request.id), {
            customerSeenStatus: requestStatus(request),
            customerSeenAt: serverTimestamp(),
          })
        })
        await batch.commit()
      }
    } catch (error) {
      console.error('Could not mark request notifications as read:', error)
      setUnreadCount(unreadRef.current.length)
    } finally {
      markingRef.current = false
    }
  }, [uid])

  return { unreadCount, markRequestUpdatesRead }
}
