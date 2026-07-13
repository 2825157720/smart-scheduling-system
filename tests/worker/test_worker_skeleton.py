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

        self.assertNotIn("ACCESS_AUD", config["env"]["preview"].get("vars", {}))
        self.assertNotIn("ACCESS_AUD", config["env"]["production"].get("vars", {}))
        self.assertFalse(config["workers_dev"])
        self.assertFalse(config["preview_urls"])
        self.assertTrue(config["env"]["preview"]["workers_dev"])
        self.assertFalse(config["env"]["preview"]["preview_urls"])
        self.assertTrue(config["env"]["production"]["workers_dev"])
        self.assertFalse(config["env"]["production"]["preview_urls"])

    def test_public_worker_does_not_require_cloudflare_access_token(self):
        source_path = __import__("pathlib").Path(__file__).resolve().parents[2] / "src" / "index.js"
        source = source_path.read_text(encoding="utf-8")

        self.assertNotIn("verifyAccessRequest", source)
        self.assertNotIn("ACCESS_AUD", source)

    def test_destructive_actions_use_server_side_admin_secret(self):
        root = __import__("pathlib").Path(__file__).resolve().parents[2]
        worker_source = (root / "src" / "index.js").read_text(encoding="utf-8")
        frontend_source = (root / "static" / "index.html").read_text(encoding="utf-8")

        self.assertIn("env.ADMIN_PASSWORD", worker_source)
        self.assertNotIn('"11050"', worker_source)
        self.assertNotIn("'11050'", frontend_source)

    def test_deployment_environments_use_unique_worker_names(self):
        config_path = __import__("pathlib").Path(__file__).resolve().parents[2] / "wrangler.jsonc"
        config = json.loads(config_path.read_text(encoding="utf-8"))

        names = [config["name"]]
        names.extend(environment["name"] for environment in config["env"].values())
        self.assertEqual(len(names), len(set(names)))

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
