import React, { useState, useRef, useEffect, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { FileAudio, X, AlertCircle, ChevronRight, Check, UploadCloud } from "lucide-react";
import { useSettings } from "../hooks/useSettings";

const TranscriptionModelPicker = React.lazy(() => import("./TranscriptionModelPicker"));

type UploadState = "idle" | "selected" | "transcribing" | "complete" | "error";

const SUPPORTED_EXTENSIONS = ["mp3", "wav", "m4a", "webm", "ogg", "flac", "aac"];
const BYOK_MAX_FILE_SIZE = 25 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UploadAudioViewProps {
  onTranscriptionCreated?: (id: number) => void;
  onOpenSettings?: (section: string) => void;
}

export default function UploadAudioView({
  onTranscriptionCreated,
  onOpenSettings,
}: UploadAudioViewProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<{
    name: string;
    path: string;
    size: string;
    sizeBytes: number;
  } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timing, setTiming] = useState<{
    elapsedMs: number;
    modelLabel: string;
    inferenceMs?: number | null;
  } | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [providerReady, setProviderReady] = useState<boolean | null>(null);

  const {
    useLocalWhisper,
    setUseLocalWhisper,
    whisperModel,
    setWhisperModel,
    localTranscriptionProvider,
    setLocalTranscriptionProvider,
    parakeetModel,
    setParakeetModel,
    cloudTranscriptionProvider,
    setCloudTranscriptionProvider,
    cloudTranscriptionModel,
    setCloudTranscriptionModel,
    cloudTranscriptionBaseUrl,
    setCloudTranscriptionBaseUrl,
    openaiApiKey,
    setOpenaiApiKey,
    groqApiKey,
    setGroqApiKey,
    mistralApiKey,
    setMistralApiKey,
    customTranscriptionApiKey,
    setCustomTranscriptionApiKey,
    updateTranscriptionSettings,
  } = useSettings();

  const fileTooLarge = !!file && !useLocalWhisper && file.sizeBytes > BYOK_MAX_FILE_SIZE;

  useEffect(() => {
    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkProviderReady = async () => {
      if (!useLocalWhisper) {
        if (cloudTranscriptionProvider === "custom") {
          if (!cancelled) setProviderReady(!!cloudTranscriptionBaseUrl?.trim());
        } else {
          const key =
            cloudTranscriptionProvider === "openai"
              ? openaiApiKey
              : cloudTranscriptionProvider === "groq"
                ? groqApiKey
                : cloudTranscriptionProvider === "mistral"
                  ? mistralApiKey
                  : customTranscriptionApiKey;
          if (!cancelled) setProviderReady(!!key);
        }
        return;
      }
      if (localTranscriptionProvider === "nvidia") {
        const r = await window.electronAPI.listParakeetModels?.();
        if (!cancelled)
          setProviderReady(
            !!(r?.success && r.models.some((m: { downloaded?: boolean }) => m.downloaded))
          );
      } else {
        const r = await window.electronAPI.listWhisperModels?.();
        if (!cancelled)
          setProviderReady(
            !!(r?.success && r.models.some((m: { downloaded?: boolean }) => m.downloaded))
          );
      }
    };
    checkProviderReady();
    return () => {
      cancelled = true;
    };
  }, [
    useLocalWhisper,
    localTranscriptionProvider,
    cloudTranscriptionProvider,
    cloudTranscriptionBaseUrl,
    openaiApiKey,
    groqApiKey,
    mistralApiKey,
    customTranscriptionApiKey,
  ]);

  const getActiveModelLabel = (): string => {
    if (useLocalWhisper) {
      if (localTranscriptionProvider === "nvidia")
        return `Parakeet · ${parakeetModel || "default"}`;
      return `Whisper · ${whisperModel || "base"}`;
    }
    const name =
      cloudTranscriptionProvider === "custom"
        ? t("notes.upload.custom")
        : cloudTranscriptionProvider.charAt(0).toUpperCase() + cloudTranscriptionProvider.slice(1);
    return `${name} · ${cloudTranscriptionModel}`;
  };

  const getActiveApiKey = (): string => {
    switch (cloudTranscriptionProvider) {
      case "openai":
        return openaiApiKey;
      case "groq":
        return groqApiKey;
      case "mistral":
        return mistralApiKey;
      case "custom":
        return customTranscriptionApiKey || "";
      default:
        return "";
    }
  };

  const handleBrowse = async () => {
    const res = await window.electronAPI.selectAudioFile();
    if (!res.canceled && res.filePath) {
      const name = res.filePath.split(/[/\\]/).pop() || "audio";
      const sizeBytes = (await window.electronAPI.getFileSize?.(res.filePath)) ?? 0;
      setFile({
        name,
        path: res.filePath,
        size: sizeBytes ? formatFileSize(sizeBytes) : "",
        sizeBytes,
      });
      setState("selected");
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    if (SUPPORTED_EXTENSIONS.includes(ext)) {
      const filePath = window.electronAPI.getPathForFile(f);
      if (!filePath) return;
      setFile({ name: f.name, path: filePath, size: formatFileSize(f.size), sizeBytes: f.size });
      setState("selected");
      setError(null);
    }
  };

  const reset = () => {
    if (progressRef.current) clearInterval(progressRef.current);
    setState("idle");
    setFile(null);
    setResult(null);
    setError(null);
    setProgress(0);
    setTiming(null);
  };

  const handleTranscribe = async () => {
    if (!file) return;
    setState("transcribing");
    setError(null);
    setProgress(0);
    setTiming(null);

    progressRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          if (progressRef.current) clearInterval(progressRef.current);
          return prev;
        }
        return prev + Math.random() * 6;
      });
    }, 500);

    const t0 = performance.now();
    try {
      let res: {
        success: boolean;
        text?: string;
        error?: string;
        code?: string;
        timings?: { transcriptionProcessingDurationMs?: number };
      };

      if (useLocalWhisper) {
        res = await window.electronAPI.transcribeAudioFile(file.path, {
          provider: localTranscriptionProvider as "whisper" | "nvidia",
          model: localTranscriptionProvider === "nvidia" ? parakeetModel : whisperModel,
        });
      } else {
        res = await window.electronAPI.transcribeAudioFileByok!({
          filePath: file.path,
          apiKey: getActiveApiKey(),
          baseUrl: cloudTranscriptionBaseUrl || "",
          model: cloudTranscriptionModel,
        });
      }

      const elapsedMs = Math.round(performance.now() - t0);

      if (progressRef.current) clearInterval(progressRef.current);

      if (res.success && res.text) {
        setProgress(100);
        setResult(res.text);
        const inferenceMs = res.timings?.transcriptionProcessingDurationMs ?? null;
        const modelLabel = getActiveModelLabel();
        setTiming({ elapsedMs, modelLabel, inferenceMs });

        // Append a structured record for offline analysis (jq, pandas, etc.)
        try {
          const provider = useLocalWhisper
            ? localTranscriptionProvider === "nvidia"
              ? "parakeet"
              : "whisper"
            : cloudTranscriptionProvider;
          const model =
            useLocalWhisper && localTranscriptionProvider === "nvidia"
              ? parakeetModel
              : useLocalWhisper
                ? whisperModel
                : cloudTranscriptionModel;
          await window.electronAPI.appendBenchLog?.({
            provider,
            model,
            modelLabel,
            elapsedMs,
            inferenceMs,
            audioFile: file.name,
            audioSizeBytes: file.sizeBytes,
            textLength: res.text.length,
            wordCount: res.text.trim().split(/\s+/).length,
            transcript: res.text,
          });
        } catch {
          // Non-blocking — log failure shouldn't affect the user flow
        }

        const saved = await window.electronAPI.saveTranscription(res.text, res.text, {
          status: "completed",
        });
        if (saved.success && saved.transcription && onTranscriptionCreated) {
          onTranscriptionCreated(saved.transcription.id);
        }

        setState("complete");
      } else {
        setProgress(0);
        setError(
          res.code === "NO_SPEECH_DETECTED"
            ? t("notes.upload.noSpeechDetected")
            : res.error || t("notes.upload.transcriptionFailed")
        );
        setState("error");
      }
    } catch (err) {
      if (progressRef.current) clearInterval(progressRef.current);
      setProgress(0);
      setError(err instanceof Error ? err.message : t("notes.upload.errorOccurred"));
      setState("error");
    }
  };

  const modelPicker = (
    <Suspense fallback={null}>
      <TranscriptionModelPicker
        selectedCloudProvider={cloudTranscriptionProvider}
        onCloudProviderSelect={setCloudTranscriptionProvider}
        selectedCloudModel={cloudTranscriptionModel}
        onCloudModelSelect={setCloudTranscriptionModel}
        selectedLocalModel={localTranscriptionProvider === "nvidia" ? parakeetModel : whisperModel}
        onLocalModelSelect={(modelId) => {
          if (localTranscriptionProvider === "nvidia") {
            setParakeetModel(modelId);
          } else {
            setWhisperModel(modelId);
          }
        }}
        selectedLocalProvider={localTranscriptionProvider}
        onLocalProviderSelect={(id) => setLocalTranscriptionProvider(id as "whisper" | "nvidia")}
        useLocalWhisper={useLocalWhisper}
        onModeChange={(isLocal) => {
          setUseLocalWhisper(isLocal);
          updateTranscriptionSettings({ useLocalWhisper: isLocal });
        }}
        openaiApiKey={openaiApiKey}
        setOpenaiApiKey={setOpenaiApiKey}
        groqApiKey={groqApiKey}
        setGroqApiKey={setGroqApiKey}
        mistralApiKey={mistralApiKey}
        setMistralApiKey={setMistralApiKey}
        customTranscriptionApiKey={customTranscriptionApiKey}
        setCustomTranscriptionApiKey={setCustomTranscriptionApiKey}
        cloudTranscriptionBaseUrl={cloudTranscriptionBaseUrl}
        setCloudTranscriptionBaseUrl={setCloudTranscriptionBaseUrl}
        variant="settings"
      />
    </Suspense>
  );

  return (
    <div className="px-8 py-8 max-w-[680px] mx-auto w-full h-full flex flex-col">
      <header className="mb-5">
        <h1 className="q-h1">{t("notes.upload.title")}</h1>
        <p className="q-body mt-1.5" style={{ color: "var(--q-fg-3)" }}>
          {t("notes.upload.using", { model: "" }).replace(/\s*$/, " ")}
          <span className="q-mono" style={{ color: "var(--q-fg-2)" }}>
            {getActiveModelLabel()}
          </span>
        </p>
      </header>

      <div className="flex-1 flex flex-col">
        {state === "idle" && providerReady === false && (
          <NoProviderView t={t} onOpenSettings={() => onOpenSettings?.("speechToText")} />
        )}
        {state === "idle" && providerReady !== false && (
          <Dropzone
            t={t}
            handleDrop={handleDrop}
            handleBrowse={handleBrowse}
            isDragOver={isDragOver}
            setIsDragOver={setIsDragOver}
          />
        )}
        {state === "selected" && file && (
          <SelectedView
            t={t}
            file={file}
            getActiveModelLabel={getActiveModelLabel}
            reset={reset}
            handleTranscribe={handleTranscribe}
            fileTooLarge={fileTooLarge}
          />
        )}
        {state === "transcribing" && <TranscribingView t={t} progress={progress} file={file} />}
        {state === "complete" && result && (
          <CompleteView t={t} result={result} reset={reset} timing={timing} />
        )}
        {state === "error" && error && (
          <ErrorView t={t} error={error} reset={reset} handleTranscribe={handleTranscribe} />
        )}
      </div>

      {(state === "idle" || state === "selected") && (
        <div className="mt-4">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center gap-1.5 q-meta mx-auto"
            style={{ color: "var(--q-meta)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--q-fg-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--q-meta)")}
          >
            <ChevronRight
              size={11}
              style={{
                transition: "transform 200ms ease",
                transform: advancedOpen ? "rotate(90deg)" : "rotate(0deg)",
              }}
            />
            {t("notes.upload.transcriptionSettings")}
          </button>
          {advancedOpen && <div className="mt-4">{modelPicker}</div>}
        </div>
      )}
    </div>
  );
}

function Dropzone({
  t,
  handleDrop,
  handleBrowse,
  isDragOver,
  setIsDragOver,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  handleDrop: (e: React.DragEvent) => void;
  handleBrowse: () => void;
  isDragOver: boolean;
  setIsDragOver: (v: boolean) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t("notes.upload.dropOrBrowse")}
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
      onClick={handleBrowse}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleBrowse();
        }
      }}
      className="flex-1 flex flex-col items-center justify-center rounded-lg cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--q-accent)]/40"
      style={{
        border: `1px ${isDragOver ? "solid" : "dashed"} ${
          isDragOver ? "var(--q-accent)" : "var(--q-rule)"
        }`,
        background: isDragOver
          ? "color-mix(in oklch, var(--q-accent) 6%, transparent)"
          : "transparent",
        minHeight: 320,
        transition: "border-color 150ms ease, background 150ms ease",
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
        style={{ border: "1px solid var(--q-rule)", color: "var(--q-fg-3)" }}
      >
        <UploadCloud size={18} strokeWidth={1.4} />
      </div>
      <p className="q-body" style={{ color: "var(--q-fg-2)" }}>
        {t("notes.upload.dropOrBrowse")}
      </p>
      <p className="q-meta-sm mt-2" style={{ color: "var(--q-meta-faint)" }}>
        {t("notes.upload.supportedFormats")}
      </p>
    </div>
  );
}

function NoProviderView({
  t,
  onOpenSettings,
}: {
  t: (key: string) => string;
  onOpenSettings: () => void;
}) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center rounded-lg"
      style={{
        border: "1px dashed var(--q-rule)",
        minHeight: 320,
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
        style={{ border: "1px solid var(--q-rule)", color: "var(--q-fg-3)" }}
      >
        <AlertCircle size={18} strokeWidth={1.4} />
      </div>
      <p className="q-body mb-1" style={{ color: "var(--q-fg-2)" }}>
        {t("notes.upload.noProviderTitle")}
      </p>
      <p className="q-meta-sm mb-4" style={{ color: "var(--q-meta-faint)", maxWidth: 320, textAlign: "center" }}>
        {t("notes.upload.noProviderDescription")}
      </p>
      <button
        onClick={onOpenSettings}
        className="q-meta-sm px-3 h-7 rounded-md inline-flex items-center"
        style={{
          background: "color-mix(in oklch, var(--q-accent) 18%, transparent)",
          color: "var(--q-accent-fg)",
          border: "1px solid color-mix(in oklch, var(--q-accent) 30%, transparent)",
          fontWeight: 500,
        }}
      >
        {t("notes.upload.noProviderAction")}
      </button>
    </div>
  );
}

function SelectedView({
  t,
  file,
  getActiveModelLabel,
  reset,
  handleTranscribe,
  fileTooLarge,
}: {
  t: (key: string) => string;
  file: { name: string; path: string; size: string; sizeBytes: number };
  getActiveModelLabel: () => string;
  reset: () => void;
  handleTranscribe: () => void;
  fileTooLarge: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col">
      <div
        className="rounded-md p-4 mb-4"
        style={{ border: "1px solid var(--q-rule)", background: "var(--q-input)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
            style={{
              background: "color-mix(in oklch, var(--q-accent) 12%, transparent)",
              border: "1px solid color-mix(in oklch, var(--q-accent) 25%, transparent)",
              color: "var(--q-accent-fg)",
            }}
          >
            <FileAudio size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="q-ui truncate" style={{ color: "var(--q-fg)", fontWeight: 500 }}>
              {file.name}
            </p>
            {file.size && <p className="q-meta-sm mt-0.5">{file.size}</p>}
            <p className="q-mono-sm mt-0.5" style={{ color: "var(--q-meta-faint)" }}>
              {getActiveModelLabel()}
            </p>
          </div>
          <button
            onClick={reset}
            className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ color: "var(--q-meta)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--q-hover)";
              e.currentTarget.style.color = "var(--q-fg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--q-meta)";
            }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {fileTooLarge && (
        <div
          className="rounded-md px-3 py-2.5 mb-4"
          style={{
            border: "1px solid color-mix(in oklch, oklch(0.75 0.15 70) 25%, transparent)",
            background: "color-mix(in oklch, oklch(0.75 0.15 70) 6%, transparent)",
          }}
        >
          <p className="q-meta" style={{ color: "var(--q-fg-2)" }}>
            {t("notes.upload.byokTooLarge")}
          </p>
          <p className="q-meta-sm mt-1.5">{t("notes.upload.byokTooLargeDetail")}</p>
        </div>
      )}

      <div className="flex items-center gap-2 justify-center">
        {!fileTooLarge && (
          <button
            onClick={handleTranscribe}
            className="q-ui px-4 h-8 rounded-md inline-flex items-center"
            style={{
              background: "color-mix(in oklch, var(--q-accent) 22%, transparent)",
              color: "var(--q-accent-fg)",
              border: "1px solid color-mix(in oklch, var(--q-accent) 35%, transparent)",
              fontWeight: 500,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                "color-mix(in oklch, var(--q-accent) 30%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                "color-mix(in oklch, var(--q-accent) 22%, transparent)";
            }}
          >
            {t("notes.upload.transcribe")}
          </button>
        )}
        <button
          onClick={reset}
          className="q-meta px-3 h-8 rounded-md inline-flex items-center"
          style={{ color: "var(--q-meta)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--q-fg-2)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--q-meta)")}
        >
          {t("notes.upload.cancel")}
        </button>
      </div>
    </div>
  );
}

function TranscribingView({
  t,
  progress,
  file,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  progress: number;
  file: { name: string; path: string; size: string; sizeBytes: number } | null;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div className="flex items-end justify-center gap-[3px] h-10 mb-5">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="w-[3px] rounded-full origin-bottom"
            style={{
              height: "100%",
              background: "var(--q-accent)",
              opacity: 0.5,
              animation: `q-bar ${0.8 + i * 0.12}s ease-in-out infinite`,
              animationDelay: `${i * 0.08}s`,
            }}
          />
        ))}
      </div>

      <div
        className="w-full max-w-[200px] h-[3px] rounded-full overflow-hidden mb-3"
        style={{ background: "var(--q-rule-faint)" }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${Math.min(progress, 100)}%`,
            background: "var(--q-accent)",
            opacity: 0.7,
          }}
        />
      </div>

      <p className="q-meta" style={{ color: "var(--q-fg-2)", fontWeight: 500 }}>
        {t("notes.upload.transcribingLocal")}
      </p>
      {file ? (
        <p className="q-meta-sm mt-1 truncate max-w-[240px]">{file.name}</p>
      ) : null}
    </div>
  );
}

function CompleteView({
  t,
  result,
  reset,
  timing,
}: {
  t: (key: string) => string;
  result: string;
  reset: () => void;
  timing: { elapsedMs: number; modelLabel: string; inferenceMs?: number | null } | null;
}) {
  const formatTime = (ms: number) =>
    ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;

  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{
          background: "color-mix(in oklch, var(--q-accent) 12%, transparent)",
          border: "1px solid color-mix(in oklch, var(--q-accent) 25%, transparent)",
          color: "var(--q-accent-fg)",
        }}
      >
        <Check size={20} />
      </div>
      <p className="q-ui mb-1" style={{ color: "var(--q-fg)", fontWeight: 500 }}>
        {t("notes.upload.transcriptionComplete")}
      </p>

      {timing && (
        <div
          className="flex items-center gap-3 mb-3 px-3 py-1.5 rounded-md"
          style={{
            background: "var(--q-input)",
            border: "1px solid var(--q-rule)",
          }}
        >
          <span className="q-mono-sm" style={{ color: "var(--q-fg-2)" }}>
            {formatTime(timing.elapsedMs)}
          </span>
          <span style={{ color: "var(--q-rule)" }}>·</span>
          <span className="q-mono-sm" style={{ color: "var(--q-meta)" }}>
            {timing.modelLabel}
          </span>
          {timing.inferenceMs != null && timing.inferenceMs !== timing.elapsedMs && (
            <>
              <span style={{ color: "var(--q-rule)" }}>·</span>
              <span className="q-mono-sm" style={{ color: "var(--q-meta-faint)" }}>
                inference {formatTime(timing.inferenceMs)}
              </span>
            </>
          )}
        </div>
      )}

      <p
        className="q-body max-w-[420px] text-center mb-4 line-clamp-3"
        style={{ color: "var(--q-fg-3)" }}
      >
        {result.slice(0, 200)}
      </p>
      <button
        onClick={reset}
        className="q-meta px-3 h-8 rounded-md inline-flex items-center"
        style={{ color: "var(--q-meta)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--q-fg-2)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--q-meta)")}
      >
        {t("notes.upload.uploadAnother")}
      </button>
    </div>
  );
}

function ErrorView({
  t,
  error,
  reset,
  handleTranscribe,
}: {
  t: (key: string) => string;
  error: string;
  reset: () => void;
  handleTranscribe: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col">
      <div
        className="rounded-md p-3.5 mb-4"
        style={{
          border: "1px solid color-mix(in oklch, oklch(0.7 0.18 25) 25%, transparent)",
          background: "color-mix(in oklch, oklch(0.7 0.18 25) 6%, transparent)",
        }}
      >
        <div className="flex items-start gap-2.5">
          <AlertCircle size={14} className="shrink-0 mt-0.5" style={{ color: "oklch(0.78 0.14 25)" }} />
          <p className="q-meta flex-1" style={{ color: "oklch(0.85 0.1 25)" }}>
            {error}
          </p>
          <button
            onClick={reset}
            className="w-5 h-5 rounded-sm flex items-center justify-center shrink-0"
            style={{ color: "var(--q-meta)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--q-fg)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--q-meta)")}
          >
            <X size={11} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 justify-center">
        <button
          onClick={handleTranscribe}
          className="q-meta px-3 h-7 rounded-md inline-flex items-center"
          style={{ color: "var(--q-fg-2)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--q-fg)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--q-fg-2)")}
        >
          {t("notes.upload.retry")}
        </button>
        <button
          onClick={reset}
          className="q-meta px-3 h-7 rounded-md inline-flex items-center"
          style={{ color: "var(--q-meta)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--q-fg-2)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--q-meta)")}
        >
          {t("notes.upload.startOver")}
        </button>
      </div>
    </div>
  );
}
