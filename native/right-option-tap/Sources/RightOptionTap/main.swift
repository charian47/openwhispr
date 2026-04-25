import Cocoa
import CoreGraphics

// MARK: - Output helpers

func emitJSON(_ text: String) {
  let data = (text + "\n").data(using: .utf8)!
  FileHandle.standardOutput.write(data)
  fsync(FileHandle.standardOutput.fileDescriptor)
}

func emitReady() { emitJSON(#"{"type":"ready"}"#) }
func emitToggle() { emitJSON(#"{"type":"toggle"}"#) }

// MARK: - Global detector instance

var detector = RightOptionDoubleTapDetector()

// MARK: - CGEventTap callback

let eventMask: CGEventMask =
  (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue)

let eventTapCallback: CGEventTapCallBack = { _, type, event, _ in
  if type == .keyDown {
    detector.onKeyDown()
    return Unmanaged.passUnretained(event)
  }
  if type == .flagsChanged {
    let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
    let fired = detector.onFlagsChanged(keyCode: keyCode, at: Date())
    if fired { emitToggle() }
    return Unmanaged.passUnretained(event)
  }
  return Unmanaged.passUnretained(event)
}

// MARK: - Bootstrap the event tap and run loop

guard let eventTap = CGEvent.tapCreate(
  tap: .cgSessionEventTap,
  place: .headInsertEventTap,
  options: .listenOnly,
  eventsOfInterest: eventMask,
  callback: eventTapCallback,
  userInfo: nil
) else {
  FileHandle.standardError.write(
    "[right-option-tap] failed to create event tap — Accessibility permission required\n"
      .data(using: .utf8)!
  )
  exit(1)
}

let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
CGEvent.tapEnable(tap: eventTap, enable: true)

emitReady()
CFRunLoopRun()
