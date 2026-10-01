"""Offline configuration regressions. Run: python3 -m unittest deploy/scripts/tests/test_wave_a_config.py."""

import ast
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

DEFAULTS = {
    "DECISIONS_NUDGE_WINDOW_HOURS": "48",
    "DECISIONS_NUDGE_AFTER_DAYS": "3",
    "SKI_TICK_BUDGET_SECONDS": "30",
    "SKI_MANUAL_REPORTS_PER_HOUR": "6",
    "NOTIFICATIONS_VAPID_PUBLIC_KEY": "",
    "NOTIFICATIONS_VAPID_PRIVATE_KEY": "",
    "NOTIFICATIONS_VAPID_SUBJECT": "",
    "NOTIFICATIONS_PUSH_ENDPOINT_HOSTS": "",
    "NOTIFICATIONS_PUSH_BUDGET_SECONDS": "10",
    "LINKPREVIEW_FETCH_SYNC": "0",
    "LINKPREVIEW_MAX_BYTES": "1048576",
    "PROPOSALS_LLM_CLASSIFIER_ENABLED": "0",
    "PROPOSALS_LLM_BASE_URL": "",
    "PROPOSALS_LLM_API_KEY": "",
    "PROPOSALS_LLM_MODEL": "",
}


def env_values(path):
    return dict(
        line.split("=", 1)
        for line in path.read_text().splitlines()
        if line and not line.startswith("#")
    )


class WaveAConfigurationTests(unittest.TestCase):
    def test_env_examples_document_defaults_without_duplicate_keys(self):
        for relative, fetcher in (
            (".env.example", "static"),
            ("deploy/env/api.env.example", "httpx"),
        ):
            with self.subTest(example=relative):
                path = ROOT / relative
                values = env_values(path)
                keys = [
                    line.split("=", 1)[0]
                    for line in path.read_text().splitlines()
                    if line and not line.startswith("#")
                ]
                self.assertEqual(len(keys), len(set(keys)))
                for key, expected in {
                    **DEFAULTS,
                    "LINKPREVIEW_FETCHER": fetcher,
                }.items():
                    with self.subTest(key=key):
                        self.assertEqual(values.get(key), expected)

    def test_examples_document_actual_push_host_defaults(self):
        source = ast.parse(
            (ROOT / "api/notifications/domain/subscriptions.py").read_text()
        )
        hosts = next(
            ast.literal_eval(node.value)
            for node in source.body
            if isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name) and target.id == "DEFAULT_ENDPOINT_HOSTS"
                for target in node.targets
            )
        )
        for relative in (".env.example", "deploy/env/api.env.example"):
            text = (ROOT / relative).read_text()
            for host in hosts:
                with self.subTest(example=relative, host=host):
                    self.assertIn(host, text)

    def test_compose_forces_static_previews_without_local_env(self):
        # Isolated project directory: no developer .env, no containers or network calls.
        with tempfile.TemporaryDirectory() as directory:
            environment = {
                key: value
                for key, value in os.environ.items()
                if not key.startswith("COMPOSE_")
            }
            environment["LINKPREVIEW_FETCHER"] = "httpx"
            result = subprocess.run(
                [
                    "docker",
                    "compose",
                    "--project-directory",
                    directory,
                    "-f",
                    str(ROOT / "docker-compose.yml"),
                    "config",
                    "--format",
                    "json",
                ],
                env=environment,
                capture_output=True,
                text=True,
                check=True,
            )
        api = json.loads(result.stdout)["services"]["api"]
        self.assertEqual(api["environment"].get("LINKPREVIEW_FETCHER"), "static")


if __name__ == "__main__":
    unittest.main()
