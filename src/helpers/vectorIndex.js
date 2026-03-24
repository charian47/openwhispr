const { QdrantClient } = require("@qdrant/js-client-rest");
const localEmbeddings = require("./localEmbeddings");
const { LocalEmbeddings } = localEmbeddings;
const debugLogger = require("./debugLogger");

class VectorIndex {
  constructor() {
    this.client = null;
    this.collectionName = "notes";
  }

  init(port) {
    this.client = new QdrantClient({ host: "127.0.0.1", port });
  }

  async ensureCollection() {
    if (!this.client) return;
    try {
      await this.client.getCollection(this.collectionName);
    } catch {
      try {
        await this.client.createCollection(this.collectionName, {
          vectors: { size: 384, distance: "Cosine" },
        });
      } catch (err) {
        debugLogger.error("Failed to create Qdrant collection", { error: err.message });
      }
    }
  }

  async upsertNote(noteId, text) {
    if (!this.client) return;
    try {
      const vector = await localEmbeddings.embedText(text);
      await this.client.upsert(this.collectionName, {
        points: [{ id: noteId, vector: Array.from(vector), payload: {} }],
      });
    } catch (err) {
      debugLogger.debug("Vector index upsert failed", { noteId, error: err.message });
    }
  }

  async deleteNote(noteId) {
    if (!this.client) return;
    try {
      await this.client.delete(this.collectionName, { points: [noteId] });
    } catch (err) {
      debugLogger.debug("Vector index delete failed", { noteId, error: err.message });
    }
  }

  async search(queryText, limit = 5) {
    if (!this.client) return [];
    try {
      const vector = await localEmbeddings.embedText(queryText);
      const results = await this.client.search(this.collectionName, {
        vector: Array.from(vector),
        limit,
      });
      return results.map((r) => ({ noteId: r.id, score: r.score }));
    } catch (err) {
      debugLogger.debug("Vector search failed", { error: err.message });
      return [];
    }
  }

  async reindexAll(notes, onProgress) {
    if (!this.client) return;
    const BATCH_SIZE = 50;
    for (let i = 0; i < notes.length; i += BATCH_SIZE) {
      const batch = notes.slice(i, i + BATCH_SIZE);
      const texts = batch.map((n) =>
        LocalEmbeddings.noteEmbedText(n.title, n.content, n.enhanced_content)
      );
      try {
        const vectors = await localEmbeddings.embedTexts(texts);
        const points = batch.map((n, j) => ({
          id: n.id,
          vector: Array.from(vectors[j]),
          payload: {},
        }));
        await this.client.upsert(this.collectionName, { points });
      } catch (err) {
        debugLogger.debug("Vector reindex batch failed", { offset: i, error: err.message });
      }
      if (onProgress) onProgress(Math.min(i + BATCH_SIZE, notes.length), notes.length);
    }
  }

  isReady() {
    return this.client !== null;
  }
}

module.exports = new VectorIndex();
