import React, { useState, useRef, useEffect, Suspense } from "react";
import { useTranslation } from "react-i18next";
import {
  Upload,
  FileAudio,
  X,
  AlertCircle,
  ChevronRight,
  Settings,
  Check,
} from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "./lib/utils";
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
  const shouldCenter = !advancedOpen;

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
  };

  const handleTranscribe = async () => {
    if (!file) return;
    setState("transcribing");
    setError(null);
    setProgress(0);

    progressRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          if (progressRef.current) clearInterval(progressRef.current);
          return prev;
        }
        return prev + Math.random() * 6;
      });
    }, 500);

    try {
      let res: { success: boolean; text?: string; error?: string; code?: string };

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

      if (progressRef.current) clearInterval(progressRef.current);

      if (res.success && res.text) {
        setProgress(100);
        setResult(res.text);

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
    <div className="flex flex-col items-center h-full overflow-y-auto px-6">
      <div
        className={cn("w-full max-w-md shrink-0", shouldCenter ? "my-auto" : "pt-4 pb-8")}
        style={{ animation: "float-up 0.4s ease-out" }}
      >
        <div className="max-w-[320px] mx-auto">
          {state === "idle" && providerReady === false && (
            <NoProviderView t={t} onOpenSettings={() => onOpenSettings?.("speechToText")} />
          )}

          {state === "idle" && providerReady !== false && (
            <IdleView
              t={t}
              getActiveModelLabel={getActiveModelLabel}
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

          {state === "transcribing" && (
            <TranscribingView t={t} progress={progress} file={file} />
          )}

          {state === "complete" && result && <CompleteView t={t} result={result} reset={reset} />}

          {state === "error" && error && (
            <ErrorView t={t} error={error} reset={reset} handleTranscribe={handleTranscribe} />
          )}
        </div>

        {(state === "idle" || state === "selected") && (
          <div className="mx-auto mt-5" style={{ maxWidth: advancedOpen ? "448px" : "320px" }}>
            <button
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="flex items-center gap-1.5 text-xs text-foreground/25 hover:text-foreground/40 transition-colors mx-auto"
            >
              <ChevronRight
                size={10}
                className={cn("transition-transform duration-200", advancedOpen && "rotate-90")}
              />
              {t("notes.upload.transcriptionSettings")}
            </button>

            {advancedOpen && (
              <div className="mt-3" style={{ animation: "float-up 0.2s ease-out" }}>
                {modelPicker}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface NoProviderViewProps {
  t: (key: string) => string;
  onOpenSettings: () => void;
}

function NoProviderView({ t, onOpenSettings }: NoProviderViewProps) {
  return (
    <div
      className="flex flex-col items-center gap-4 py-2"
      style={{ animation: "float-up 0.4s ease-out" }}
    >
      <div className="w-10 h-10 rounded-[10px] bg-linear-to-b from-foreground/5 to-foreground/2 dark:from-white/8 dark:to-white/3 border border-foreground/8 dark:border-white/8 flex items-center justify-center">
        <Settings size={17} strokeWidth={1.5} className="text-foreground/25 dark:text-foreground/35" />
      </div>
      <div className="text-center">
        <h2 className="text-xs font-semibold text-foreground mb-1">
          {t("notes.upload.noProviderTitle")}
        </h2>
        <p className="text-xs text-foreground/30 leading-relaxed max-w-60">
          {t("notes.upload.noProviderDescription")}
        </p>
      </div>
      <Button variant="default" size="sm" className="h-7 text-xs px-4" onClick={onOpenSettings}>
        {t("notes.upload.noProviderAction")}
      </Button>
    </div>
  );
}

interface IdleViewProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  getActiveModelLabel: () => string;
  handleDrop: (e: React.DragEvent) => void;
  handleBrowse: () => void;
  isDragOver: boolean;
  setIsDragOver: (v: boolean) => void;
}

function IdleView({
  t,
  getActiveModelLabel,
  handleDrop,
  handleBrowse,
  isDragOver,
  setIsDragOver,
}: IdleViewProps) {
  return (
    <>
      <div className="flex flex-col items-center mb-5">
        <div className="w-10 h-10 rounded-[10px] bg-linear-to-b from-foreground/5 to-foreground/[0.02] dark:from-white/8 dark:to-white/3 border border-foreground/8 dark:border-white/8 flex items-center justify-center mb-4">
          <Upload size={17} strokeWidth={1.5} className="text-foreground/25 dark:text-foreground/35" />
        </div>
        <h2 className="text-xs font-semibold text-foreground mb-1">{t("notes.upload.title")}</h2>
        <p className="text-xs text-foreground/25">
          {t("notes.upload.using", { model: getActiveModelLabel() })}
        </p>
      </div>

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
        className={cn(
          "relative rounded-lg p-8 text-center cursor-pointer transition-[background-color,border-color,transform] duration-300 group",
          "bg-surface-1/40 dark:bg-white/[0.03] backdrop-blur-sm",
          "border border-foreground/6 dark:border-white/6",
          "hover:bg-surface-1/60 dark:hover:bg-white/[0.05] hover:border-foreground/12 dark:hover:border-white/10",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30",
          isDragOver && "border-primary/30 bg-primary/[0.04] dark:bg-primary/[0.06] scale-[1.01]"
        )}
      >
        {!isDragOver ? (
          <div className="flex flex-col items-center gap-2 relative">
            <div className="w-8 h-8 rounded-full bg-foreground/[0.03] dark:bg-white/[0.04] flex items-center justify-center mb-1">
              <Upload size={14} className="text-foreground/20 dark:text-foreground/30 group-hover:text-foreground/40 transition-colors" />
            </div>
            <p className="text-xs text-foreground/35 group-hover:text-foreground/50 transition-colors">
              {t("notes.upload.dropOrBrowse")}
            </p>
            <p className="text-xs text-foreground/15 tracking-wide">
              {t("notes.upload.supportedFormats")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 relative">
            <Upload size={18} className="text-primary/60" />
            <p className="text-xs text-primary/60 font-medium">{t("notes.upload.dropToUpload")}</p>
          </div>
        )}
      </div>
    </>
  );
}

interface SelectedViewProps {
  t: (key: string) => string;
  file: { name: string; path: string; size: string; sizeBytes: number };
  getActiveModelLabel: () => string;
  reset: () => void;
  handleTranscribe: () => void;
  fileTooLarge: boolean;
}

function SelectedView({
  t,
  file,
  getActiveModelLabel,
  reset,
  handleTranscribe,
  fileTooLarge,
}: SelectedViewProps) {
  return (
    <div style={{ animation: "float-up 0.3s ease-out" }}>
      <div className="rounded-lg border border-foreground/8 dark:border-white/6 bg-surface-1/40 dark:bg-white/[0.03] backdrop-blur-sm p-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[8px] bg-primary/8 dark:bg-primary/12 border border-primary/10 dark:border-primary/15 flex items-center justify-center shrink-0">
            <FileAudio size={15} className="text-primary/60" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-foreground/70 truncate font-medium">{file.name}</p>
            {file.size && <p className="text-xs text-foreground/25 mt-0.5">{file.size}</p>}
            <p className="text-xs text-foreground/20 mt-0.5">{getActiveModelLabel()}</p>
          </div>
          <button
            onClick={reset}
            className="text-foreground/15 hover:text-foreground/40 transition-colors p-1 rounded"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {fileTooLarge && (
        <div className="rounded-lg border border-primary/12 dark:border-primary/15 bg-primary/[0.03] px-3 py-2.5 mb-3">
          <p className="text-xs text-foreground/50 leading-relaxed">
            {t("notes.upload.byokTooLarge")}
          </p>
          <p className="text-xs text-foreground/35 leading-relaxed mt-1.5">
            {t("notes.upload.byokTooLargeDetail")}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 justify-center flex-wrap">
        {!fileTooLarge && (
          <Button
            variant="default"
            size="sm"
            onClick={handleTranscribe}
            className="h-8 text-xs px-5"
          >
            {t("notes.upload.transcribe")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="h-8 text-xs text-foreground/35"
        >
          {t("notes.upload.cancel")}
        </Button>
      </div>
    </div>
  );
}

interface TranscribingViewProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  progress: number;
  file: { name: string; path: string; size: string; sizeBytes: number } | null;
}

function TranscribingView({ t, progress, file }: TranscribingViewProps) {
  return (
    <div className="flex flex-col items-center" style={{ animation: "float-up 0.3s ease-out" }}>
      <div className="flex items-end justify-center gap-[3px] h-10 mb-5">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="w-[3px] rounded-full bg-primary/40 dark:bg-primary/50 origin-bottom"
            style={{
              height: "100%",
              animation: `waveform-bar ${0.8 + i * 0.12}s ease-in-out infinite`,
              animationDelay: `${i * 0.08}s`,
            }}
          />
        ))}
      </div>

      <div className="w-full max-w-[200px] h-[3px] rounded-full bg-foreground/5 dark:bg-white/5 overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-primary/50 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      <p className="text-xs text-foreground/50 font-medium">
        {t("notes.upload.transcribingLocal")}
      </p>
      {file ? (
        <p className="text-xs text-foreground/20 mt-1 truncate max-w-50">{file.name}</p>
      ) : null}
    </div>
  );
}

interface CompleteViewProps {
  t: (key: string) => string;
  result: string;
  reset: () => void;
}

function CompleteView({ t, result, reset }: CompleteViewProps) {
  return (
    <div className="flex flex-col items-center" style={{ animation: "float-up 0.3s ease-out" }}>
      <div className="w-12 h-12 rounded-full bg-success/10 border border-success/20 flex items-center justify-center mb-4">
        <Check size={20} className="text-success/70" />
      </div>

      <p className="text-xs text-foreground/60 font-medium mb-1">
        {t("notes.upload.transcriptionComplete")}
      </p>
      <p className="text-xs text-foreground/25 max-w-[240px] text-center line-clamp-3 mb-4">
        {result.slice(0, 200)}
      </p>

      <Button
        variant="ghost"
        size="sm"
        onClick={reset}
        className="h-8 text-xs text-foreground/35"
      >
        {t("notes.upload.uploadAnother")}
      </Button>
    </div>
  );
}

interface ErrorViewProps {
  t: (key: string) => string;
  error: string;
  reset: () => void;
  handleTranscribe: () => void;
}

function ErrorView({ t, error, reset, handleTranscribe }: ErrorViewProps) {
  return (
    <div style={{ animation: "float-up 0.3s ease-out" }}>
      <div className="rounded-lg border border-destructive/15 dark:border-destructive/20 bg-destructive/[0.03] dark:bg-destructive/[0.05] backdrop-blur-sm p-4 mb-4">
        <div className="flex items-start gap-2.5">
          <AlertCircle size={14} className="text-destructive/50 shrink-0 mt-0.5" />
          <p className="flex-1 text-xs text-destructive/70 leading-relaxed">{error}</p>
          <button
            onClick={reset}
            className="text-foreground/15 hover:text-foreground/30 transition-colors shrink-0 p-0.5 rounded"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 justify-center">
        <Button variant="ghost" size="sm" onClick={handleTranscribe} className="h-7 text-xs text-foreground/40">
          {t("notes.upload.retry")}
        </Button>
        <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs text-foreground/25">
          {t("notes.upload.startOver")}
        </Button>
      </div>
    </div>
  );
}
