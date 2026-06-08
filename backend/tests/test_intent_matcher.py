from app.services.intent_matcher import top_matching_intents


def test_top_matching_intents_orders_by_similarity() -> None:
    email_embedding = [1.0, 0.0, 0.0]
    intents = [
        {"id": "a", "query": "alpha", "embedding": [1.0, 0.0, 0.0]},
        {"id": "b", "query": "beta", "embedding": [0.0, 1.0, 0.0]},
        {"id": "c", "query": "gamma", "embedding": [0.5, 0.0, 0.0]},
    ]

    top = top_matching_intents(email_embedding=email_embedding, intents=intents, limit=2)

    assert [intent["id"] for intent in top] == ["a", "c"]
