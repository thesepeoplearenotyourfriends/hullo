#!/usr/bin/env python3
# Offline Bluephone / Hullo Trystero vendoring helper.
#
# No network. No npm. No node.
#
# Input directory must contain:
#   nostr-0.25.3.tgz
#   core-0.25.3.tgz
#   secp256k1-3.1.0.tgz
#
# The script verifies package identity/version, copies published browser JS,
# rewrites only the two bare imports in Trystero Nostr to local files, checks
# for remaining executable bare ESM imports, and writes SHA-256 provenance.

import argparse
import hashlib
import json
import re
import shutil
import tarfile
import tempfile
from pathlib import Path

TRYSTERO_VERSION = "0.25.3"
NOBLE_VERSION = "3.1.0"

EXPECTED = {
    "nostr": f"nostr-{TRYSTERO_VERSION}.tgz",
    "core": f"core-{TRYSTERO_VERSION}.tgz",
    "noble": f"secp256k1-{NOBLE_VERSION}.tgz",
}

PACKAGE_IDS = {
    "nostr": ("@trystero-p2p/nostr", TRYSTERO_VERSION),
    "core": ("@trystero-p2p/core", TRYSTERO_VERSION),
    "noble": ("@noble/secp256k1", NOBLE_VERSION),
}

# Only recognize actual top-level-looking ESM source statements.
# This intentionally does NOT match JSDoc example lines such as:
#   * import { sha256 } from '@noble/hashes/sha2.js';
STATIC_ESM_START = re.compile(r"^\s*(?:import|export)\b")
STATIC_ESM_SPEC = re.compile(r"""(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']""")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def safe_extract(tar_path: Path, dest: Path) -> Path:
    with tarfile.open(tar_path, "r:gz") as tf:
        root = dest.resolve()
        for member in tf.getmembers():
            target = (dest / member.name).resolve()
            if target != root and root not in target.parents:
                raise RuntimeError(f"unsafe path in {tar_path.name}: {member.name}")
        tf.extractall(dest)

    package = dest / "package"
    if not package.is_dir():
        raise RuntimeError(f"{tar_path.name}: npm archive has no package/ directory")
    return package


def load_package_json(package: Path) -> dict:
    p = package / "package.json"
    if not p.is_file():
        raise RuntimeError(f"{package}: missing package.json")
    return json.loads(p.read_text(encoding="utf-8"))


def verify_package(package: Path, expected_name: str, expected_version: str) -> dict:
    data = load_package_json(package)
    actual_name = data.get("name")
    actual_version = data.get("version")
    if actual_name != expected_name or actual_version != expected_version:
        raise RuntimeError(
            f"package identity mismatch: expected {expected_name}@{expected_version}, "
            f"got {actual_name}@{actual_version}"
        )
    return data


def copy_license(package: Path, out: Path, name: str) -> None:
    for candidate in ("LICENSE", "LICENSE.md", "LICENSE.txt", "license", "license.md"):
        p = package / candidate
        if p.is_file():
            shutil.copy2(p, out / name)
            return
    raise RuntimeError(f"license file not found in {package}")


def patch_nostr_imports(nostr_dir: Path):
    changes = []
    replacements = {
        "@trystero-p2p/core": "../core/index.mjs",
        "@noble/secp256k1": "../noble-secp256k1/index.js",
    }

    for path in sorted(nostr_dir.rglob("*")):
        if not path.is_file() or path.suffix not in {".mjs", ".js"}:
            continue
        text = path.read_text(encoding="utf-8")
        new = text
        for old, repl in replacements.items():
            new = new.replace(f"'{old}'", f"'{repl}'")
            new = new.replace(f'"{old}"', f'"{repl}"')
        if new != text:
            path.write_text(new, encoding="utf-8")
            changes.append(path)
    return changes


def executable_static_imports(path: Path):
    """Yield module specifiers from real static ESM statements, ignoring docs/comments."""
    lines = path.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not STATIC_ESM_START.match(line):
            i += 1
            continue

        statement = line.strip()
        while ";" not in statement and i + 1 < len(lines):
            i += 1
            statement += "\n" + lines[i].strip()

        for spec in STATIC_ESM_SPEC.findall(statement):
            yield spec
        i += 1


def unresolved_bare_imports(root: Path):
    bad = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in {".mjs", ".js"}:
            continue
        for spec in executable_static_imports(path):
            if (
                spec.startswith("./")
                or spec.startswith("../")
                or spec.startswith("/")
                or spec.startswith("data:")
                or spec.startswith("blob:")
                or "://" in spec
            ):
                continue
            bad.append((str(path.relative_to(root)), spec))
    return bad


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("downloads", type=Path, help="directory containing the three .tgz files")
    ap.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("trystero-vendor-v2"),
        help="output directory (default: ./trystero-vendor-v2)",
    )
    args = ap.parse_args()

    downloads = args.downloads.resolve()
    output = args.output.resolve()

    archives = {}
    for key, filename in EXPECTED.items():
        p = downloads / filename
        if not p.is_file():
            raise SystemExit(f"missing: {p}")
        archives[key] = p

    if output.exists():
        raise SystemExit(
            f"refusing to overwrite existing output: {output}\n"
            "Choose another -o path, or remove the old directory yourself after inspection."
        )

    package_meta = {}

    with tempfile.TemporaryDirectory(prefix="bp-trystero-vendor-") as tmp_s:
        tmp = Path(tmp_s)
        unpacked = {}

        for key, archive in archives.items():
            dest = tmp / key
            dest.mkdir()
            unpacked[key] = safe_extract(archive, dest)
            package_meta[key] = verify_package(unpacked[key], *PACKAGE_IDS[key])

        # Sanity-check the dependency shape we intend to freeze.
        nostr_deps = package_meta["nostr"].get("dependencies", {})
        if nostr_deps.get("@trystero-p2p/core") is None or nostr_deps.get("@noble/secp256k1") is None:
            raise RuntimeError("unexpected Trystero Nostr dependency graph")

        if package_meta["core"].get("dependencies"):
            raise RuntimeError(f"unexpected Trystero core runtime dependencies: {package_meta['core']['dependencies']}")

        if package_meta["noble"].get("dependencies"):
            raise RuntimeError(f"unexpected noble-secp256k1 runtime dependencies: {package_meta['noble']['dependencies']}")

        nostr_dist = unpacked["nostr"] / "dist"
        core_dist = unpacked["core"] / "dist"
        noble_index = unpacked["noble"] / "index.js"

        if not (nostr_dist / "index.mjs").is_file():
            raise RuntimeError("nostr package missing dist/index.mjs")
        if not (core_dist / "index.mjs").is_file():
            raise RuntimeError("core package missing dist/index.mjs")
        if not noble_index.is_file():
            raise RuntimeError("noble package missing index.js")

        output.mkdir(parents=True)
        shutil.copytree(nostr_dist, output / "nostr")
        shutil.copytree(core_dist, output / "core")

        (output / "noble-secp256k1").mkdir()
        shutil.copy2(noble_index, output / "noble-secp256k1" / "index.js")

        licenses = output / "licenses"
        licenses.mkdir()
        copy_license(unpacked["nostr"], licenses, "TRYSTERO-MIT.txt")
        copy_license(unpacked["noble"], licenses, "NOBLE-SECP256K1-MIT.txt")

    changes = patch_nostr_imports(output / "nostr")

    bad = unresolved_bare_imports(output)
    if bad:
        rendered = "\n".join(f"  {p}: {spec}" for p, spec in bad)
        raise SystemExit(
            "STOP: unresolved executable bare runtime imports remain:\n"
            + rendered
            + "\nNothing was silently guessed."
        )

    input_hashes = {p.name: sha256(p) for p in archives.values()}

    output_files = [
        p for p in sorted(output.rglob("*"))
        if p.is_file() and p.name != "PROVENANCE.md"
    ]
    output_hashes = {
        str(p.relative_to(output)): sha256(p)
        for p in output_files
    }

    provenance = [
        "# Bluephone vendored Trystero provenance",
        "",
        f"- `@trystero-p2p/nostr`: `{TRYSTERO_VERSION}`",
        f"- `@trystero-p2p/core`: `{TRYSTERO_VERSION}`",
        f"- `@noble/secp256k1`: `{NOBLE_VERSION}`",
        "- Acquisition: exact-version npm package archives downloaded manually in a browser.",
        "- Build tools used here: none.",
        "- Runtime remote JS imports: none.",
        "",
        "## Input archive SHA-256",
        "",
    ]

    for name, digest in sorted(input_hashes.items()):
        provenance.append(f"- `{name}`: `{digest}`")

    provenance += [
        "",
        "## Local modifications",
        "",
        "Published package files are preserved except for package-style imports in",
        "`nostr/`, rewritten to local relative paths:",
        "",
        "- `@trystero-p2p/core` -> `../core/index.mjs`",
        "- `@noble/secp256k1` -> `../noble-secp256k1/index.js`",
        "",
        f"Files changed by that rewrite: `{len(changes)}`",
        "",
        "The dependency check examines executable static ESM statements only.",
        "JSDoc/example imports embedded in comments are intentionally ignored.",
        "",
        "## Output SHA-256",
        "",
    ]

    for name, digest in sorted(output_hashes.items()):
        provenance.append(f"- `{name}`: `{digest}`")

    (output / "PROVENANCE.md").write_text(
        "\n".join(provenance) + "\n",
        encoding="utf-8",
    )

    print(f"OK: wrote {output}")
    print("Input archive hashes:")
    for name, digest in sorted(input_hashes.items()):
        print(f"  {digest}  {name}")
    print(f"Patched {len(changes)} Trystero Nostr module file(s).")
    print("No unresolved executable bare runtime imports found.")
    print("Review PROVENANCE.md, then give this directory to Codex.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
