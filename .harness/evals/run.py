#!/usr/bin/env python3
"""Eval runner (Phase 5).

Scores the golden task set and supports regression vs a saved baseline.
Stdlib only (the .venv is empty). Parses the small, known tasks.yaml shape
with a minimal parser -- NOT a general YAML library.

Usage:
    python3 .harness/evals/run.py                 # per-task + aggregate
    python3 .harness/evals/run.py --save-baseline # save current as baseline
    python3 .harness/evals/run.py --regression    # compare to baseline
    python3 .harness/evals/run.py --json          # machine-readable output
"""
import datetime
import json
import os
import subprocess
import sys

HARNESS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVALS = os.path.join(HARNESS, "evals")
ROOT = os.path.dirname(HARNESS)
TASKS = os.path.join(EVALS, "tasks.yaml")
RESULTS_DIR = os.path.join(EVALS, "results")
BASELINE = os.path.join(EVALS, "baseline.json")
AUDIT = os.path.join(HARNESS, "audit.log")


def log(msg: str) -> None:
    stamp = datetime.datetime.utcnow().isoformat()
    with open(AUDIT, "a") as f:
        f.write(f"{stamp}Z\teval: {msg}\n")


def parse_tasks(path: str) -> list[dict]:
    """Parse the fixed tasks.yaml shape (list of `- key: value` blocks)."""
    tasks: list[dict] = []
    cur: dict | None = None
    with open(path) as f:
        for raw in f:
            s = raw.strip()
            if not s or s.startswith("#") or s == "tasks:":
                continue
            if s.startswith("- "):
                if cur:
                    tasks.append(cur)
                cur = {}
                s = s[2:].strip()
            if cur is None or ":" not in s:
                continue
            key, _, val = s.partition(":")
            val = val.strip()
            if len(val) >= 2 and val[0] in "\"'" and val[-1] == val[0]:
                val = val[1:-1]
            cur[key.strip()] = val
    if cur:
        tasks.append(cur)
    return tasks


def score_command(task: dict) -> tuple[bool, str]:
    p = subprocess.run(
        task["cmd"], shell=True, cwd=ROOT,
        capture_output=True, text=True,
    )
    out = (p.stdout + p.stderr).strip()
    expect = task.get("expect", "")
    if task.get("kind") == "exact":
        ok = out == expect
        return ok, f"exit={p.returncode} exact_match={ok}"
    ok = p.returncode == 0 and (expect in out if expect else True)
    tail = f" expect_found={expect in out}" if expect else ""
    return ok, f"exit={p.returncode}{tail}"


def score_rubric(task: dict) -> tuple[str, str]:
    verdict_file = os.path.join(RESULTS_DIR, f"{task['id']}.verdict")
    if not os.path.exists(verdict_file):
        return "pending", "no verifier verdict yet (run verify.sh + verifier)"
    with open(verdict_file) as f:
        v = f.read().strip().upper()
    if "PASS" in v:
        return "pass", "verifier: PASS"
    if "FAIL" in v:
        return "fail", "verifier: FAIL"
    return "pending", f"unrecognized verdict: {v!r}"


def run() -> dict:
    os.makedirs(RESULTS_DIR, exist_ok=True)
    tasks = parse_tasks(TASKS)
    results, auto_total, auto_pass = [], 0, 0
    for t in tasks:
        kind = t.get("kind", "command")
        if kind in ("command", "exact"):
            ok, detail = score_command(t)
            status = "pass" if ok else "fail"
            auto_total += 1
            auto_pass += 1 if ok else 0
        else:
            status, detail = score_rubric(t)
        results.append(
            {"id": t["id"], "kind": kind, "status": status, "detail": detail}
        )
    score = round(auto_pass / auto_total, 3) if auto_total else None
    aggregate = {
        "auto_pass": auto_pass,
        "auto_total": auto_total,
        "auto_score": score,
    }
    return {"results": results, "aggregate": aggregate}


def main() -> int:
    report = run()
    if "--save-baseline" in sys.argv:
        with open(BASELINE, "w") as f:
            json.dump(report, f, indent=2)
        log(f"baseline saved score={report['aggregate']['auto_score']}")
        print(f"Baseline saved -> {BASELINE}")
        return 0

    if "--json" in sys.argv:
        print(json.dumps(report, indent=2))
    else:
        print("== Eval results ==")
        marks = {"pass": "PASS", "fail": "FAIL", "pending": "PEND"}
        for r in report["results"]:
            mark = marks[r["status"]]
            print(f"  [{mark}] {r['id']:<28} ({r['kind']}) — {r['detail']}")
        agg = report["aggregate"]
        print(
            f"\nAuto score: {agg['auto_pass']}/{agg['auto_total']}"
            f"  ({agg['auto_score']})"
        )

    log(f"run auto_score={report['aggregate']['auto_score']}")

    if "--regression" in sys.argv:
        if not os.path.exists(BASELINE):
            print("\nNo baseline; run --save-baseline first.", file=sys.stderr)
            return 0
        with open(BASELINE) as f:
            base = json.load(f)
        b = base["aggregate"]["auto_score"]
        c = report["aggregate"]["auto_score"]
        print(f"\nRegression: baseline={b} current={c}")
        if c is not None and b is not None and c < b:
            print("REGRESSION DETECTED.", file=sys.stderr)
            log(f"REGRESSION baseline={b} current={c}")
            return 1
        print("No regression.")

    failed = any(r["status"] == "fail" for r in report["results"])
    return 1 if failed and "--regression" not in sys.argv else 0


if __name__ == "__main__":
    raise SystemExit(main())
