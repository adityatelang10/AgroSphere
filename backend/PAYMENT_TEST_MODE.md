# Razorpay Test-Mode Payment Flow

AgroSphere uses Razorpay Standard Checkout in **test mode only**. No real money,
farmer settlement, refunds, split payouts, or live gateway credentials are part
of this academic prototype.

## Configuration

Add these values to `backend/.env` using credentials generated from the Razorpay
Dashboard while it is in Test Mode:

```ini
RAZORPAY_KEY_ID=rzp_test_replace_me
RAZORPAY_KEY_SECRET=replace_me
RAZORPAY_MODE=test
```

The Key ID is returned to the authenticated customer only as part of the
sanitized Checkout configuration. The Key Secret remains on Node and must never
be added to React, Git, screenshots, logs, or API responses. Missing credentials
disable only the payment action; they do not prevent Node from starting.

## Request flow

1. React sends crop IDs, quantities, and the delivery address to Node.
2. Node reloads the Crop records and calculates the canonical INR amount.
3. Node stores a `PaymentAttempt`, creates a Razorpay Order in paise, and stores
   its gateway order ID.
4. React opens Razorpay Standard Checkout. AgroSphere never collects card, CVV,
   UPI PIN, banking password, or OTP values.
5. The success callback is sent to Node for verification; it is not treated as
   proof of payment by React.
6. Node verifies the HMAC using the server-stored gateway order ID, then fetches
   both the Razorpay Payment and Razorpay Order.
7. Node requires exact IDs, amount and INR currency, plus a captured Payment and
   paid Order, before rechecking stock and creating seller Orders.
8. One customer payment can create multiple farmer Orders. The same verified
   payment references those seller Orders; this is not a claim of farmer payout.

The existing `/api/orders/checkout` route no longer creates unpaid Orders. It
returns a safe error directing the customer through the test-payment workflow.

## Capture setting

Configure automatic capture for test payments in the Razorpay Dashboard. An
`authorized` payment is deliberately not fulfilled by AgroSphere; the backend
requires `status: captured` and `captured: true`.

## Failure and recovery limits

- Checkout dismissal or gateway failure leaves the cart and stock unchanged.
- Signature, identity, amount, currency, or capture mismatches create no Order.
- Inventory is validated again after payment verification. If inventory changed,
  the attempt becomes `RECONCILIATION_REQUIRED` and needs manual review.
- Order creation still uses the project's existing compensating rollback rather
  than a MongoDB multi-document transaction.
- Production deployments should additionally use Razorpay webhooks for
  asynchronous reconciliation.
- Refunds, webhooks, live payments, and farmer settlements are future scope.

## Official references

- Standard Checkout integration: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- Create an Order: https://razorpay.com/docs/api/orders/create/
- Fetch a Payment: https://razorpay.com/docs/api/payments/fetch-with-id/
- Payment capture settings: https://razorpay.com/docs/payments/payments/capture-settings/
- Test and Live modes: https://razorpay.com/docs/payments/dashboard/test-live-modes/
- API keys: https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/
