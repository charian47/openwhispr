// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "RightOptionTap",
  platforms: [.macOS(.v12)],
  products: [.executable(name: "right-option-tap", targets: ["RightOptionTap"])],
  targets: [
    .executableTarget(name: "RightOptionTap"),
    .testTarget(name: "RightOptionTapTests", dependencies: ["RightOptionTap"]),
  ]
)
