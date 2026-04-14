import type { TranscriptSegment } from "../hooks/useMeetingTranscription";

export type TranscriptSpeakerStatus = "provisional" | "confirmed" | "suggested" | "locked";
export type TranscriptSpeakerLockSource = "user" | "diarization" | "suggestion";

const SPEAKER_STATE_FIELDS = [
  "speaker",
  "speakerName",
  "speakerIsPlaceholder",
  "suggestedName",
  "suggestedProfileId",
  "speakerStatus",
  "speakerLocked",
  "speakerLockSource",
] as const;

type SpeakerStateField = (typeof SPEAKER_STATE_FIELDS)[number];

const normalizeText = (text: string) => text.trim().replace(/\s+/g, " ");

const getSegmentMatchKey = (segment: TranscriptSegment) =>
  [segment.source, segment.timestamp ?? "", normalizeText(segment.text)].join("|");

const canonicalizeTranscriptSpeakerStatus = (
  status?: string,
  speakerLocked?: boolean,
  speakerLockSource?: TranscriptSpeakerLockSource
): TranscriptSpeakerStatus | undefined => {
  if (speakerLocked || speakerLockSource === "user") {
    return "locked";
  }

  switch (status) {
    case "provisional":
    case "confirmed":
    case "suggested":
    case "locked":
      return status;
    case "suggested_profile":
      return "suggested";
    case "user_locked":
      return "locked";
    case "uncertain_overlap":
      return "provisional";
    default:
      return undefined;
  }
};

const pickSpeakerStatus = (segment: TranscriptSegment): TranscriptSpeakerStatus | undefined => {
  const normalizedStatus = canonicalizeTranscriptSpeakerStatus(
    segment.speakerStatus,
    segment.speakerLocked,
    segment.speakerLockSource
  );
  if (normalizedStatus) return normalizedStatus;
  if (segment.suggestedName && !segment.speakerName) return "suggested";
  if (segment.source === "system" && segment.speakerIsPlaceholder) return "provisional";
  if (segment.speaker && segment.speaker !== "you") return "confirmed";
  return undefined;
};

export const isTranscriptSpeakerLocked = (segment: TranscriptSegment) =>
  !!segment.speakerLocked ||
  segment.speakerLockSource === "user" ||
  canonicalizeTranscriptSpeakerStatus(segment.speakerStatus) === "locked";

export const normalizeTranscriptSegment = (segment: TranscriptSegment): TranscriptSegment => {
  const speakerStatus = pickSpeakerStatus(segment);
  const speakerLocked =
    !!segment.speakerLocked || segment.speakerLockSource === "user" || speakerStatus === "locked";
  return {
    ...segment,
    speakerStatus,
    speakerLocked,
    speakerLockSource: speakerLocked
      ? (segment.speakerLockSource ?? "user")
      : segment.speakerLockSource,
  };
};

export const normalizeTranscriptSegments = (segments: TranscriptSegment[]) =>
  segments.map((segment) => normalizeTranscriptSegment(segment));

export const applyTranscriptSpeakerPatch = (
  segment: TranscriptSegment,
  patch: Partial<Pick<TranscriptSegment, SpeakerStateField>>
) => normalizeTranscriptSegment({ ...segment, ...patch });

export const lockTranscriptSpeaker = (
  segment: TranscriptSegment,
  patch: Partial<Pick<TranscriptSegment, SpeakerStateField>> = {}
) =>
  normalizeTranscriptSegment({
    ...segment,
    ...patch,
    speakerLocked: true,
    speakerStatus: "locked",
    speakerLockSource: "user",
  });

const mergeSpeakerFields = (existing: TranscriptSegment, incoming: TranscriptSegment) => {
  const merged = { ...incoming } as TranscriptSegment;
  const existingFields = existing as Record<SpeakerStateField, unknown>;
  const mergedFields = merged as Record<SpeakerStateField, unknown>;

  for (const field of SPEAKER_STATE_FIELDS) {
    if (mergedFields[field] === undefined && existingFields[field] !== undefined) {
      mergedFields[field] = existingFields[field];
    }
  }

  if (isTranscriptSpeakerLocked(existing)) {
    for (const field of SPEAKER_STATE_FIELDS) {
      if (existingFields[field] !== undefined) {
        mergedFields[field] = existingFields[field];
      }
    }
  }

  return normalizeTranscriptSegment(merged);
};

export const mergeTranscriptSegments = (
  existingSegments: TranscriptSegment[],
  incomingSegments: TranscriptSegment[]
) => {
  if (incomingSegments.length === 0) {
    return normalizeTranscriptSegments(existingSegments);
  }

  const existingById = new Map<string, TranscriptSegment>();
  const existingByKey = new Map<string, Array<{ index: number; segment: TranscriptSegment }>>();

  existingSegments.forEach((segment, index) => {
    if (segment.id) {
      existingById.set(segment.id, segment);
    }

    const key = getSegmentMatchKey(segment);
    const bucket = existingByKey.get(key);
    if (bucket) {
      bucket.push({ index, segment });
    } else {
      existingByKey.set(key, [{ index, segment }]);
    }
  });

  const usedIndexes = new Set<number>();

  return incomingSegments.map((segment, index) => {
    const byId = segment.id ? existingById.get(segment.id) : undefined;
    if (byId) {
      const byIdIndex = existingSegments.findIndex((candidate) => candidate.id === byId.id);
      if (byIdIndex >= 0) {
        usedIndexes.add(byIdIndex);
      }
      return mergeSpeakerFields(byId, segment);
    }

    const keyMatches = existingByKey.get(getSegmentMatchKey(segment)) || [];
    const keyMatch = keyMatches.find(({ index: existingIndex }) => !usedIndexes.has(existingIndex));
    if (keyMatch) {
      usedIndexes.add(keyMatch.index);
      return mergeSpeakerFields(keyMatch.segment, segment);
    }

    const fallbackIndex = existingSegments.findIndex(
      (candidate, existingIndex) =>
        !usedIndexes.has(existingIndex) &&
        candidate.source === segment.source &&
        candidate.text === segment.text
    );

    if (fallbackIndex >= 0) {
      usedIndexes.add(fallbackIndex);
      return mergeSpeakerFields(existingSegments[fallbackIndex], segment);
    }

    const positionalMatch = existingSegments[index];
    if (positionalMatch && !usedIndexes.has(index) && positionalMatch.source === segment.source) {
      usedIndexes.add(index);
      return mergeSpeakerFields(positionalMatch, segment);
    }

    return normalizeTranscriptSegment({
      ...segment,
      id: segment.id || `merged-${index}`,
    });
  });
};

export const serializeTranscriptSegments = (segments: TranscriptSegment[]) =>
  JSON.stringify(
    segments.map((segment) => ({
      text: segment.text,
      source: segment.source,
      timestamp: segment.timestamp,
      speaker: segment.speaker,
      speakerName: segment.speakerName,
      speakerIsPlaceholder: segment.speakerIsPlaceholder,
      suggestedName: segment.suggestedName,
      suggestedProfileId: segment.suggestedProfileId,
      speakerStatus: segment.speakerStatus,
      speakerLocked: segment.speakerLocked,
      speakerLockSource: segment.speakerLockSource,
    }))
  );
