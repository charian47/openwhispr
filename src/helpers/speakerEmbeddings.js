const fs = require("fs");
const path = require("path");
const debugLogger = require("./debugLogger");
const { getModelsDirForService } = require("./modelDirUtils");

const EMBEDDING_DIM = 512;
const MIN_SEGMENT_SECONDS = 2;
const MODEL_FILE = "3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx";

class SpeakerEmbeddings {
  constructor() {
    this.session = null;
    this.modelPath = path.join(getModelsDirForService("diarization"), MODEL_FILE);
  }

  isAvailable() {
    return fs.existsSync(this.modelPath);
  }

  async _ensureLoaded() {
    if (this.session) return;

    if (!this.isAvailable()) {
      throw new Error(`Speaker embedding model not found at ${this.modelPath}`);
    }

    debugLogger.debug("speaker-embeddings loading model", { modelPath: this.modelPath });

    const ort = require("onnxruntime-node");
    this.session = await ort.InferenceSession.create(this.modelPath);

    debugLogger.debug("speaker-embeddings model loaded");
  }

  async extractEmbedding(wavPath, startSec, endSec) {
    if (endSec - startSec < MIN_SEGMENT_SECONDS) return null;

    await this._ensureLoaded();

    const buf = fs.readFileSync(wavPath);
    const { sampleRate, dataOffset } = this._parseWavHeader(buf);

    const startSample = Math.floor(startSec * sampleRate);
    const endSample = Math.floor(endSec * sampleRate);
    const numSamples = endSample - startSample;

    const samples = new Float32Array(numSamples);
    const bytesPerSample = 2;
    const offset = dataOffset + startSample * bytesPerSample;

    for (let i = 0; i < numSamples; i++) {
      const bytePos = offset + i * bytesPerSample;
      if (bytePos + 1 >= buf.length) break;
      const int16 = buf.readInt16LE(bytePos);
      samples[i] = int16 / 32768;
    }

    const ort = require("onnxruntime-node");
    const inputName = this.session.inputNames[0];
    const feeds = {
      [inputName]: new ort.Tensor("float32", samples, [1, numSamples]),
    };

    const results = await this.session.run(feeds);
    const output = results[Object.keys(results)[0]];

    return new Float32Array(output.data);
  }

  _parseWavHeader(buf) {
    let offset = 12;
    let sampleRate = 16000;
    let dataOffset = 44;

    while (offset < buf.length - 8) {
      const chunkId = buf.toString("ascii", offset, offset + 4);
      const chunkSize = buf.readUInt32LE(offset + 4);

      if (chunkId === "fmt ") {
        sampleRate = buf.readUInt32LE(offset + 12);
      } else if (chunkId === "data") {
        dataOffset = offset + 8;
        break;
      }

      offset += 8 + chunkSize;
    }

    return { sampleRate, dataOffset };
  }

  computeCentroid(embeddings) {
    if (embeddings.length === 0) return new Float32Array(EMBEDDING_DIM);

    const centroid = new Float32Array(EMBEDDING_DIM);
    for (const emb of embeddings) {
      for (let i = 0; i < EMBEDDING_DIM; i++) {
        centroid[i] += emb[i];
      }
    }
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      centroid[i] /= embeddings.length;
    }
    return centroid;
  }

  cosineSimilarity(a, b) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}

const instance = new SpeakerEmbeddings();
module.exports = instance;
module.exports.SpeakerEmbeddings = SpeakerEmbeddings;
