// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "TextInjector",
  platforms: [.macOS(.v12)],
  products: [.executable(name: "text-injector", targets: ["TextInjector"])],
  targets: [.executableTarget(name: "TextInjector")]
)
