import { cert, getApps, initializeApp } from 'firebase-admin/app'

export function firebaseAdminApp() {
  if (getApps().length) return getApps()[0]
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured')
  return initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
}

export function bearerToken(req) {
  return req.headers.authorization?.match(/^Bearer (.+)$/)?.[1] || null
}
