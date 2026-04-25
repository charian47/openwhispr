import Foundation
import CoreGraphics

// MARK: - Output helpers

func emitJSON(_ obj: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: obj),
        let str = String(data: data, encoding: .utf8) else { return }
  let line = str + "\n"
  FileHandle.standardOutput.write(line.data(using: .utf8)!)
  fsync(FileHandle.standardOutput.fileDescriptor)
}

func emitDone() {
  emitJSON(["type": "done"])
}

func emitError(_ message: String) {
  emitJSON(["type": "error", "message": message])
}

// MARK: - TextInjectorChunker
//
// Mirrors the JS chunkText() logic: walks Swift Character values (which
// correspond to Unicode extended grapheme clusters), accumulates UTF-16 code
// unit counts, and flushes a chunk when adding the next grapheme would exceed
// the limit.  MAX_UNITS is 18 for safety (CGEventKeyboardSetUnicodeString
// truncates at 20).

struct TextInjectorChunker {
  static let maxUnits = 18

  static func chunk(_ text: String) -> [String] {
    var chunks: [String] = []
    var current = ""
    var currentUnits = 0

    for ch in text {  // Swift Character == extended grapheme cluster
      let segUnits = ch.utf16.count
      if segUnits > maxUnits {
        // A single grapheme wider than the limit — emit as its own chunk.
        if !current.isEmpty {
          chunks.append(current)
          current = ""
          currentUnits = 0
        }
        chunks.append(String(ch))
        continue
      }
      if currentUnits + segUnits > maxUnits {
        chunks.append(current)
        current = ""
        currentUnits = 0
      }
      current.append(ch)
      currentUnits += segUnits
    }
    if !current.isEmpty {
      chunks.append(current)
    }
    return chunks
  }
}

// MARK: - CGEvent injection

func typeChunk(_ chunk: String) {
  let src = CGEventSource(stateID: .hidSystemState)
  guard let down = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: true),
        let up   = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: false) else {
    return
  }
  down.flags = []
  up.flags   = []
  let utf16 = Array(chunk.utf16)
  utf16.withUnsafeBufferPointer { bp in
    down.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: bp.baseAddress)
    up.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: bp.baseAddress)
  }
  down.post(tap: .cghidEventTap)
  up.post(tap: .cghidEventTap)
  usleep(12_000)  // 12 ms between events
}

// MARK: - Entry point

// Read exactly one line from stdin.
guard let line = readLine(strippingNewline: true), !line.isEmpty else {
  emitError("no input received")
  exit(1)
}

guard let data = line.data(using: .utf8),
      let obj  = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let text  = obj["text"] as? String else {
  emitError("JSON parse failed or 'text' key missing")
  exit(1)
}

let chunks = TextInjectorChunker.chunk(text)
for chunk in chunks {
  typeChunk(chunk)
}

emitDone()
exit(0)
