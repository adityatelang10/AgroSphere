# Farmer input audit and safe autofill

## Scope and source boundaries

This pass audits the farmer pages, profile components, listing creation, weather
controls, Copilot/chat and order controls. It changes data-entry assistance, not
training, inference, irrigation calculations, decision scoring, price models,
checkout, order workflows or demo records.

Classification: **A** automatic/read-only; **B** suggested but editable;
**C** manual observation, declaration or deliberate action.
The table groups fields only when every named field has the same classification.

## Field-by-field audit

| Service | Field | Before | Now / class | Source | Editable? |
| --- | --- | --- | --- | --- | --- |
| Shared context | Farmer identity | Authenticated session | A, unchanged | Existing User/session on Node | No |
| Shared context | Selected listing | No cross-page selection | B, reused across farmer tools; a sole active listing is suggested, multiple listings require selection | Owner-scoped active MongoDB Crop records | Yes |
| Weather | Latitude, longitude | Repeated controls and global browser storage | B, account-scoped saved coordinates reused; already-granted device location may be obtained automatically | Browser geolocation or manually confirmed coordinates | Yes, Change location |
| Weather | Temperature, humidity, precipitation, wind, forecast | Existing live display | A, shared read-only result rather than independent page state | Existing Node Open-Meteo service | No (display) |
| Weather | Manual latitude, longitude fallback | Available independently per page | B, one shared manual fallback, retry and source label | Farmer-confirmed geographic point | Yes |
| Irrigation | Crop | Tomato default | B when an exact supported listing name matches; otherwise C/blank | Selected listing | Yes |
| Irrigation | Growth stage | Mid-season default | C, no assumed stage | Farmer's current observation | Yes |
| Irrigation | Soil reference profile | Silt default | C, no assumed soil | Farmer's actual soil knowledge | Yes |
| Irrigation | Soil moisture (% volumetric) | Manual | C | Current measurement | Yes |
| Irrigation | Tmin, Tmax (°C) | Manual or explicit weather fill | B, automatically mapped after shared weather loads for the matching date/location | Open-Meteo daily minimum/maximum | Yes |
| Irrigation | Field latitude | Global saved coordinate/manual | B, account's shared coordinate | Saved/device/manual location | Yes |
| Irrigation | Observation date | System date at module load | B, current date at form creation; provider's local date when weather fills untouched inputs | Device clock / weather location's date | Yes |
| Irrigation | Rain since moisture reading (mm) | Default 0 | C, blank until explicitly entered | Farmer measurement covering this exact interval | Yes |
| Irrigation | Expected rainfall, next 24 hours (mm) | Default 0 / explicit weather fill | B when all 24 hourly values are available; otherwise C/blank | Existing Node weather mapping | Yes |
| Irrigation | Days since last irrigation | Manual | C | Farmer watering history | Yes |
| Crop Advisor | N, P, K | Manual dataset-scale values | C | Real soil inputs; no saved soil-test source exists | Yes |
| Crop Advisor | Soil pH | Manual | C | Soil test; no saved source exists | Yes |
| Crop Advisor | Temperature (°C), humidity (%), rainfall (mm) | Manual | C; explanation added, today's weather deliberately not inserted | Farmer's planning inputs; dataset time window unspecified | Yes |
| Disease Detection | Leaf image | Upload only | C, unchanged | Actual farmer-selected image | Yes |
| Disease Detection | Crop, condition | Model output | A, unchanged; no duplicate crop selector exists | disease-v1 / existing OOD guard | No |
| Decision Engine | Selected crop | Tomato default | B, supported selected listing, otherwise C/blank | Selected active listing | Yes |
| Decision Engine | Available quantity, unit | 0 / kg defaults | B, stock and unit of the selected matching listing; explicit confirmation that this is the produce being assessed | Stored current stock, not an inferred harvest | Yes |
| Decision Engine | Farm state (growing / harvest-ready / harvested) | Growing default | C/blank | Farmer's actual lifecycle stage, not geographic state | Yes |
| Decision Engine | Water availability | Adequate default | C/blank | Actual current water access | Yes |
| Decision Engine | Storage available | No default | C/blank | Actual storage availability | Yes |
| Decision Engine | Current sale price | Optional manual | C, unchanged | Farmer's actual realizable price in the selected quantity unit | Yes |
| Decision Engine | Transport cost, storage cost, other cost | 0 defaults | C, explicit values; enter 0 only when truly zero | Actual farmer-entered costs | Yes |
| Decision Engine | Latest disease, irrigation, planning, market and inventory evidence | Already loaded by Node | A, existing owner/crop lookup and freshness handling retained | Saved MongoDB records; planning remains planning only | No, use original module for new evidence |
| Latest mandi reports | State | Karnataka default | B from selected listing or profile; blank when unknown | Crop.location, then FarmerProfile.location | Yes |
| Latest mandi reports | District | First reported district | B only on exact matching reported state/district, otherwise C | Context matched against actual returned reports | Yes |
| Latest mandi reports | Commodity | First reported commodity | B only when selected crop matches returned commodity in the selected district/market | Selected listing + report options | Yes |
| Latest mandi reports | Market | First reported market | B only if a single matching market is available; otherwise C | Actual snapshot options, not a guessed farm sale location | Yes |
| Historical Market Intelligence | Crop | Tomato default | B if one of the three supported archive crops matches, otherwise C | Selected listing | Yes |
| Historical Market Intelligence | Historical market/variety | Fixed crop-specific archive | B, same supported archive for the selected crop; never replaced by farmer location | Existing historical dataset, through 30 June 2021 | Yes among available options; variety display is read-only |
| Historical Market Intelligence | Quantity in quintals | Manual | B from matching listing stock only for kg, gram or quintal; C for other units | Exact mass conversion | Yes |
| Historical Market Intelligence | Expected sale price | Manual | C, unchanged | Farmer expectation, not AGMARKNET modal price | Yes |
| Historical Market Intelligence | Transport, storage, other costs | 0 defaults / blanks treated as 0 | C, explicit cost or deliberate 0 required | Farmer | Yes |
| What-If | Decision crop | Tomato default | B from supported current listing, otherwise C | Selected listing | Yes |
| What-If | Baseline farm state, quantity/unit, water, storage, optional price, three costs | Saved baseline already reused | B, existing snapshot baseline retained; hypothetical edits remain explicit | Latest crop-matching DecisionSnapshot | Yes except fixed quantity unit |
| Add Crop | Farmer identity / farm ownership | Backend-assigned | A, unchanged, no identity textbox added | Session -> FarmerProfile | No |
| Add Crop | Name | Blank | B from selected listing, reviewed as a new batch name | Selected listing | Yes |
| Add Crop | District, state | Blank | B from selected listing location, otherwise farm profile | Stored location | Yes |
| Add Crop | Category, unit, season | Existing manual selectors with UI defaults | C, existing choices retained; not labelled as measured farm facts | Farmer choice | Yes |
| Add Crop | Description, actual new-batch stock, selling price | Manual | C, unchanged | Farmer | Yes |
| Add Crop | Harvest date | Optional manual | C, unchanged, no invented harvest date | Actual farmer-entered date | Yes |
| Add Crop | Organic declaration | Optional unchecked declaration | C, unchanged | Farmer's explicit declaration, not certification | Yes |
| Add Crop | Images / preview / remove selection | Manual | C, unchanged | Farmer-selected files | Yes |
| Profile | Name, role, email, member date, farm name/location | Stored read-only display | A; shared farm profile replaces duplicate fetch | Existing User and FarmerProfile | No new editing controls |
| Profile | Bio | Existing stored text prefilled | B, unchanged editing; writes update shared context | FarmerProfile.bio | Yes |
| Profile | Profile photo / gallery additions and removals | Stored previews + manual choice | A for stored images; C for changes, unchanged | User/FarmerProfile + selected files | Yes through existing controls |
| Customer delivery address, if user changes role | Saved line1/line2, village/city, district, state, PIN | Already prefilled | B, unchanged; never treated as farm location | User.deliveryAddress | Yes |
| Farmer orders | Status action | Explicit existing delivery workflow | C, unchanged | Farmer's real fulfilment event | Explicit action |
| My Crops / traceability | Listing selection, QR, removal | Stored listing + explicit actions | A for IDs/details; C for removal/copy/download | Existing crop records | No automatic removal |
| Farmer chat / Copilot | Search, message, prompt, speech | Manual intent | C, unchanged; no invented prompt or auto-send | Farmer intent | Yes |
| Farmer review replies | Reply text | Manual | C, unchanged | Farmer intent | Yes |
| Registration / login / recovery | Name, role, credentials, email, new password | Explicit input | C, unchanged; not farm measurements to infer | Account holder | Yes |

## Shared mechanism and priorities

- New read-only `GET /api/farmer/context` runs behind the existing authenticated
  FARMER middleware. It uses the session owner, not a supplied user/profile ID.
- It returns the existing own-profile fields and an allowlisted set of active
  listings (`removedAt: null`): ID, name, unit, stock, district/state, updatedAt.
  Gallery URLs/IDs support the existing manager; Cloudinary public IDs, credentials,
  contacts, password hashes, orders and AI histories are not returned here.
- FarmerContextProvider is keyed by authenticated user ID. On logout/account
  change its profile, selected crop and weather state are discarded.
- Existing farm-specific data would outrank more generic sources, but this schema
  has no saved field coordinates, soil tests, growing-field stages or watering log.
  We do not create those facts from an unlinked old analysis.
- Listing location wins over profile location. Coordinates are separate: device
  position is never labelled as confirmed farm location.
- A single listing can be suggested. Several listings require explicit selection;
  no alphabetical/latest-crop guess is made. Selection is shared during the login
  session and can be changed or cleared.
- Changes to bio/gallery update shared profile state. Adding/removing a listing
  refreshes context. The visible refresh control can reload stock/profile again.
- Suggestions show their source. Manual edits, including clearing a field, win
  over late data. If an untouched suggestion becomes unavailable it is cleared.
  Editing crop/unit clears incompatible quantity suggestions instead of converting
  or reusing an unrelated crop's quantity.
- Account-scoped browser storage preserves validated coordinates. Old unscoped
  coordinates are offered only through an explicit reuse action, not silently
  inherited by a different farmer.
- Already-granted browser geolocation can be reused; a new permission prompt
  requires clicking Use My Location. Device coordinates are rounded to six
  decimals, as in the existing implementation.
- Dashboard and irrigation share one weather state, in-flight request deduplication
  and a ten-minute cache with an absolute age (cache reads do not extend freshness).
  Calls still go React -> Node /api/weather -> existing Open-Meteo integration.
  Context reads time out after 15 seconds; weather reads after 20 seconds.
- The shared context is not proof of crop cultivation, a new forecast, or a new
  agronomic record. No background action saves CropRecommendation, DiseaseScan,
  IrrigationRecord, MarketAnalysis or DecisionSnapshot.

## Semantic substitutions deliberately refused

1. Crop Recommendation's local CSV and dataset documentation specify units but
   not a temperature/humidity averaging interval or rainfall accumulation period.
   The training pipeline consumes those raw columns; it does not transform today's
   observations into an equivalent planning/climate feature. Their being in °C,
   percent and mm is insufficient to establish equivalence. No current-weather
   autofill, invented seasonal average or weather-derived NPK/pH was added.
2. Irrigation's recent rainfall is rain **since the moisture measurement**, not
   current precipitation, today's daily total, yesterday's total or a forecast.
   It stays manual and no longer starts as an unobserved zero.
3. Weather for today/current coordinates does not describe a historical observation
   date or a manually different latitude. Those mismatches block weather mapping.
   Changing date/latitude clears untouched weather suggestions. Missing forecast
   data clears untouched values, not manual edits.
4. Listing stock is only offered as current inventory, not proof of new harvested
   quantity. New Add Crop stock remains blank. Pieces, dozens, bundles, packets and
   litres are not converted into quintals.
5. AGMARKNET wholesale prices and listing asking prices do not establish the
   farmer's actual realizable sale price. No price/cost/storage/water guess is made.
6. An old irrigation analysis is not a field registry: there is no plot/listing
   association proving that its moisture, soil type, stage or elapsed watering time
   belongs to the selected field now.
7. A Maize Crop Advisor recommendation remains future-crop planning evidence.
   It never replaces a current Tomato selection. Disease detection continues to
   infer crop/condition from the uploaded image without an unnecessary selector.

## Failure behaviour

- Profile/context errors show a retry control; normal manual form entry stays usable.
- Permission denial/unavailable geolocation offers manual coordinates.
- Weather failure clears the shared displayed weather, releases loading, and shows
  Retry / enter manually. Existing farmer-entered form values are not erased.
- Missing numeric data is never coerced to zero. Actual zero is preserved.
- A newer location request wins over an older response, including delayed device
  location. Unmounted/account-changed providers ignore late results.
- Mandi failures retain editable state and the existing explicit reload action.
  Missing reports do not create a fake district, market, commodity or price.
- A missing What-If baseline stays missing; scenarios are not invented.

## Existing architectural limitations (not silently refactored)

- FarmerProfile stores district/state, not coordinates or field/plot metadata.
  Device position must be checked against the real farm. No geocoding inference
  from a district name is attempted.
- AI evidence is associated with farmer/crop rather than a specific field/batch.
  Existing decision freshness and planning-only rules are retained.
- The existing Decision Engine inventory evidence loader predates soft removal
  and still describes inventory status conservatively. Its scoring/query semantics
  were not changed in this input-assistance task. New form-prefill context itself
  explicitly excludes removed listings.
- Stock suggestions are a fetched snapshot, not a reservation. Refresh and verify
  before using them; existing server-side checkout stock validation is unchanged.
- Directly editing a bio/gallery still uses the existing endpoints. No profile,
  listing or AI schemas were added or migrated.

## Verification and manual checks

Automated tests use isolated provider/database doubles; they never create demo
records. They exercise real Express/RBAC/DTO handling and actual React form/hook
code, source matching, manual override protection, missing values, unit conversion,
request races, cache expiry, permissions and errors.

Run:

```powershell
cd "C:\Users\adity\OneDrive\Desktop\AgroSphere\backend"
node --test --test-isolation=none tests/*.test.js
cd "..\frontend"
node --test --test-isolation=none scripts/*.test.mjs
npm run build
```

Read-only browser checklist after FARMER login at http://localhost:5173/login:

1. Dashboard: choose an active listing (if several), confirm source labels and farm
   location, then use already-saved location or explicitly request device location.
2. Irrigation: navigate via app links; crop and shared latitude should carry across.
   On weather success, verify Tmin/Tmax, next-24h forecast and date. Recent rain,
   moisture, stage, soil type and days since irrigation must remain manual.
3. Change Tmin, leave forecast blank deliberately, then refresh weather: neither
   manual edit should be overwritten. Pick a historical date: current weather
   must not be applied. No analysis submission is needed to verify prefilling.
4. Market Intelligence: check profile/listing state; explicitly load reports.
   Matching district/commodity should be suggested only if reported. Select a
   market when several match. Actual sale price/cost fields remain manual.
5. Decision Engine: check selected crop and stored stock/unit, existing disease/
   irrigation evidence display, and empty real-world water/storage/cost inputs.
   Do not generate a decision merely to check autofill.
6. Add Crop: check name/location suggestions, but empty new-batch quantity, price,
   harvest date and image selections. Do not save a throwaway listing.
7. Crop Advisor: all seven inputs remain manual; read the semantic warning.
   Disease Scanner still asks only for an image.
8. What-If: the selected crop loads only a real saved baseline; no baseline means
   no scenario form. Profile bio/gallery should still show stored values.
9. Deny location permission or make the weather request unavailable: manual entry
   and retry should remain possible. Test a second farmer/account to check isolation.

Useful routes: /farmer/dashboard, /farmer/irrigation-advisor,
/farmer/market-intelligence, /farmer/decision-engine, /farmer/crops/new,
/farmer/crop-recommendation, /farmer/disease-detection, /farmer/what-if-simulator,
/profile.

## Changed file inventory

New:

- FARM_INPUT_AUDIT.md — this audit, source boundaries and verification guide.
- backend/src/controllers/farmContextController.js — read-only own farm/listing DTO.
- backend/tests/farmContext.test.js — authentication, ownership, privacy and failure tests.
- frontend/src/context/FarmContext.jsx — shared account-scoped farm/weather context.
- frontend/src/hooks/useEditablePrefill.js — safe suggestions and manual-edit protection.
- frontend/src/utils/farmContext.js — exact crop matching, quantities, date and device location.
- frontend/src/utils/mandiContext.js — context matching against real returned report choices.
- frontend/src/components/profile/FarmContextSelector.jsx — shared selection and source labels.
- frontend/src/components/weather/FarmWeatherControls.jsx — shared weather/location controls.
- frontend/scripts/farmContext.test.mjs — form, context, failure and asynchronous regression tests.

Modified:

- backend/src/routes/farmerRoutes.js — register authenticated FARMER context read.
- frontend/src/main.jsx — install shared provider inside existing auth scope.
- frontend/src/utils/weatherLocation.js — optional account-specific storage keys.
- frontend/src/services/weatherService.js — forward request options for bounded timeouts.
- frontend/src/components/weather/DashboardWeatherCard.jsx — reuse shared controls.
- frontend/src/components/weather/IrrigationWeatherAssist.jsx — reuse shared controls.
- frontend/src/components/market/LatestMandiPricePanel.jsx — real contextual state/district/commodity defaults.
- frontend/src/pages/farmer/FarmerDashboardPage.jsx — context selection beside weather.
- frontend/src/pages/farmer/SmartIrrigationPage.jsx — safe weather/crop suggestions, no invented field observations.
- frontend/src/pages/farmer/DecisionEnginePage.jsx — contextual crop/stock/unit, explicit unknown real-world inputs.
- frontend/src/pages/farmer/MarketIntelligencePage.jsx — matching crop/archive/mass quantity; explicit costs.
- frontend/src/pages/farmer/WhatIfSimulatorPage.jsx — contextual crop, unchanged saved-baseline rules.
- frontend/src/pages/farmer/AddCropPage.jsx — editable name/location suggestions; refresh after save.
- frontend/src/pages/farmer/FarmerCropsPage.jsx — invalidate context after successful existing removal action.
- frontend/src/pages/farmer/CropRecommendationPage.jsx — explain why its seven inputs stay manual.
- frontend/src/pages/profile/ProfilePage.jsx — consume shared profile and retry without duplicating reads.

No packages, environment variables, schemas, training artifacts or migrations added.

## Verification result

- Backend: 296 tests passed, including four new context route tests.
- Frontend: 164 tests passed, including nineteen new form/context tests.
- Frontend production build passed; Vite still reports the main chunk above 500 kB.
- Local Node startup and MongoDB connection succeeded.
- Live browser navigation reached Login, not an authenticated farmer page. Real
  account autofill, actual device permission and live provider UI checks remain
  manual; automated tests are not claimed as those checks.
- No analysis, listing, order or other demo-data submission was performed.
- No commit or push performed.
