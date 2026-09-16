"""Optional research tests: generate ignored kNN artifacts first; not a production suite."""

import json
import unittest

import numpy as np

from app.services.disease_ood import file_sha256, normalize_embeddings
from training.compare_disease_ood_knn import (
    ADOPTION_CANDIDATE, COMPARISON, FROZEN, K_VALUES, REFERENCE, SCORE, TARGETS,
    calibrate, knn_scores,
)


class KnnScoringTests(unittest.TestCase):
    def test_mean_of_nearest_cosine_distances(self):
        reference = np.array([[1., 0.], [0., 1.], [-1., 0.]])
        query = np.array([[1., 0.]])
        self.assertEqual(knn_scores(query, reference, 1)[0], 0)
        self.assertEqual(knn_scores(query, reference, 2)[0], .5)
        self.assertEqual(knn_scores(query, reference, 3)[0], 1)

    def test_query_scale_and_reference_order_do_not_change_scores(self):
        reference = np.array([[1., 0.], [0., 1.], [-1., 0.]])
        np.testing.assert_array_equal(knn_scores(np.array([[7., 0.]]), reference[::-1], 2),
                                      knn_scores(np.array([[1., 0.]]), reference, 2))

    def test_invalid_k_is_rejected(self):
        for k in (True, 0, -1, 4, 1.0):
            with self.subTest(k=k), self.assertRaises(ValueError):
                knn_scores(np.array([[1., 0.]]), np.eye(3, 2), k)

    def test_invalid_features_are_rejected(self):
        for query, reference in [(np.zeros((1, 2)), np.eye(2)),
                                  (np.array([[np.nan, 0.]]), np.eye(2)),
                                  (np.array([[1., 0.]]), np.full((3, 2), np.inf)),
                                  (np.array([[1., 0.]]), np.eye(3))]:
            with self.subTest(query=query, reference=reference), self.assertRaises(ValueError):
                knn_scores(query, reference, 1)

    def test_higher_observed_order_statistic(self):
        for target, index in ((.99, 298), (.98, 295)):
            result = calibrate(np.arange(300) / 300, target)
            self.assertEqual(result["orderStatisticOneBased"], index)
            self.assertEqual(result["threshold"], (index - 1) / 300)
            self.assertEqual(result["validationAccepted"], index)

    def test_equal_threshold_is_accepted_including_ties(self):
        result = calibrate(np.ones(300) * .2, .98)
        self.assertEqual(result["validationAccepted"], 300)
        self.assertEqual(result["threshold"], .2)

    def test_invalid_calibration_input_is_rejected(self):
        for values, target in (([], .99), ([np.nan], .99), ([.1], 1), ([[.1]], .98)):
            with self.subTest(values=values, target=target), self.assertRaises(ValueError):
                calibrate(values, target)


class FrozenKnnExperimentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frozen = json.loads(FROZEN.read_text(encoding="utf-8"))

    def test_frozen_candidates_use_validation_only_and_reproduce_exactly(self):
        self.assertEqual(self.frozen["calibrationImages"], {"train": 1500, "validation": 300, "test": 0, "ood": 0})
        self.assertEqual(len(self.frozen["candidates"]), 6)
        self.assertEqual(self.frozen["kValues"], list(K_VALUES))
        self.assertEqual(self.frozen["targets"], list(TARGETS))
        self.assertEqual(self.frozen["preselectedAdoptionCandidate"], ADOPTION_CANDIDATE)
        for candidate in self.frozen["candidates"]:
            self.assertEqual(candidate["score"], SCORE)
            expected = calibrate(self.frozen["validationScores"][str(candidate["k"])], candidate["target"])
            for key, value in expected.items():
                self.assertEqual(candidate[key], value)

    def test_reference_contains_only_training_features_class_ids_metadata(self):
        self.assertEqual(file_sha256(REFERENCE), self.frozen["referenceSha256"])
        with np.load(REFERENCE, allow_pickle=False) as artifact:
            self.assertEqual(set(artifact.files), {"embeddings", "class_ids", "metadata"})
            self.assertEqual(artifact["embeddings"].shape, (1500, 1280))
            self.assertEqual(artifact["embeddings"].dtype, np.float32)
            np.testing.assert_allclose(np.linalg.norm(artifact["embeddings"], axis=1), 1, atol=1e-6)
            reference = normalize_embeddings(artifact["embeddings"])
            np.testing.assert_allclose(knn_scores(reference[:5], reference, 1), 0, atol=1e-14)
            np.testing.assert_array_equal(np.bincount(artifact["class_ids"]), np.full(15, 100))
            self.assertEqual(json.loads(str(artifact["metadata"].item())), self.frozen["metadata"])

    def test_comparison_bound_to_frozen_candidates_and_predeclared_selection(self):
        report = json.loads(COMPARISON.read_text(encoding="utf-8"))
        self.assertEqual(report["frozenReportSha256"], file_sha256(FROZEN))
        self.assertEqual(report["referenceSha256"], file_sha256(REFERENCE))
        self.assertGreater(report["evaluatedAt"], self.frozen["frozenAt"])
        self.assertTrue(report["exactSplitLogitsVerified"])
        self.assertEqual(report["originalCorrect"], 268)
        rows = {row["method"]: row for row in report["comparison"]}
        self.assertEqual(len(rows), 8)
        for candidate in self.frozen["candidates"]:
            self.assertEqual(rows[candidate["id"]]["parameters"], candidate)
        baseline, candidate = rows["centroid-confidence-v1.1"], rows[ADOPTION_CANDIDATE]
        adopt = (candidate["validation"]["accepted"] >= 294
                 and candidate["test"]["accepted"] >= baseline["test"]["accepted"]
                 and candidate["oodRejected"] > baseline["oodRejected"])
        self.assertEqual(report["selection"]["adoptKnn"], adopt)
        self.assertEqual(report["selection"]["method"], ADOPTION_CANDIDATE if adopt else baseline["method"])
        for row in rows.values():
            self.assertEqual(len(row["ood"]), 8)
            self.assertEqual(len(row["synthetic"]), 4)
            self.assertEqual(row["test"]["accepted"] + row["test"]["falseRejections"], 300)


if __name__ == "__main__":
    unittest.main()
