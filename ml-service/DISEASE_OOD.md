# Disease scanner supported-domain guard

Final kNN comparison: **retain disease-ood-v1.1**. All six frozen kNN candidates
rejected 7/8 unrelated images, trading the building false acceptance for a rocket
false acceptance and additionally accepting solid black. See
[DISEASE_OOD_COMPARISON.md](DISEASE_OOD_COMPARISON.md) for validation-only frozen
thresholds, the fresh final rerun, artifact sizes, timings and latest regression totals.
The kNN reference is evaluation-only and is not loaded by the deployed service.

## Finalization status

The production classifier and guard artifacts, thresholds and API remain unchanged.
The generated kNN reference/candidate/comparison files and hardening diagnostic dump
are **ignored local research outputs**, not part of the final feature diff. No local
dataset, artifact or historical scan was deleted. The compact production evaluation
record (18,951 bytes) remains included for measured results and fixture provenance.

Permanent regression after cleanup: **45 Python**, **222 backend**, **46 frontend
helper** tests passed, all with zero failures/skips; QR decoder and frontend production
build passed. The ten artifact-dependent research tests moved to
`training/research_tests/test_disease_ood_knn.py`, outside permanent discovery. The
production validation-calibration test now extracts the 300 validation images itself
instead of reading an ignored diagnostic dump; its original threshold/count assertions
are preserved. No new experiment or classifier training was run during finalization.

The project owner has confirmed **manual FARMER browser verification complete** and
approved the feature release. This is user-reported verification, not a claim that
the earlier blocked browser automation succeeded. No browser uploads or live database
writes are repeated for the release. Automated controller tests verify rejected
requests make no DiseaseScan write and classified requests retain their existing
save behavior; those tests are not independent live-MongoDB measurements.

## Scope and root cause

The existing 15-class MobileNetV2 performs closed-set classification: logits ->
softmax -> argmax always selects a known class. Its confidence is conditional class
preference, not proof of a supported leaf. No `not_leaf` class has been invented.
No classifier retraining, class changes, new packages, or database migration were used.

The classifier stays `disease-v1`; the separate guard is now `disease-ood-v1.1`.
The unchanged classifier SHA-256 is
`7309566b0e13fc4abc83c15462cb5421119ca39a89281f5807b9b15e3955a841`.

## Algorithm and preprocessing

Images use the existing decoder/limits, RGB conversion, shorter-side resize to 176,
160 x 160 center crop, tensor conversion to [0,1], then ImageNet mean
`[0.485, 0.456, 0.406]` and standard deviation `[0.229, 0.224, 0.225]`.
No calibration/evaluation augmentation is applied.

The feature boundary matches [Torchvision MobileNetV2](https://docs.pytorch.org/vision/stable/_modules/torchvision/models/mobilenetv2.html):
`model.features -> adaptive_avg_pool2d(1,1) -> flatten`, a 1,280-element vector,
before `model.classifier` (dropout in evaluation mode, then the unchanged 15-output linear head).
Tests confirm the split forward path produces exactly the original logits.

1. L2-normalize each training embedding.
2. Compute one mean for each of the 15 training classes; normalize each centroid.
3. Score an image with minimum cosine distance to any centroid: `min(1 - dot(z,c))`.
4. Obtain the original head's softmax internally for the distance-gated confidence check.
5. Reject if distance > 0.3195909709599357 OR (distance > 0.30602748224511367 AND
   confidence < 0.9119687676429749). Equality is accepted at each boundary.
6. Return a diagnosis only for accepted images. Low confidence alone never rejects
   an image inside the secondary distance boundary.

Training embedding norms varied from 19.0698 to 44.9258 (median 28.3478), so raw
Euclidean magnitude was not used as a domain-membership signal. Normalized Euclidean
distance is `sqrt(2 * cosine distance)` and gives the same ranking; maximum measured
equivalence error was 5.55e-16. We chose the simpler cosine score, not an ensemble.

## Original distance calibration and validation-only hardening

The existing manifest/splits remain unchanged. File hashes, class order, duplicate
hash separation and leaf-group separation are checked. Centroids use 1,500 training
images (100/class); the threshold uses 300 validation images (20/class).
The 300 test images and unrelated images are not inputs to numeric threshold fitting.
However, hardening compared rule families on these same sets; the results are
exploratory selection evidence, not a fresh independent OOD benchmark.

Validation nearest-centroid distances (linear-interpolated descriptive quantiles):

| Minimum | Median | 95th percentile | 97th percentile | 99th percentile | Maximum |
|---|---|---|---|---|---|
| 0.116714 | 0.226750 | 0.295351 | 0.306001 | 0.312705 | 0.337896 |

Observed-order-statistic candidate thresholds (`np.quantile(..., method="higher")`):

| Target | Threshold | Accepted validation images |
|---|---|---|
| 95% | 0.29638474955002425 | 286/300 |
| 97% | 0.30602748224511367 | 292/300 |
| 99% (original/base rule) | **0.3195909709599357** | **298/300 (99.33%)** |

The conservative 99% target protects genuine moderate-confidence leaves and was
selected before test/OOD evaluation. The small difference between 99% and 99.33%
comes from the discrete inclusive order-statistic boundary, not a different metric.
This is empirical calibration, not a guaranteed coverage bound. The existing validation
split was also used to select the original classifier checkpoint, so it is not an
independent formal coverage study. The new secondary distance threshold is the
validation 97th percentile with `higher` interpolation: 0.30602748224511367. Six
baseline-accepted validation images exceed it. The fifth-lowest confidence among
those six (0.9119687676429749) defines a strict cutoff rejecting four extra validation
images. Final validation acceptance is **294/300 (98%)**.

`model_artifacts/disease_ood_metadata.npz` is 147,670 bytes: 15 x 1,280 float64
centroids, base/secondary distance thresholds, confidence cutoff, rule, versions, calibration statistics, class order,
preprocessing, classifier and manifest hashes. No images or training embeddings.
It is loaded once with `allow_pickle=False` and checked against the exact model,
class order, feature dimension and preprocessing. Missing/corrupt/mismatched artifacts
fail closed with disease HTTP 503; `/health` and the other ML services remain available.

## Measured evaluation (2026-09-16)

Complete machine-readable results, paths and source hashes are in
`model_artifacts/disease_ood_evaluation.json`.

- Original classifier: 268/300 correct = **89.33%**, unchanged historical baseline.
- Guard accepted: **289/300 (96.33%)**, versus 293/300 before hardening.
- False rejections: **11/300 (3.67%)** supported leaves: 3 Pepper, 1 Tomato Early
  Blight, 2 Tomato Late Blight, 1 Tomato Spider Mite, 1 Tomato Leaf Mold, 3 Tomato Septoria.
- Accepted-subset classification: **262/289 = 90.66%**. This is selection on a
  smaller subset, not an improvement to the classifier. Six previously correct and
  five previously incorrect test images were rejected. Correct accepted outcomes
  across all 300 images are 262/300 = 87.33%, with eleven abstentions.
- Moderate-confidence genuine Tomato Early Blight: **59.4619% confidence**, distance
  0.258826; accepted. Healthy Tomato, Potato and Bell Pepper demo leaves also pass.

Real unrelated-image convenience sample, all eight included without cherry-picking:

| Image/category | Distance | Guard result | Unguarded class / confidence |
|---|---:|---|---|
| Coffee cup | 0.383362 | Rejected | Tomato Late Blight / 46.38% |
| Brick wall | 0.502734 | Rejected | Tomato Healthy / 52.46% |
| Printed text | 0.461204 | Rejected | Potato Late Blight / 43.36% |
| Rocket/sky | 0.307277 | **Rejected after hardening** | Tomato Late Blight / 86.93% |
| Cat | 0.383815 | Rejected | Tomato Late Blight / 62.99% |
| Deep-field stars | 0.474480 | Rejected | Tomato Healthy / 70.62% |
| Building (`china.jpg`) | 0.273118 | **False accept** | Tomato Late Blight / 81.51% |
| Unsupported flower | 0.342058 | Rejected | Pepper Healthy / 32.32% |

**7/8 rejected (87.5%); 1/8 incorrectly accepted (12.5%).** This is not a population-level
OOD accuracy estimate. Numeric thresholds use validation statistics; the rule family
was selected through comparison on the reused OOD/test sets. Random
noise and black/white/green solid-color images were also rejected (4/4), reported
separately, not counted as real-image evidence.

The six scikit-image evaluation images live outside Git in
`C:\Users\adity\AppData\Local\Temp\agrosphere-disease-ood-20260916`.
Licenses/attribution were checked in the upstream
[sample descriptions](https://raw.githubusercontent.com/scikit-image/scikit-image/v0.25.2/skimage/data/_fetchers.py):
coffee (Rachel Michetti), cat (Stefan van der Walt), and brick texture are CC0;
printed text, NASA stars, and SpaceX rocket are documented public domain.
The two installed scikit-learn samples are CC BY 2.0, with attribution/source URLs
in `.venv/Lib/site-packages/sklearn/datasets/images/README.txt`.
No unrelated image was added to production assets or Git. No new image library installed.

## Hardening diagnostics and candidate comparison

The ignored local `model_artifacts/disease_ood_hardening.json` preserves all 608 original diagnostic
rows (300 validation, 300 test, eight OOD), fixture hashes/paths, nearest centroid,
top two classes/scores, margin, entropy, original status, numeric candidate thresholds
and the reviewed selection. It retains the original v1 guard hash; the separate
`disease_ood_evaluation.json` now records final v1.1 results. Only that compact
production evaluation record is included in Git; the larger diagnostic dump is
optional and can be regenerated with the research commands below. Production startup
and permanent tests do not require the dump.

Both false accepts had nearest centroid and top prediction `Tomato___Late_blight`:

| Image | Distance | Top confidence | Second confidence | Margin | Entropy (nats) |
|---|---:|---:|---:|---:|---:|
| Building | 0.273118 | 0.815068 | 0.066926 | 0.748142 | 0.813842 |
| Rocket/sky | 0.307277 | 0.869343 | 0.070920 | 0.798423 | 0.575299 |

Their confidence, margin and entropy overlap ordinary supported leaves. Building
distance is at validation percentile 86; rocket distance is at 97.67. The building
is not near the boundary, so tail hardening cannot safely target it.

Distance gates were predeclared at validation p90/p95/p97; each auxiliary threshold
is an observed validation order statistic allowing at most six total validation
rejections. No test/OOD values were used as numeric cutoffs.

| Rule | Validation accepted | Test accepted | OOD rejected | Building rejected | Rocket rejected |
|---|---:|---:|---:|---|---|
| A: original cosine only | 298/300 | 293/300 | 6/8 | No | No |
| B: distance + confidence, p90 gate | 294/300 | 290/300 | 6/8 | No | No |
| C: distance + margin, p90 gate | 294/300 | 290/300 | 6/8 | No | No |
| D: distance + entropy, p90 gate | 294/300 | 288/300 | 6/8 | No | No |
| B: distance + confidence, p95 gate | 294/300 | 291/300 | 6/8 | No | No |
| C: distance + margin, p95 gate | 294/300 | 291/300 | 6/8 | No | No |
| D: distance + entropy, p95 gate | 294/300 | 289/300 | 6/8 | No | No |
| **B: distance + confidence, p97 gate (selected)** | **294/300** | **289/300** | **7/8** | **No** | **Yes** |
| C: distance + margin, p97 gate | 294/300 | 289/300 | 7/8 | No | Yes |
| D: distance + entropy, p97 gate | 294/300 | 289/300 | 7/8 | No | Yes |

Confidence ties the other two signals and is simplest. Cost: four extra supported
test rejections (two previously correct). No claim of 8/8 rejection. A dominance
analysis shows that any of these monotone distance-AND-uncertainty families rejecting
the building would also reject at least 34-35/300 validation leaves, leaving at most
88.33-88.67% acceptance. Those bounds are diagnostics, not deployed OOD-derived cutoffs.
They do not prove that every conceivable rule or model must fail.

To reproduce diagnostic extraction/comparison without overwriting the original
hardening report, use a separate output path:

```powershell
cd "C:\Users\adity\OneDrive\Desktop\AgroSphere\ml-service"
.\.venv\Scripts\python.exe -B -m training.analyze_disease_ood --ood-dir "$env:TEMP/agrosphere-disease-ood-20260916" --output "$env:TEMP/agrosphere-disease-signals.json"
.\.venv\Scripts\python.exe -B -m training.compare_disease_ood_rules --report "$env:TEMP/agrosphere-disease-signals.json"
```

Hardening regression tests track the rocket rejection and the building's known false
acceptance explicitly. External fixture bytes remain outside Git; only paths/hashes
and boundary tests are added. Neither the classifier nor its supported classes changed.

## API, UI and persistence

`POST /predict/disease` returns HTTP 200 with either `CLASSIFIED` or
`UNSUPPORTED_IMAGE`. Classified fields retain their existing names; `guardVersion`
is added. An unsupported result has:

```json
{
  "status": "UNSUPPORTED_IMAGE",
  "modelVersion": "disease-v1",
  "guardVersion": "disease-ood-v1.1",
  "predictedClass": null,
  "crop": null,
  "condition": null,
  "isHealthy": null,
  "confidence": null,
  "supportedClass": false,
  "supportedClassCount": 15,
  "supportedCrops": ["Bell Pepper", "Potato", "Tomato"],
  "guidance": null,
  "message": "This image does not appear sufficiently similar to the supported Bell Pepper, Potato, or Tomato leaf images. Upload one clear leaf image."
}
```

Node's existing FARMER-only `/api/ai/disease-detection` validates both contracts,
adds `success: true` for a completed analysis, and returns only allowlisted fields.
It saves **only CLASSIFIED** results. Rejections have no `scanId`, no `DiseaseScan`,
and cannot become new `CHECK_CROP_HEALTH` evidence. Existing records are untouched;
historical false diagnoses and OOD false accepts remain limitations.

React still calls only Node. Rejection displays “Unable to analyze this image”,
the retry message and “No diagnosis was saved”, without a disease, confidence,
severity or treatment panel. Normal classification rendering is preserved, gated
by explicit `CLASSIFIED`. MIME/signature/5 MB/decode checks and auth are unchanged.

Restart FastAPI **and Node** after deploying the changed API contract; refresh React.
An old unguarded or `disease-ood-v1` response is deliberately rejected by the updated Node client
rather than silently bypassing the guard. Optional `DISEASE_OOD_PATH` is documented
in `.env.example`; the default works without editing `.env`.

## Reproduce calibration and evaluation (PowerShell)

The generated guard is already included; **do not retrain** the disease classifier.

```powershell
cd "C:\Users\adity\OneDrive\Desktop\AgroSphere\ml-service"
.\.venv\Scripts\Activate.ps1
python -B -m training.calibrate_disease_ood --inspect-only
# Only if deliberately regenerating the guard from the existing train/validation splits:
python -B -m training.calibrate_disease_ood
```

Use the existing temporary image directory for the original evaluation, or fetch
the same licensed evaluation samples outside Git (network required; no API keys):

```powershell
$oodDirectory = Join-Path $env:TEMP 'agrosphere-disease-ood-20260916'
New-Item -ItemType Directory -Path $oodDirectory -Force
foreach ($name in @('coffee.png','brick.png','text.png','rocket.jpg','chelsea.png','hubble_deep_field.jpg')) {
    Invoke-WebRequest -Uri ('https://raw.githubusercontent.com/scikit-image/scikit-image/v0.25.2/skimage/data/' + $name) -OutFile (Join-Path $oodDirectory $name)
}
python -B -m training.evaluate_disease_ood --ood-dir $oodDirectory
$env:DISEASE_OOD_FIXTURES_DIR = $oodDirectory
python -B -m unittest discover -s tests -v
```

No OOD downloads happen automatically during tests. Missing local PlantVillage images
or an unset OOD fixture directory produce explicit skips, not fabricated passing tests.
The final permanent suite has **45 Python tests passed, zero skips**, including
building/rocket and combined-boundary regressions; **222 backend tests passed**; **46 frontend
checks passed** (42 baseline +4 source-contract checks); QR decoder and production build
passed. The existing >500 kB bundle warning is non-blocking and unchanged in scope.

```powershell
cd "C:\Users\adity\OneDrive\Desktop\AgroSphere\backend"
node --test tests/*.test.js
cd "C:\Users\adity\OneDrive\Desktop\AgroSphere\frontend"
node --test --test-isolation=none scripts/*.test.mjs
node scripts/verifyTraceQr.cjs
npm run build
```

## Direct manual verification without database writes

Start FastAPI using your existing command. In another PowerShell terminal:

```powershell
cd "C:\Users\adity\OneDrive\Desktop\AgroSphere\ml-service"
$results = Get-Content model_artifacts/disease_ood_evaluation.json -Raw | ConvertFrom-Json
$healthy = Join-Path (Resolve-Path data/plant_disease) $results.demoSamples.healthyTomato.path
$earlyBlight = Join-Path (Resolve-Path data/plant_disease) $results.demoSamples.moderateEarlyBlight.path
curl.exe -F "image=@$healthy" http://127.0.0.1:8000/predict/disease
curl.exe -F "image=@$earlyBlight" http://127.0.0.1:8000/predict/disease
curl.exe -F "image=@$env:TEMP/agrosphere-disease-ood-20260916/coffee.png" http://127.0.0.1:8000/predict/disease
curl.exe -F "image=@$env:TEMP/agrosphere-disease-ood-20260916/text.png" http://127.0.0.1:8000/predict/disease
```

Expected: first two `CLASSIFIED`; last two `UNSUPPORTED_IMAGE`, all HTTP 200.
These calls do not touch MongoDB. Browser check for the user: log in as FARMER,
open Leaf Scanner, upload coffee/text and click Analyze Leaf. Expect the unsupported
panel with no saved scan. A classified browser upload still creates a normal scan.
Frontend source-contract checks/build are not a claim of an interactive browser test.
Try your own varied unrelated images; do not assume the eight-image result generalizes.

## Limitations

The unsupported-image guard reduces forced disease classifications but
is not a universal leaf detector. Some unrelated images may still pass
and some supported leaf images may be rejected.

One centroid per class is a coarse approximation. Controlled-background PlantVillage
features may not represent field photos; supported leaves may be rejected. One real
OOD image in this evaluation still passed. The unchanged head can misclassify accepted
leaves, and an accepted image is not verified provenance, a laboratory diagnosis or a
certified leaf. The guard does not clean up old scan history. Disease decisions remain
decision support requiring appropriate human confirmation.
