from app.services.llm.normalize import normalize_classification_dict


def test_normalize_classification_enforces_bounds_and_shape() -> None:
    normalized = normalize_classification_dict(
        {
            "category": "low value",
            "vigilScore": 999,
            "summary": "",
            "actions": {"bad": "shape"},
        }
    )

    assert normalized.category == "Low-Value"
    assert normalized.vigilScore == 100
    assert normalized.summary == "No summary generated."
    assert normalized.actions == []
