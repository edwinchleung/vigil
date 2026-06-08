## LLM classifier eval harness

This folder contains a small offline evaluator for the email classifier. It is intentionally simple:

- **Input:** `dataset.jsonl` where each line is a JSON object (one labeled email + optional matching intents as the harness supplies them; the real pipeline builds intents from the DB and embeddings).
- **Output:** JSON printed to `stdout` with overall accuracy, per-category accuracy, a 3×3 confusion matrix (`expected` → `predicted` for Critical / Relevant / Low-Value), support counts per category, and `parse_failures` when the model response cannot be parsed or normalized.

The dataset is **balanced** (by design: four examples per category) so regressions in one tier show up in both overall score and the per-class metrics.

### Run

From `backend/`:

```bash
uv run python -m evals.run_eval
```

### Dataset format (`dataset.jsonl`)

Each line:

```json
{
  "email_text": "Subject: ...\nFrom: ...\nBody: ...",
  "matching_intents": [{"query":"...", "deadline":null}],
  "expected": {"category":"Relevant"}
}
```

- `expected.category` is required for scoring; it must be one of `Critical`, `Relevant`, or `Low-Value` (to match the confusion matrix and per-category stats).
- `matching_intents` mirrors the **slim** shape the pipeline sends to the LLM (`query` + optional `deadline` only; no `embedding` in the eval file).

The live pipeline still receives a `reasoning` field from the model and strips it before returning `ClassificationResult`; the harness classifies on `category` only.
