import WhisperKit

/// Loads a WhisperKit model from a local folder path.
///
/// Uses `.cpuAndNeuralEngine` compute units for both encoder and decoder,
/// which is optimal on Apple Silicon — the Neural Engine handles inference
/// while the CPU handles the sequential parts.
/// Renamed from `ModelLoader` to avoid colliding with WhisperKit's
/// own `ModelLoader` protocol exposed by the ArgmaxCore module.
struct WhisperKitModelLoader {
  let modelPath: String

  /// Initialise the loader with a path to a directory that contains the model
  /// artefacts (e.g. `AudioEncoder.mlmodelc`, `TextDecoder.mlmodelc`, etc.)
  init(modelPath: String) {
    self.modelPath = modelPath
  }

  /// Builds and returns a ready-to-use `WhisperKit` instance.
  ///
  /// - `prewarm: true` — triggers ANE specialisation before the first real
  ///   transcription request so the initial decode isn't slow.
  /// - `load: true`   — loads the model into memory immediately rather than
  ///   lazily on the first call.
  /// - `download: false` — we are pointing at a local folder; no network
  ///   fetch should ever be attempted.
  func load() async throws -> WhisperKit {
    let computeOptions = ModelComputeOptions(
      audioEncoderCompute: .cpuAndNeuralEngine,
      textDecoderCompute: .cpuAndNeuralEngine
    )

    let wkConfig = WhisperKitConfig(
      modelFolder: modelPath,
      computeOptions: computeOptions,
      verbose: false,
      prewarm: true,
      load: true,
      download: false
    )

    return try await WhisperKit(wkConfig)
  }
}
