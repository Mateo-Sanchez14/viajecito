"""Offline CI roster regressions: real make expansion, mocked curl/Docker only."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MOCK = """import json, os, sys
from pathlib import Path
name = Path(sys.argv[0]).name
with open(os.environ["SEED_TEST_LOG"], "a") as log:
    log.write(json.dumps({"command": name, "args": sys.argv[1:]}) + "\\n")
sys.exit(int(os.environ.get("SEED_TEST_" + name.upper() + "_STATUS", "0")))
"""


def run_seed(curl_status=0, docker_status=0):
    with tempfile.TemporaryDirectory() as directory:
        directory = Path(directory)
        bin_dir = directory / "bin"
        bin_dir.mkdir()
        for name in ("curl", "docker"):
            executable = bin_dir / name
            executable.write_text(f"#!{sys.executable}\n" + MOCK)
            executable.chmod(0o700)
        # A real file must not shadow the PHONY setup target.
        (directory / "seed-e2e-roster").touch()
        log = directory / "calls.jsonl"
        environment = {
            **os.environ,
            "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
            "SEED_TEST_LOG": str(log),
            "SEED_TEST_CURL_STATUS": str(curl_status),
            "SEED_TEST_DOCKER_STATUS": str(docker_status),
        }
        result = subprocess.run(
            [
                "make",
                "--no-print-directory",
                "-f",
                str(ROOT / "Makefile"),
                "seed-e2e-roster",
                "E2E_PHONE=+5491100000011",
                "E2E_LOGIN_PHONE=+5491100000012",
            ],
            cwd=directory,
            env=environment,
            check=False,
            capture_output=True,
            text=True,
        )
        calls = (
            [json.loads(line) for line in log.read_text().splitlines()]
            if log.exists()
            else []
        )
        return result, calls


class E2ECIRosterTests(unittest.TestCase):
    def test_ci_seeds_after_bootstrap_and_before_browser_login(self):
        workflow = (ROOT / ".github/workflows/e2e.yml").read_text()
        bootstrap = workflow.index("run: make bootstrap-dev-crew")
        seed = workflow.index("run: make seed-e2e-roster")
        login = workflow.index("run: pnpm test:e2e")
        self.assertLess(bootstrap, seed)
        self.assertLess(seed, login)
        self.assertEqual(workflow.count("run: make seed-e2e-roster"), 1)

    def test_target_reuses_recipe_and_is_advertised_in_help(self):
        makefile = (ROOT / "Makefile").read_text()
        self.assertRegex(
            makefile, r"seed-e2e-roster: ## [^\n]+\n\t\$\(SEED_E2E_ROSTER\)"
        )
        phony = next(
            line for line in makefile.splitlines() if line.startswith(".PHONY:")
        )
        self.assertIn("seed-e2e-roster", phony.split())
        help_result = subprocess.run(
            ["make", "help"], cwd=ROOT, capture_output=True, text=True, check=True
        )
        self.assertIn("seed-e2e-roster", help_result.stdout)

    def test_seed_enrolls_both_configured_phones_then_ticks_once(self):
        result, calls = run_seed()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([call["command"] for call in calls], ["curl", "docker"])
        args = calls[0]["args"]
        self.assertIn("PUT", args)
        self.assertIn("http://localhost:4000/__groups/120363000000000000@g.us", args)
        people = json.loads(args[args.index("-d") + 1])
        self.assertEqual(
            [p["jid"] for p in people],
            ["5491100000011@s.whatsapp.net", "5491100000012@s.whatsapp.net"],
        )
        self.assertEqual(
            [p["phone_number"] for p in people], [p["jid"] for p in people]
        )
        self.assertEqual([p["display_name"] for p in people], ["Admin", "Login"])
        self.assertEqual(
            calls[1]["args"],
            ["compose", "exec", "-T", "api", "python", "manage.py", "tick"],
        )

    def test_failed_seed_stops_before_tick(self):
        result, calls = run_seed(curl_status=7)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual([call["command"] for call in calls], ["curl"])

    def test_tick_failure_is_not_hidden(self):
        result, calls = run_seed(docker_status=9)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual([call["command"] for call in calls], ["curl", "docker"])


if __name__ == "__main__":
    unittest.main()
