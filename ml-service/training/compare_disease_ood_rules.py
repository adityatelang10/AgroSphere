"""Compare a small predeclared family; calibrate thresholds using validation ONLY.

No production artifact changes. Test/OOD results are exploratory comparisons, not
fresh independent estimates of a rule selected after seeing those same images.
"""

import argparse
import json
import math
from pathlib import Path

import numpy as np

REPORT_PATH = Path(__file__).resolve().parents[1] / "model_artifacts/disease_ood_hardening.json"

# Predeclared distance gates, not tailored to individual OOD scores.
GATE_QUANTILES = (.90, .95, .97)
AUXILIARY_SIGNALS = ("confidence", "margin", "entropyNats")
MIN_VALIDATION_ACCEPTANCE = .98


def accepts(row, rule):
    if row["distance"] > rule["distanceThreshold"]:
        return False
    field = rule.get("auxiliarySignal")
    if not field or row["distance"] <= rule["secondaryDistanceThreshold"]:
        return True
    if field == "entropyNats":
        return row[field] <= rule["auxiliaryThreshold"]
    return row[field] >= rule["auxiliaryThreshold"]


def calibrate_candidate(validation, baseline_threshold, gate_quantile, field):
    max_rejected = len(validation) - math.ceil(MIN_VALIDATION_ACCEPTANCE * len(validation))
    baseline_rejected = sum(row["distance"] > baseline_threshold for row in validation)
    budget = max_rejected - baseline_rejected
    if budget < 0:
        raise ValueError("Baseline already exceeds validation rejection budget.")
    gate = float(np.quantile([row["distance"] for row in validation], gate_quantile, method="higher"))
    eligible = [row for row in validation if gate < row["distance"] <= baseline_threshold]
    ordered = sorted((row[field] for row in eligible), reverse=field == "entropyNats")
    if len(ordered) <= budget:
        raise ValueError("Too few gated validation samples to calibrate an auxiliary threshold.")
    # Strict rejection beyond an observed order statistic, preserving equality.
    # Ties can reduce rejection; they cannot exceed the allowed budget.
    cutoff = ordered[budget]
    rule = {
        "name": f"cosine+{field}@p{int(gate_quantile * 100)}",
        "distanceThreshold": baseline_threshold, "distanceGateQuantile": gate_quantile,
        "secondaryDistanceThreshold": gate, "auxiliarySignal": field, "auxiliaryThreshold": cutoff,
        "auxiliaryRejectOperator": ">" if field == "entropyNats" else "<",
        "validationOnlyCalibration": True, "allowedAdditionalValidationRejections": budget,
        "gatedValidationSamples": len(eligible),
    }
    if sum(accepts(row, rule) for row in validation) < math.ceil(MIN_VALIDATION_ACCEPTANCE * len(validation)):
        raise ValueError("Candidate exceeds the validation rejection budget.")
    return rule


def summarize(rule, splits):
    result = dict(rule)
    for split in ["validation", "test"]:
        rows = splits[split]
        accepted = [row for row in rows if accepts(row, rule)]
        correct = sum(row["topClass"] == row["actualClass"] for row in accepted)
        result[split] = {"total": len(rows), "accepted": len(accepted), "acceptanceRate": len(accepted) / len(rows),
                         "falseRejected": len(rows) - len(accepted), "acceptedCorrect": correct,
                         "acceptedAccuracy": correct / len(accepted) if accepted else None}
    ood = {row["file"]: not accepts(row, rule) for row in splits["ood"]}
    result["ood"] = {"total": len(ood), "rejected": sum(ood.values()), "byFileRejected": ood}
    return result


def dominance_lower_bounds(splits, baseline):
    """Diagnostic impossibility bounds, NOT thresholds to install or candidates to select.

    Any distance-AND-low-confidence/margin (or high-entropy) rule that rejects an
    OOD point must also reject known leaves strictly more extreme on both axes.
    Include the baseline rejections. This exposes the unavoidable validation cost.
    """
    bounds = []
    for ood in splits["ood"]:
        if ood["distance"] > baseline:
            continue
        row = {"file": ood["file"], "interpretation": "Lower bound only; OOD values are not deployed thresholds."}
        for signal in AUXILIARY_SIGNALS:
            counts = {}
            for split in ["validation", "test"]:
                rejected = sum(
                    known["distance"] > baseline or (
                        known["distance"] >= ood["distance"] and
                        (known[signal] >= ood[signal] if signal == "entropyNats" else known[signal] <= ood[signal])
                    ) for known in splits[split]
                )
                counts[split + "MinimumRejections"] = rejected
                counts[split + "MaximumAcceptance"] = (len(splits[split]) - rejected) / len(splits[split])
            row[signal] = counts
        bounds.append(row)
    return bounds


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, default=REPORT_PATH)
    parser.add_argument("--record-selected-rule", action="store_true", help="Record the reviewed confidence@p97 selection; does not edit the runtime artifact.")
    args = parser.parse_args()
    report = json.loads(args.report.read_text(encoding="utf-8"))
    splits = report["splits"]
    baseline = report["existingThreshold"]
    # Complete all calibration before evaluating any candidate on test/OOD.
    rules = [{"name": "A: current cosine only", "distanceThreshold": baseline}]
    for quantile in GATE_QUANTILES:
        for field in AUXILIARY_SIGNALS:
            rules.append(calibrate_candidate(splits["validation"], baseline, quantile, field))
    report["candidateProtocol"] = {
        "minimumValidationAcceptance": MIN_VALIDATION_ACCEPTANCE,
        "gates": list(GATE_QUANTILES), "signals": list(AUXILIARY_SIGNALS),
        "thresholdSource": "Existing base threshold; validation higher-quantile distance gates; observed auxiliary order statistic spending at most four additional validation rejections.",
        "warning": "Repeated inspection of the same eight OOD images and test split is exploratory, not independent generalization evidence.",
    }
    report["candidateComparison"] = [summarize(rule, splits) for rule in rules]
    report["dominanceLowerBounds"] = dominance_lower_bounds(splits, baseline)
    report["stage"] = "candidates_evaluated_no_production_change"
    if args.record_selected_rule:
        selected = next(row for row in report["candidateComparison"] if row["name"] == "cosine+confidence@p97")
        report["decision"] = {
            "selectedRule": selected,
            "guardVersion": "disease-ood-v1.1",
            "reason": "7/8 real OOD rejected instead of 6/8, at 294/300 validation and 289/300 test accepted. Four additional test false rejections (two originally correct). Confidence ties margin/entropy but is simpler; building remains an explicit limitation.",
            "numericThresholdsCalibratedOn": "validation only",
            "ruleFamilySelectedUsing": "exploratory comparison on reused validation/test/OOD sets; not independent evidence",
        }
        report["stage"] = "hardening_decision_recorded"
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"candidates": report["candidateComparison"], "bounds": report["dominanceLowerBounds"]}, indent=2))


if __name__ == "__main__":
    main()
