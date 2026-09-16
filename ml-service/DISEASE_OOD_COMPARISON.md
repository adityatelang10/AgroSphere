# Final disease OOD method comparison — 2026-09-16

Finalization note: this document preserves the completed research findings. The
generated reference, candidate, comparison and hardening files remain available
locally but are now ignored by Git. They are not production dependencies. No further
model experiment was performed. The final permanent suite is **45 Python tests**;
the ten research tests are optional under `training/research_tests/`. The project
owner subsequently confirmed manual FARMER browser verification complete and approved
release. No additional model experiment or browser session is needed for that release.

## Decision

**Retain `disease-ood-v1.1`. Do not deploy the kNN reference.** The classifier stays
`disease-v1` with unchanged weights, preprocessing and 15 classes. No packages,
second neural network, classifier retraining, API changes or database writes were needed.

kNN retains more supported test leaves and rejects the building, but all six frozen
candidates still reject only **7/8** unrelated images: they accept the rocket instead.
They also falsely accept the supplementary solid-black image. This does not satisfy
the predeclared requirement for improved OOD rejection. We did not lower thresholds,
change k, or combine kNN with the centroid/confidence guard to target these examples.

The current guard is not universally safer: kNN has better supported-leaf retention
on this test split. The result is a tradeoff, not evidence that centroid methods
dominate kNN. Retaining the existing deployment avoids an unsupported upgrade claim.

## A–D. Formulation, predetermined candidates, calibration and freeze

The existing RGB -> resize shorter side 176 -> center crop 160 x 160 -> tensor ->
ImageNet normalization pipeline is unchanged. MobileNetV2 features -> global average
pooling -> flatten gives the same 1,280-dimensional vector. Split-path and original
forward logits are checked with **rtol=0, atol=0**. No augmentation is used here.

For each image, L2-normalize the embedding and calculate cosine distance to each of
the **1,500 training embeddings**. The score is the **mean distance of the k nearest
training embeddings**, regardless of their class. A score <= threshold is accepted.
Reference vectors are serialized as normalized float32, then re-normalized in
float64 on load; calibration and evaluation use exactly that same representation.

Predetermined k values: **1, 3, 5**. Validation targets: **99%, 98%**. Before any test
or OOD evaluation, the only adoption candidate was designated **k=5, target=99%**:
average multiple neighbors and prioritize retaining supported leaves. The other five
candidates are descriptive comparisons, not choices selected using test/OOD outcomes.

Calibration reads only the 1,500 training and 300 validation image files. Split
metadata checks verify disjoint paths, hashes and leaf groups, without opening test
images. Calibration records contain **test=0, OOD=0**. Both used splits are hash-checked.

Threshold = sorted validation scores at zero-based index `ceil(target * (300 - 1))`;
this is `numpy.quantile(..., method="higher")`, with an inclusive boundary.

| k | Target | Frozen cosine threshold | One-based order statistic | Actual validation accepted |
|---|---|---|---|---|
| 1 | 99% | 0.333432203885045 | 298 | 298/300 (99.33%) |
| 1 | 98% | 0.3298805755758246 | 295 | 295/300 (98.33%) |
| 3 | 99% | 0.3401290584089538 | 298 | 298/300 (99.33%) |
| 3 | 98% | 0.33754699070274286 | 295 | 295/300 (98.33%) |
| 5 | 99% | 0.3486570235016934 | 298 | 298/300 (99.33%) |
| 5 | 98% | 0.3434184068840589 | 295 | 295/300 (98.33%) |

The complete candidate report was written **2026-09-16 08:49:12 UTC**, before the
first comparison finished at **08:50:23 UTC**. Candidate-report SHA-256:
`259478273cb39444a73959f8e634a092e8ebc9dfcd9cc6a35fd819cb1bcfe042`.

The frozen adoption gate required validation >=294/300, test >=289/300 and real OOD
rejection >7/8. Only the designated k=5/99% candidate was eligible; the fallback was
v1.1. These requirements and the preselection rationale are stored in
`model_artifacts/disease_ood_knn_candidates.json`. No numeric threshold, aggregation
or k changed after seeing test/OOD outcomes.

## E. Frozen comparison

Validation and test denominators are 300. OOD denominator is eight. Accepted accuracy
means original disease classification accuracy **among accepted test leaves only**.

| Method | Validation accepted | Test accepted | Test false rejects | Accepted accuracy | OOD rejected | Building rejected | Rocket rejected |
|---|---|---|---|---|---|---|---|
| Centroid v1 | 298 (99.33%) | 293 (97.67%) | 7 | 264/293 = 90.10% | 6/8 | No | No |
| Centroid + confidence v1.1 (retained) | 294 (98.00%) | 289 (96.33%) | 11 | 262/289 = 90.66% | 7/8 | No | Yes |
| kNN k=1, 99% | 298 (99.33%) | 294 (98.00%) | 6 | 266/294 = 90.48% | 7/8 | Yes | No |
| kNN k=1, 98% | 295 (98.33%) | 293 (97.67%) | 7 | 266/293 = 90.78% | 7/8 | Yes | No |
| kNN k=3, 99% | 298 (99.33%) | 293 (97.67%) | 7 | 266/293 = 90.78% | 7/8 | Yes | No |
| kNN k=3, 98% | 295 (98.33%) | 292 (97.33%) | 8 | 266/292 = 91.10% | 7/8 | Yes | No |
| kNN k=5, 99% (preselected) | 298 (99.33%) | 295 (98.33%) | 5 | 267/295 = 90.51% | 7/8 | Yes | No |
| kNN k=5, 98% | 295 (98.33%) | 290 (96.67%) | 10 | 265/290 = 91.38% | 7/8 | Yes | No |

Individual unrelated-image decisions (all six kNN candidates have the same decisions):

| Fixture | Centroid v1 | Centroid + confidence v1.1 | Each kNN candidate |
|---|---|---|---|
| Building, china.jpg | False accept | False accept | Reject |
| Rocket, rocket.jpg | False accept | Reject | False accept |
| Coffee, coffee.png | Reject | Reject | Reject |
| Text, text.png | Reject | Reject | Reject |
| Cat, chelsea.png | Reject | Reject | Reject |
| Wall, brick.png | Reject | Reject | Reject |
| Stars, hubble_deep_field.jpg | Reject | Reject | Reject |
| Flower, flower.jpg | Reject | Reject | Reject |

Sources, licensing, local paths and SHA-256 values remain in the comparison JSON and
the earlier evaluation documentation. The six downloaded fixtures stay outside Git
in the existing temporary folder; the other two are installed scikit-learn samples.

## F–O. Final retained guard and fresh rerun

After selecting v1.1, the final evaluation re-extracted **300 validation + 300 test
embeddings**, re-evaluated **all eight real OOD images** and regenerated the four
supplementary inputs. It completed at **08:51:58 UTC**. The script asserted that all
comparison scores, decisions, metrics and the selection exactly matched the first
run, and that the v1.1 formula agreed with the deployed guard's acceptance function.

- Final guard: **disease-ood-v1.1**, unchanged artifact and rule.
- Validation acceptance: **294/300 = 98%**.
- Test acceptance: **289/300 = 96.33%**; **11 false rejections**.
- Original classifier accuracy: **268/300 = 89.33%**, unchanged.
- Accepted-test accuracy: **262/289 = 90.66%**, not a retrained-classifier improvement.
- Real OOD rejection: **7/8 = 87.5%** of this small fixture set only.
- Building: **false acceptance**, still classified Tomato Late Blight.
- Rocket: **rejected**, with no public diagnosis/confidence/guidance.
- Genuine Tomato Early Blight with **59.4619%** confidence: **accepted** by every method.
- Supplementary final results: black **reject**, white **reject**, green **reject**,
  seed-42 noise **reject**: **4/4**. Each kNN candidate rejected only **3/4** because
  solid black was incorrectly accepted. These are separate from the real OOD count.

The genuine moderate-confidence example is still:
`data/plant_disease/test/Tomato___Early_blight/12c1c25b-6809-45d8-9a20-969de7860b5d___RS_Erly.B 6372.JPG`.

The API still returns `CLASSIFIED` or `UNSUPPORTED_IMAGE`. Rejections contain no
diagnosis, confidence or guidance and do not create DiseaseScan records or new
Decision Engine disease evidence. The public contract was not changed by this task.

## P–Q. Artifact size and measured inference overhead

- Experimental `disease_ood_reference.npz`: **6,670,290 bytes** (6.67 MB / 6.36 MiB).
  Contains only 1,500 x 1,280 normalized float32 embeddings, class IDs and metadata.
  Its normalized in-memory float64 matrix is 15,360,000 bytes, excluding small overheads.
  **Not loaded by production.**
- Retained `disease_ood_metadata.npz`: **147,670 bytes**, unchanged SHA-256
  `40fae7fb64c0139a56872a14d8c4db7a266e498880233360c6584db8d0ca2975`.
- Classifier SHA-256 remains
  `7309566b0e13fc4abc83c15462cb5421119ca39a89281f5807b9b15e3955a841`.

CPU benchmark: existing Intel processor, Torch four threads, NumPy environment
defaults, ten warmups + 100 single-image repetitions, preloaded reference. Final-run
median timings: classifier forward **15.188 ms**, centroid score **0.060 ms**, k=5
kNN score **4.043 ms** (p95 **7.045 ms**). Experimental kNN adds roughly **3.98 ms**
to score computation versus the centroid calculation on this machine. The first run
measured 3.28 ms for kNN, illustrating timing variation. These exclude image decoding,
network and database work, and are not end-to-end service latency measurements.
**Actual production inference overhead added by this task: none**, since v1.1 remains.

## R. Research files retained after cleanup

Lightweight reproducibility files retained in the feature diff:

- `training/compare_disease_ood_knn.py`: isolated freeze/evaluate workflow, checks and CPU benchmark.
- `training/research_tests/test_disease_ood_knn.py`: ten optional research regressions, moved out of the permanent suite.
- `DISEASE_OOD_COMPARISON.md`: this report.

Generated outputs preserved locally but excluded from Git:

- `model_artifacts/disease_ood_reference.npz`: training-reference experiment artifact.
- `model_artifacts/disease_ood_knn_candidates.json`: original frozen calibration evidence.
- `model_artifacts/disease_ood_comparison.json`: complete comparison, per-image results, initial/final timestamps and timings.
- `model_artifacts/disease_ood_hardening.json`: earlier diagnostic dump.

Cleanup changes:

- `.gitignore`: remove those four experiment-output allowlist entries; retain production guard/evaluation and raw-image exclusions.
- `tests/test_disease_ood.py`: reproduce validation calibration from real validation images, not the ignored hardening dump, preserving all production assertions.
- `DISEASE_OOD.md`: link this comparison and its retained-deployment decision.

All paths above are relative to `ml-service`. The earlier disease-guard work was
already uncommitted when this task began and has been preserved. No backend/frontend
source file, classifier weight, production guard artifact, package or environment
variable was changed by this comparison task. No commits, merges or pushes performed.

## S–V. Regression results

- Before cleanup: **55 Python tests passed** (45 production + 10 research tests).
- Final permanent Python suite: **45 passed, 0 failed, 0 skipped**. The optional research tests are no longer included in this command.
- Backend full suite: **222 passed, 0 failed, 0 skipped**; rejected scans remain unpersisted.
- Frontend helper suite: **46 passed, 0 failed, 0 skipped**.
- QR decoder: **passed**, decoded the expected existing fixture trace URL.
- Production build: **passed**, 205 modules; existing 509.89 kB bundle warning only.

The research pass did not perform interactive browser or physical-phone testing.
The project owner subsequently confirmed manual FARMER browser verification complete;
this is user-reported, not a claim of successful agent browser automation or an
independent live-database measurement. Existing image validation, missing-guard failure
isolation, exact logits, supported-leaf samples and status contracts were covered by
the regression suites.

## Reproduction (PowerShell)

No installation or retraining is needed. These commands are optional research
reproduction, not deployment/startup steps. They are not required for the selected
guard or its permanent regression suite. If the ignored artifacts are still present
locally, re-evaluate those already frozen candidates:

```powershell
cd "C:\Users\adity\OneDrive\Desktop\AgroSphere\ml-service"
.\.venv\Scripts\python.exe -B -m training.compare_disease_ood_knn evaluate --ood-dir "$env:TEMP/agrosphere-disease-ood-20260916" --confirm-final disease-ood-v1.1
$env:DISEASE_OOD_FIXTURES_DIR = Join-Path $env:TEMP 'agrosphere-disease-ood-20260916'
.\.venv\Scripts\python.exe -B -m unittest discover -s tests -v
```

To reproduce calibration without overwriting the frozen evidence, choose new output
paths. This reads train/validation images only; it does not deploy the result:

```powershell
.\.venv\Scripts\python.exe -B -m training.compare_disease_ood_knn freeze --reference "$env:TEMP/agrosphere-knn-reference-reproduction.npz" --frozen "$env:TEMP/agrosphere-knn-candidates-reproduction.json"
.\.venv\Scripts\python.exe -B -m training.compare_disease_ood_knn evaluate --reference "$env:TEMP/agrosphere-knn-reference-reproduction.npz" --frozen "$env:TEMP/agrosphere-knn-candidates-reproduction.json" --output "$env:TEMP/agrosphere-knn-comparison-reproduction.json" --ood-dir "$env:TEMP/agrosphere-disease-ood-20260916"
```

The freeze command deliberately refuses to overwrite existing artifacts. A new
candidate report records a new freeze timestamp; preserve the original evidence.
Vectors and thresholds are deterministic for this recorded CPU/software setup;
verify them again if the software or hardware environment changes.

On a fresh clone, the default ignored artifacts are absent. To deliberately reproduce
the optional research test suite, generate them first (do not run `freeze` over the
existing local originals):

```powershell
# Only when the default reference/candidate files are absent:
.\.venv\Scripts\python.exe -B -m training.compare_disease_ood_knn freeze
.\.venv\Scripts\python.exe -B -m training.compare_disease_ood_knn evaluate --ood-dir "$env:TEMP/agrosphere-disease-ood-20260916"
.\.venv\Scripts\python.exe -B -m unittest discover -s training/research_tests -v
```

These research commands intentionally are not part of the permanent regression or
normal startup workflow. The compact checked-in production evaluation JSON supplies
fixture provenance; local dataset images and licensed OOD fixtures are still required.

```powershell
cd "C:\Users\adity\OneDrive\Desktop\AgroSphere\backend"
node --test tests/*.test.js
cd "C:\Users\adity\OneDrive\Desktop\AgroSphere\frontend"
node --test --test-isolation=none scripts/*.test.mjs
node scripts/verifyTraceQr.cjs
npm run build
```

## W. Limitations

- Eight unrelated images are a tiny convenience sample, not a representative OOD benchmark.
- These same test/OOD sets have been used for prior method comparisons. This is
  exploratory adoption evidence, not fresh independent generalization evidence,
  even though all new kNN parameters were frozen before evaluation.
- Validation also participated in original classifier checkpoint selection; the
  reported empirical acceptance is not a guaranteed future-coverage bound.
- PlantVillage controlled-background images differ from real field conditions.
- Both methods have false accepts; supported leaves can be rejected. Confidence is
  not proof of domain membership or correctness. Accepted leaves can be misclassified.
- Neither method detects every unsupported crop/disease or unrelated image.
- The retained guard leaves the building false acceptance unresolved. It does not
  remove previous false diagnoses from scan history.
- No independent new OOD benchmark, retraining or larger follow-up search was added.

The research comparison is complete. No further model experiments are required for
the selected production implementation.
