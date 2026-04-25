// Plan 2 protocol contract test.
// Verifies the JSON line protocol behaves correctly under expected and
// adversarial inputs:
//   - ping → pong
//   - bad JSON → error with code `bad_message`
//   - unknown type → error with code `unknown_type`
//   - end → end_ack then exit
//
// Does NOT load the model — runs without --model so the sidecar starts
// fast and stays in stub mode.

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const SIDECAR = path.join(__dirname, "..", "resources", "bin", "whisperkit-sidecar");

function check(cond, msg, ctx) {
  if (!cond) {
    const c = ctx ? "\n" + JSON.stringify(ctx, null, 2) : "";
    throw new Error(msg + c);
  }
}

(async () => {
  if (!fs.existsSync(SIDECAR)) {
    throw new Error(`sidecar not found at ${SIDECAR} — run npm run compile:whisperkit`);
  }

  const proc = spawn(SIDECAR, [], { stdio: ["pipe", "pipe", "pipe"] });
  const events = [];
  let exitCode = null;
  let stdoutBuf = "";

  proc.stdout.on("data", (d) => {
    stdoutBuf += d.toString();
    let nl;
    while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
      const line = stdoutBuf.slice(0, nl);
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        events.push({ _meta: "non-json", raw: line });
      }
    }
  });
  proc.on("exit", (code) => {
    exitCode = code;
  });

  // Wait for ready
  const ready = await waitFor(events, (e) => e.type === "ready", 5000);
  check(ready, "no ready event in 5s", { events });

  // 1) ping → pong
  proc.stdin.write(JSON.stringify({ type: "ping" }) + "\n");
  const pong = await waitFor(events, (e) => e.type === "pong", 2000);
  check(pong, "expected pong after ping", { events });

  // 2) Bad JSON → error with code bad_message
  proc.stdin.write("this is not json\n");
  const badJsonErr = await waitFor(
    events,
    (e) => e.type === "error" && e.code === "bad_message",
    2000
  );
  check(badJsonErr, "expected error{code:bad_message} after bad JSON", { events });

  // 3) Unknown type → error with code unknown_type
  proc.stdin.write(JSON.stringify({ type: "definitely-not-a-thing" }) + "\n");
  const unknownErr = await waitFor(
    events,
    (e) =>
      e.type === "error" && e.code === "unknown_type" && e.message === "definitely-not-a-thing",
    2000
  );
  check(unknownErr, "expected error{code:unknown_type} for unknown type", { events });

  // 4) end → end_ack then exit
  proc.stdin.write(JSON.stringify({ type: "end" }) + "\n");
  const endAck = await waitFor(events, (e) => e.type === "end_ack", 2000);
  check(endAck, "expected end_ack", { events });

  await new Promise((resolve, reject) => {
    if (exitCode !== null) return resolve();
    const timer = setTimeout(() => reject(new Error("sidecar did not exit after end")), 3000);
    proc.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  check(exitCode === 0, `expected clean exit (code=0), got ${exitCode}`, { events });

  console.log("[test] PASS — protocol handshake correct");
})().catch((err) => {
  console.error("[test] FAIL:", err.message);
  process.exit(1);
});

function waitFor(events, pred, timeoutMs) {
  return new Promise((resolve) => {
    // Check existing first.
    const found = events.find(pred);
    if (found) return resolve(found);
    const start = Date.now();
    const interval = setInterval(() => {
      const f = events.find(pred);
      if (f) {
        clearInterval(interval);
        resolve(f);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        resolve(null);
      }
    }, 50);
  });
}
