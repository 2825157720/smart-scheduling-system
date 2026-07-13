import importlib
import asyncio
import json
import unittest


class WorkerSkeletonTests(unittest.TestCase):
    def test_worker_configuration_preserves_same_origin_api_routing(self):
        config = importlib.import_module("src.config")

        self.assertEqual(config.WORKER_NAME, "smart-scheduling-system")
        self.assertEqual(config.API_PREFIX, "/api")
        self.assertEqual(config.TIMEZONE, "Asia/Shanghai")

    def test_preview_and_production_bind_different_d1_databases(self):
        config_path = __import__("pathlib").Path(__file__).resolve().parents[2] / "wrangler.jsonc"
        config = json.loads(config_path.read_text(encoding="utf-8"))

        preview = config["env"]["preview"]["d1_databases"][0]
        production = config["env"]["production"]["d1_databases"][0]
        self.assertEqual(preview["binding"], "DB")
        self.assertEqual(production["binding"], "DB")
        self.assertNotEqual(preview["database_id"], production["database_id"])

    def test_fastapi_app_exposes_live_endpoint_and_json_not_found(self):
        import httpx
        from src.api import app

        async def request(path):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                return await client.get(path)

        live = asyncio.run(request("/api/live"))
        self.assertEqual(live.status_code, 200)
        self.assertEqual(live.headers["content-type"].split(";", 1)[0], "application/json")
        self.assertEqual(live.json(), {"ok": True})

        missing = asyncio.run(request("/api/not-found"))
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.headers["content-type"].split(";", 1)[0], "application/json")
        self.assertEqual(missing.json()["success"], False)
        self.assertIsInstance(missing.json()["msg"], str)


if __name__ == "__main__":
    unittest.main()
