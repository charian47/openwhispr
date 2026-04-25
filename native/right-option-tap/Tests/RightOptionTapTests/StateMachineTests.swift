import XCTest
@testable import RightOptionTap

final class StateMachineTests: XCTestCase {

  // Helper: build a Date at an arbitrary fixed offset so tests are deterministic.
  func t(_ seconds: Double) -> Date {
    Date(timeIntervalSinceReferenceDate: seconds)
  }

  // Helper: perform one full tap (press then release) of right-Option.
  // Returns (pressResult, releaseResult).
  @discardableResult
  func tap(_ detector: inout RightOptionDoubleTapDetector, pressAt: Double, releaseAt: Double) -> (Bool, Bool) {
    let p = detector.onFlagsChanged(keyCode: RIGHT_OPTION_KEYCODE, at: t(pressAt))
    let r = detector.onFlagsChanged(keyCode: RIGHT_OPTION_KEYCODE, at: t(releaseAt))
    return (p, r)
  }

  // MARK: - 1. Single tap → does NOT emit toggle

  func testSingleTapNoToggle() {
    var d = RightOptionDoubleTapDetector()
    let (press, release) = tap(&d, pressAt: 0.0, releaseAt: 0.1)
    XCTAssertFalse(press, "press should never emit")
    XCTAssertFalse(release, "single tap release should not emit toggle")
  }

  // MARK: - 2. Tap-tap within 350 ms → emits exactly one toggle

  func testDoubleTapWithinWindowEmitsOnce() {
    var d = RightOptionDoubleTapDetector()
    // First tap
    let (p1, r1) = tap(&d, pressAt: 0.0, releaseAt: 0.1)
    XCTAssertFalse(p1)
    XCTAssertFalse(r1, "first tap should not emit")

    // Second tap — released 0.2 s after first release (well within 0.35 s)
    let (p2, r2) = tap(&d, pressAt: 0.2, releaseAt: 0.3)
    XCTAssertFalse(p2)
    XCTAssertTrue(r2, "second tap within window must emit toggle")
  }

  // MARK: - 3. Tap-tap outside the window → does NOT emit

  func testDoubleTapOutsideWindowNoToggle() {
    var d = RightOptionDoubleTapDetector()
    // First tap
    tap(&d, pressAt: 0.0, releaseAt: 0.1)

    // Second tap — released 0.6 s after first release (outside 0.35 s window)
    let (_, r2) = tap(&d, pressAt: 0.55, releaseAt: 0.6)
    XCTAssertFalse(r2, "tap-tap outside 350 ms window must not emit")
  }

  // MARK: - 4. Tap-key-tap → does NOT emit (key between cancels sequence)

  func testTapKeyTapDoesNotEmit() {
    var d = RightOptionDoubleTapDetector()
    // First tap
    tap(&d, pressAt: 0.0, releaseAt: 0.1)

    // Regular key down between the two right-Option taps
    d.onKeyDown()

    // Second tap within the window
    let (_, r2) = tap(&d, pressAt: 0.2, releaseAt: 0.3)
    XCTAssertFalse(r2, "key between taps must cancel the double-tap")
  }

  // MARK: - 5. Tap-tap-tap → emits exactly once on second tap; third starts fresh

  func testTripleTapEmitsOnceOnSecond() {
    var d = RightOptionDoubleTapDetector()

    // First tap
    tap(&d, pressAt: 0.0, releaseAt: 0.1)

    // Second tap — should emit
    let (_, r2) = tap(&d, pressAt: 0.2, releaseAt: 0.3)
    XCTAssertTrue(r2, "second tap should emit toggle")

    // Third tap — after the emit, lastReleaseTime was cleared, so this is
    // the start of a fresh sequence and must NOT emit
    let (_, r3) = tap(&d, pressAt: 0.4, releaseAt: 0.5)
    XCTAssertFalse(r3, "third tap should not emit (it is the first tap of a new sequence)")
  }

  // MARK: - 6. State reset after emit — fresh tap-tap should emit again

  func testStateResetAfterEmitAllowsNextDoubleTap() {
    var d = RightOptionDoubleTapDetector()

    // First double-tap
    tap(&d, pressAt: 0.0, releaseAt: 0.1)
    let (_, r2) = tap(&d, pressAt: 0.2, releaseAt: 0.3)
    XCTAssertTrue(r2, "first double-tap must emit")

    // After state reset, a new double-tap must also emit
    // Third tap becomes "first tap" of new sequence
    tap(&d, pressAt: 1.0, releaseAt: 1.1)
    let (_, r4) = tap(&d, pressAt: 1.2, releaseAt: 1.3)
    XCTAssertTrue(r4, "second double-tap after reset must also emit")
  }

  // MARK: - 7. Different modifier in between → still emits (only non-modifier keyDown breaks the sequence)

  func testOtherModifierBetweenTapsDoesNotCancel() {
    var d = RightOptionDoubleTapDetector()

    // First right-Option tap
    tap(&d, pressAt: 0.0, releaseAt: 0.1)

    // Another modifier (e.g. left-Command, keycode 0x37) changes flags — detector ignores it
    let ignored = d.onFlagsChanged(keyCode: 0x37, at: t(0.15))
    XCTAssertFalse(ignored, "non-right-option flagsChange must return false")

    // Second right-Option tap within window
    let (_, r2) = tap(&d, pressAt: 0.2, releaseAt: 0.3)
    XCTAssertTrue(r2, "other modifier flagsChange must not cancel the double-tap sequence")
  }
}
