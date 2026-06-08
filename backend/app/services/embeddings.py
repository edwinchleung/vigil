class EmbeddingService:
    def __init__(self, model_name: str) -> None:
        from sentence_transformers import SentenceTransformer

        self._model = SentenceTransformer(model_name)

    def embed_text(self, text: str) -> list[float]:
        embedding = self._model.encode(text, normalize_embeddings=True)
        return [float(value) for value in embedding.tolist()]
