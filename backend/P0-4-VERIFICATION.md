# P0-4 verification report

Completed 2026-09-13 in `C:\Users\adity\OneDrive\Desktop\AgroSphere`. Scope: Decision Engine irrigation evidence freshness and Dashboard stale saved-decision handling only.

## A-C. Root cause, timestamp rule, and legacy fallback

`loadLatestEvidence` previously classified IrrigationRecord recency using `createdAt`. The actual field is `inputs.observationDate`, a required Mongoose Date supplied by the farmer’s Observation date input. Saving an old observation today therefore incorrectly made it fresh.

`getIrrigationRecency` now uses `inputs.observationDate`. It preserves `createdAt` separately for record creation display and the existing newer-record comparison. Normalized evidence includes `evidenceAt`, `timestampSource`, and `timestampIssue`, so the existing Mixed evidenceSnapshot preserves the resolved provenance on future decisions.

Only missing or null observation dates use `createdAt` as an explicit legacy fallback. A present but invalid observation does not fall back to a recent creation time. Future or invalid observation timestamps remain visible as unusable (`STALE`, `usedInScoring: false`, `ageHours: null`) with an explanatory note. Current Node ISO-date validation and the Python date schema do not reject future dates; neither validator nor the irrigation calculation was changed.

Date-only input is interpreted as UTC midnight, matching the existing YYYY-MM-DD-to-Mongoose-Date serialization. For example, 2026-09-13 resolves to 2026-09-13T00:00:00.000Z, independent of the server timezone. Full timestamps preserve their instant. There is no inferred local timezone or additional date library.

DiseaseScan and CropRecommendation have no separate observation fields in their actual models; their existing `createdAt` timestamp rules remain unchanged. The newest saved record selection also remains unchanged; this fix corrects its evidence age.

## D. Verified freshness windows

| Evidence | FRESH | OLDER | STALE |
| --- | --- | --- | --- |
| Disease | age <= 24 hours | 24 hours < age <= 7 days | age > 7 days |
| Irrigation | age <= 24 hours | 24 hours < age <= 72 hours | age > 72 hours |
| Crop recommendation | age <= 30 days | 30 days < age <= 90 days | age > 90 days |

Source: backend/src/config/decisionEngineConfig.js, unchanged. Tests cover both inclusive boundaries and one millisecond beyond them. Historical market evidence remains HISTORICAL_STALE and contributes zero current-market points.

## E-G. Before/after example and scoring impact

Example clock: 2026-09-13T12:00:00.000Z; observation: 2026-08-01; record created: 2026-09-13T12:00:00.000Z.

| Behavior | Timestamp used | Age | Result |
| --- | --- | --- | --- |
| Before | createdAt | 0 hours | FRESH, incorrectly eligible |
| After | inputs.observationDate | 1044 hours | STALE, excluded from current irrigation scoring |

The regression fixture for irrigate_today with high water stress scores 100 for fresh evidence and 94 for 48-hour-old usable evidence, preserving the existing weights. At 96 hours it has status INSUFFICIENT_EVIDENCE and null irrigation score. Candidate actions, factor arithmetic, hard constraints, tie priority, action codes, thresholds, market rules, and decision-v1 remain unchanged.

## H-I. Dashboard root cause and refresh logic

Previously, decisionNeedsRefresh was exactly newerEvidence.length > 0. It never reconsidered the lifetime of supporting evidence, so elapsed time alone could leave the saved action labeled LATEST_STORED_DECISION.

Dashboard refresh now has two sources:

1. Existing newer-evidence detection, unchanged. A newer saved crop recommendation, disease scan, irrigation record, market record, or inventory timestamp continues to request refresh.
2. Expired or unusable supporting disease/irrigation evidence established by the saved decision’s provenance.

The second rule is deliberately narrow. The winning SCORED candidate must contain a nonzero factor sourced from DiseaseScan or IrrigationRecord, and the corresponding saved evidence must have a source ID, be AVAILABLE, have usedInScoring=true, and have been FRESH or OLDER at decision time. It is not enough that a module record exists or another candidate mentioned it.

For that proven support, a missing current module record, expired evidence window, an invalid/future irrigation observation, or a now-unsupported/unusable matching record requests refresh. The same source ID allows an old irrigation snapshot to recover the actual observation time from current normalized evidence. A different source record is never substituted for the snapshot’s timestamp. When the original record is not the current one, known saved timestamp provenance remains usable for expiry; without it the legacy creation-time rule applies.

An empty latest-evidence result can establish that support is unavailable. A different current record alone does not prove deletion of the saved record. Snapshots lacking factor/evidence provenance remain readable and retain the existing newer-evidence behavior; no contribution is guessed from the action code. This rule does not attempt to reconstruct implicit dependencies or influences that only affected competing candidates.

The saved action, score, timestamp, and reasons remain visible. Expired support uses freshness.decision=DECISION_OUTDATED, decisionNeedsRefresh=true, and backend-derived decisionRefreshReasons plus the existing DECISION_REFRESH alert. Newer-only evidence retains NEW_EVIDENCE_AVAILABLE. The frontend displays “Saved Next Best Action,” “Decision may be outdated,” saved reasons, and “Regenerate Farm Decision.” It does not calculate evidence age.

Dashboard remains read-only aggregation: no DecisionSnapshot write or regeneration, no crop/disease/irrigation rerun, and no Gemini/FastAPI call was introduced.

## J-K. Historical market and crop planning exceptions

Market aging alone never requests refresh. Its intentional HISTORICAL_STALE state and zero contribution cannot qualify as supporting evidence. A newly saved market record still follows the pre-existing newer-record detection.

Crop Recommendation remains planning-only with zero current-action contribution. Its normal aging does not invalidate an unrelated action. Likewise, disease evidence that contributed no points to a winning irrigation action does not invalidate that action solely because it expires.

## L. Audit scenario

An actual evaluateDecision fixture produces CHECK_CROP_HEALTH using a supported disease scan. With no newer record, advance the clock eight days:

- Before the fix: decisionNeedsRefresh=false, LATEST_STORED_DECISION.
- After the fix: decisionNeedsRefresh=true, DECISION_OUTDATED.
- Reason: “Supporting disease evidence is stale.”
- Action remains visible with its original priority score. Prompt: “Regenerate Farm Decision using current evidence.”

## M. Files modified/created by P0-4

| File | Purpose |
| --- | --- |
| backend/src/services/decisionEngineService.js | Observation-based recency, legacy fallback, unusable timestamp handling, normalized provenance |
| backend/src/services/intelligenceDashboardService.js | Supporting-evidence expiry checks, refresh reasons/status, observation metadata |
| backend/tests/decisionEngineService.test.js | Eleven new freshness, boundary, scoring and shared What-If regressions |
| backend/tests/intelligenceDashboardService.test.js | Twelve new saved-decision provenance/expiry regressions |
| frontend/src/pages/farmer/FarmerDashboardPage.jsx | Backend-derived outdated-state labels, reasons, regenerate links, observation display |
| frontend/src/pages/farmer/DecisionEnginePage.jsx | Distinguish record save time from observation evidence time |
| backend/P0-4-VERIFICATION.md | This report |

FarmerDashboardPage.jsx already contained unrelated DashboardWeatherCard edits before this task; those were preserved. Other previously modified/untracked files in the repository were left as found.

## N. Tests added (23)

Decision Engine (11):

- Current observation is FRESH.
- 48-hour observation saved now is OLDER.
- 96-hour observation saved now is STALE.
- Missing legacy observation falls back explicitly.
- Null legacy observation falls back explicitly.
- Future observation is unusable with no negative age.
- Invalid present observation never falls back.
- Date-only input and Mongo Date agree across UTC, Asia/Kolkata, and America/Los_Angeles.
- Exact freshness boundaries remain inclusive for all three evidence types.
- Fresh/older/stale observations preserve score arithmetic and control eligibility.
- Shared What-If preview excludes stale irrigation in both scenarios.

Dashboard (12):

- Audit reproduction: supporting disease expires without any newer record.
- Supporting irrigation expires.
- Old irrigation snapshot recovers only the same source record’s observation timestamp.
- Historical market alone never expires a manual sale decision.
- Crop planning aging does not invalidate an unrelated irrigation action.
- All supporting evidence remains usable, including OLDER evidence.
- Missing/deleted supporting record is handled safely.
- Now-unsupported supporting disease is handled safely.
- Unrelated stale disease with zero winning-action contribution does not invalidate irrigation.
- Evidence missing at decision time is not mistaken for expired support.
- Legacy snapshots without provenance remain readable.
- No saved decision preserves existing missing-decision behavior.

The existing newer-disease-evidence test remains passing.

## O-R. Verification results

| Check | Command | Result |
| --- | --- | --- |
| Backend (baseline 98) | node --test tests/*.test.js | PASS: 121 passed, 0 failed, 0 skipped |
| Python (baseline 20) | .\.venv\Scripts\python.exe -B -m unittest discover -s tests -v | PASS: 20 passed |
| Frontend | npm run build | PASS: 200 modules compiled |
| What-If | Included in full backend run | PASS: all 9 existing tests plus 1 new shared-preview regression |
| Scoped diff validation | git diff --check -- <six changed code/test files> | PASS: no whitespace errors |

The initial sandboxed Node run could not spawn test workers (EPERM); the authorized execution outside that restriction passed. One added test initially referenced baseDecision/simulatedDecision rather than the existing response fields baseScenario/simulatedScenario; the test was corrected, with no What-If implementation change.

P0-1 Socket.IO authentication (20 tests), P0-2 public crop privacy (15 tests), and P0-3 irrigation Python regressions remain passing. No new dependencies were installed.

## S-T. Database, services, and scope

No model/schema changes, migration, or database writes were made. Optional live database/account checks were not performed; deterministic synthetic tests verify aggregation, saved-action preservation, and response serialization. No application server was started or left running for this task; test servers terminate with the completed test suite.

The P0-4 diff contains only the six code/test changes and this report. Scoring configuration and What-If implementation are unchanged. P0-5 and other audit items were not started. Existing weather tests ran only as part of the requested full regression suite.

No commit and no push. HEAD: 2a549df7f891d4373821518bc1babe7a27ad0b33.

## U. Final git status --short

This is the full dirty-tree status, including changes already present before P0-4. The P0-4 file list above is the scoped change list.

```text
 M backend/.env.example
 M backend/package.json
 M backend/src/controllers/chatController.js
 M backend/src/controllers/cropController.js
 M backend/src/controllers/orderController.js
 M backend/src/index.js
 M backend/src/middleware/authMiddleware.js
 M backend/src/models/Crop.js
 M backend/src/models/Order.js
 M backend/src/routes/cropRoutes.js
 M backend/src/routes/orderRoutes.js
 M backend/src/services/decisionEngineService.js
 M backend/src/services/geminiService.js
 M backend/src/services/intelligenceDashboardService.js
 M backend/tests/decisionEngineService.test.js
 M backend/tests/intelligenceDashboardService.test.js
 M frontend/package-lock.json
 M frontend/package.json
 M frontend/src/App.jsx
 M frontend/src/components/GeminiChatWidget.jsx
 M frontend/src/context/CartContext.jsx
 M frontend/src/hooks/useNotifications.js
 M frontend/src/pages/customer/CartPage.jsx
 M frontend/src/pages/customer/OrdersPage.jsx
 M frontend/src/pages/farmer/AddCropPage.jsx
 M frontend/src/pages/farmer/DecisionEnginePage.jsx
 M frontend/src/pages/farmer/FarmerCropsPage.jsx
 M frontend/src/pages/farmer/FarmerDashboardPage.jsx
 M frontend/src/pages/farmer/FarmerOrdersPage.jsx
 M frontend/src/pages/farmer/SmartIrrigationPage.jsx
 M frontend/src/pages/marketplace/CropDetailsPage.jsx
 M frontend/src/services/cropService.js
 M frontend/src/utils/cartCalculations.js
 M ml-service/app/services/irrigation_advisor.py
 M ml-service/tests/test_irrigation_engine.py
?? backend/P0-4-VERIFICATION.md
?? backend/PAYMENT_TEST_MODE.md
?? backend/WEATHER_DATA.md
?? backend/src/config/agroSphereCopilotContext.js
?? backend/src/controllers/paymentController.js
?? backend/src/controllers/traceabilityController.js
?? backend/src/controllers/weatherController.js
?? backend/src/middleware/socketAuthMiddleware.js
?? backend/src/models/PaymentAttempt.js
?? backend/src/routes/paymentRoutes.js
?? backend/src/routes/traceabilityRoutes.js
?? backend/src/routes/weatherRoutes.js
?? backend/src/services/checkoutService.js
?? backend/src/services/paymentWorkflowService.js
?? backend/src/services/razorpayService.js
?? backend/src/services/traceabilityService.js
?? backend/src/services/weatherService.js
?? backend/src/utils/authToken.js
?? backend/src/utils/publicCrop.js
?? backend/tests/geminiService.test.js
?? backend/tests/paymentCheckoutService.test.js
?? backend/tests/paymentWorkflow.test.js
?? backend/tests/publicCropPrivacy.test.js
?? backend/tests/socketAuth.test.js
?? backend/tests/traceabilityService.test.js
?? backend/tests/weatherService.test.js
?? frontend/scripts/
?? frontend/src/components/traceability/
?? frontend/src/components/weather/
?? frontend/src/pages/traceability/
?? frontend/src/services/paymentService.js
?? frontend/src/services/traceabilityService.js
?? frontend/src/services/weatherService.js
?? frontend/src/utils/loadRazorpayCheckout.js
?? frontend/src/utils/speechAssistant.js
?? frontend/src/utils/traceability.js
?? frontend/src/utils/weatherLocation.js
```
