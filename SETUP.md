# SnackShop setup

1. Install Node.js, then run `npm install`.
2. Copy `.env.example` to `.env.local` and set the `VITE_FIREBASE_*` values for the Firebase project you intend to use. Local `.env` files are ignored by Git.
3. Enable Google sign-in, Firestore, and Storage in that Firebase project. Grant the intended shop owner the `admin` role in their `users/{uid}` document.
4. Run `npm run dev` for the frontend or `npm run build` to check a production build.
5. Configure `FIREBASE_SERVICE_ACCOUNT`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` in the server hosting environment for payment endpoints. Keep these values out of the repository and frontend environment.

The local Firebase project alias is `snackshop-bfaf4`. Its Firestore security rules match the rules already active in that project. Review `firestore.indexes.json` against existing indexes before deploying it. The `/preview` and `/admin-preview` routes run only in development and use sample data.
