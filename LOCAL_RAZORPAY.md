# Local Razorpay test checkout

This checkout is available only through Vite's local development server. It is not included in the Vercel production API.

1. In the Razorpay dashboard, switch to **Test Mode** and create test API keys.
2. Copy `.env.local.example` to `.env.local`.
3. Replace `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` with the test values. The key ID must start with `rzp_test_`.
4. Run `npm run dev` and open the localhost URL.
5. In checkout, choose **Razorpay test checkout**.

The local server creates the Razorpay order and verifies the returned HMAC signature. After a successful test payment, the existing SnackShop draft is submitted to the admin confirmation queue. Production continues to use the QR and cash flow until the server-side production integration, webhook handling, and live credentials are configured.
