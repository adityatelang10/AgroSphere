# AgroSphere Technical Debt

This backlog records issues identified during the Task 1 repository audit. They are intentionally outside Task 2 and remain unresolved until separate tasks are approved.

## Security

- Authenticate Socket.IO connections instead of trusting a client-supplied user ID.
- Protect and rate-limit the Gemini endpoint, and reject client-provided system instructions.
- Review CSRF protection, security headers, error exposure, and authentication rate limits.

## Existing product flows

- Add an administrator role through a protected bootstrap flow, not public registration.
- Implement farmer profile management, crop edit/delete, review/reply UI, payment processing, pagination, order cancellation/refunds, and persistent notifications.
- Scope browser cart storage to the signed-in customer and handle stale/deleted listings.
- Replace client-side filtering of all crops with farmer-scoped and paginated APIs.
- Preserve historical order/review data when crop listings are deleted.
- Add payment-aware revenue reporting and order delivery timestamps/history.

## Reliability and repository maintenance

- Evaluate MongoDB transactions for checkout only after confirming replica-set support.
- Add automated backend, frontend, API integration, and failure-isolation tests.
- Remove already-tracked frontend `node_modules` in a dedicated maintenance commit.
- Add project documentation, CI, linting, and environment examples for every service.

## Future intelligence modules

- Crop Recommendation, Leaf Disease Detection, Smart Irrigation, Market Intelligence, the Decision Engine, and the Farmer Intelligence Dashboard are not implemented in Task 2.
- Future predictions must record input provenance, units, model version, confidence, data freshness, and whether any input is demo or fallback data.
