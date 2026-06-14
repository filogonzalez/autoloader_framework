#!/usr/bin/env python3
"""Resolve the programmatic model backend per .harness/model.config.yaml.

Stdlib only, so it runs in the empty .venv (no deps). Resolution order:
backend_override_env first, then detect_env (model-serving > anthropic > ide).

Usage:
    python3 .harness/bin/resolve_model.py            # prints chosen backend
    python3 .harness/bin/resolve_model.py --explain  # backend + why
"""
import os
import sys

ORDER = ["databricks-model-serving", "anthropic-api", "ide"]
DETECT = {
    "databricks-model-serving": "DATABRICKS_MODEL_SERVING_ENDPOINT",
    "anthropic-api": "ANTHROPIC_API_KEY",
    "ide": None,
}
OVERRIDE_ENV = "HARNESS_MODEL_BACKEND"


def resolve() -> tuple[str, str]:
    override = os.environ.get(OVERRIDE_ENV, "").strip()
    if override:
        if override not in ORDER:
            return "ide", (
                f"override {OVERRIDE_ENV}={override!r} invalid; "
                "falling back to ide"
            )
        return override, f"forced by {OVERRIDE_ENV}={override}"
    for backend in ORDER:
        env = DETECT[backend]
        if env is None:
            return backend, (
                "no programmatic backend detected; "
                "degrade to IDE/manual fresh-pass"
            )
        if os.environ.get(env):
            return backend, f"detected env {env}"
    return "ide", "fallthrough"


def main() -> int:
    backend, why = resolve()
    if "--explain" in sys.argv:
        print(f"backend={backend}  reason={why}")
    else:
        print(backend)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
