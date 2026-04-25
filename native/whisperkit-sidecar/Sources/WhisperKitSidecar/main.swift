import Foundation
import WhisperKit

struct Config {
  var language: String = "auto"
  var modelPath: String? = nil
}

var config = Config()
var whisperKit: WhisperKit?
/// Set to true once the model load task has finished (success or failure).
var modelLoadComplete: Bool = false

let audioBuffer = AudioRingBuffer()
var segmentId: Int = 0

func send(_ dict: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: dict),
        let line = String(data: data, encoding: .utf8) else { return }
  FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
}

func handleLine(_ line: String) {
  guard let data = line.data(using: .utf8),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let type = obj["type"] as? String else {
    send(["type": "error", "code": "bad_message", "message": "unparseable line"])
    return
  }
  switch type {
  case "config":
    if let lang = obj["language"] as? String { config.language = lang }
    send(["type": "config_ack", "language": config.language])
  case "ping":
    send(["type": "pong"])
  case "transcribe_file":
    guard let audioPath = obj["path"] as? String else {
      send(["type": "error", "code": "bad_message", "message": "transcribe_file requires 'path'"])
      return
    }
    guard let wk = whisperKit else {
      send(["type": "error", "code": "model_not_loaded", "message": "model not loaded yet"])
      return
    }
    Task {
      do {
        // Build decoding options honouring the configured language.
        let decodeOptions: DecodingOptions
        if config.language == "auto" {
          // Let WhisperKit detect the language automatically.
          decodeOptions = DecodingOptions(
            verbose: false,
            task: .transcribe,
            language: nil,
            detectLanguage: true
          )
        } else {
          decodeOptions = DecodingOptions(
            verbose: false,
            task: .transcribe,
            language: config.language,
            detectLanguage: false
          )
        }
        let results: [TranscriptionResult] = try await wk.transcribe(
          audioPath: audioPath,
          decodeOptions: decodeOptions
        )
        // Concatenate text from all result segments.
        let text = results.map { $0.text }.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        send(["type": "transcribe_file_done", "path": audioPath, "text": text])
      } catch {
        send(["type": "error", "code": "transcribe_failed", "message": "\(error)"])
      }
    }
  case "audio":
    guard let b64 = obj["pcm"] as? String,
          let data = Data(base64Encoded: b64) else {
      send(["type": "error", "code": "bad_audio", "message": "expected base64 pcm"])
      return
    }
    // Incoming: Int16LE mono 16 kHz. Convert to Float32 -1..1.
    let int16Count = data.count / 2
    var floats: [Float] = []
    floats.reserveCapacity(int16Count)
    data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
      let ptr = raw.bindMemory(to: Int16.self)
      for i in 0..<int16Count {
        floats.append(Float(ptr[i]) / 32768.0)
      }
    }
    audioBuffer.append(floats)
  case "end":
    send(["type": "end_ack"])
    exit(0)
  default:
    send(["type": "error", "code": "unknown_type", "message": type])
  }
}

// Parse CLI args
var i = 1
while i < CommandLine.arguments.count {
  let arg = CommandLine.arguments[i]
  if arg == "--language", i + 1 < CommandLine.arguments.count {
    config.language = CommandLine.arguments[i + 1]
    i += 2
  } else if arg == "--model", i + 1 < CommandLine.arguments.count {
    config.modelPath = CommandLine.arguments[i + 1]
    i += 2
  } else {
    i += 1
  }
}

send(["type": "ready", "stub": true])

// Kick off async model load if a model path was provided.
if let modelPath = config.modelPath {
  Task {
    do {
      whisperKit = try await WhisperKitModelLoader(modelPath: modelPath).load()
      modelLoadComplete = true
      send(["type": "model_loaded", "path": modelPath])
    } catch {
      modelLoadComplete = true
      send(["type": "error", "code": "model_load_failed", "message": "\(error)"])
    }
  }
} else {
  modelLoadComplete = true
}

// Read stdin lines in a background thread so the main RunLoop can service
// async Tasks (model loading, future transcription tasks).
// Blocking readLine() on the main thread would starve Swift Concurrency.
let stdinThread = Thread {
  while let line = readLine(strippingNewline: true) {
    handleLine(line)
  }
  // EOF on stdin — wait for model load to complete before exiting,
  // then clean up and terminate.
  let deadline = Date(timeIntervalSinceNow: 300) // up to 5 min for model load
  while !modelLoadComplete && Date() < deadline {
    Thread.sleep(forTimeInterval: 0.2)
  }
  // Give any pending send() calls a moment to flush.
  Thread.sleep(forTimeInterval: 0.1)
  exit(0)
}
stdinThread.start()

// Run the main run loop forever; exit() calls terminate the process.
RunLoop.main.run()
