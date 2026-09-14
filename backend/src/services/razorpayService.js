const crypto = require("crypto");

const RAZORPAY_API_BASE_URL = "https://api.razorpay.com/v1";

class PaymentServiceError extends Error {
  constructor(message, statusCode = 502, code = "PAYMENT_SERVICE_ERROR") {
    super(message);
    this.name = "PaymentServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

class PaymentVerificationError extends Error {
  constructor(message, statusCode = 400, code = "PAYMENT_VERIFICATION_FAILED") {
    super(message);
    this.name = "PaymentVerificationError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const getRazorpayConfiguration = (environment = process.env) => {
  const keyId = String(environment.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(environment.RAZORPAY_KEY_SECRET || "").trim();
  const mode = String(environment.RAZORPAY_MODE || "").trim().toLowerCase();

  if (!keyId || !keySecret || !mode) {
    throw new PaymentServiceError(
      "Test payment gateway is not configured.",
      503,
      "PAYMENT_NOT_CONFIGURED"
    );
  }

  if (mode !== "test" || !keyId.startsWith("rzp_test_")) {
    throw new PaymentServiceError(
      "Only Razorpay Test Mode is supported by this AgroSphere prototype.",
      503,
      "UNSUPPORTED_PAYMENT_MODE"
    );
  }

  return { keyId, keySecret, mode: "test" };
};

const verifyRazorpaySignature = ({
  storedOrderId,
  paymentId,
  signature,
  keySecret,
}) => {
  const normalizedSignature = String(signature || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedSignature)) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${storedOrderId}|${paymentId}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const receivedBuffer = Buffer.from(normalizedSignature, "hex");

  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
};

const validateCapturedPayment = (payment, expected) => {
  if (!payment || payment.id !== expected.paymentId) {
    throw new PaymentVerificationError("Payment identity verification failed.");
  }

  if (payment.order_id !== expected.orderId) {
    throw new PaymentVerificationError("Payment order verification failed.");
  }

  if (payment.amount !== expected.amountPaise) {
    throw new PaymentVerificationError("Payment amount verification failed.");
  }

  if (payment.currency !== "INR") {
    throw new PaymentVerificationError("Payment currency verification failed.");
  }

  if (payment.status !== "captured" || payment.captured !== true) {
    throw new PaymentVerificationError(
      "Payment is not captured. The marketplace order has not been finalized.",
      409,
      "PAYMENT_NOT_CAPTURED"
    );
  }

  return true;
};

const validatePaidGatewayOrder = (gatewayOrder, expected) => {
  if (!gatewayOrder || gatewayOrder.id !== expected.orderId) {
    throw new PaymentVerificationError("Gateway order identity verification failed.");
  }

  if (gatewayOrder.amount !== expected.amountPaise) {
    throw new PaymentVerificationError("Gateway order amount verification failed.");
  }

  if (gatewayOrder.currency !== "INR") {
    throw new PaymentVerificationError("Gateway order currency verification failed.");
  }

  if (gatewayOrder.status !== "paid") {
    throw new PaymentVerificationError(
      "Gateway order is not paid. The marketplace order has not been finalized.",
      409,
      "GATEWAY_ORDER_NOT_PAID"
    );
  }

  return true;
};

const createRazorpayClient = ({
  fetchImplementation = global.fetch,
  environment = process.env,
  apiBaseUrl = RAZORPAY_API_BASE_URL,
  timeoutMs = 8000,
} = {}) => {
  if (typeof fetchImplementation !== "function") {
    throw new Error("A fetch implementation is required for Razorpay integration.");
  }

  const request = async (path, options = {}) => {
    const configuration = getRazorpayConfiguration(environment);
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetchImplementation(`${apiBaseUrl}${path}`, {
        ...options,
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(
            `${configuration.keyId}:${configuration.keySecret}`
          ).toString("base64")}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
        signal: abortController.signal,
      });

      const rawText = await response.text();
      let payload = {};
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch (error) {
          throw new PaymentServiceError(
            "Test payment service returned an invalid response.",
            502,
            "INVALID_GATEWAY_RESPONSE"
          );
        }
      }

      if (!response.ok) {
        throw new PaymentServiceError(
          "Test payment service is temporarily unavailable. Your cart has not been converted into a paid order.",
          response.status >= 500 ? 503 : 502,
          "GATEWAY_REQUEST_FAILED"
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof PaymentServiceError) {
        throw error;
      }

      throw new PaymentServiceError(
        "Test payment service is temporarily unavailable. Your cart has not been converted into a paid order.",
        503,
        "GATEWAY_UNAVAILABLE"
      );
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    getConfiguration: () => getRazorpayConfiguration(environment),
    createOrder: async ({ amountPaise, receipt }) => {
      const order = await request("/orders", {
        method: "POST",
        body: JSON.stringify({
          amount: amountPaise,
          currency: "INR",
          receipt,
          notes: {
            application: "AgroSphere",
            mode: "test",
          },
        }),
      });

      if (
        !String(order.id || "").startsWith("order_") ||
        order.amount !== amountPaise ||
        order.currency !== "INR"
      ) {
        throw new PaymentServiceError(
          "Test payment service returned an invalid order.",
          502,
          "INVALID_GATEWAY_ORDER"
        );
      }

      return order;
    },
    fetchPayment: (paymentId) =>
      request(`/payments/${encodeURIComponent(paymentId)}`, { method: "GET" }),
    fetchOrder: (orderId) =>
      request(`/orders/${encodeURIComponent(orderId)}`, { method: "GET" }),
  };
};

module.exports = {
  PaymentServiceError,
  PaymentVerificationError,
  RAZORPAY_API_BASE_URL,
  createRazorpayClient,
  getRazorpayConfiguration,
  validateCapturedPayment,
  validatePaidGatewayOrder,
  verifyRazorpaySignature,
};
