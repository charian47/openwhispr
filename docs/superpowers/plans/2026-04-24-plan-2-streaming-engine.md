# Plan 2: Streaming Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a macOS-only, local-only, live-streaming dictation pipeline as a parallel mode alongside the existing Parakeet/whisper.cpp batch engines. After this plan, double-tapping **right-Option** opens a streaming session that types each committed phrase into whatever app has focus, using **WhisperKit turbo on ANE**.

**Architecture:** One new Swift binary for the streaming ASR engine (WhisperKit), one new Swift binary for the right-Option double-tap detector, and new Node helpers for audio streaming, keystroke injection, clipboard-paste fallback, and model download. The existing app shell (windows, control panel, settings, meeting detection, notes, semantic search) is preserved — we add new surfaces rather than rewrite.

**Tech Stack:** Swift + Swift Package Manager + `argmaxinc/WhisperKit` (CoreML + ANE), Node 24, Electron 41, CoreGraphics (CGEventTap, CGEventPost), AVAudioEngine.

**Safety rule for all subprocess calls in this plan:** Use `child_process.execFile` or `child_process.spawn` with argument arrays. Never use `child_process.exec` with string interpolation — it invokes a shell and is prone to command injection. All examples in this plan follow that rule.

**Verification anchor (success definition for this plan):** On a clean M5 Pro install, double-tap right-Option, speak *"Plan two is working"* into a focused Notes window, double-tap right-Option again, and the phrase appears in Notes within ~800 ms of the stop gesture. Must also work in Slack / Cursor / any app (via per-app paste-mode fallback).

---

## Scope boundaries

**In scope:**
- Swift WhisperKit sidecar (lifecycle, protocol, streaming decode, VAD, language switching)
- Swift right-Option double-tap listener binary
- Node audio streamer (16 kHz PCM → socket)
- Node sidecar manager (spawn, supervise, restart-once, IPC to renderer)
- Node streaming injector (CGEventPost + Unicode chunking) + clipboard-paste fallback
- WhisperKit model downloader + first-run UI
- Minimal overlay state updates (listening / transcribing / error / idle)
- Developer-ID signing of the new binaries so Accessibility permission sticks across rebuilds

**Out of scope (deferred to Plan 3):**
- Removing the existing Parakeet / whisper.cpp batch path (still used for manual recording)
- Menu-bar icon and EN/ES language toggle UI (design section §6.2)
- PermissionsGate UI replacement (§6.4)
- Control Panel cleanup (§6.3)
- AI agent command revival — remains deferred as noted in spec §7.2

**Out of scope permanently:**
- Live-rewrite streaming (Strategy B), IME, iOS, Windows, Linux, cloud, translation.

---

## Phase overview

| Phase | What ships at the end | Approx. tasks |
|---|---|---|
| 1 | Swift package scaffold + build script + a stubbed sidecar that opens stdio and echoes messages | 7 |
| 2 | WhisperKit integrated; model loads; fixed-audio-file test transcribes correctly | 8 |
| 3 | Streaming decode loop with VAD; `commit` messages emit on silence | 9 |
| 4 | Node sidecar manager spawns, supervises, surfaces `ready`/`commit`/`error` to main | 7 |
| 5 | Audio streamer captures mic and pushes 16 kHz PCM to the sidecar | 6 |
| 6 | Swift right-Option double-tap detector + Node wrapper | 7 |
| 7 | Streaming injector — keystroke insertion with Unicode chunking | 8 |
| 8 | Paste-mode fallback + per-app override settings | 6 |
| 9 | Model downloader + first-run UI | 6 |
| 10 | Overlay state updates (listening / transcribing / error) | 4 |
| 11 | Developer-ID signing integration + final verification | 5 |

Total: ~73 tasks. Each is 2-5 min of work for a focused engineer. Commit after every task.

**Between phases**: verify the app still boots and the previously-working features (batch dictation history, notes, meeting detection) still function. If a phase breaks something, stop and fix before proceeding.

---

## Task 0: Working branch

**Files:** none

- [ ] **Step 1: Confirm clean state**

```bash
git status
git log --oneline -3
```

Expected: no uncommitted changes; HEAD is past the Plan 1 merge.

- [ ] **Step 2: Create the Plan 2 branch**

```bash
git checkout -b feature/plan-2-streaming-engine
```

- [ ] **Step 3: Verify baseline app still builds**

```bash
npm run build:renderer
```

Expected: builds without errors.

---

## Phase 1 — Swift sidecar scaffold

### Task 1.1: Create Swift package skeleton

**Files:**
- Create: `native/whisperkit-sidecar/Package.swift`
- Create: `native/whisperkit-sidecar/Sources/WhisperKitSidecar/main.swift`

- [ ] **Step 1: Make the directory tree**

```bash
mkdir -p native/whisperkit-sidecar/Sources/WhisperKitSidecar
mkdir -p native/whisperkit-sidecar/Tests/WhisperKitSidecarTests
```

- [ ] **Step 2: Write `Package.swift`**

Exact contents (write to `native/whisperkit-sidecar/Package.swift`):

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "WhisperKitSidecar",
  platforms: [.macOS(.v14)],
  products: [
    .executable(name: "whisperkit-sidecar", targets: ["WhisperKitSidecar"])
  ],
  dependencies: [
    .package(url: "https://github.com/argmaxinc/WhisperKit.git", from: "0.9.0")
  ],
  targets: [
    .executableTarget(
      name: "WhisperKitSidecar",
      dependencies: [
        .product(name: "WhisperKit", package: "WhisperKit")
      ]
    ),
    .testTarget(name: "WhisperKitSidecarTests", dependencies: ["WhisperKitSidecar"])
  ]
)
```

- [ ] **Step 3: Write a minimal `main.swift` that prints and exits**

```swift
import Foundation

FileHandle.standardError.write("whisperkit-sidecar: starting\n".data(using: .utf8)!)
let args = CommandLine.arguments
FileHandle.standardError.write("whisperkit-sidecar: got \(args.count) args\n".data(using: .utf8)!)

// Placeholder — real implementation lands in later tasks.
print(#"{"type":"ready","stub":true}"#)
fflush(stdout)

RunLoop.main.run(until: Date().addingTimeInterval(0.1))
```

- [ ] **Step 4: Build it once manually to confirm the package resolves**

```bash
cd native/whisperkit-sidecar && swift build -c release && cd ../..
```

Expected: compiles without errors. First build takes several minutes because it fetches WhisperKit and its transitive deps.

- [ ] **Step 5: Run the stub**

```bash
./native/whisperkit-sidecar/.build/release/whisperkit-sidecar --test
```

Expected output: `{"type":"ready","stub":true}` on stdout, `whisperkit-sidecar: starting` and the args count on stderr.

- [ ] **Step 6: Commit**

```bash
git add native/whisperkit-sidecar/
git commit -m "feat(sidecar): scaffold WhisperKit Swift package with stub main"
```

### Task 1.2: Build script

**Files:**
- Create: `scripts/build-whisperkit-sidecar.js`
- Modify: `package.json`

- [ ] **Step 1: Write the build script using `execFileSync` (not `exec`)**

Exact contents for `scripts/build-whisperkit-sidecar.js`:

```javascript
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SIDECAR_DIR = path.join(__dirname, "..", "native", "whisperkit-sidecar");
const OUTPUT_DIR = path.join(__dirname, "..", "resources", "bin");
const OUTPUT_BIN = path.join(OUTPUT_DIR, "whisperkit-sidecar");

function main() {
  if (process.platform !== "darwin") {
    console.error("whisperkit-sidecar only builds on macOS");
    process.exit(1);
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  execFileSync(
    "swift",
    ["build", "-c", "release", "--arch", "arm64", "--arch", "x86_64"],
    { cwd: SIDECAR_DIR, stdio: "inherit" }
  );
  const built = path.join(SIDECAR_DIR, ".build", "apple", "Products", "Release", "whisperkit-sidecar");
  if (!fs.existsSync(built)) {
    console.error(`Expected binary at ${built} — not found`);
    process.exit(1);
  }
  fs.copyFileSync(built, OUTPUT_BIN);
  fs.chmodSync(OUTPUT_BIN, 0o755);
  console.log(`[whisperkit-sidecar] -> ${OUTPUT_BIN}`);
}

main();
```

- [ ] **Step 2: Register the script in `package.json`**

Edit `package.json` → `scripts` object. Add:
```
"compile:whisperkit": "node scripts/build-whisperkit-sidecar.js"
```

Append to the `compile:native` chain (a single long string of `&&`-separated invocations):
```
"compile:native": "npm run compile:globe && npm run compile:fast-paste && npm run compile:text-monitor && npm run compile:media-remote && npm run compile:mic-listener && npm run compile:audio-tap && npm run compile:whisperkit"
```

- [ ] **Step 3: Run it**

```bash
npm run compile:whisperkit
```

Expected: `resources/bin/whisperkit-sidecar` exists. Run it:
```bash
./resources/bin/whisperkit-sidecar --test
```
Expected output: `{"type":"ready","stub":true}`.

- [ ] **Step 4: Ensure the built binary is gitignored**

```bash
grep -n "resources/bin" .gitignore || echo "ADD_PATTERN_NEEDED"
```

If not present, add `resources/bin/whisperkit-sidecar` to `.gitignore`.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-whisperkit-sidecar.js package.json .gitignore
git commit -m "feat(build): add whisperkit-sidecar compile script"
```

### Task 1.3: Stdio JSON line protocol

**Files:**
- Modify: `native/whisperkit-sidecar/Sources/WhisperKitSidecar/main.swift`

Use stdio with newline-delimited JSON. (We upgrade to Unix socket in Phase 4 once we have real PCM streaming that would benefit from separated channels.)

- [ ] **Step 1: Rewrite `main.swift`**

```swift
import Foundation

struct Config {
  var language: String = "auto"
  var modelPath: String? = nil
}

var config = Config()

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

// Read stdin lines; blocking readLine returns nil on EOF.
while let line = readLine(strippingNewline: true) {
  handleLine(line)
}
```

- [ ] **Step 2: Rebuild and smoke-test**

```bash
npm run compile:whisperkit
printf '{"type":"ping"}\n{"type":"end"}\n' | ./resources/bin/whisperkit-sidecar
```

Expected output:
```
{"type":"ready","stub":true}
{"type":"pong"}
{"type":"end_ack"}
```

- [ ] **Step 3: Commit**

```bash
git add native/whisperkit-sidecar/
git commit -m "feat(sidecar): add JSON line protocol with config/ping/end messages"
```

---

## Phase 2 — WhisperKit integration

### Task 2.1: Model path resolution and loading

**Files:**
- Create: `native/whisperkit-sidecar/Sources/WhisperKitSidecar/ModelLoader.swift`
- Modify: `native/whisperkit-sidecar/Sources/WhisperKitSidecar/main.swift`

- [ ] **Step 1: Write `ModelLoader.swift`**

```swift
import Foundation
import WhisperKit

struct ModelLoader {
  let modelPath: String

  func load() async throws -> WhisperKit {
    let computeOptions = ModelComputeOptions(
      audioEncoderCompute: .cpuAndNeuralEngine,
      textDecoderCompute: .cpuAndNeuralEngine
    )
    let config = WhisperKitConfig(
      modelFolder: modelPath,
      computeOptions: computeOptions,
      verbose: false,
      prewarm: true,
      load: true
    )
    return try await WhisperKit(config)
  }
}
```

- [ ] **Step 2: Wire `ModelLoader` into `main.swift`**

Add near the top after `var config = Config()`:
```swift
var whisperKit: WhisperKit?
```

After sending `ready`, if a model path was provided, start loading:
```swift
if let modelPath = config.modelPath {
  Task {
    do {
      whisperKit = try await ModelLoader(modelPath: modelPath).load()
      send(["type": "model_loaded", "path": modelPath])
    } catch {
      send(["type": "error", "code": "model_load_failed", "message": "\(error)"])
    }
  }
}
```

- [ ] **Step 3: Rebuild**

```bash
npm run compile:whisperkit
```

Expected: compiles.

- [ ] **Step 4: Download a small test model**

Use the official HuggingFace repo (this is a manual step; the production downloader lands in Phase 9):

```bash
mkdir -p ~/.cache/openwhispr/whisperkit-models
cd ~/.cache/openwhispr/whisperkit-models
git clone --depth 1 https://huggingface.co/argmaxinc/whisperkit-coreml
```

After the clone, you'll have a large repo with many model subfolders. For testing, point at one small variant, e.g. `~/.cache/openwhispr/whisperkit-models/whisperkit-coreml/openai_whisper-tiny.en`.

- [ ] **Step 5: Test model load**

```bash
./resources/bin/whisperkit-sidecar \
  --model "$HOME/.cache/openwhispr/whisperkit-models/whisperkit-coreml/openai_whisper-tiny.en" \
  < /dev/null
```

Expected: within ~10 s, emits `{"type":"model_loaded","path":"..."}` on stdout.

- [ ] **Step 6: Commit**

```bash
git add native/whisperkit-sidecar/
git commit -m "feat(sidecar): load WhisperKit model on startup via ModelLoader"
```

### Task 2.2: Fixed-file transcription (end-to-end sanity)

**Files:**
- Modify: `native/whisperkit-sidecar/Sources/WhisperKitSidecar/main.swift`

Before streaming, verify the whole chain (WhisperKit + model + binary) produces correct text on a known audio file.

- [ ] **Step 1: Add a `transcribe_file` message handler**

In the `switch type` block of `handleLine`, add:

```swift
case "transcribe_file":
  guard let path = obj["path"] as? String else {
    send(["type": "error", "code": "missing_path", "message": "transcribe_file needs path"])
    return
  }
  Task {
    guard let wk = whisperKit else {
      send(["type": "error", "code": "not_loaded", "message": "model not loaded"])
      return
    }
    do {
      let options = DecodingOptions(
        task: .transcribe,
        language: config.language == "auto" ? nil : config.language,
        detectLanguage: config.language == "auto",
        verbose: false
      )
      let result = try await wk.transcribe(audioPath: path, decodeOptions: options)
      send([
        "type": "transcribe_file_done",
        "path": path,
        "text": result.first?.text ?? ""
      ])
    } catch {
      send(["type": "error", "code": "transcribe_failed", "message": "\(error)"])
    }
  }
```

- [ ] **Step 2: Rebuild**

```bash
npm run compile:whisperkit
```

- [ ] **Step 3: Test with a generated file**

Using the built-in `say` command (shell-safe; no user input injected):

```bash
say "the quick brown fox jumps over the lazy dog" -o /tmp/test.aiff
ffmpeg -y -i /tmp/test.aiff -ac 1 -ar 16000 /tmp/test.wav
```

Then:

```bash
(
  sleep 0.2
  echo '{"type":"transcribe_file","path":"/tmp/test.wav"}'
  sleep 10
  echo '{"type":"end"}'
) | ./resources/bin/whisperkit-sidecar \
  --model "$HOME/.cache/openwhispr/whisperkit-models/whisperkit-coreml/openai_whisper-tiny.en"
```

Expected: you see `model_loaded`, then `transcribe_file_done` with a text roughly matching the spoken phrase.

- [ ] **Step 4: Commit**

```bash
git add native/whisperkit-sidecar/
git commit -m "feat(sidecar): add transcribe_file message for end-to-end sanity"
```

---

## Phase 3 — Streaming decode loop

### Task 3.1: Audio ring buffer

**Files:**
- Create: `native/whisperkit-sidecar/Sources/WhisperKitSidecar/AudioRingBuffer.swift`

- [ ] **Step 1: Write `AudioRingBuffer.swift`**

```swift
import Foundation

/// Fixed-capacity ring buffer of Float32 audio samples (16 kHz mono).
/// Default capacity: 30 seconds × 16000 Hz = 480,000 samples.
final class AudioRingBuffer {
  private var buffer: [Float]
  private var writeIndex: Int = 0
  private var count: Int = 0
  let capacity: Int

  init(capacity: Int = 30 * 16000) {
    self.capacity = capacity
    self.buffer = Array(repeating: 0, count: capacity)
  }

  func append(_ samples: [Float]) {
    for s in samples {
      buffer[writeIndex] = s
      writeIndex = (writeIndex + 1) % capacity
      count = min(count + 1, capacity)
    }
  }

  /// Snapshot the last N seconds into a flat array in temporal order.
  func snapshot(lastSeconds: Double) -> [Float] {
    let n = min(count, Int(lastSeconds * 16000))
    guard n > 0 else { return [] }
    let start = (writeIndex - n + capacity) % capacity
    if start + n <= capacity {
      return Array(buffer[start..<start + n])
    } else {
      let firstPart = Array(buffer[start..<capacity])
      let remainder = n - firstPart.count
      let secondPart = Array(buffer[0..<remainder])
      return firstPart + secondPart
    }
  }

  func reset() {
    writeIndex = 0
    count = 0
  }
}
```

- [ ] **Step 2: Rebuild to confirm it compiles**

```bash
npm run compile:whisperkit
```

- [ ] **Step 3: Commit**

```bash
git add native/whisperkit-sidecar/
git commit -m "feat(sidecar): add AudioRingBuffer for 30s rolling window"
```

### Task 3.2: Raw PCM audio input message

**Files:**
- Modify: `native/whisperkit-sidecar/Sources/WhisperKitSidecar/main.swift`

- [ ] **Step 1: Add ring buffer + audio handler**

Near the top:
```swift
let audioBuffer = AudioRingBuffer()
var segmentId: Int = 0
```

In `switch type`:
```swift
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
```

- [ ] **Step 2: Rebuild**

```bash
npm run compile:whisperkit
```

- [ ] **Step 3: Commit**

```bash
git add native/whisperkit-sidecar/
git commit -m "feat(sidecar): accept streaming PCM audio via audio messages"
```

### Task 3.3: VAD + segment detection

**Files:**
- Create: `native/whisperkit-sidecar/Sources/WhisperKitSidecar/VoiceActivityDetector.swift`
- Modify: `native/whisperkit-sidecar/Sources/WhisperKitSidecar/main.swift`

- [ ] **Step 1: Write a simple energy-based VAD**

```swift
// VoiceActivityDetector.swift
import Foundation

final class VoiceActivityDetector {
  private let energyThreshold: Float
  private let hangoverSamples: Int  // 400 ms of silence ⇒ end of segment
  private var silentSamples: Int = 0
  var inSpeech: Bool = false

  init(energyThreshold: Float = 0.005, hangoverMs: Int = 400) {
    self.energyThreshold = energyThreshold
    self.hangoverSamples = hangoverMs * 16  // 16 samples/ms at 16 kHz
  }

  /// Returns true when a segment just ended (speech → silence long enough).
  func feed(_ samples: [Float]) -> Bool {
    var segmentEnded = false
    for s in samples {
      let energy = s * s
      if energy > energyThreshold {
        inSpeech = true
        silentSamples = 0
      } else {
        silentSamples += 1
        if inSpeech && silentSamples >= hangoverSamples {
          segmentEnded = true
          inSpeech = false
        }
      }
    }
    return segmentEnded
  }

  func reset() {
    silentSamples = 0
    inSpeech = false
  }
}
```

- [ ] **Step 2: Integrate VAD + transcription on segment end**

In `main.swift`, add:
```swift
let vad = VoiceActivityDetector()
```

Add the commit helper at file scope:
```swift
func transcribeAndCommit(_ samples: [Float], segmentId: Int) async {
  guard let wk = whisperKit else { return }
  let options = DecodingOptions(
    task: .transcribe,
    language: config.language == "auto" ? nil : config.language,
    detectLanguage: config.language == "auto",
    verbose: false
  )
  do {
    let result = try await wk.transcribe(audioArray: samples, decodeOptions: options)
    let text = result.first?.text ?? ""
    guard !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }
    send(["type": "commit", "segmentId": segmentId, "text": text])
  } catch {
    send(["type": "error", "code": "transcribe_failed", "message": "\(error)"])
  }
}
```

Modify the `audio` case so that after `audioBuffer.append(floats)`:
```swift
if vad.feed(floats) {
  segmentId += 1
  let snapshot = audioBuffer.snapshot(lastSeconds: 30)
  let myId = segmentId
  Task { await transcribeAndCommit(snapshot, segmentId: myId) }
}
```

- [ ] **Step 3: Rebuild**

```bash
npm run compile:whisperkit
```

- [ ] **Step 4: Commit**

```bash
git add native/whisperkit-sidecar/
git commit -m "feat(sidecar): VAD-triggered streaming transcription with commit messages"
```

### Task 3.4: Partial heartbeat + VAD state messages

**Files:**
- Modify: `native/whisperkit-sidecar/Sources/WhisperKitSidecar/main.swift`

Partials in this implementation are heartbeats (no text) — they drive the overlay pulse per spec §4 (commit-only).

- [ ] **Step 1: Add state**

```swift
var lastPartialAt: Date = .distantPast
var lastVadState: String? = nil
```

- [ ] **Step 2: Inside the `audio` case, after `audioBuffer.append(floats)`**

```swift
let wasInSpeech = vad.inSpeech
let segmentEnded = vad.feed(floats)
let newVadState = vad.inSpeech ? "speech" : "silence"
if newVadState != lastVadState {
  send(["type": "vad", "state": newVadState])
  lastVadState = newVadState
}

let now = Date()
if vad.inSpeech && now.timeIntervalSince(lastPartialAt) > 0.3 {
  send(["type": "partial", "segmentId": segmentId, "heartbeat": true])
  lastPartialAt = now
}

if segmentEnded {
  segmentId += 1
  let snapshot = audioBuffer.snapshot(lastSeconds: 30)
  let myId = segmentId
  Task { await transcribeAndCommit(snapshot, segmentId: myId) }
}
```

(This replaces the simpler `vad.feed` block from Task 3.3.)

- [ ] **Step 3: Rebuild**

```bash
npm run compile:whisperkit
```

- [ ] **Step 4: Commit**

```bash
git add native/whisperkit-sidecar/
git commit -m "feat(sidecar): emit partial heartbeats + vad state transitions"
```

---

## Phase 4 — Node sidecar manager

### Task 4.1: WhisperKitSidecarManager

**Files:**
- Create: `src/helpers/whisperKitSidecarManager.js`

- [ ] **Step 1: Write the manager (uses `spawn`, never `exec`)**

```javascript
const { spawn } = require("child_process");
const path = require("path");
const readline = require("readline");
const EventEmitter = require("events");
const debugLogger = require("./debugLogger");

const SIDECAR_PATH = path.join(__dirname, "..", "..", "resources", "bin", "whisperkit-sidecar");

class WhisperKitSidecarManager extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.ready = false;
    this.modelPath = null;
    this.language = "auto";
    this.restartsRemaining = 1;
  }

  async start(modelPath, language = "auto") {
    if (this.proc) {
      debugLogger.log("[whisperkit] already running");
      return;
    }
    this.modelPath = modelPath;
    this.language = language;
    this._spawn();
    await this._awaitReady();
  }

  _spawn() {
    const args = ["--model", this.modelPath, "--language", this.language];
    debugLogger.log(`[whisperkit] spawn args=${JSON.stringify(args)}`);
    // spawn with argv array — no shell involved, no injection risk.
    this.proc = spawn(SIDECAR_PATH, args, { stdio: ["pipe", "pipe", "pipe"] });

    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on("line", (line) => this._onLine(line));

    this.proc.stderr.on("data", (d) => {
      debugLogger.log(`[whisperkit stderr] ${d.toString().trim()}`);
    });

    this.proc.on("exit", (code, signal) => {
      debugLogger.warn(`[whisperkit] exited code=${code} signal=${signal}`);
      this.ready = false;
      this.proc = null;
      this.emit("exit", { code, signal });
      if (this.restartsRemaining > 0) {
        this.restartsRemaining -= 1;
        debugLogger.log("[whisperkit] restarting once");
        this._spawn();
      }
    });
  }

  _onLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      debugLogger.warn(`[whisperkit] non-JSON line: ${line}`);
      return;
    }
    const map = {
      ready: () => { this.ready = true; this.emit("ready"); },
      model_loaded: () => this.emit("modelLoaded", msg),
      commit: () => this.emit("commit", msg),
      partial: () => this.emit("partial", msg),
      vad: () => this.emit("vad", msg),
      error: () => this.emit("sidecarError", msg),
    };
    (map[msg.type] || (() => {}))();
  }

  _awaitReady(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (this.ready) return resolve();
      const timer = setTimeout(
        () => reject(new Error("whisperkit sidecar failed to become ready in time")),
        timeoutMs
      );
      this.once("ready", () => { clearTimeout(timer); resolve(); });
    });
  }

  send(msg) {
    if (!this.proc || !this.proc.stdin.writable) return;
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  setLanguage(language) {
    this.language = language;
    this.send({ type: "config", language });
  }

  sendAudio(int16Buffer) {
    // int16Buffer is a Node Buffer of Int16LE samples at 16 kHz mono.
    this.send({ type: "audio", pcm: int16Buffer.toString("base64") });
  }

  stop() {
    if (!this.proc) return;
    try { this.send({ type: "end" }); } catch {}
    setTimeout(() => { if (this.proc) this.proc.kill("SIGTERM"); }, 500);
    setTimeout(() => { if (this.proc) this.proc.kill("SIGKILL"); }, 2500);
  }
}

module.exports = WhisperKitSidecarManager;
```

- [ ] **Step 2: Write an integration test**

Create `test/whisperkit-sidecar-manager.test.js`:

```javascript
const WhisperKitSidecarManager = require("../src/helpers/whisperKitSidecarManager");
const path = require("path");
const os = require("os");

(async () => {
  const modelPath = path.join(
    os.homedir(), ".cache", "openwhispr", "whisperkit-models",
    "whisperkit-coreml", "openai_whisper-tiny.en"
  );
  const mgr = new WhisperKitSidecarManager();
  mgr.on("commit", (msg) => console.log("[test] commit:", msg));
  mgr.on("partial", (msg) => console.log("[test] partial:", msg));
  mgr.on("sidecarError", (msg) => console.log("[test] error:", msg));

  console.log("[test] starting");
  await mgr.start(modelPath, "auto");
  console.log("[test] sidecar ready");
  await new Promise((resolve) => mgr.once("modelLoaded", resolve));
  console.log("[test] model loaded");

  setTimeout(() => { console.log("[test] stopping"); mgr.stop(); process.exit(0); }, 3000);
})();
```

- [ ] **Step 3: Run the test**

```bash
node test/whisperkit-sidecar-manager.test.js
```

Expected: `[test] sidecar ready` → `[test] model loaded` → `[test] stopping`.

- [ ] **Step 4: Commit**

```bash
git add src/helpers/whisperKitSidecarManager.js test/whisperkit-sidecar-manager.test.js
git commit -m "feat: WhisperKitSidecarManager spawns/supervises the sidecar via JSON protocol"
```

### Task 4.2: Bridge manager to main process + IPC

**Files:**
- Modify: `main.js`
- Modify: `src/helpers/ipcHandlers.js`
- Modify: `preload.js`

- [ ] **Step 1: Instantiate the manager in `main.js`**

Near the top of `main.js`, alongside the other helpers:
```javascript
const WhisperKitSidecarManager = require("./src/helpers/whisperKitSidecarManager");
let whisperKitManager = null;
```

Inside `app.whenReady()` (after other initialization):
```javascript
whisperKitManager = new WhisperKitSidecarManager();

whisperKitManager.on("commit", (msg) => {
  if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
    windowManager.mainWindow.webContents.send("streaming-commit", msg);
  }
});
whisperKitManager.on("partial", (msg) => {
  if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
    windowManager.mainWindow.webContents.send("streaming-partial", msg);
  }
});
whisperKitManager.on("vad", (msg) => {
  if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
    windowManager.mainWindow.webContents.send("streaming-vad", msg);
  }
});
whisperKitManager.on("sidecarError", (msg) => {
  debugLogger.error(`[whisperkit] sidecar error: ${msg.code} ${msg.message}`);
});
```

Inside the `will-quit` handler:
```javascript
if (whisperKitManager) whisperKitManager.stop();
```

- [ ] **Step 2: Add IPC in `ipcHandlers.js`**

`whisperKitManager` needs to be accessible from the handlers. Either pass it in the constructor (recommended — matches existing dependency-injection pattern) or expose it as a getter on `windowManager`.

Assuming constructor injection, add:
```javascript
ipcMain.handle("whisperkit-start", async (_event, { modelPath, language }) => {
  try {
    await this.whisperKitManager.start(modelPath, language);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle("whisperkit-stop", async () => {
  this.whisperKitManager?.stop();
  return { success: true };
});
ipcMain.handle("whisperkit-set-language", async (_event, language) => {
  this.whisperKitManager?.setLanguage(language);
  return { success: true };
});
ipcMain.on("whisperkit-audio", (_event, buffer) => {
  this.whisperKitManager?.sendAudio(buffer);
});
```

- [ ] **Step 3: Expose in `preload.js`**

```javascript
whisperKitStart: (opts) => ipcRenderer.invoke("whisperkit-start", opts),
whisperKitStop: () => ipcRenderer.invoke("whisperkit-stop"),
whisperKitSetLanguage: (lang) => ipcRenderer.invoke("whisperkit-set-language", lang),
whisperKitSendAudio: (buffer) => ipcRenderer.send("whisperkit-audio", buffer),
onStreamingCommit: (cb) => {
  const h = (_e, msg) => cb(msg);
  ipcRenderer.on("streaming-commit", h);
  return () => ipcRenderer.removeListener("streaming-commit", h);
},
onStreamingPartial: (cb) => {
  const h = (_e, msg) => cb(msg);
  ipcRenderer.on("streaming-partial", h);
  return () => ipcRenderer.removeListener("streaming-partial", h);
},
onStreamingVad: (cb) => {
  const h = (_e, msg) => cb(msg);
  ipcRenderer.on("streaming-vad", h);
  return () => ipcRenderer.removeListener("streaming-vad", h);
},
```

- [ ] **Step 4: Rebuild renderer**

```bash
npm run build:renderer
```

- [ ] **Step 5: Commit**

```bash
git add main.js src/helpers/ipcHandlers.js preload.js
git commit -m "feat: wire WhisperKitSidecarManager to renderer via IPC"
```

### Task 4.3: Smoke-boot regression check

**Files:** none

- [ ] **Step 1: Boot the app**

```bash
npm run dev
```

- [ ] **Step 2: Confirm no regressions.** Meeting detection, Qdrant, Globe listener, whisper-server discovery should all log normally. The WhisperKit manager is idle until someone calls `.start()`.

If anything crashes or throws at startup, stop and fix before proceeding.

- [ ] **Step 3: Tear down (Cmd+Q).**

---

## Phase 5 — Audio streamer (mic capture)

### Task 5.1: AudioWorklet for 16 kHz Int16 PCM streaming

**Files:**
- Create: `src/helpers/streamingAudioCapture.js`

- [ ] **Step 1: Write `streamingAudioCapture.js`**

```javascript
const WORKLET_CODE = `
class PCM16kStreamingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._inputRate = sampleRate;
    this._ratio = this._inputRate / 16000;
    this._frameSamples = 320; // 20 ms at 16 kHz
    this._int16 = new Int16Array(this._frameSamples);
    this._fillIndex = 0;
    this._phase = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    // Simple decimation by stepping through input at _ratio.
    for (let i = 0; i < input.length; i++) {
      this._phase += 1;
      if (this._phase >= this._ratio) {
        this._phase -= this._ratio;
        const s = Math.max(-1, Math.min(1, input[i]));
        this._int16[this._fillIndex++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this._fillIndex >= this._frameSamples) {
          this.port.postMessage(this._int16.buffer, [this._int16.buffer]);
          this._int16 = new Int16Array(this._frameSamples);
          this._fillIndex = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm16k-streaming-processor", PCM16kStreamingProcessor);
`;

class StreamingAudioCapture {
  constructor({ onFrame, onError } = {}) {
    this.onFrame = onFrame || (() => {});
    this.onError = onError || ((e) => console.error("capture error", e));
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
    const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    await this.audioContext.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    this.worklet = new AudioWorkletNode(this.audioContext, "pcm16k-streaming-processor");
    this.worklet.port.onmessage = (event) => {
      // event.data is a transferred ArrayBuffer.
      this.onFrame(new Uint8Array(event.data));
    };

    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.source.connect(this.worklet);
  }

  stop() {
    try { this.source?.disconnect(); } catch {}
    try { this.worklet?.disconnect(); } catch {}
    try { this.audioContext?.close(); } catch {}
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
    }
    this.source = this.worklet = this.audioContext = this.stream = null;
  }
}

module.exports = StreamingAudioCapture;
```

- [ ] **Step 2: Commit**

```bash
git add src/helpers/streamingAudioCapture.js
git commit -m "feat: StreamingAudioCapture emits 20ms Int16 16kHz frames"
```

### Task 5.2: useStreamingDictation hook

**Files:**
- Create: `src/hooks/useStreamingDictation.js`

- [ ] **Step 1: Write the hook**

```javascript
import { useCallback, useEffect, useRef, useState } from "react";
import StreamingAudioCapture from "../helpers/streamingAudioCapture";

export function useStreamingDictation() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [vadState, setVadState] = useState("silence");
  const captureRef = useRef(null);

  useEffect(() => {
    const disposeVad = window.electronAPI.onStreamingVad?.((msg) => setVadState(msg.state));
    return () => disposeVad?.();
  }, []);

  const start = useCallback(async ({ modelPath, language }) => {
    if (isStreaming) return;
    const startResult = await window.electronAPI.whisperKitStart({ modelPath, language });
    if (!startResult?.success) {
      console.error("whisperkit start failed:", startResult?.error);
      return;
    }
    const capture = new StreamingAudioCapture({
      onFrame: (u8) => window.electronAPI.whisperKitSendAudio(u8),
      onError: (err) => console.error("capture error:", err),
    });
    await capture.start();
    captureRef.current = capture;
    setIsStreaming(true);
  }, [isStreaming]);

  const stop = useCallback(async () => {
    captureRef.current?.stop();
    captureRef.current = null;
    await window.electronAPI.whisperKitStop();
    setIsStreaming(false);
  }, []);

  return { isStreaming, vadState, start, stop };
}
```

- [ ] **Step 2: Add a dev-only stream-toggle button for testing**

In `src/App.jsx` near the existing mic button, add (conditional on dev env):

```jsx
import { useStreamingDictation } from "./hooks/useStreamingDictation";

// Inside the App function body:
const streaming = useStreamingDictation();

// In the JSX:
{process.env.NODE_ENV === "development" && (
  <button
    type="button"
    style={{ position: "absolute", top: 6, right: 6, fontSize: 10, padding: "2px 6px" }}
    onClick={async () => {
      if (streaming.isStreaming) await streaming.stop();
      else await streaming.start({
        modelPath: "/Users/excallibur/.cache/openwhispr/whisperkit-models/whisperkit-coreml/openai_whisper-tiny.en",
        language: "en",
      });
    }}
  >
    {streaming.isStreaming ? "Stop Stream" : "Start Stream"}
  </button>
)}
```

(The model path is hardcoded for dev-only testing. Plan 3's model-selector UI replaces this.)

- [ ] **Step 3: Manual test**

`npm run dev`, click "Start Stream", speak, click "Stop Stream". In the dev terminal you should see `streaming-vad` transitions and `streaming-commit` messages after each pause.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useStreamingDictation.js src/App.jsx
git commit -m "feat: useStreamingDictation hook + dev-only stream toggle button"
```

---

## Phase 6 — Right-Option double-tap detector

### Task 6.1: Swift CGEventTap binary

**Files:**
- Create: `native/right-option-tap/Package.swift`
- Create: `native/right-option-tap/Sources/RightOptionTap/main.swift`

- [ ] **Step 1: Scaffold the package**

```bash
mkdir -p native/right-option-tap/Sources/RightOptionTap
```

Write `native/right-option-tap/Package.swift`:
```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "RightOptionTap",
  platforms: [.macOS(.v12)],
  products: [.executable(name: "right-option-tap", targets: ["RightOptionTap"])],
  targets: [.executableTarget(name: "RightOptionTap")]
)
```

- [ ] **Step 2: Write the main.swift**

Explicit state tracking of right-Option down/up (not `.maskAlternate`, which doesn't discriminate L vs R). Any non-modifier keyDown between taps aborts the sequence.

```swift
import Cocoa
import CoreGraphics

let RIGHT_OPTION_KEYCODE: Int64 = 0x3D  // kVK_RightOption
let DOUBLE_TAP_WINDOW_SEC: Double = 0.35

var lastReleaseTime: Date? = nil
var hadKeyBetween: Bool = false
var rightOptionDown: Bool = false

func emitReady() {
  FileHandle.standardOutput.write(#"{"type":"ready"}\#n"#.data(using: .utf8)!)
  fsync(FileHandle.standardOutput.fileDescriptor)
}

func emitToggle() {
  FileHandle.standardOutput.write(#"{"type":"toggle"}\#n"#.data(using: .utf8)!)
  fsync(FileHandle.standardOutput.fileDescriptor)
}

let eventMask: CGEventMask =
  (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue)

let eventTapCallback: CGEventTapCallBack = { _, type, event, _ in
  if type == .keyDown {
    hadKeyBetween = true
    return Unmanaged.passUnretained(event)
  }
  if type == .flagsChanged {
    let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
    if keyCode == RIGHT_OPTION_KEYCODE {
      // flagsChanged fires on both press and release.
      // We track our own down/up state by toggling on each event.
      rightOptionDown.toggle()
      if !rightOptionDown {
        // Release
        let now = Date()
        if let prev = lastReleaseTime,
           now.timeIntervalSince(prev) < DOUBLE_TAP_WINDOW_SEC,
           !hadKeyBetween {
          emitToggle()
          lastReleaseTime = nil
        } else {
          lastReleaseTime = now
        }
        hadKeyBetween = false
      } else {
        // Press — reset the key-between flag so we start fresh
        hadKeyBetween = false
      }
    } else {
      // Some other modifier changed — don't count as "key between"
    }
    return Unmanaged.passUnretained(event)
  }
  return Unmanaged.passUnretained(event)
}

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
      .data(using: .utf8)!)
  exit(1)
}

let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
CGEvent.tapEnable(tap: eventTap, enable: true)

emitReady()
CFRunLoopRun()
```

- [ ] **Step 3: Write the build script (uses `execFileSync`)**

Create `scripts/build-right-option-tap.js`:

```javascript
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "native", "right-option-tap");
const OUT_DIR = path.join(__dirname, "..", "resources", "bin");
const OUT_BIN = path.join(OUT_DIR, "right-option-tap");

if (process.platform !== "darwin") {
  console.error("right-option-tap only builds on macOS");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
execFileSync(
  "swift",
  ["build", "-c", "release", "--arch", "arm64", "--arch", "x86_64"],
  { cwd: DIR, stdio: "inherit" }
);
const built = path.join(DIR, ".build", "apple", "Products", "Release", "right-option-tap");
fs.copyFileSync(built, OUT_BIN);
fs.chmodSync(OUT_BIN, 0o755);
console.log("built", OUT_BIN);
```

- [ ] **Step 4: Register the compile step**

In `package.json`:
```
"compile:right-option": "node scripts/build-right-option-tap.js"
```

And append to `compile:native`:
```
"compile:native": "... && npm run compile:whisperkit && npm run compile:right-option"
```

- [ ] **Step 5: Build**

```bash
npm run compile:right-option
```

- [ ] **Step 6: Test manually**

```bash
./resources/bin/right-option-tap
```

First run: macOS will require Accessibility permission for the terminal (or for whatever process invoked the binary). Grant it. After granting, double-tap right-Option — you should see `{"type":"toggle"}` appear on stdout.

- [ ] **Step 7: Commit**

```bash
git add native/right-option-tap/ scripts/build-right-option-tap.js package.json
git commit -m "feat(hotkey): Swift right-Option double-tap detector via CGEventTap"
```

### Task 6.2: Node wrapper for the hotkey binary

**Files:**
- Create: `src/helpers/rightOptionTapManager.js`

- [ ] **Step 1: Write the wrapper (uses `spawn`)**

```javascript
const { spawn } = require("child_process");
const path = require("path");
const readline = require("readline");
const EventEmitter = require("events");
const debugLogger = require("./debugLogger");

const BIN_PATH = path.join(__dirname, "..", "..", "resources", "bin", "right-option-tap");

class RightOptionTapManager extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
  }

  start() {
    if (this.proc) return;
    this.proc = spawn(BIN_PATH, [], { stdio: ["ignore", "pipe", "pipe"] });
    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === "ready") this.emit("ready");
        else if (msg.type === "toggle") this.emit("toggle");
      } catch {}
    });
    this.proc.stderr.on("data", (d) => {
      const text = d.toString().trim();
      debugLogger.warn(`[right-option-tap] ${text}`);
      if (text.includes("Accessibility permission required")) {
        this.emit("permissionMissing");
      }
    });
    this.proc.on("exit", (code) => {
      debugLogger.warn(`[right-option-tap] exited code=${code}`);
      this.proc = null;
      this.emit("exit", { code });
    });
  }

  stop() {
    if (this.proc) {
      this.proc.kill("SIGTERM");
      this.proc = null;
    }
  }
}

module.exports = RightOptionTapManager;
```

- [ ] **Step 2: Commit**

```bash
git add src/helpers/rightOptionTapManager.js
git commit -m "feat(hotkey): Node wrapper spawns right-option-tap binary"
```

### Task 6.3: Wire hotkey → streaming toggle

**Files:**
- Modify: `main.js`
- Modify: `preload.js`
- Modify: `src/hooks/useStreamingDictation.js`

- [ ] **Step 1: Instantiate + wire in `main.js`**

```javascript
const RightOptionTapManager = require("./src/helpers/rightOptionTapManager");
const rightOptionTap = new RightOptionTapManager();

rightOptionTap.on("toggle", () => {
  if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
    windowManager.mainWindow.webContents.send("streaming-hotkey-toggle");
  }
});
rightOptionTap.on("permissionMissing", () => {
  if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
    windowManager.mainWindow.webContents.send("streaming-permission-missing");
  }
});
rightOptionTap.start();
```

Add to `will-quit`:
```javascript
rightOptionTap.stop();
```

- [ ] **Step 2: Preload bindings**

```javascript
onStreamingHotkeyToggle: (cb) => {
  const h = () => cb();
  ipcRenderer.on("streaming-hotkey-toggle", h);
  return () => ipcRenderer.removeListener("streaming-hotkey-toggle", h);
},
onStreamingPermissionMissing: (cb) => {
  const h = () => cb();
  ipcRenderer.on("streaming-permission-missing", h);
  return () => ipcRenderer.removeListener("streaming-permission-missing", h);
},
```

- [ ] **Step 3: Subscribe in `useStreamingDictation`**

Modify the `useEffect`:
```javascript
useEffect(() => {
  const disposeVad = window.electronAPI.onStreamingVad?.((msg) => setVadState(msg.state));
  const disposeHotkey = window.electronAPI.onStreamingHotkeyToggle?.(() => {
    if (isStreaming) {
      stop();
    } else {
      start({
        modelPath: "/Users/excallibur/.cache/openwhispr/whisperkit-models/whisperkit-coreml/openai_whisper-tiny.en",
        language: "auto",
      });
    }
  });
  return () => {
    disposeVad?.();
    disposeHotkey?.();
  };
}, [isStreaming, start, stop]);
```

- [ ] **Step 4: Smoke test**

`npm run dev`. Grant Accessibility to the Electron dev binary. Double-tap right-Option — main process should log `[whisperkit] spawn`. Speak, pause — `streaming-commit` messages appear. Double-tap right-Option — streaming stops.

- [ ] **Step 5: Commit**

```bash
git add main.js preload.js src/hooks/useStreamingDictation.js
git commit -m "feat: right-Option double-tap toggles streaming start/stop"
```

---

## Phase 7 — Streaming injector

### Task 7.1: Swift text-injection helper binary

**Files:**
- Create: `native/text-injector/Package.swift`
- Create: `native/text-injector/Sources/TextInjector/main.swift`
- Create: `scripts/build-text-injector.js`

To avoid AppleScript quoting issues and to get proper `CGEventKeyboardSetUnicodeString` semantics, ship a small Swift helper. Node calls it via `execFile`.

- [ ] **Step 1: Scaffold**

```bash
mkdir -p native/text-injector/Sources/TextInjector
```

Write `native/text-injector/Package.swift`:
```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "TextInjector",
  platforms: [.macOS(.v12)],
  products: [.executable(name: "text-injector", targets: ["TextInjector"])],
  targets: [.executableTarget(name: "TextInjector")]
)
```

- [ ] **Step 2: Write the main.swift**

It reads one JSON object from stdin: `{ "text": "..." }`. Posts the text via `CGEventKeyboardSetUnicodeString`, chunked in ≤ 18 UTF-16 units, 12 ms between events.

```swift
import Cocoa
import CoreGraphics

let MAX_UNITS = 18
let DELAY_US: UInt32 = 12_000  // 12 ms

func chunkUtf16(_ s: String) -> [String] {
  var chunks: [String] = []
  var current = ""
  var currentUnits = 0
  for char in s {
    let piece = String(char)
    let units = piece.utf16.count
    if currentUnits + units > MAX_UNITS && !current.isEmpty {
      chunks.append(current)
      current = ""
      currentUnits = 0
    }
    current.append(piece)
    currentUnits += units
  }
  if !current.isEmpty { chunks.append(current) }
  return chunks
}

func postChunk(_ chunk: String) {
  let src = CGEventSource(stateID: .hidSystemState)
  let down = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: true)
  let up = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: false)
  down?.flags = []
  up?.flags = []
  let utf16 = Array(chunk.utf16)
  utf16.withUnsafeBufferPointer { bp in
    down?.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: bp.baseAddress)
    up?.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: bp.baseAddress)
  }
  down?.post(tap: .cghidEventTap)
  up?.post(tap: .cghidEventTap)
}

// Read one JSON line from stdin.
guard let line = readLine(strippingNewline: true),
      let data = line.data(using: .utf8),
      let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let text = obj["text"] as? String else {
  FileHandle.standardError.write("text-injector: expected JSON {\"text\": \"...\"} on stdin\n".data(using: .utf8)!)
  exit(1)
}

for chunk in chunkUtf16(text) {
  postChunk(chunk)
  usleep(DELAY_US)
}

print(#"{"type":"done"}"#)
```

- [ ] **Step 3: Build script (uses `execFileSync`)**

`scripts/build-text-injector.js`:
```javascript
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "native", "text-injector");
const OUT_DIR = path.join(__dirname, "..", "resources", "bin");
const OUT_BIN = path.join(OUT_DIR, "text-injector");

if (process.platform !== "darwin") {
  console.error("text-injector only builds on macOS");
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });
execFileSync("swift", ["build", "-c", "release", "--arch", "arm64", "--arch", "x86_64"],
  { cwd: DIR, stdio: "inherit" });
const built = path.join(DIR, ".build", "apple", "Products", "Release", "text-injector");
fs.copyFileSync(built, OUT_BIN);
fs.chmodSync(OUT_BIN, 0o755);
console.log("built", OUT_BIN);
```

- [ ] **Step 4: Register in `package.json`**

```
"compile:text-injector": "node scripts/build-text-injector.js"
```

Append to `compile:native`.

- [ ] **Step 5: Build + smoke test**

```bash
npm run compile:text-injector
echo '{"text":"hello world "}' | ./resources/bin/text-injector
```

(Focus an editable text field first — e.g., a Notes window — then quickly switch to the terminal and run the echo. The text should appear in Notes.)

- [ ] **Step 6: Commit**

```bash
git add native/text-injector/ scripts/build-text-injector.js package.json
git commit -m "feat(injector): Swift text-injector binary using CGEventKeyboardSetUnicodeString"
```

### Task 7.2: Node streaming-injector helper

**Files:**
- Create: `src/helpers/streamingInjector.js`

- [ ] **Step 1: Write `streamingInjector.js`**

```javascript
const { execFile } = require("child_process");
const path = require("path");

const BIN = path.join(__dirname, "..", "..", "resources", "bin", "text-injector");

function injectText(text) {
  return new Promise((resolve) => {
    const child = execFile(BIN, [], (err) => {
      if (err) resolve({ success: false, error: err.message });
      else resolve({ success: true });
    });
    child.stdin.write(JSON.stringify({ text }) + "\n");
    child.stdin.end();
  });
}

module.exports = { injectText };
```

- [ ] **Step 2: Write a simple runtime smoke test**

Create `test/streamingInjector.smoke.js`:
```javascript
const { injectText } = require("../src/helpers/streamingInjector");
(async () => {
  console.log("Focus a text field in the next 3 seconds...");
  await new Promise((r) => setTimeout(r, 3000));
  const r = await injectText("plan 2 injector test ");
  console.log(r);
})();
```

Run manually:
```bash
node test/streamingInjector.smoke.js
```

Focus Notes during the 3-second wait. Expected: "plan 2 injector test " appears.

- [ ] **Step 3: Commit**

```bash
git add src/helpers/streamingInjector.js test/streamingInjector.smoke.js
git commit -m "feat: Node streamingInjector wraps text-injector binary"
```

### Task 7.3: Wire commits → injector

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Inject on commit**

Replace the `commit` handler body in main.js (the one that just forwards to renderer) with:

```javascript
whisperKitManager.on("commit", async (msg) => {
  const text = (msg.text || "").trim();
  if (!text) return;
  const toInject = text + " ";  // trailing space for autocorrect finalization
  const { injectText } = require("./src/helpers/streamingInjector");
  const result = await injectText(toInject);
  if (!result.success) debugLogger.warn(`[injector] failed: ${result.error}`);
  if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
    windowManager.mainWindow.webContents.send("streaming-commit", msg);
  }
});
```

- [ ] **Step 2: End-to-end smoke test**

1. `npm run dev`
2. Focus Notes.
3. Double-tap right-Option.
4. Speak: *"hello from plan two"*.
5. Pause.
6. Double-tap right-Option.

Expected: the phrase appears in Notes.

- [ ] **Step 3: Commit**

```bash
git add main.js
git commit -m "feat: inject committed text into focused app on streaming commit"
```

### Task 7.4: Secure-input detection

**Files:**
- Create: `src/helpers/secureInput.js`

- [ ] **Step 1: Check Secure Input before injection (no shell)**

```javascript
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

async function isSecureInputActive() {
  try {
    // ioreg output is searched in-process, not via shell pipe.
    const { stdout } = await execFileAsync("ioreg", ["-l", "-w", "0"]);
    return /SecureInput=1/.test(stdout);
  } catch {
    return false;
  }
}

module.exports = { isSecureInputActive };
```

- [ ] **Step 2: Guard the commit handler**

In main.js, before calling `injectText`:
```javascript
const { isSecureInputActive } = require("./src/helpers/secureInput");
if (await isSecureInputActive()) {
  if (windowManager.mainWindow && !windowManager.mainWindow.isDestroyed()) {
    windowManager.mainWindow.webContents.send("streaming-injection-error", {
      code: "SECURE_INPUT",
      message: "Secure input is active (password field). Click outside it and try again."
    });
  }
  return;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/helpers/secureInput.js main.js
git commit -m "feat: detect Secure Input and block injection with clear error"
```

---

## Phase 8 — Paste-mode fallback

### Task 8.1: Paste fallback helper

**Files:**
- Create: `src/helpers/pasteFallback.js`

- [ ] **Step 1: Write `pasteFallback.js` (uses `execFile` with `osascript`, no shell pipe)**

```javascript
const { clipboard } = require("electron");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

async function pasteChunk(text, { restoreClipboard = true } = {}) {
  const previous = clipboard.readText();
  clipboard.writeText(text);
  await new Promise((r) => setTimeout(r, 20));
  // osascript -e '...' is invoked via execFile — no shell, no injection.
  await execFileAsync("osascript", [
    "-e",
    'tell application "System Events" to keystroke "v" using command down'
  ]);
  if (restoreClipboard) {
    await new Promise((r) => setTimeout(r, 120));
    clipboard.writeText(previous);
  }
}

async function getFrontmostBundleId() {
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to get bundle identifier of (first process whose frontmost is true)'
    ]);
    return stdout.trim();
  } catch {
    return null;
  }
}

module.exports = { pasteChunk, getFrontmostBundleId };
```

- [ ] **Step 2: Commit**

```bash
git add src/helpers/pasteFallback.js
git commit -m "feat: pasteChunk + getFrontmostBundleId using execFile (no shell)"
```

### Task 8.2: Route commits per-app

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Pull the paste-mode app list from localStorage**

Add a helper in main.js:
```javascript
async function getPasteModeApps() {
  if (!windowManager.mainWindow || windowManager.mainWindow.isDestroyed()) return [];
  try {
    const json = await windowManager.mainWindow.webContents.executeJavaScript(
      `localStorage.getItem("pasteModeApps") || null`
    );
    if (!json) return ["com.tinyspeck.slackmacgap", "com.hnc.Discord",
                      "com.microsoft.VSCode", "com.todesktop.230313mzl4w4u92"];
    return JSON.parse(json);
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Route commit → paste or inject**

Replace the commit handler body:
```javascript
whisperKitManager.on("commit", async (msg) => {
  const text = (msg.text || "").trim();
  if (!text) return;
  const toInject = text + " ";

  const { isSecureInputActive } = require("./src/helpers/secureInput");
  if (await isSecureInputActive()) {
    windowManager.mainWindow?.webContents.send("streaming-injection-error", {
      code: "SECURE_INPUT",
      message: "Secure input is active. Click outside a password field and try again."
    });
    return;
  }

  const { injectText } = require("./src/helpers/streamingInjector");
  const { pasteChunk, getFrontmostBundleId } = require("./src/helpers/pasteFallback");
  const pasteApps = await getPasteModeApps();
  const bundleId = await getFrontmostBundleId();

  let result;
  if (bundleId && pasteApps.includes(bundleId)) {
    try { await pasteChunk(toInject); result = { success: true }; }
    catch (err) { result = { success: false, error: err.message }; }
  } else {
    result = await injectText(toInject);
  }

  if (!result.success) debugLogger.warn(`[inject] failed: ${result.error}`);
  windowManager.mainWindow?.webContents.send("streaming-commit", msg);
});
```

- [ ] **Step 3: Smoke test in Slack / Cursor**

Focus Slack, double-tap right-Option, speak, pause, double-tap. Verify text arrives via paste (not keystroke). Verify clipboard is restored (copy "keepme" before dictating; after the paste, check the clipboard still has "keepme").

- [ ] **Step 4: Commit**

```bash
git add main.js
git commit -m "feat: route streaming commits through paste-mode for Slack/Discord/VS Code/Cursor"
```

---

## Phase 9 — Model downloader + first-run UI

### Task 9.1: Model downloader script

**Files:**
- Create: `scripts/download-whisperkit-model.js`

- [ ] **Step 1: Write the downloader using `execFile` for git**

```javascript
const { execFile, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DEFAULT_MODEL = "openai_whisper-large-v3-v20240930_turbo";
const CACHE_DIR = path.join(os.homedir(), ".cache", "openwhispr", "whisperkit-models");

function main() {
  const model = process.argv[2] || DEFAULT_MODEL;
  const dest = path.join(CACHE_DIR, model);
  fs.mkdirSync(dest, { recursive: true });

  if (fs.existsSync(path.join(dest, "config.json")) ||
      fs.existsSync(path.join(dest, "MelSpectrogram.mlmodelc"))) {
    console.log(`[whisperkit-model] ${model} already downloaded at ${dest}`);
    return;
  }

  const tmp = `${dest}.tmp`;
  console.log(`[whisperkit-model] Cloning whisperkit-coreml → ${tmp}`);
  try {
    // git args as array — no shell.
    execFileSync("git", [
      "clone",
      "--depth", "1",
      "--filter=blob:none",
      "--sparse",
      "https://huggingface.co/argmaxinc/whisperkit-coreml",
      tmp
    ], { stdio: "inherit" });
    execFileSync("git", ["-C", tmp, "sparse-checkout", "set", model], { stdio: "inherit" });
    execFileSync("git", ["-C", tmp, "checkout"], { stdio: "inherit" });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  const src = path.join(tmp, model);
  if (!fs.existsSync(src)) {
    console.error(`Model ${model} not found in the whisperkit-coreml repo`);
    process.exit(1);
  }
  fs.cpSync(src, dest, { recursive: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`[whisperkit-model] -> ${dest}`);
}

main();
```

This uses sparse-checkout to fetch only the requested model folder — much smaller than cloning everything.

- [ ] **Step 2: Register script**

```
"download:whisperkit-model": "node scripts/download-whisperkit-model.js"
```

- [ ] **Step 3: Test**

```bash
npm run download:whisperkit-model -- openai_whisper-tiny.en
```

Expected: tiny model arrives at `~/.cache/openwhispr/whisperkit-models/openai_whisper-tiny.en/`.

- [ ] **Step 4: Commit**

```bash
git add scripts/download-whisperkit-model.js package.json
git commit -m "feat: download-whisperkit-model script using sparse git clone"
```

### Task 9.2: Model manager + IPC

**Files:**
- Create: `src/helpers/whisperKitModelManager.js`
- Modify: `src/helpers/ipcHandlers.js`
- Modify: `preload.js`

- [ ] **Step 1: Write the manager (spawn, not exec)**

```javascript
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const EventEmitter = require("events");

const CACHE_DIR = path.join(os.homedir(), ".cache", "openwhispr", "whisperkit-models");
const DEFAULT_MODEL = "openai_whisper-large-v3-v20240930_turbo";
const SCRIPT = path.join(__dirname, "..", "..", "scripts", "download-whisperkit-model.js");

class WhisperKitModelManager extends EventEmitter {
  constructor() {
    super();
    this.downloadProc = null;
  }

  modelPath(name = DEFAULT_MODEL) {
    return path.join(CACHE_DIR, name);
  }

  isInstalled(name = DEFAULT_MODEL) {
    const p = this.modelPath(name);
    return fs.existsSync(path.join(p, "config.json"))
        || fs.existsSync(path.join(p, "MelSpectrogram.mlmodelc"));
  }

  async download(name = DEFAULT_MODEL) {
    if (this.downloadProc) throw new Error("Download already in progress");
    return new Promise((resolve, reject) => {
      this.downloadProc = spawn("node", [SCRIPT, name], { stdio: ["ignore", "pipe", "pipe"] });
      this.downloadProc.stdout.on("data", (d) => this.emit("progress", d.toString()));
      this.downloadProc.stderr.on("data", (d) => this.emit("progress", d.toString()));
      this.downloadProc.on("exit", (code) => {
        this.downloadProc = null;
        code === 0 ? resolve() : reject(new Error(`exit ${code}`));
      });
    });
  }
}

module.exports = WhisperKitModelManager;
```

- [ ] **Step 2: Expose via IPC**

In `ipcHandlers.js`:
```javascript
const WhisperKitModelManager = require("./whisperKitModelManager");
const wkModelMgr = new WhisperKitModelManager();

ipcMain.handle("whisperkit-model-status", () => ({
  installed: wkModelMgr.isInstalled(),
  path: wkModelMgr.modelPath()
}));

ipcMain.handle("whisperkit-model-download", async (event) => {
  const onProgress = (chunk) => event.sender.send("whisperkit-model-progress", chunk);
  wkModelMgr.on("progress", onProgress);
  try {
    await wkModelMgr.download();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    wkModelMgr.off("progress", onProgress);
  }
});
```

- [ ] **Step 3: Expose in preload**

```javascript
whisperKitModelStatus: () => ipcRenderer.invoke("whisperkit-model-status"),
whisperKitModelDownload: () => ipcRenderer.invoke("whisperkit-model-download"),
onWhisperKitModelProgress: (cb) => {
  const h = (_e, chunk) => cb(chunk);
  ipcRenderer.on("whisperkit-model-progress", h);
  return () => ipcRenderer.removeListener("whisperkit-model-progress", h);
},
```

- [ ] **Step 4: Commit**

```bash
git add src/helpers/whisperKitModelManager.js src/helpers/ipcHandlers.js preload.js
git commit -m "feat: WhisperKit model manager + IPC for status/download"
```

### Task 9.3: First-run banner

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Check status on mount, show banner if missing**

```jsx
const [modelStatus, setModelStatus] = useState(null);
const [downloadProgress, setDownloadProgress] = useState("");

useEffect(() => {
  window.electronAPI.whisperKitModelStatus?.().then(setModelStatus);
  const dispose = window.electronAPI.onWhisperKitModelProgress?.(setDownloadProgress);
  return () => dispose?.();
}, []);

const handleDownload = async () => {
  const r = await window.electronAPI.whisperKitModelDownload();
  if (r?.success) {
    setModelStatus({ installed: true });
  } else {
    console.error(r?.error);
  }
};

// JSX — render inside the dictation overlay when model is missing:
{modelStatus && !modelStatus.installed && (
  <div style={{ padding: 8, fontSize: 12, textAlign: "center" }}>
    Streaming model not downloaded.
    <button type="button" onClick={handleDownload}>Download (~1.6 GB)</button>
    <pre style={{ fontSize: 10, maxHeight: 80, overflow: "auto" }}>{downloadProgress}</pre>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat(overlay): first-run banner to download WhisperKit model"
```

---

## Phase 10 — Overlay state updates

### Task 10.1: Subscribe to VAD + permission state

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Wire state**

```jsx
const [streamingOverlayState, setStreamingOverlayState] = useState("idle");

useEffect(() => {
  const disposeVad = window.electronAPI.onStreamingVad?.((msg) => {
    setStreamingOverlayState(msg.state === "speech" ? "listening" : "transcribing");
  });
  const disposePerm = window.electronAPI.onStreamingPermissionMissing?.(() => {
    setStreamingOverlayState("error-permission");
  });
  const disposeInjError = window.electronAPI.onStreamingInjectionError?.((msg) => {
    setStreamingOverlayState("error-secure-input");
  });
  return () => { disposeVad?.(); disposePerm?.(); disposeInjError?.(); };
}, []);
```

Note: `onStreamingInjectionError` needs to be added to preload if it isn't already. Also add the IPC listener on the `streaming-injection-error` channel.

- [ ] **Step 2: Apply state styling**

Minimal approach: map the state to a short label and a class that tints the mic icon. No partial text. Spec §6.1 is explicit.

```jsx
{streamingOverlayState === "listening" && <span className="pulse-green">Listening</span>}
{streamingOverlayState === "transcribing" && <span className="pulse-blue">Transcribing</span>}
{streamingOverlayState === "error-permission" && <span className="error">Accessibility needed</span>}
{streamingOverlayState === "error-secure-input" && <span className="error">Secure input active</span>}
```

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx preload.js
git commit -m "feat(overlay): listening/transcribing/error states driven by streaming events"
```

### Task 10.2: End-to-end smoke test

**Files:** none

- [ ] **Step 1: Run the full flow**

1. `npm run dev`
2. Grant Accessibility to the Electron dev binary if you haven't.
3. Download the model if not yet (via the banner).
4. Focus Notes.
5. Double-tap right-Option → overlay pulses "Listening".
6. Speak "hello from plan two"; pause.
7. The committed text appears in Notes; overlay returns to "Transcribing" briefly then idle.
8. Double-tap right-Option → streaming stops.

- [ ] **Step 2: Fix or note any visual glitches, commit if edited.**

---

## Phase 11 — Signing + final verification

### Task 11.1: Developer-ID signing for the new binaries

**Files:**
- Create: `scripts/sign-dev-binaries.js`

- [ ] **Step 1: Identify your Developer ID**

```bash
security find-identity -p codesigning -v
```

Copy the string (e.g. `"Developer ID Application: Your Name (TEAMID)"`).

- [ ] **Step 2: Write the sign script (uses `execFileSync`)**

```javascript
const { execFileSync } = require("child_process");
const path = require("path");

const IDENTITY = process.env.SIGN_IDENTITY;
if (!IDENTITY) {
  console.warn("[sign-dev-binaries] SIGN_IDENTITY not set, skipping.");
  process.exit(0);
}

const BINS = [
  "resources/bin/whisperkit-sidecar",
  "resources/bin/right-option-tap",
  "resources/bin/text-injector",
];

for (const rel of BINS) {
  const p = path.join(__dirname, "..", rel);
  try {
    execFileSync("codesign", [
      "--force",
      "--sign", IDENTITY,
      "--options", "runtime",
      p,
    ], { stdio: "inherit" });
    console.log(`[sign-dev-binaries] signed ${rel}`);
  } catch (err) {
    console.error(`[sign-dev-binaries] failed ${rel}:`, err.message);
  }
}
```

- [ ] **Step 3: Hook into `compile:native`**

Append ` && node scripts/sign-dev-binaries.js` to the `compile:native` script in `package.json`.

- [ ] **Step 4: Test**

```bash
SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" npm run compile:native
```

Expected: all three binaries signed with the stable identity. Accessibility grants will persist across rebuilds.

- [ ] **Step 5: Commit**

```bash
git add scripts/sign-dev-binaries.js package.json
git commit -m "feat(build): sign sidecar binaries with Developer ID for dev permission stability"
```

### Task 11.2: Verification checklist per spec §10

**Files:** none (work through and record)

Work through the spec's success criteria. For each, manual-verify and record pass/fail:

- [ ] **Step 1:** Right-Option double-tap toggles listening within 50 ms.
- [ ] **Step 2:** 5-word English phrase appears in Notes within 800 ms of pause.
- [ ] **Step 3:** Subjective Spanish/accented quality comparable to or better than batch Parakeet.
- [ ] **Step 4:** Second double-tap cleanly stops, flushing any in-flight audio.
- [ ] **Step 5:** Paste-mode works in Slack and Cursor.
- [ ] **Step 6:** Revoked Accessibility surfaces a visible error.
- [ ] **Step 7:** Clean-machine install under 15 min (clone → install → compile → model download → first dictation).

### Task 11.3: Handoff doc for Plan 3

**Files:**
- Create: `docs/superpowers/plans/2026-04-24-plan-2-handoff.md`

- [ ] **Step 1: Write handoff notes**

Content should enumerate:
- What Plan 3 still needs to do (menu-bar, language toggle, PermissionsGate, Control Panel cleanup, delete old batch engines, swap hardcoded model path for setting, per-app paste UI).
- Known debt left in Plan 2 (dev-only "Start Stream" button, hardcoded paths in `useStreamingDictation`, any workarounds).
- Performance numbers measured during Task 11.2.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-04-24-plan-2-handoff.md
git commit -m "docs: Plan 2 handoff for Plan 3"
```

### Task 11.4: Merge Plan 2

**Files:** none

- [ ] **Step 1: Final status check**

```bash
git log --oneline main..HEAD | wc -l
```

Expected: ~70+ commits.

- [ ] **Step 2: Merge**

```bash
git checkout main
git merge --no-ff feature/plan-2-streaming-engine -m "Plan 2 complete: streaming engine"
```

- [ ] **Step 3: Confirm still boots**

```bash
npm run dev
```

Verify double-tap right-Option streams text into a focused app.

---

## Plan 2 complete — what's next

After Plan 2 is merged:

- Streaming dictation works end-to-end on M5 Pro via right-Option double-tap.
- The old Parakeet + whisper.cpp batch path still lives alongside (to be removed in Plan 3).
- Cloud backend residue still exists in a few places (stale IPC handlers, unreachable settings UI) — Plan 3 sweeps these.

**Plan 3 scope**: UI cleanup (menu-bar, language toggle, permissions gate, control panel shrink), deletion of the old batch engines, per-app paste-mode UI, and production build + notarization story.
