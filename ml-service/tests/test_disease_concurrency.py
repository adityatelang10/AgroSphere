import asyncio
from io import BytesIO
import threading
import unittest
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from app.api.routes import get_health, predict_disease
from app.core.config import Settings
from app.services.disease_detector import DiseaseModelUnavailableError


class DiseaseConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_inference_runs_off_event_loop_and_health_stays_responsive(self):
        event_loop_thread = threading.get_ident()
        started = threading.Event()
        release = threading.Event()
        worker_threads = []
        result = object()

        def slow_predict(data):
            worker_threads.append(threading.get_ident())
            started.set()
            if not release.wait(timeout=3):
                raise AssertionError("Event loop could not release inference worker")
            self.assertEqual(data, b"fixture")
            return result

        upload = UploadFile(BytesIO(b"fixture"), headers=Headers({"content-type": "image/png"}))
        with patch("app.api.routes.disease_model_service.predict", side_effect=slow_predict):
            task = asyncio.create_task(predict_disease(upload))
            try:
                async def wait_until_started():
                    while not started.is_set():
                        await asyncio.sleep(0.005)

                await asyncio.wait_for(wait_until_started(), timeout=1)
                self.assertEqual(get_health(Settings()).status, "ok")
                self.assertFalse(task.done())
                self.assertNotEqual(worker_threads[0], event_loop_thread)
            finally:
                release.set()
                returned = await task
            self.assertIs(returned, result)
            self.assertTrue(upload.file.closed)

    async def test_worker_errors_keep_existing_http_status_and_close_upload(self):
        upload = UploadFile(BytesIO(b"fixture"), headers=Headers({"content-type": "image/png"}))
        with patch("app.api.routes.disease_model_service.predict", side_effect=DiseaseModelUnavailableError("fixture")):
            with self.assertRaises(HTTPException) as caught:
                await predict_disease(upload)
        self.assertEqual(caught.exception.status_code, 503)
        self.assertTrue(upload.file.closed)


if __name__ == "__main__":
    unittest.main()
