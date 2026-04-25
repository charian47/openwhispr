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
