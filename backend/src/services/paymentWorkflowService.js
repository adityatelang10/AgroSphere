const PaymentAttempt = require("../models/PaymentAttempt");
const {
  CheckoutError,
  buildCheckoutQuote,
  finalizeCheckout,
} = require("./checkoutService");
const {
  PaymentServiceError,
  PaymentVerificationError,
  createRazorpayClient,
  validateCapturedPayment,
  validatePaidGatewayOrder,
  verifyRazorpaySignature,
} = require("./razorpayService");

const safeFailureReason = (error) =>
  String(error?.code || error?.message || "Payment attempt failed").slice(0, 300);

const createPaymentWorkflow = ({
  PaymentAttemptModel = PaymentAttempt,
  checkoutQuoteBuilder = buildCheckoutQuote,
  checkoutFinalizer = finalizeCheckout,
  razorpayClient = createRazorpayClient(),
  now = () => new Date(),
} = {}) => {
  const finalizedResponse = (attempt) => ({
    success: true,
    message: "Test payment verified and order placed successfully.",
    idempotent: true,
    payment: {
      provider: "razorpay",
      mode: "test",
      status: "VERIFIED",
      paymentReference: attempt.razorpayPaymentId,
      amountInr: attempt.amountPaise / 100,
      currency: attempt.currency,
      paidAt: attempt.verifiedAt,
    },
    orderIds: (attempt.finalOrderIds || []).map(String),
  });

  const createPaymentAttempt = async ({ customer, items, deliveryAddress }) => {
    const configuration = razorpayClient.getConfiguration();
    const quote = await checkoutQuoteBuilder({ items, deliveryAddress });
    const attempt = await PaymentAttemptModel.create({
      customer,
      provider: "razorpay",
      mode: "test",
      status: "CREATED",
      amountPaise: quote.amountPaise,
      subtotalPaise: quote.subtotalPaise,
      deliveryChargePaise: quote.deliveryChargePaise,
      currency: quote.currency,
      itemsSnapshot: quote.itemsSnapshot,
      deliverySnapshot: quote.deliverySnapshot,
    });

    try {
      const gatewayOrder = await razorpayClient.createOrder({
        amountPaise: quote.amountPaise,
        receipt: `ags_${String(attempt._id)}`.slice(0, 40),
      });

      attempt.razorpayOrderId = gatewayOrder.id;
      await attempt.save();

      return {
        success: true,
        paymentAttemptId: String(attempt._id),
        provider: "razorpay",
        mode: "test",
        razorpay: {
          keyId: configuration.keyId,
          orderId: gatewayOrder.id,
          amount: quote.amountPaise,
          currency: "INR",
        },
        display: {
          subtotalInr: quote.subtotalPaise / 100,
          deliveryChargeInr: quote.deliveryChargePaise / 100,
          amountInr: quote.amountPaise / 100,
          items: quote.itemsSnapshot.map((item) => ({
            cropId: String(item.crop),
            name: item.cropName,
            unit: item.unit,
            quantity: item.quantity,
            unitPriceInr: item.priceAtOrder,
            lineTotalInr: item.lineAmountPaise / 100,
          })),
        },
      };
    } catch (error) {
      attempt.status = "FAILED";
      attempt.failureReason = safeFailureReason(error);
      await attempt.save();
      throw error;
    }
  };

  const verifyPaymentAttempt = async ({
    customer,
    paymentAttemptId,
    razorpayPaymentId,
    razorpayOrderId,
    razorpaySignature,
    io,
  }) => {
    const attempt = await PaymentAttemptModel.findOne({
      _id: paymentAttemptId,
      customer,
    });

    if (!attempt) {
      throw new PaymentVerificationError("Payment attempt not found.", 404);
    }

    if (attempt.status === "FINALIZED") {
      return finalizedResponse(attempt);
    }

    if (attempt.status === "FINALIZING") {
      throw new PaymentVerificationError(
        "Test payment verification is already being finalized. Please retry shortly.",
        409,
        "PAYMENT_FINALIZATION_IN_PROGRESS"
      );
    }

    if (attempt.status !== "CREATED") {
      throw new PaymentVerificationError(
        "This payment attempt cannot be finalized. Start a new test payment.",
        409,
        "PAYMENT_ATTEMPT_NOT_ACTIVE"
      );
    }

    if (!attempt.razorpayOrderId || razorpayOrderId !== attempt.razorpayOrderId) {
      throw new PaymentVerificationError("Payment order verification failed.");
    }

    const configuration = razorpayClient.getConfiguration();
    const signatureIsValid = verifyRazorpaySignature({
      storedOrderId: attempt.razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
      keySecret: configuration.keySecret,
    });

    if (!signatureIsValid) {
      throw new PaymentVerificationError("Payment signature verification failed.");
    }

    const [payment, gatewayOrder] = await Promise.all([
      razorpayClient.fetchPayment(razorpayPaymentId),
      razorpayClient.fetchOrder(attempt.razorpayOrderId),
    ]);

    const expected = {
      paymentId: razorpayPaymentId,
      orderId: attempt.razorpayOrderId,
      amountPaise: attempt.amountPaise,
    };
    validateCapturedPayment(payment, expected);
    validatePaidGatewayOrder(gatewayOrder, expected);

    let lockedAttempt;
    try {
      lockedAttempt = await PaymentAttemptModel.findOneAndUpdate(
        {
          _id: attempt._id,
          customer,
          status: "CREATED",
        },
        {
          $set: {
            status: "FINALIZING",
            razorpayPaymentId,
            verifiedAt: now(),
            failureReason: null,
          },
        },
        { new: true }
      );
    } catch (error) {
      throw new PaymentVerificationError(
        "This gateway payment is already linked to another attempt.",
        409,
        "DUPLICATE_GATEWAY_PAYMENT"
      );
    }

    if (!lockedAttempt) {
      const currentAttempt = await PaymentAttemptModel.findOne({
        _id: attempt._id,
        customer,
      });
      if (currentAttempt?.status === "FINALIZED") {
        return finalizedResponse(currentAttempt);
      }

      throw new PaymentVerificationError(
        "Test payment verification is already being finalized. Please retry shortly.",
        409,
        "PAYMENT_FINALIZATION_IN_PROGRESS"
      );
    }

    try {
      const finalization = await checkoutFinalizer({
        customer,
        paymentAttemptId: lockedAttempt._id,
        itemsSnapshot: lockedAttempt.itemsSnapshot,
        deliverySnapshot: lockedAttempt.deliverySnapshot,
        razorpayOrderId: lockedAttempt.razorpayOrderId,
        razorpayPaymentId,
        verifiedAt: lockedAttempt.verifiedAt,
        io,
      });

      lockedAttempt.status = "FINALIZED";
      lockedAttempt.finalOrderIds = finalization.orderIds;
      lockedAttempt.finalizedAt = now();
      await lockedAttempt.save();

      return {
        ...finalizedResponse(lockedAttempt),
        idempotent: false,
      };
    } catch (error) {
      lockedAttempt.status = "RECONCILIATION_REQUIRED";
      lockedAttempt.failureReason = safeFailureReason(error);
      await lockedAttempt.save();

      if (error instanceof CheckoutError) {
        throw error;
      }

      throw new CheckoutError(
        "Payment was verified, but the order could not be finalized. Manual reconciliation is required.",
        409,
        "RECONCILIATION_REQUIRED"
      );
    }
  };

  const cancelPaymentAttempt = async ({ customer, paymentAttemptId }) => {
    const cancelled = await PaymentAttemptModel.findOneAndUpdate(
      { _id: paymentAttemptId, customer, status: "CREATED" },
      {
        $set: {
          status: "CANCELLED",
          failureReason: "Checkout closed or payment was not completed",
        },
      },
      { new: true }
    );

    if (cancelled) {
      return { success: true, status: "CANCELLED" };
    }

    const attempt = await PaymentAttemptModel.findOne({
      _id: paymentAttemptId,
      customer,
    });
    if (!attempt) {
      throw new PaymentVerificationError("Payment attempt not found.", 404);
    }

    return { success: true, status: attempt.status };
  };

  return {
    cancelPaymentAttempt,
    createPaymentAttempt,
    verifyPaymentAttempt,
  };
};

const paymentWorkflow = createPaymentWorkflow();

module.exports = {
  PaymentServiceError,
  PaymentVerificationError,
  createPaymentWorkflow,
  ...paymentWorkflow,
};
