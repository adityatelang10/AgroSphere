# Local presentation database

The backend-only `MONGO_URI` in `backend/.env` chooses the database:

- Presentation: `mongodb://127.0.0.1:27017/agrosphere_demo`
- Original/fallback: `mongodb://127.0.0.1:27017/agrosphere`

Restart Node after changing this value. Log out/in when switching databases;
the old session belongs to the other database. Carts are account-scoped.
No replica-set conversion or payment-verification change is part of this task.

## Seed

From `backend`, set the process's `MONGO_URI` to the presentation URI, then run
`node scripts/seedDemoData.js`. The script refuses all other targets. It checks
the original database's content hashes and counts before/after, without writing
to it. A completed seed rerun preserves existing records/passwords. The explicit
`--reset-demo` option clears **only** the confirmed presentation database; do not
use it during a demo or without inspecting the existing demo records first.

Optional backend-process variables `DEMO_FARMER_PASSWORD` and
`DEMO_CUSTOMER_PASSWORD` supply valid passwords. Otherwise secure passwords are
generated and reported once, never embedded in source or saved in metadata.
Keep the output private; do not commit credentials. Passwords use User's normal
bcrypt save hook.

FastAPI and Cloudinary must be available before seeding. Disease inference uses
the actual held-out Tomato healthy fixture. Irrigation is a real irrigation-v1
calculation, but its field inputs are **illustrative**, not observed weather or
farm measurements. The decision engine uses those actual saved outputs. Inspect
`demo_seed_metadata` for provenance, fixture path and record identifiers.

Farm/customer identities, inventory, delivered order, review and conversation
are labelled presentation examples, not evidence of real trade or farm origin.
The delivered order has no gateway/payment fields. No successful Razorpay
payment or PaymentAttempt is manufactured. Review verification uses the real
delivered-order/customer/crop relationship within this demo database only.

Images are independently copied Cloudinary assets: removing a demo gallery
image cannot destroy original database assets. Mango has one available source
photo; no extra photographic views are fabricated. Harvest date stays unknown.
No crop recommendation, market analysis or What-If result is fabricated.

The current scanner/advisor pages show results from a new submission; saved
evidence is visible on Farm Intelligence. This task does not add history UI.
