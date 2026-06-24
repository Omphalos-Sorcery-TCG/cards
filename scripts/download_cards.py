#!/usr/bin/env python3
"""
Download all Sorcery TCG card images from the CloudFront CDN.

- Pulls the card list from the public API, expands every set/variant slug.
- Downloads each variant's full-res PNG to <dataDir>/cards/{slug}.png.
- Saves the raw API snapshot to <dataDir>/cards.json (input for split-cards.mjs).
- Resumable: skips files already on disk (verified non-empty + PNG header).
- Concurrent but polite, with retries and a failure log.

Usage:
  python scripts/download_cards.py [dataDir]

dataDir is where cards.json and cards/ are written, resolved against the current
working directory. Defaults to ../public (this package's own data dir).
Re-run anytime; it only fetches what's missing.
"""

from __future__ import annotations

import json
import sys

# Windows consoles default to cp1252 and choke on non-ASCII output; force UTF-8.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

API_URL = "https://api.sorcerytcg.com/api/cards"
CDN_BASE = "https://d27a44hjr9gen3.cloudfront.net/cards"

ROOT = Path(__file__).resolve().parent.parent
# Where cards.json + images are written; override with the first CLI arg.
DATA_DIR = (
    Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "public"
)
OUT_DIR = DATA_DIR / "cards"
MANIFEST = DATA_DIR / "cards.json"   # raw API snapshot for split-cards.mjs
FAIL_LOG = ROOT / "scripts" / "download_failures.txt"

WORKERS = 8           # concurrent downloads; keep modest to be polite to the CDN
RETRIES = 3
TIMEOUT = 30          # seconds per request
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def fetch_card_list() -> list[dict]:
    print(f"Fetching card list from {API_URL} ...")
    req = urllib.request.Request(API_URL, headers={"User-Agent": "sorcery-omphalos/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        data = resp.read()
    cards = json.loads(data.decode("utf-8"))
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(cards, ensure_ascii=False), encoding="utf-8")
    print(f"  {len(cards)} cards; saved raw manifest -> {MANIFEST}")
    return cards


def collect_slugs(cards: list[dict]) -> list[str]:
    slugs: set[str] = set()
    for card in cards:
        for s in card.get("sets", []):
            for v in s.get("variants", []):
                slug = v.get("slug")
                if slug:
                    slugs.add(slug)
    return sorted(slugs)


def already_good(path: Path) -> bool:
    try:
        if path.stat().st_size == 0:
            return False
        with path.open("rb") as f:
            return f.read(8) == PNG_MAGIC
    except OSError:
        return False


def download_one(slug: str) -> tuple[str, str]:
    """Returns (slug, status) where status is 'ok', 'skip', or 'fail: ...'."""
    dest = OUT_DIR / f"{slug}.png"
    if already_good(dest):
        return slug, "skip"

    url = f"{CDN_BASE}/{slug}.png"
    tmp = dest.with_suffix(".png.part")
    last_err = ""
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "sorcery-omphalos/1.0"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                body = resp.read()
            if body[:8] != PNG_MAGIC:
                last_err = "not a PNG response"
                raise ValueError(last_err)
            tmp.write_bytes(body)
            tmp.replace(dest)
            return slug, "ok"
        except (urllib.error.URLError, ValueError, OSError) as e:
            last_err = str(getattr(e, "reason", e)) or repr(e)
            time.sleep(0.5 * attempt)  # simple backoff
    tmp.unlink(missing_ok=True)
    return slug, f"fail: {last_err}"


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cards = fetch_card_list()
    slugs = collect_slugs(cards)
    total = len(slugs)
    print(f"{total} unique variant images -> {OUT_DIR}\n")

    done = ok = skipped = 0
    failures: list[str] = []

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(download_one, s): s for s in slugs}
        for fut in as_completed(futures):
            slug, status = fut.result()
            done += 1
            if status == "ok":
                ok += 1
            elif status == "skip":
                skipped += 1
            else:
                failures.append(f"{slug}\t{status}")
            if done % 25 == 0 or done == total:
                print(f"  [{done}/{total}] ok={ok} skip={skipped} fail={len(failures)}",
                      end="\r", flush=True)

    print()  # newline after progress
    if failures:
        FAIL_LOG.write_text("\n".join(failures), encoding="utf-8")
        print(f"\n{len(failures)} failed. Logged -> {FAIL_LOG}")
        print("Re-run the script to retry just the missing ones.")
    else:
        FAIL_LOG.unlink(missing_ok=True)
        print("\nAll images present. ✓")

    print(f"\nDownloaded {ok}, already had {skipped}, failed {len(failures)}, of {total}.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
