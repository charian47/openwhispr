import Foundation

FileHandle.standardError.write("whisperkit-sidecar: starting\n".data(using: .utf8)!)
let args = CommandLine.arguments
FileHandle.standardError.write("whisperkit-sidecar: got \(args.count) args\n".data(using: .utf8)!)

// Placeholder — real implementation lands in later tasks.
print(#"{"type":"ready","stub":true}"#)
fflush(stdout)

RunLoop.main.run(until: Date().addingTimeInterval(0.1))
