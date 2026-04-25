import XCTest
@testable import WhisperKitSidecar

final class AudioRingBufferTests: XCTestCase {
  // 16 kHz mono. 1 second = 16,000 samples.

  func test_empty_buffer_returns_empty_snapshot() {
    let b = AudioRingBuffer(capacitySeconds: 1.0)
    let s = b.snapshot(lastSeconds: 1)
    XCTAssertTrue(s.isEmpty)
  }

  func test_appended_samples_appear_in_snapshot_in_order() {
    let b = AudioRingBuffer(capacitySeconds: 1.0)
    let input: [Float] = [0.1, 0.2, 0.3, 0.4]
    b.append(input)
    let s = b.snapshot(lastSeconds: 1)
    XCTAssertEqual(s.count, 4)
    XCTAssertEqual(s, input)
  }

  func test_snapshot_returns_only_requested_window() {
    // 0.5 second window @ 16 kHz = 8000 samples
    let b = AudioRingBuffer(capacitySeconds: 1.0)
    let input = (0..<10_000).map { Float($0) / 10_000 }
    b.append(input)
    let s = b.snapshot(lastSeconds: 0.5)
    XCTAssertEqual(s.count, 8_000)
    // Should be the LAST 8000 samples, in order.
    XCTAssertEqual(s.first, input[2_000])
    XCTAssertEqual(s.last, input[9_999])
  }

  func test_wrap_around_preserves_temporal_order() {
    // Custom sample-rate trick: capacity = 4 means 4 samples
    // (capacitySeconds * sampleRate = 1.0 * 4 = 4).
    let b = AudioRingBuffer(capacitySeconds: 1.0, sampleRate: 4)
    b.append([1, 2, 3, 4, 5, 6])
    // Use a generous window to grab everything still in the buffer.
    let s = b.snapshot(lastSeconds: 100, sampleRate: 4)
    XCTAssertEqual(s.count, 4)
    XCTAssertEqual(s, [3, 4, 5, 6])
  }

  func test_reset_empties_the_buffer() {
    let b = AudioRingBuffer(capacitySeconds: 1.0)
    b.append([1, 2, 3])
    b.reset()
    XCTAssertTrue(b.snapshot(lastSeconds: 1).isEmpty)
  }
}
