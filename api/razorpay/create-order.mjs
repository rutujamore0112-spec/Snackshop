import Razorpay from "razorpay";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

function getFirebaseAdmin() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured");
  }

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT contains invalid JSON");
  }

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured");
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

async function getAuthenticatedUid(req) {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Missing authentication token");
  }

  const token = authHeader.slice(7);

  const decodedToken = await getAuth().verifyIdToken(token);

  return decodedToken.uid;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  // Expose each backend wait in the browser's Network panel without customer data.
  const timings = [];
  async function timed(name, operation) {
    const started = performance.now();
    try {
      return await operation();
    } finally {
      timings.push(`${name};dur=${(performance.now() - started).toFixed(1)}`);
      res.setHeader("Server-Timing", timings.join(", "));
    }
  }

  try {
    getFirebaseAdmin();

    const authenticatedUid = await timed("auth", () => getAuthenticatedUid(req));

    const { firestoreOrderId } = req.body || {};

    if (typeof firestoreOrderId !== "string" || !/^[A-Za-z0-9]{1,40}$/.test(firestoreOrderId)) {
      return res.status(400).json({
        error: "Invalid firestoreOrderId",
      });
    }

    const db = getFirestore();

    const orderRef = db.collection("orders").doc(firestoreOrderId);
    const orderSnap = await timed("order_read", () => orderRef.get());

    if (!orderSnap.exists) {
      return res.status(404).json({
        error: "Order not found",
      });
    }

    const order = orderSnap.data();

    if (order.userId !== authenticatedUid) {
      return res.status(403).json({
        error: "Unauthorized",
      });
    }

    if (!['razorpay', 'upi'].includes(order.paymentMethod)) {
      return res.status(400).json({
        error: "This is not a Razorpay order",
      });
    }

    if (order.status !== "draft") {
      return res.status(400).json({
        error: `Order cannot be paid from status: ${order.status}`,
      });
    }

    if (order.expiresAt?.toMillis?.() <= Date.now()) {
      return res.status(409).json({ error: "Order has expired" });
    }

    if (order.razorpayOrderId && Number.isSafeInteger(order.razorpayAmount)) {
      return res.status(200).json({
        keyId: process.env.RAZORPAY_KEY_ID,
        razorpayOrderId: order.razorpayOrderId,
        amount: order.razorpayAmount,
        currency: "INR",
        expiresAtMillis: order.expiresAt?.toMillis?.(),
      });
    }

    if (!Array.isArray(order.items) || order.items.length === 0) {
      return res.status(400).json({
        error: "Order has no items",
      });
    }

    for (const item of order.items) {
      if (
        !item.productId ||
        !Number.isInteger(item.qty) ||
        item.qty <= 0
      ) {
        return res.status(400).json({
          error: "Invalid order item",
        });
      }
    }

    // Read prices in a single batch instead of one network round trip per item.
    // Keep server-side price validation; never charge a client-supplied total.
    const productRefs = order.items.map(item =>
      db.collection("products").doc(item.productId)
    );
    const productSnaps = await timed("products_read", () =>
      db.getAll(...productRefs, { fieldMask: ["price"] })
    );

    let amountPaise = 0;

    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i];
      const productSnap = productSnaps[i];

      if (!productSnap.exists) {
        return res.status(400).json({
          error: `Product not found: ${item.productId}`,
        });
      }

      const product = productSnap.data();
      const price = Number(product.price);

      if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({
          error: `Invalid price for product: ${item.productId}`,
        });
      }

      const itemPaise = Math.round(price * 100);
      if (Math.round(Number(item.price) * 100) !== itemPaise) {
        return res.status(409).json({ error: "Product price changed; please retry checkout" });
      }
      amountPaise += itemPaise * item.qty;
    }

    if (!Number.isSafeInteger(amountPaise) || amountPaise < 100) {
      return res.status(400).json({
        error: "Order total must be at least 100 paise",
      });
    }

    if (amountPaise > 5000000) {
      return res.status(400).json({
        error: "Order total exceeds the allowed limit",
      });
    }

    if (Math.round(Number(order.total) * 100) !== amountPaise) {
      return res.status(409).json({ error: "Order total changed; please retry checkout" });
    }

    const razorpay = getRazorpay();

    const razorpayOrder = await timed("razorpay_order", () => razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: firestoreOrderId,
      notes: {
        firestoreOrderId,
        userId: authenticatedUid,
      },
    }));

    const expiresAtMillis = Date.now() + 15 * 60 * 1000;
    await timed("order_save", () => db.runTransaction(async transaction => {
      const current = await transaction.get(orderRef);
      if (!current.exists || current.data().status !== "draft" || current.data().userId !== authenticatedUid) {
        throw new Error("Order changed during payment setup");
      }
      if (current.data().razorpayOrderId) throw new Error("Razorpay order was already created");
      transaction.update(orderRef, {
        razorpayOrderId: razorpayOrder.id,
        razorpayAmount: amountPaise,
        razorpayCurrency: "INR",
        expiresAt: Timestamp.fromMillis(expiresAtMillis),
      });
    }));

    return res.status(200).json({
      keyId: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId: razorpayOrder.id,
      amount: amountPaise,
      currency: "INR",
      name: order.customerName || "Customer",
      expiresAtMillis,
    });
  } catch (error) {
    console.error("Razorpay create-order error:", error);

    if (
      error.message === "Missing authentication token" ||
      error.code === "auth/id-token-expired" ||
      error.code === "auth/argument-error" ||
      error.code === "auth/invalid-id-token"
    ) {
      return res.status(401).json({
        error: "Authentication failed",
      });
    }

    if (error.statusCode === 401 || error.statusCode === 403) {
      return res.status(401).json({ error: "Razorpay authentication failed" });
    }

    return res.status(error.message === "FIREBASE_SERVICE_ACCOUNT is not configured" || error.message === "Razorpay credentials are not configured" ? 503 : 500).json({
      error: error.message === "FIREBASE_SERVICE_ACCOUNT is not configured" || error.message === "Razorpay credentials are not configured" ? "Payment service is not configured" : "Unable to create Razorpay order",
    });
  }
}
