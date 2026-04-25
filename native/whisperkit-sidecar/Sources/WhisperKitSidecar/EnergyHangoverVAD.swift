import Foundation

/// Simple energy-based Voice Activity Detector.
/// - `energyThreshold`: RMS level above which a chunk is considered speech.
/// - `hangoverMs`: How many milliseconds of silence to accumulate after speech
///   ends before signalling a segment boundary. Prevents splitting on brief pauses.
/// - `inSpeech`: Readable state; true while the VAD is in the "speech" phase.
/// - `feed(_ samples:) -> Bool`: Returns true exactly once per speech-to-silence
///   transition, when the hangover window has elapsed. Callers should then commit
///   the buffered audio as a finished segment.
/// Renamed from `VoiceActivityDetector` to avoid colliding with
/// WhisperKit's own `VoiceActivityDetector` open class.
final class EnergyHangoverVAD {
    // MARK: - Configuration

    var energyThreshold: Float = 0.005
    var hangoverMs: Int = 400

    private let sampleRate: Double

    // MARK: - State

    /// True while at least one recent chunk exceeded the energy threshold.
    private(set) var inSpeech: Bool = false

    /// How many samples of silence have accumulated since the last speech chunk.
    private var silenceSamples: Int = 0

    private var hangoverSamples: Int {
        Int(Double(hangoverMs) / 1000.0 * sampleRate)
    }

    // MARK: - Init

    init(sampleRate: Double = 16000.0) {
        self.sampleRate = sampleRate
    }

    // MARK: - Interface

    /// Feed a chunk of mono 16 kHz Float32 samples.
    /// - Returns: `true` when a speech-to-silence transition completes the
    ///   hangover window, indicating a segment boundary. Returns `false` otherwise.
    func feed(_ samples: [Float]) -> Bool {
        let energy = rms(samples)
        let isSpeech = energy >= energyThreshold

        if isSpeech {
            inSpeech = true
            silenceSamples = 0
            return false
        } else {
            guard inSpeech else { return false }
            silenceSamples += samples.count
            if silenceSamples >= hangoverSamples {
                inSpeech = false
                silenceSamples = 0
                return true   // segment boundary
            }
            return false
        }
    }

    /// Reset VAD state (e.g. after a forced flush or model switch).
    func reset() {
        inSpeech = false
        silenceSamples = 0
    }

    // MARK: - Helpers

    private func rms(_ samples: [Float]) -> Float {
        guard !samples.isEmpty else { return 0 }
        var sum: Float = 0
        for s in samples { sum += s * s }
        return (sum / Float(samples.count)).squareRoot()
    }
}
