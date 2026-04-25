import Foundation

/// A fixed-capacity ring buffer for Float audio samples.
/// Capacity: 30 seconds at 16 kHz mono = 480,000 samples.
/// Append-only; `snapshot(lastSeconds:)` returns the most recent N seconds
/// in chronological order, handling wrap-around.
final class AudioRingBuffer {
    private let capacity: Int
    private var buffer: [Float]
    private var writeIndex: Int = 0
    private var totalWritten: Int = 0

    init(capacitySeconds: Double = 30.0, sampleRate: Double = 16000.0) {
        self.capacity = Int(capacitySeconds * sampleRate)
        self.buffer = [Float](repeating: 0, count: self.capacity)
    }

    /// Append samples to the ring buffer, overwriting oldest data if full.
    func append(_ samples: [Float]) {
        for sample in samples {
            buffer[writeIndex] = sample
            writeIndex = (writeIndex + 1) % capacity
            totalWritten += 1
        }
    }

    /// Return the most recent `lastSeconds` of audio in chronological order.
    /// If fewer samples have been written, returns everything written so far.
    func snapshot(lastSeconds: Double, sampleRate: Double = 16000.0) -> [Float] {
        let requestedSamples = Int(lastSeconds * sampleRate)
        let available = min(totalWritten, capacity)
        let count = min(requestedSamples, available)
        guard count > 0 else { return [] }

        // `writeIndex` points to the next write location, so one step back is
        // the most recent sample. The oldest of the `count` samples is at:
        //   startIndex = (writeIndex - count + capacity * N) % capacity
        var result = [Float](repeating: 0, count: count)
        let startIndex = ((writeIndex - count) % capacity + capacity) % capacity
        let firstChunk = min(count, capacity - startIndex)
        result[0..<firstChunk] = buffer[startIndex..<(startIndex + firstChunk)]
        if firstChunk < count {
            let remaining = count - firstChunk
            result[firstChunk..<count] = buffer[0..<remaining]
        }
        return result
    }

    /// Clear all buffered audio.
    func reset() {
        buffer = [Float](repeating: 0, count: capacity)
        writeIndex = 0
        totalWritten = 0
    }
}
