const EventEmitter = require("events");
const debugLogger = require("./debugLogger");
const processListCache = require("./processListCache");

const POLL_INTERVAL_MS = 30 * 1000;

const BUNDLE_ID_MAP = {
  "us.zoom.xos": "zoom",
  "com.microsoft.teams": "teams",
  "com.microsoft.teams2": "teams",
  "com.cisco.webexmeetingsapp": "webex",
  "com.apple.FaceTime": "facetime",
};

const BUNDLE_APP_NAMES = {
  zoom: "Zoom",
  teams: "Microsoft Teams",
  webex: "Webex",
  facetime: "FaceTime",
};

class MeetingProcessDetector extends EventEmitter {
  constructor() {
    super();
    this.pollInterval = null;
    this.detectedProcesses = new Map();
    this.dismissedProcesses = new Set();
    this._subscriptionIds = [];
  }

  start() {
    if (this.pollInterval || this._subscriptionIds.length > 0) return;
    this._startDarwin();
  }

  _startDarwin() {
    let systemPreferences;
    try {
      systemPreferences = require("electron").systemPreferences;
    } catch {
      debugLogger.warn("systemPreferences unavailable, falling back to polling", {}, "meeting");
      this._startPollingFallback();
      return;
    }

    if (!systemPreferences.subscribeWorkspaceNotification) {
      debugLogger.warn(
        "subscribeWorkspaceNotification unavailable, falling back to polling",
        {},
        "meeting"
      );
      this._startPollingFallback();
      return;
    }

    const launchId = systemPreferences.subscribeWorkspaceNotification(
      "NSWorkspaceDidLaunchApplicationNotification",
      (_event, userInfo) => {
        const bundleId = userInfo?.NSApplicationBundleIdentifier;
        const processKey = bundleId ? BUNDLE_ID_MAP[bundleId] : null;
        if (processKey) {
          const appName = BUNDLE_APP_NAMES[processKey] || processKey;
          debugLogger.debug("Workspace app launched", { bundleId, processKey }, "meeting");
          this._updateDetection(processKey, appName, true);
        }
      }
    );

    const terminateId = systemPreferences.subscribeWorkspaceNotification(
      "NSWorkspaceDidTerminateApplicationNotification",
      (_event, userInfo) => {
        const bundleId = userInfo?.NSApplicationBundleIdentifier;
        const processKey = bundleId ? BUNDLE_ID_MAP[bundleId] : null;
        if (processKey) {
          const appName = BUNDLE_APP_NAMES[processKey] || processKey;
          debugLogger.debug("Workspace app terminated", { bundleId, processKey }, "meeting");
          this._updateDetection(processKey, appName, false);
        }
      }
    );

    this._subscriptionIds.push(launchId, terminateId);

    debugLogger.info(
      "Process detector started",
      {
        platform: "darwin",
        mode: "NSWorkspace",
        bundleIds: Object.keys(BUNDLE_ID_MAP),
      },
      "meeting"
    );

    this._initialScanDarwin();
  }

  async _initialScanDarwin() {
    try {
      const processList = await processListCache.getProcessList();
      const darwinProcessNames = [
        { match: "zoom.us", processKey: "zoom" },
        { match: "microsoft teams", processKey: "teams" },
        { match: "webex", processKey: "webex" },
        { match: "facetime", processKey: "facetime" },
      ];
      for (const { match, processKey } of darwinProcessNames) {
        if (processList.some((p) => p.includes(match))) {
          const appName = BUNDLE_APP_NAMES[processKey] || processKey;
          debugLogger.info("Initial scan: already running", { processKey, appName }, "meeting");
          this._updateDetection(processKey, appName, true);
        }
      }
    } catch (err) {
      debugLogger.warn("Initial scan failed", { error: err.message }, "meeting");
    }
  }

  _startPollingFallback() {
    const darwinNames = [
      { processKey: "zoom", appName: "Zoom", match: "zoom.us" },
      { processKey: "teams", appName: "Microsoft Teams", match: "microsoft teams" },
      { processKey: "webex", appName: "Webex", match: "webex" },
      { processKey: "facetime", appName: "FaceTime", match: "facetime" },
    ];
    debugLogger.info(
      "Process detector started (polling fallback)",
      {
        platform: "darwin",
        appsMonitored: darwinNames.map((a) => a.appName),
        intervalMs: POLL_INTERVAL_MS,
      },
      "meeting"
    );
    this._poll();
    this.pollInterval = setInterval(() => this._poll(), POLL_INTERVAL_MS);
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this._subscriptionIds.length > 0) {
      try {
        const { systemPreferences } = require("electron");
        for (const id of this._subscriptionIds) {
          systemPreferences.unsubscribeWorkspaceNotification(id);
        }
      } catch {
        // electron may not be available during cleanup
      }
      this._subscriptionIds = [];
    }

    this.detectedProcesses.clear();
    this.dismissedProcesses.clear();
    debugLogger.info("Stopped meeting process detector", {}, "meeting");
  }

  dismiss(processKey) {
    this.dismissedProcesses.add(processKey);
    debugLogger.info("Process detection dismissed", { processKey }, "meeting");
  }

  getDetectedProcesses() {
    return Array.from(this.detectedProcesses.entries()).map(([processKey, { detectedAt }]) => ({
      processKey,
      appName: this._getAppName(processKey),
      detectedAt,
    }));
  }

  _getAppName(processKey) {
    return BUNDLE_APP_NAMES[processKey] || processKey;
  }

  async _poll() {
    try {
      const processList = await processListCache.getProcessList();
      const darwinNames = [
        { processKey: "zoom", appName: "Zoom", match: "zoom.us" },
        { processKey: "teams", appName: "Microsoft Teams", match: "microsoft teams" },
        { processKey: "webex", appName: "Webex", match: "webex" },
        { processKey: "facetime", appName: "FaceTime", match: "facetime" },
      ];
      for (const { processKey, appName, match } of darwinNames) {
        const isRunning = processList.some((p) => p.includes(match));
        this._updateDetection(processKey, appName, isRunning);
      }
    } catch (err) {
      debugLogger.warn("Poll error", { error: err.message }, "meeting");
    }
  }

  _updateDetection(processKey, appName, isRunning) {
    if (isRunning) {
      if (!this.detectedProcesses.has(processKey) && !this.dismissedProcesses.has(processKey)) {
        const detectedAt = Date.now();
        this.detectedProcesses.set(processKey, { detectedAt });
        debugLogger.info("Meeting process detected", { processKey, appName }, "meeting");
        this.emit("meeting-process-detected", { processKey, appName, detectedAt });
      }
    } else if (this.detectedProcesses.has(processKey)) {
      this.detectedProcesses.delete(processKey);
      this.dismissedProcesses.delete(processKey);
      debugLogger.info("Meeting process ended", { processKey, appName }, "meeting");
      this.emit("meeting-process-ended", { processKey, appName });
    }
  }
}

module.exports = MeetingProcessDetector;
