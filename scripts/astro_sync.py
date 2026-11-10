#!/usr/bin/env python3
"""Astro (Mac ASO app) → Solis.

Reads a *copy* of Astro's Core Data store (never the live file) and pushes to Solis prod:
  - every tracked keyword with its Apple Search Ads popularity, Astro difficulty and number of competing apps
  - Astro's daily App Store search positions (only the days Solis does not have yet, unless --full)

Usage:
  python3 scripts/astro_sync.py              push what Astro already has
  python3 scripts/astro_sync.py --refresh    open Astro hidden first, wait until it has refreshed, then push
  python3 scripts/astro_sync.py --full       resend the whole history
  python3 scripts/astro_sync.py --dry-run    read and summarise, send nothing

Auth: the Mac sync token (same as the Carousel Factory): ~/.config/carousel-factory/solis_sync_token or
SOLIS_SYNC_TOKEN. Target: SOLIS_CONVEX_URL (default: production). Standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ASTRO_DIR = Path.home() / "Library/Containers/matteospada.it.ASO/Data/Library/Application Support/Astro"
DB_NAME = "Model.sqlite"
CORE_DATA_EPOCH = 978307200  # 2001-01-01 in Unix time
NOT_RANKED = 1000  # Astro stores 1000 when the app is not in the results it reads
CONVEX_URL = os.environ.get("SOLIS_CONVEX_URL", "https://clear-mockingbird-404.convex.cloud").rstrip("/")
TOKEN_FILE = Path(os.environ.get("SOLIS_SYNC_TOKEN_FILE", Path.home() / ".config/carousel-factory/solis_sync_token"))
BATCH_KEYWORDS = 300
BATCH_RANKS = 400


def log(msg: str) -> None:
    print(f"[astro_sync {datetime.now():%H:%M:%S}] {msg}", flush=True)


def token() -> str:
    t = os.environ.get("SOLIS_SYNC_TOKEN") or (TOKEN_FILE.read_text().strip() if TOKEN_FILE.exists() else "")
    if not t:
        sys.exit(f"No sync token: set SOLIS_SYNC_TOKEN or create {TOKEN_FILE}")
    return t


def call(kind: str, path: str, args: dict) -> object:
    body = json.dumps({"path": path, "args": {**args, "token": token()}, "format": "json"}).encode()
    req = urllib.request.Request(f"{CONVEX_URL}/api/{kind}", data=body, headers={"Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                out = json.loads(res.read())
            if out.get("status") != "success":
                raise RuntimeError(str(out.get("errorMessage", out))[:300])
            return out.get("value")
        except Exception as err:  # network hiccup or Convex OCC retry
            if attempt == 3:
                raise
            log(f"{path}: {err} (nouvel essai)")
            time.sleep(3 * (attempt + 1))
    return None


def refresh_astro(max_wait: int = 1800, quiet: int = 180) -> None:
    """Opens Astro hidden, then waits until its store has changed and stayed quiet for `quiet` seconds."""
    db = ASTRO_DIR / f"{DB_NAME}-wal"
    before = db.stat().st_mtime if db.exists() else 0
    subprocess.run(["open", "-g", "-j", "-a", "Astro"], check=False)
    log("Astro ouvert en arrière-plan, attente de sa mise à jour…")
    start = time.time()
    while time.time() - start < max_wait:
        time.sleep(20)
        now = db.stat().st_mtime if db.exists() else 0
        if now > before and time.time() - now > quiet:
            log("Astro a fini de rafraîchir")
            return
    log("Astro n'a pas fini dans le temps imparti : import de ce qu'il a déjà")


def read_store() -> tuple[list[dict], list[dict]]:
    if not (ASTRO_DIR / DB_NAME).exists():
        sys.exit(f"Base Astro introuvable : {ASTRO_DIR / DB_NAME}")
    with tempfile.TemporaryDirectory() as tmp:
        for suffix in ("", "-wal", "-shm"):
            src = ASTRO_DIR / f"{DB_NAME}{suffix}"
            if src.exists():
                shutil.copy2(src, Path(tmp) / src.name)
        con = sqlite3.connect(f"file:{Path(tmp) / DB_NAME}?mode=ro", uri=True)
        con.row_factory = sqlite3.Row
        kw_rows = con.execute(
            """select k.Z_PK pk, a.ZAPPID apple_id, k.ZTEXT text, k.ZSTORE store, k.ZPOPULARITY popularity,
                      k.ZDIFFICULTY difficulty, k.ZAPPSCOUNT competitors, k.ZLASTUPDATE updated
               from ZKEYWORD k join ZAPPLICATION a on a.Z_PK = k.ZAPPLICATION"""
        ).fetchall()
        points = con.execute("select ZKEYWORD kw, ZRANKING rank, ZDATE at from ZDATAPOINT where ZDATE is not null order by ZDATE").fetchall()
        con.close()

    keywords = {}
    for r in kw_rows:
        if not r["text"] or not r["store"]:
            continue
        keywords[r["pk"]] = {
            "appleId": str(r["apple_id"]),
            "keyword": r["text"],
            "country": r["store"].lower(),
            **({"popularity": int(r["popularity"])} if r["popularity"] is not None else {}),
            **({"difficulty": int(r["difficulty"])} if r["difficulty"] is not None else {}),
            **({"competitors": int(r["competitors"])} if r["competitors"] is not None else {}),
            **({"updatedAt": int((r["updated"] + CORE_DATA_EPOCH) * 1000)} if r["updated"] else {}),
        }

    # One measure per keyword per (local) day: the last one of the day.
    daily: dict[tuple[int, str], int] = {}
    for p in points:
        k = keywords.get(p["kw"])
        if not k:
            continue
        day = datetime.fromtimestamp(p["at"] + CORE_DATA_EPOCH).strftime("%Y-%m-%d")
        daily[(p["kw"], day)] = int(p["rank"])
    ranks = [
        {"appleId": keywords[pk]["appleId"], "keyword": keywords[pk]["keyword"], "country": keywords[pk]["country"], "date": day, "rank": None if rank >= NOT_RANKED or rank <= 0 else rank}
        for (pk, day), rank in daily.items()
    ]
    ranks.sort(key=lambda r: (r["date"], r["appleId"], r["keyword"], r["country"]))
    return list(keywords.values()), ranks


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="ouvrir Astro en arrière-plan et attendre sa mise à jour")
    ap.add_argument("--full", action="store_true", help="renvoyer tout l'historique")
    ap.add_argument("--dry-run", action="store_true", help="lire sans rien envoyer")
    args = ap.parse_args()

    started = int(time.time() * 1000)
    if args.refresh:
        refresh_astro()
    keywords, ranks = read_store()
    by_app = defaultdict(int)
    for k in keywords:
        by_app[k["appleId"]] += 1
    last_day = max((r["date"] for r in ranks), default=None)
    log(f"{len(keywords)} mots-clés ({dict(by_app)}), {len(ranks)} mesures jour, dernière le {last_day}")
    if args.dry_run:
        return

    try:
        since = {} if args.full else (call("query", "asoAstro:status", {}) or {})
        todo = [r for r in ranks if not since.get(r["appleId"]) or r["date"] >= since[r["appleId"]]]
        created = updated = 0
        for i in range(0, len(keywords), BATCH_KEYWORDS):
            res = call("mutation", "asoAstro:upsertKeywords", {"rows": keywords[i : i + BATCH_KEYWORDS]}) or {}
            created += res.get("created", 0)
            updated += res.get("updated", 0)
        log(f"mots-clés : {created} ajoutés, {updated} mis à jour")
        written = 0
        for i in range(0, len(todo), BATCH_RANKS):
            res = call("mutation", "asoAstro:upsertRanks", {"rows": todo[i : i + BATCH_RANKS]}) or {}
            written += res.get("written", 0)
            if (i // BATCH_RANKS) % 25 == 0:
                log(f"positions : {min(i + BATCH_RANKS, len(todo))}/{len(todo)}")
        msg = f"{len(keywords)} mots-clés ({created} nouveaux), {written} positions envoyées, données Astro au {last_day}"
        call("mutation", "asoAstro:recordSync", {"status": "ok", "startedAt": started, "rows": written, "message": msg})
        log(msg)
    except Exception as err:
        try:
            call("mutation", "asoAstro:recordSync", {"status": "error", "startedAt": started, "rows": 0, "message": str(err)[:300]})
        finally:
            raise


if __name__ == "__main__":
    main()
