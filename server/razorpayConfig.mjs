export function razorpayKeyMode(keyId) {
  if (keyId?.startsWith('rzp_live_')) return 'live'
  if (keyId?.startsWith('rzp_test_')) return 'test'
  return 'unconfigured'
}

export function razorpayConfiguration(env) {
  const mode = razorpayKeyMode(env.RAZORPAY_KEY_ID)
  const credentialsConfigured = mode !== 'unconfigured' && Boolean(env.RAZORPAY_KEY_SECRET)
  const webhookConfigured = Boolean(env.RAZORPAY_WEBHOOK_SECRET)
  return { mode, credentialsConfigured, webhookConfigured, liveReady: mode === 'live' && credentialsConfigured }
}
