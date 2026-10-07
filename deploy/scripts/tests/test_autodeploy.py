"""Offline updater tests. Run: python3 -m unittest deploy/scripts/tests/test_autodeploy.py."""

import importlib.util
import io
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "autodeploy", ROOT / "deploy/scripts/autodeploy.py"
)
updater = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(updater)
SHA = "a" * 40


def runs():
    return [
        {
            "path": path,
            "head_sha": SHA,
            "head_branch": "main",
            "event": "push",
            "status": "completed",
            "conclusion": "success",
            "run_number": 1,
            "run_attempt": 1,
            "id": index,
        }
        for index, path in enumerate(updater.WORKFLOWS)
    ]


def archive(extra=None, overrides=True):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        directory = tarfile.TarInfo("source/deploy")
        directory.type = tarfile.DIRTYPE
        tar.addfile(directory)
        for name in (
            "compose.pi.yml",
            "scripts/deploy.sh",
            "scripts/lib.sh",
            "scripts/smoke.sh",
        ):
            body = b"name: viajecito\n" if name.endswith("yml") else b"#!/bin/bash\n"
            if name == "scripts/lib.sh" and overrides:
                body += b"# DEPLOY_IMAGE_TAG VIAJECITO_COMPOSE_FILE\n"
            info = tarfile.TarInfo("source/deploy/" + name)
            info.size = len(body)
            tar.addfile(info, io.BytesIO(body))
        if extra:
            tar.addfile(extra, io.BytesIO(b"x") if extra.size else None)
    return buffer.getvalue()


class ReleaseGateTests(unittest.TestCase):
    def test_requires_all_exact_workflow_paths(self):
        self.assertTrue(updater.eligible(runs(), SHA))
        self.assertFalse(updater.eligible(runs()[:-1], SHA))
        spoof = runs()
        spoof[0]["path"] = ".github/workflows/untrusted.yml"
        self.assertFalse(updater.eligible(spoof, SHA))

    def test_rejects_wrong_sha_event_branch_or_outcome(self):
        for field, value in (
            ("head_sha", "b" * 40),
            ("event", "pull_request"),
            ("head_branch", "feature"),
            ("status", "in_progress"),
            ("conclusion", "failure"),
        ):
            with self.subTest(field=field):
                candidate = runs()
                candidate[0][field] = value
                self.assertFalse(updater.eligible(candidate, SHA))

    def test_latest_rerun_failure_overrides_earlier_success(self):
        candidate = runs()
        candidate.append({**candidate[0], "run_attempt": 2, "conclusion": "failure"})
        self.assertFalse(updater.eligible(candidate, SHA))

    def test_newer_run_failure_overrides_previous_success(self):
        candidate = runs()
        candidate.append(
            {**candidate[0], "id": 99, "run_number": 2, "conclusion": "failure"}
        )
        self.assertFalse(updater.eligible(candidate, SHA))

    def test_all_workflows_run_on_every_main_push_and_keep_pr_filters(self):
        for path in updater.WORKFLOWS:
            content = (ROOT / path).read_text()
            push = (
                content.split("  push:\n", 1)[1]
                .split("  pull_request:", 1)[0]
                .split("  workflow_dispatch:", 1)[0]
            )
            self.assertIn("branches: [main]", push)
            self.assertNotIn("paths:", push)
            if "  pull_request:" in content:
                self.assertIn("paths:", content.split("  pull_request:", 1)[1])


class StagingTests(unittest.TestCase):
    def test_stages_only_bundle_files_and_accepts_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            release = updater.stage(Path(directory), SHA, archive())
            self.assertTrue((release / "compose.pi.yml").is_file())
            self.assertTrue((release / "scripts/deploy.sh").is_file())

    def test_rejects_bundle_without_shared_release_overrides(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            self.assertRaisesRegex(ValueError, "release overrides"),
        ):
            updater.stage(Path(directory), SHA, archive(overrides=False))

    def test_rejects_traversal_links_and_missing_required_files(self):
        traversal = tarfile.TarInfo("source/deploy/scripts/../../escape.sh")
        traversal.size = 1
        link = tarfile.TarInfo("source/deploy/scripts/link.sh")
        link.type = tarfile.SYMTYPE
        link.linkname = "/etc/passwd"
        empty = io.BytesIO()
        with tarfile.open(fileobj=empty, mode="w:gz"):
            pass
        for data in (archive(traversal), archive(link), empty.getvalue()):
            with self.subTest(), tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(ValueError):
                    updater.stage(Path(directory), SHA, data)
                self.assertEqual(list(Path(directory).iterdir()), [])


class UpdateTests(unittest.TestCase):
    def invoke(self, root, candidate=None, check=False):
        response = {
            "workflow_runs": candidate if candidate is not None else runs(),
            "total_count": 5,
        }
        with (
            patch.object(
                updater, "get_json", side_effect=[{"object": {"sha": SHA}}, response]
            ),
            patch.object(updater, "download", return_value=archive()),
            patch.object(updater.subprocess, "run") as command,
        ):
            result = updater.update(root, "owner/repo", check)
        return result, command

    def test_waits_for_current_main_without_falling_back(self):
        with tempfile.TemporaryDirectory() as directory:
            result, command = self.invoke(Path(directory), [])
            self.assertEqual(
                result, "waiting: main checks/images are not all successful"
            )
            command.assert_not_called()

    def test_check_is_read_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result, command = self.invoke(root, check=True)
            self.assertIn("eligible", result)
            command.assert_not_called()
            self.assertFalse((root / "releases").exists())

    def test_exact_tag_compose_validation_and_success_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result, command = self.invoke(root)
            self.assertIn("deployed", result)
            calls = command.call_args_list
            self.assertEqual(len(calls), 2)
            self.assertEqual(calls[0].args[0][-2:], ["config", "-q"])
            self.assertEqual(calls[1].args[0][0], "bash")
            env = calls[1].kwargs["env"]
            self.assertEqual(env["DEPLOY_IMAGE_TAG"], SHA)
            self.assertEqual(env["VIAJECITO_ROOT"], str(root))
            self.assertTrue(Path(env["VIAJECITO_COMPOSE_FILE"]).is_file())
            self.assertEqual((root / "deployed-sha").read_text().strip(), SHA)

    def test_noop_avoids_checks_and_download(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "deployed-sha").write_text(SHA)
            with (
                patch.object(
                    updater, "get_json", return_value={"object": {"sha": SHA}}
                ) as api,
                patch.object(updater, "download") as fetch,
            ):
                self.assertIn("already deployed", updater.update(root, "owner/repo"))
                self.assertEqual(api.call_count, 1)
                fetch.assert_not_called()

    def test_failed_config_or_deploy_preserves_previous_state(self):
        for failed_call in (1, 2):
            with (
                self.subTest(failed_call=failed_call),
                tempfile.TemporaryDirectory() as directory,
            ):
                root = Path(directory)
                (root / "deployed-sha").write_text("b" * 40)
                outcomes = [None] * (failed_call - 1) + [
                    subprocess.CalledProcessError(1, "test")
                ]
                with (
                    patch.object(
                        updater,
                        "get_json",
                        side_effect=[
                            {"object": {"sha": SHA}},
                            {"workflow_runs": runs(), "total_count": 5},
                        ],
                    ),
                    patch.object(updater, "download", return_value=archive()),
                    patch.object(updater.subprocess, "run", side_effect=outcomes),
                    self.assertRaises(subprocess.CalledProcessError),
                ):
                    updater.update(root, "owner/repo")
                self.assertEqual((root / "deployed-sha").read_text(), "b" * 40)

    def test_lock_contention_does_not_call_github(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with updater.lock(root), patch.object(updater, "get_json") as api:
                self.assertIn("another updater", updater.update(root, "owner/repo"))
                api.assert_not_called()
