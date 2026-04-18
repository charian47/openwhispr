import { useState, useCallback } from "react";

interface ReasoningRetryPayload {
  text: string;
  model: string;
  agentName: string | null;
  config: Record<string, unknown>;
}

const STORAGE_KEY = "pendingReasoningInput";

function readStoredPayload(): ReasoningRetryPayload | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as ReasoningRetryPayload) : null;
  } catch {
    return null;
  }
}

export function useReasoningRetry() {
  const [retryPayload, setRetryPayload] = useState<ReasoningRetryPayload | null>(() =>
    readStoredPayload()
  );

  const clearRetry = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setRetryPayload(null);
  }, []);

  const refreshRetry = useCallback(() => {
    setRetryPayload(readStoredPayload());
  }, []);

  return {
    hasPendingRetry: retryPayload !== null,
    retryPayload,
    clearRetry,
    refreshRetry,
  };
}
