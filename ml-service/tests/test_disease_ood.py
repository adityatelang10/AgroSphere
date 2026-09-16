import asyncio
import json
import os
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import numpy as np
import sklearn
import torch
from fastapi import HTTPException, UploadFile
from PIL import Image
from pydantic import ValidationError
from starlette.datastructures import Headers

from app.api.routes import get_health, predict_crop, predict_disease
from app.core.config import Settings
from app.schemas.crop_recommendation import CropPredictionRequest
from app.schemas.disease_detection import DiseasePredictionResponse
from app.services.disease_detector import DiseaseModelService, DiseaseModelUnavailableError, InvalidDiseaseImageError
from app.services.disease_ood import DiseaseOODGuard, centroid_distances, extract_embedding, file_sha256

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "model_artifacts/disease_model.pt"
CLASSES = ROOT / "model_artifacts/disease_classes.json"
METADATA = ROOT / "model_artifacts/disease_model_metadata.json"
GUARD = ROOT / "model_artifacts/disease_ood_metadata.npz"
DATASET = ROOT / "data/plant_disease"


def encoded(image):
    stream = BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()


class DiseaseGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(4)
        cls.service = DiseaseModelService()
        cls.service.load(MODEL, CLASSES, METADATA, GUARD)
        cls.report = json.loads((ROOT / "model_artifacts/disease_ood_evaluation.json").read_text(encoding="utf-8"))
        cls.flower_bytes = (Path(sklearn.__file__).parent / "datasets/images/flower.jpg").read_bytes()

    def known(self, name):
        sample = self.report["demoSamples"][name]
        path = DATASET / sample["path"]
        if not path.is_file():
            self.skipTest("Local PlantVillage test image not downloaded; see DISEASE_OOD.md.")
        result = self.service.predict(path.read_bytes())
        self.assertEqual(result.status, "CLASSIFIED")
        self.assertEqual(result.predicted_class, sample["actualClass"])
        self.assertTrue(result.supported_class)
        return result

    def test_healthy_tomato_is_classified(self):
        self.assertTrue(self.known("healthyTomato").is_healthy)

    def test_moderate_early_blight_is_not_confidence_rejected(self):
        result = self.known("moderateEarlyBlight")
        self.assertGreater(result.confidence, .58)
        self.assertLess(result.confidence, .61)

    def test_potato_is_classified(self):
        self.known("potato")

    def test_pepper_is_classified(self):
        self.known("pepper")

    def test_real_unsupported_flower_photo_is_rejected(self):
        self.assertEqual(self.service.predict(self.flower_bytes).status, "UNSUPPORTED_IMAGE")

    def test_real_coffee_photo_is_rejected(self):
        directory = os.environ.get("DISEASE_OOD_FIXTURES_DIR")
        if not directory:
            self.skipTest("Set DISEASE_OOD_FIXTURES_DIR to the temporary licensed OOD sample folder.")
        result = self.service.predict((Path(directory) / "coffee.png").read_bytes())
        self.assertEqual(result.status, "UNSUPPORTED_IMAGE")

    def test_rocket_photo_now_rejected_without_diagnosis(self):
        directory = os.environ.get("DISEASE_OOD_FIXTURES_DIR")
        if not directory:
            self.skipTest("Set DISEASE_OOD_FIXTURES_DIR to the temporary licensed OOD sample folder.")
        path = Path(directory) / "rocket.jpg"
        self.assertEqual(file_sha256(path), "c2dd0de7c538df8d111e479619b129464d0269d0ae5fd18ca91d33a7fdfea95c")
        result = self.service.predict(path.read_bytes())
        self.assertEqual(result.status, "UNSUPPORTED_IMAGE")
        self.assertIsNone(result.predicted_class)
        self.assertIsNone(result.confidence)
        self.assertIsNone(result.guidance)

    def test_building_known_false_accept_remains_explicit(self):
        # Track this limitation honestly; do not invent a successful rejection.
        path = Path(sklearn.__file__).parent / "datasets/images/china.jpg"
        self.assertEqual(file_sha256(path), "8378025ad2519d649d02e32bd98990db4ab572357d9f09841c2fbfbb4fefad29")
        result = self.service.predict(path.read_bytes())
        self.assertEqual(result.status, "CLASSIFIED")
        self.assertEqual(result.predicted_class, "Tomato___Late_blight")

    def test_solid_colors_rejected(self):
        for color in ["black", "white", "green"]:
            with self.subTest(color=color):
                result = self.service.predict(encoded(Image.new("RGB", (256, 256), color)))
                self.assertEqual(result.status, "UNSUPPORTED_IMAGE")

    def test_noise_rejected(self):
        noise = np.random.default_rng(42).integers(0, 256, (256, 256, 3), dtype=np.uint8)
        self.assertEqual(self.service.predict(encoded(Image.fromarray(noise))).status, "UNSUPPORTED_IMAGE")

    def test_corrupt_image_still_rejected(self):
        with self.assertRaises(InvalidDiseaseImageError):
            self.service.predict(b"\x89PNG\r\n\x1a\nnot a decodable image")

    def test_rejection_contract_has_no_diagnosis_or_guidance(self):
        payload = self.service.predict(self.flower_bytes).model_dump(by_alias=True)
        for key in ["predictedClass", "crop", "condition", "isHealthy", "confidence", "guidance"]:
            self.assertIsNone(payload[key])
        self.assertFalse(payload["supportedClass"])
        self.assertEqual(payload["guardVersion"], "disease-ood-v1.1")
        self.assertIn("sufficiently similar", payload["message"])

    def test_supported_contract_preserves_fields_and_classifier_version(self):
        payload = self.known("healthyTomato").model_dump(by_alias=True)
        self.assertEqual(payload["modelVersion"], "disease-v1")
        self.assertEqual(payload["supportedClassCount"], 15)
        self.assertEqual(payload["supportedCrops"], ["Bell Pepper", "Potato", "Tomato"])
        self.assertIsInstance(payload["guidance"], str)
        self.assertIsInstance(payload["confidence"], float)

    def test_schema_forbids_diagnosis_in_rejected_result(self):
        payload = self.service.predict(self.flower_bytes).model_dump()
        for key, value in [("predicted_class", "Tomato___Early_blight"), ("guidance", "Treat disease"), ("confidence", .99)]:
            with self.subTest(field=key), self.assertRaises(ValidationError):
                DiseasePredictionResponse(**{**payload, key: value})

    def test_threshold_boundary_inclusive_and_deterministic(self):
        guard = self.service._guard
        self.assertTrue(guard.accepts_distance(guard.threshold))
        self.assertTrue(guard.accepts_distance(np.nextafter(guard.threshold, -np.inf)))
        self.assertFalse(guard.accepts_distance(np.nextafter(guard.threshold, np.inf)))
        self.assertFalse(guard.accepts_distance(float("nan")))
        self.assertFalse(guard.accepts_distance(float("inf")))

    def test_combined_rule_boundaries_and_no_confidence_only_rejection(self):
        guard = self.service._guard
        d, d2, c = guard.threshold, guard.secondary_threshold, guard.confidence_threshold
        self.assertTrue(guard.accepts_score(d2, .1))
        self.assertFalse(guard.accepts_score(np.nextafter(d2, np.inf), np.nextafter(c, -np.inf)))
        self.assertTrue(guard.accepts_score(d, c))
        self.assertFalse(guard.accepts_score(np.nextafter(d, np.inf), 1.0))
        self.assertFalse(guard.accepts_score(d2, float("nan")))
        self.assertFalse(guard.accepts_score(d2, float("inf")))

    def test_auxiliary_calibration_reproduces_from_validation_only(self):
        from training.calibrate_disease_ood import collect_features
        from training.compare_disease_ood_rules import accepts, calibrate_candidate
        manifest = json.loads((DATASET / "dataset_manifest.json").read_text(encoding="utf-8"))
        records = [row for row in manifest["records"] if row["split"] == "validation"]
        if not all((DATASET / row["localPath"]).is_file() for row in records):
            self.skipTest("Local PlantVillage validation split is not downloaded.")
        self.assertEqual(len(records), 300)
        for record in records:
            self.assertEqual(file_sha256(DATASET / record["localPath"]), record["sha256"].lower())
        features, _, probabilities = collect_features(
            self.service._model, self.service._transform, DATASET, records,
        )
        distances = centroid_distances(features, self.service._guard.centroids)
        validation = [{"distance": float(d), "confidence": float(p.max())}
                      for d, p in zip(distances, probabilities)]
        rule = calibrate_candidate(validation, self.service._guard.threshold, .97, "confidence")
        self.assertEqual(rule["secondaryDistanceThreshold"], self.service._guard.secondary_threshold)
        self.assertEqual(rule["auxiliaryThreshold"], self.service._guard.confidence_threshold)
        self.assertEqual(sum(accepts(row, rule) for row in validation), 294)
        # Function receives no test or OOD samples and uses strict boundary comparisons.
        self.assertEqual(rule["allowedAdditionalValidationRejections"], 4)

    def test_weights_unchanged_and_exact_head_equivalence(self):
        self.assertEqual(file_sha256(MODEL), "7309566b0e13fc4abc83c15462cb5421119ca39a89281f5807b9b15e3955a841")
        image = self.service._decode_image(self.flower_bytes)
        tensor = self.service._transform(image).unsqueeze(0)
        with torch.inference_mode():
            model = self.service._model
            torch.testing.assert_close(model(tensor), model.classifier(extract_embedding(model, tensor)), rtol=0, atol=0)

    def test_missing_guard_fails_closed_even_after_previous_successful_load(self):
        service = DiseaseModelService()
        service.load(MODEL, CLASSES, METADATA, GUARD)
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(DiseaseModelUnavailableError):
                service.load(MODEL, CLASSES, METADATA, Path(directory) / "missing.npz")
            with self.assertRaises(DiseaseModelUnavailableError):
                service.predict(self.flower_bytes)

    def test_corrupt_guard_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.npz"
            path.write_bytes(b"broken artifact")
            service = DiseaseModelService()
            with self.assertRaises(DiseaseModelUnavailableError):
                service.load(MODEL, CLASSES, METADATA, path)
            with self.assertRaises(DiseaseModelUnavailableError):
                service.predict(self.flower_bytes)

    def test_mismatched_or_nonfinite_guard_is_rejected(self):
        guard = self.service._guard
        cases = [
            (guard.centroids, {**guard.metadata, "modelSha256": "wrong"}),
            (guard.centroids, {**guard.metadata, "classLabels": list(reversed(guard.metadata["classLabels"]))}),
            (guard.centroids, {**guard.metadata, "threshold": float("nan")}),
            (guard.centroids, {**guard.metadata, "threshold": 0}),
            (guard.centroids, {**guard.metadata, "secondaryDistanceThreshold": guard.threshold + 1}),
            (guard.centroids, {**guard.metadata, "confidenceThreshold": float("nan")}),
            (guard.centroids, {**guard.metadata, "confidenceThreshold": None}),
            (guard.centroids, {**guard.metadata, "rule": "confidence_only"}),
            (guard.centroids, {**guard.metadata, "guardVersion": "disease-ood-v1"}),
            (np.full_like(guard.centroids, np.nan), guard.metadata),
            (np.zeros((15, 100)), guard.metadata),
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid.npz"
            for index, (centroids, metadata) in enumerate(cases):
                with self.subTest(case=index):
                    np.savez_compressed(path, centroids=centroids, metadata=np.array(json.dumps(metadata)))
                    with self.assertRaises(ValueError):
                        DiseaseOODGuard.load(path, MODEL, guard.metadata["classLabels"], guard.metadata["preprocessing"])

    def test_frozen_300_image_test_set_metrics(self):
        from training.calibrate_disease_ood import collect_features
        manifest = json.loads((DATASET / "dataset_manifest.json").read_text(encoding="utf-8"))
        records = [row for row in manifest["records"] if row["split"] == "test"]
        if not all((DATASET / row["localPath"]).is_file() for row in records):
            self.skipTest("Local PlantVillage test split is not downloaded.")
        features, targets, scores = collect_features(self.service._model, self.service._transform, DATASET, records)
        distances = centroid_distances(features, self.service._guard.centroids)
        accepted = np.array([self.service._guard.accepts_score(d, float(p.max())) for d, p in zip(distances, scores)])
        correct = scores.argmax(axis=1) == targets
        self.assertEqual(len(records), 300)
        self.assertEqual(int(correct.sum()), 268)
        self.assertEqual(int(accepted.sum()), 289)
        self.assertEqual(int((accepted & correct).sum()), 262)


class DiseaseRouteTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(4)
        cls.service = DiseaseModelService()
        cls.service.load(MODEL, CLASSES, METADATA, GUARD)

    async def call(self, data, content_type="image/png"):
        upload = UploadFile(BytesIO(data), filename="test.png", headers=Headers({"content-type": content_type}))
        with patch("app.api.routes.disease_model_service", self.service):
            try:
                return await predict_disease(upload)
            finally:
                self.assertTrue(upload.file.closed)

    async def test_unsupported_route_response_is_not_an_http_failure(self):
        result = await self.call(encoded(Image.new("RGB", (256, 256), "black")))
        self.assertEqual(result.status, "UNSUPPORTED_IMAGE")

    async def test_upload_validation_statuses_unchanged(self):
        for data, mime, expected in [
            (b"", "image/png", 400), (b"bad image", "image/png", 400),
            (b"text", "text/plain", 415), (b"0" * (5 * 1024 * 1024 + 1), "image/png", 413),
        ]:
            with self.subTest(status=expected), self.assertRaises(HTTPException) as caught:
                await self.call(data, mime)
            self.assertEqual(caught.exception.status_code, expected)

    async def test_missing_guard_startup_isolated_health_and_crop_still_work(self):
        import app.main as main
        with tempfile.TemporaryDirectory() as directory:
            settings = Settings(disease_ood_path=Path(directory) / "missing.npz")
            with patch.object(main, "settings", settings):
                async with main.lifespan(main.app):
                    self.assertEqual(get_health(settings).status, "ok")
                    crop = predict_crop(CropPredictionRequest(
                        nitrogen=90, phosphorus=42, potassium=43, temperature=20.88, humidity=82,
                        ph=6.5, rainfall=202,
                    ))
                    self.assertEqual(crop.status, "ok")
                    upload = UploadFile(BytesIO(encoded(Image.new("RGB", (256, 256)))), headers=Headers({"content-type": "image/png"}))
                    with self.assertRaises(HTTPException) as caught:
                        await predict_disease(upload)
                    self.assertEqual(caught.exception.status_code, 503)
            main.disease_model_service.load(MODEL, CLASSES, METADATA, GUARD)


if __name__ == "__main__":
    unittest.main()
