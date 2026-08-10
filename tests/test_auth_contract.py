import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AuthenticationContractTests(unittest.TestCase):
    def test_login_assets_are_local_and_do_not_embed_production_credentials(self):
        html = (ROOT / "static" / "login.html").read_text(encoding="utf-8")
        script = (ROOT / "static" / "login.js").read_text(encoding="utf-8")
        style = (ROOT / "static" / "login.css").read_text(encoding="utf-8")
        combined = "\n".join((html, script, style))

        self.assertIn('id="login-form"', html)
        self.assertIn('autocomplete="username"', html)
        self.assertIn('autocomplete="current-password"', html)
        self.assertIn('/api/auth/login', script)
        self.assertNotIn('value="production-', combined)
        self.assertNotRegex(combined, r"https?://")

    def test_login_and_authenticated_shell_are_not_publicly_cached(self):
        headers = (ROOT / "static" / "_headers").read_text(encoding="utf-8")
        self.assertIn("/login.html\n  Cache-Control: private, no-store", headers)
        worker = (ROOT / "src" / "index.js").read_text(encoding="utf-8")
        auth = (ROOT / "src" / "auth.js").read_text(encoding="utf-8")
        self.assertIn("privateAssetResponse", worker)
        self.assertIn('HttpOnly; Secure; SameSite=Strict', auth)
        self.assertIn('request.headers.get("Origin") === url.origin', auth)
        self.assertIn('crypto.subtle.deriveBits', auth)

    def test_authentication_secrets_are_required_in_both_remote_environments(self):
        config = json.loads((ROOT / "wrangler.jsonc").read_text(encoding="utf-8"))
        for environment in ("preview", "production"):
            self.assertEqual(
                set(config["env"][environment]["secrets"]["required"]),
                {"AUTH_CREDENTIAL", "AUTH_SESSION_SECRET"},
            )

    def test_secret_generator_uses_runtime_verified_iteration_budget(self):
        generator = (ROOT / "scripts" / "generate-auth-secrets.mjs").read_text(encoding="utf-8")
        self.assertIn("const ITERATIONS = 50_000;", generator)


if __name__ == "__main__":
    unittest.main()
