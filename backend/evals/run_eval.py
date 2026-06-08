from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import Settings
from app.services.llm.registry import get_llm_classifier


CATEGORIES = ("Critical", "Relevant", "Low-Value")


@dataclass
class Row:
    email_text: str
    matching_intents: list[dict[str, Any]]
    expected_category: str


def _load_dataset(path: Path) -> list[Row]:
    rows: list[Row] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        obj = json.loads(line)
        expected = obj.get("expected") or {}
        rows.append(
            Row(
                email_text=str(obj.get("email_text") or ""),
                matching_intents=list(obj.get("matching_intents") or []),
                expected_category=str(expected.get("category") or ""),
            )
        )
    return rows


def _empty_category_counts() -> dict[str, int]:
    return {c: 0 for c in CATEGORIES}


def _empty_confusion() -> dict[str, dict[str, int]]:
    return {expected: _empty_category_counts() for expected in CATEGORIES}


def main() -> None:
    settings = Settings()
    llm = get_llm_classifier(settings)

    dataset_path = Path(__file__).with_name("dataset.jsonl")
    rows = _load_dataset(dataset_path)
    if not rows:
        raise SystemExit("No rows found in dataset.jsonl")

    total = 0
    correct = 0
    parse_fail = 0
    per_cat_total = _empty_category_counts()
    per_cat_correct = _empty_category_counts()
    confusion = _empty_confusion()

    for row in rows:
        total += 1
        expected = row.expected_category.strip()
        if expected in per_cat_total:
            per_cat_total[expected] += 1

        try:
            result = llm.classify_email(
                email_text=row.email_text, matching_intents=row.matching_intents
            )
        except Exception:  # noqa: BLE001
            parse_fail += 1
            continue

        predicted = (result.category or "").strip()
        if expected in confusion and predicted in confusion[expected]:
            confusion[expected][predicted] += 1
        if predicted == expected:
            correct += 1
            if expected in per_cat_correct:
                per_cat_correct[expected] += 1

    overall_acc = (correct / total) if total else 0.0
    per_cat_acc = {
        cat: round((per_cat_correct[cat] / per_cat_total[cat]), 4) if per_cat_total[cat] else 0.0
        for cat in CATEGORIES
    }

    print(
        json.dumps(
            {
                "rows": total,
                "accuracy_overall": round(overall_acc, 4),
                "accuracy_per_category": per_cat_acc,
                "support_per_category": per_cat_total,
                "confusion_matrix": confusion,
                "parse_failures": parse_fail,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
