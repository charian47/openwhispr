/**
 * streamingAudioCapture.js
 *
 * Exports:
 *   RESAMPLER_SOURCE — string containing the StreamingPCM16kResampler class.
 *                      Used verbatim both in AudioWorklet code and in Node tests.
 *   StreamingAudioCapture — class that wires getUserMedia → AudioWorklet → onFrame callbacks.
 */

// ---------------------------------------------------------------------------
// RESAMPLER_SOURCE
// The class is defined *once* here as a string. The AudioWorklet template embeds
// it via ${RESAMPLER_SOURCE}. Tests load it via:
//   new Function(RESAMPLER_SOURCE + "; return StreamingPCM16kResampler;")()
// ---------------------------------------------------------------------------
const RESAMPLER_SOURCE = `
class StreamingPCM16kResampler {
  constructor({ inputRate, frameSamples = 320, onFrame }) {
    this._ratio = inputRate / 16000;
    this._frameSamples = frameSamples;
    this._onFrame = onFrame;
    this._int16 = new Int16Array(frameSamples);
    this._fillIndex = 0;
    this._phase = 0;
  }

  process(float32Samples) {
    for (let i = 0; i < float32Samples.length; i++) {
      this._phase += 1;
      if (this._phase >= this._ratio) {
        this._phase -= this._ratio;
        const s = float32Samples[i];
        const clipped = s > 1.0 ? 1.0 : s < -1.0 ? -1.0 : s;
        this._int16[this._fillIndex++] = clipped < 0 ? (clipped * 0x8000) | 0 : (clipped * 0x7fff) | 0;
        if (this._fillIndex >= this._frameSamples) {
          this._onFrame(this._int16.buffer.slice(0));
          this._int16 = new Int16Array(this._frameSamples);
          this._fillIndex = 0;
        }
      }
    }
  }
}
`;

// ---------------------------------------------------------------------------
// Worklet code template — embeds RESAMPLER_SOURCE so the worklet has the
// resampler class, then wires it to AudioWorkletProcessor.
// ---------------------------------------------------------------------------
function buildWorkletCode() {
  return (
    RESAMPLER_SOURCE +
    `
class PCM16kStreamingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._resampler = new StreamingPCM16kResampler({
      inputRate: sampleRate,
      frameSamples: 320,
      onFrame: (buf) => {
        this.port.postMessage(buf, [buf]);
      },
    });
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    this._resampler.process(input);
    return true;
  }
}

registerProcessor("pcm16k-streaming-processor", PCM16kStreamingProcessor);
`
  );
}

// ---------------------------------------------------------------------------
// StreamingAudioCapture
// Renderer-only class — depends on browser globals (navigator, AudioContext, Blob, URL).
// ---------------------------------------------------------------------------
class StreamingAudioCapture {
  constructor({ onFrame, onError } = {}) {
    this.onFrame = onFrame || (() => {});
    this.onError = onError || ((e) => console.error("[StreamingAudioCapture] error", e));
    this.audioContext = null;
    this.worklet = null;
    this.source = null;
    this.stream = null;
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
    } catch (err) {
      this.onError(err);
      throw err;
    }

    this.audioContext = new AudioContext();
    const workletCode = buildWorkletCode();
    const blob = new Blob([workletCode], { type: "application/javascript" });
    const objectUrl = URL.createObjectURL(blob);

    try {
      await this.audioContext.audioWorklet.addModule(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }

    this.worklet = new AudioWorkletNode(this.audioContext, "pcm16k-streaming-processor");
    this.worklet.port.onmessage = (event) => {
      this.onFrame(new Uint8Array(event.data));
    };

    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.source.connect(this.worklet);
  }

  stop() {
    try { this.source?.disconnect(); } catch (_) {}
    try { this.worklet?.disconnect(); } catch (_) {}
    try { this.audioContext?.close(); } catch (_) {}
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
    }
    this.source = null;
    this.worklet = null;
    this.audioContext = null;
    this.stream = null;
  }
}

export { RESAMPLER_SOURCE, StreamingAudioCapture };
