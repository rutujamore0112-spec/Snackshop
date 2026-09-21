import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createLocalRazorpayOrder, verifyLocalRazorpayPayment } from './server/localRazorpay.mjs'

const readJson = request => new Promise((resolve, reject) => {
  let body = ''
  request.on('data', chunk => {
    body += chunk
    if (body.length > 20_000) reject(new Error('Request body is too large'))
  })
  request.on('end', () => {
    try { resolve(body ? JSON.parse(body) : {}) } catch { reject(new Error('Invalid JSON body')) }
  })
  request.on('error', reject)
})

const sendJson = (response, status, body) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}

function localRazorpayPlugin(env) {
  return {
    name: 'local-razorpay-test-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0]
        if (!path?.startsWith('/api/local-razorpay/')) return next()
        const remoteAddress = request.socket.remoteAddress || ''
        const isLoopback = remoteAddress === '::1' || remoteAddress === '127.0.0.1' || remoteAddress.startsWith('::ffff:127.')
        if (!isLoopback) return sendJson(response, 403, { error: 'Local Razorpay is restricted to localhost' })
        if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' })
        try {
          const payload = await readJson(request)
          if (path === '/api/local-razorpay/create-order') return sendJson(response, 200, await createLocalRazorpayOrder(env, payload))
          if (path === '/api/local-razorpay/verify-payment') return sendJson(response, 200, verifyLocalRazorpayPayment(env, payload))
          return sendJson(response, 404, { error: 'Not found' })
        } catch (error) {
          return sendJson(response, 400, { error: error.message || 'Local Razorpay request failed' })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return { plugins: [react(), localRazorpayPlugin(env)] }
})
