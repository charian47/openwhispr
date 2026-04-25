import Foundation

public let RIGHT_OPTION_KEYCODE: Int64 = 0x3D  // kVK_RightOption

/// Stateful detector for "double tap of right-Option" with no intervening keys.
/// Pure Swift — no Cocoa/CoreGraphics imports. Feed it events from tests or from a CGEventTap.
public struct RightOptionDoubleTapDetector {
  public let windowSec: Double

  public init(windowSec: Double = 0.35) {
    self.windowSec = windowSec
  }

  // Internal state — public for tests but should not be touched outside.
  public var rightOptionDown: Bool = false
  public var lastReleaseTime: Date? = nil
  public var hadKeyBetween: Bool = false

  /// Call when a flagsChanged event arrives.
  /// `keyCode` is the keyboardEventKeycode field from the CGEvent.
  /// Returns true exactly once, when a valid double-tap completes.
  public mutating func onFlagsChanged(keyCode: Int64, at: Date) -> Bool {
    if keyCode != RIGHT_OPTION_KEYCODE { return false }
    rightOptionDown.toggle()
    if rightOptionDown {
      // Press — don't reset hadKeyBetween here; a key pressed after the first
      // release (and before this press) must still be visible on the release check.
      return false
    }
    // Release: check for valid double-tap, then reset hadKeyBetween.
    defer {
      hadKeyBetween = false
    }
    if let prev = lastReleaseTime,
       at.timeIntervalSince(prev) < windowSec,
       !hadKeyBetween {
      // Valid double-tap; clear state so the next sequence starts fresh.
      lastReleaseTime = nil
      return true
    }
    // Single tap (or stale) — record this release time and wait for second tap.
    lastReleaseTime = at
    return false
  }

  /// Call when a non-modifier key goes down. Cancels any in-flight double-tap.
  public mutating func onKeyDown() {
    hadKeyBetween = true
  }
}
