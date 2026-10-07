#!/usr/bin/env python3
"""Poll test-gated main releases on the Pi; no inbound CI access or third-party packages."""

import argparse
import fcntl
import io
import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.parse
import urllib.request
from contextlib import contextmanager
from pathlib import Path, PurePosixPath

WORKFLOWS = tuple(
    f".github/workflows/{name}.yml"
    for name in ("api", "web", "platform", "e2e", "images")
)
MAX_DOWNLOAD = 64 * 1024 * 1024


def download(url):
    request = urllib.request.Request(
        url, headers={"User-Agent": "viajecito-autodeploy"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(MAX_DOWNLOAD + 1)
    if len(data) > MAX_DOWNLOAD:
        raise ValueError("release response exceeds size limit")
    return data


def get_json(path):
    return json.loads(download("https://api.github.com/repos/" + path))


def eligible(runs, sha):
    latest = {}
    for run in runs:
        path = run.get("path")
        if (
            path not in WORKFLOWS
            or run.get("head_sha") != sha
            or run.get("head_branch") != "main"
            or run.get("event") != "push"
        ):
            continue
        rank = (run.get("run_number", 0), run.get("id", 0), run.get("run_attempt", 0))
        if path not in latest or rank > latest[path][0]:
            latest[path] = (rank, run)
    return all(
        path in latest
        and latest[path][1].get("status") == "completed"
        and latest[path][1].get("conclusion") == "success"
        for path in WORKFLOWS
    )


@contextmanager
def lock(root):
    with (root / ".autodeploy.lock").open("a") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def stage(root, sha, data):
    """Copy allowlisted regular files ourselves, never tar.extract/extractall."""
    temporary = Path(tempfile.mkdtemp(prefix=".stage-", dir=root))
    try:
        seen = set()
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
            for member in archive:
                parts = PurePosixPath(member.name).parts
                if member.name.startswith("/") or ".." in parts:
                    raise ValueError("unsafe archive path")
                if member.isdir():
                    continue
                if not member.isfile():
                    raise ValueError("archive contains non-regular files")
                relative = PurePosixPath(*parts[1:])
                selected = str(relative) == "deploy/compose.pi.yml" or (
                    relative.parent == PurePosixPath("deploy/scripts")
                    and relative.suffix == ".sh"
                )
                if not selected:
                    continue
                if str(relative) in seen or member.size > 1024 * 1024:
                    raise ValueError("duplicate or oversized bundle file")
                seen.add(str(relative))
                target = temporary.joinpath(*relative.parts[1:])
                target.parent.mkdir(parents=True, exist_ok=True)
                with (
                    archive.extractfile(member) as source,
                    target.open("wb") as destination,
                ):
                    shutil.copyfileobj(source, destination)
                target.chmod(0o700 if target.suffix == ".sh" else 0o600)
        required = {
            "deploy/compose.pi.yml",
            "deploy/scripts/deploy.sh",
            "deploy/scripts/lib.sh",
            "deploy/scripts/smoke.sh",
        }
        if not required <= seen:
            raise ValueError("release bundle is incomplete")
        helper = (temporary / "scripts/lib.sh").read_text()
        if not all(
            name in helper for name in ("DEPLOY_IMAGE_TAG", "VIAJECITO_COMPOSE_FILE")
        ):
            raise ValueError("release bundle lacks release overrides")
        releases = root / "releases"
        releases.mkdir(exist_ok=True)
        release = releases / (sha + temporary.name.removeprefix(".stage-"))
        temporary.rename(release)
        return release
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def update(root, repository, check=False):
    root = Path(root)
    with_lock = lock(root)
    try:
        with_lock.__enter__()
    except BlockingIOError:
        return "waiting: another updater is running"
    try:
        sha = get_json(repository + "/git/ref/heads/main")["object"]["sha"]
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            raise ValueError("invalid main SHA")
        state = root / "deployed-sha"
        if state.exists() and state.read_text().strip() == sha:
            return "already deployed: " + sha
        response = get_json(
            repository
            + "/actions/runs?"
            + urllib.parse.urlencode({"head_sha": sha, "per_page": 100})
        )
        if response.get("total_count", 0) > 100 or not eligible(
            response["workflow_runs"], sha
        ):
            return "waiting: main checks/images are not all successful"
        if check:
            return "eligible (check only): " + sha
        release = stage(
            root,
            sha,
            download(f"https://codeload.github.com/{repository}/tar.gz/{sha}"),
        )
        env = {
            **os.environ,
            "VIAJECITO_ROOT": str(root),
            "DEPLOY_IMAGE_TAG": sha,
            "VIAJECITO_COMPOSE_FILE": str(release / "compose.pi.yml"),
            "IMAGE_TAG": sha,
        }
        subprocess.run(
            [
                "docker",
                "compose",
                "--env-file",
                str(root / "pi.env"),
                "--project-directory",
                str(root),
                "-f",
                env["VIAJECITO_COMPOSE_FILE"],
                "config",
                "-q",
            ],
            env=env,
            check=True,
        )
        subprocess.run(
            ["bash", str(release / "scripts/deploy.sh")], env=env, check=True
        )
        temporary_state = root / ".deployed-sha.tmp"
        temporary_state.write_text(sha + "\n")
        temporary_state.replace(state)
        return "deployed: " + sha
    finally:
        with_lock.__exit__(None, None, None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("/srv/viajecito"))
    parser.add_argument("--repository", default="Mateo-Sanchez14/viajecito")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repository):
        parser.error("repository must be owner/name")
    try:
        print(update(args.root, args.repository, args.check), flush=True)
    except (
        OSError,
        ValueError,
        KeyError,
        TypeError,
        tarfile.TarError,
        subprocess.SubprocessError,
    ) as error:
        # Do not expose responses, env values or subprocess command arguments.
        parser.exit(
            1, f"autodeploy failed: {type(error).__name__}; inspect service logs\n"
        )


if __name__ == "__main__":
    main()
