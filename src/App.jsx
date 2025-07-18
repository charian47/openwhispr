import React, { useState, useEffect, useRef } from "react";
import "./index.css";
import { useToast } from "./components/ui/Toast";
import { LoadingDots } from "./components/ui/LoadingDots";
import { useHotkey } from "./hooks/useHotkey";
import { useWindowDrag } from "./hooks/useWindowDrag";

// Sound Wave Icon Component (for idle/hover states)
const SoundWaveIcon = ({ size = 16 }) => {
  return (
    <div className="flex items-center justify-center gap-1">
      <div
        className={`bg-white rounded-full`}
        style={{ width: size * 0.25, height: size * 0.6 }}
      ></div>
      <div
        className={`bg-white rounded-full`}
        style={{ width: size * 0.25, height: size }}
      ></div>
      <div
        className={`bg-white rounded-full`}
        style={{ width: size * 0.25, height: size * 0.6 }}
      ></div>
    </div>
  );
};

// Voice Wave Animation Component (for processing state)
const VoiceWaveIndicator = ({ isListening }) => {
  return (
    <div className="flex items-center justify-center gap-0.5">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className={`w-0.5 bg-white rounded-full transition-all duration-150 ${
            isListening ? "animate-pulse h-4" : "h-2"
          }`}
          style={{
            animationDelay: isListening ? `${i * 0.1}s` : "0s",
            animationDuration: isListening ? `${0.6 + i * 0.1}s` : "0s",
          }}
        />
      ))}
    </div>
  );
};

// Enhanced Tooltip Component
const Tooltip = ({ children, content, emoji }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && (
        <div
          className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-1 py-1 text-white bg-gradient-to-r from-neutral-800 to-neutral-700 rounded-md whitespace-nowrap z-10 transition-opacity duration-150"
          style={{ fontSize: "9.7px" }}
        >
          {emoji && <span className="mr-1">{emoji}</span>}
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-neutral-800"></div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const { toast } = useToast();
  const { hotkey } = useHotkey();
  const { isDragging, handleMouseDown, handleMouseUp, handleClick } = useWindowDrag();
  const [dragStartPos, setDragStartPos] = useState(null);
  const [hasDragged, setHasDragged] = useState(false);

  const startRecording = async () => {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      mediaRecorderRef.current = new window.MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        setIsProcessing(true);
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/wav",
        });
        // Start processing immediately without waiting
        processAudio(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Recording error:", err);
      toast({
        title: "Recording Error",
        description: "Failed to access microphone: " + err.message,
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // Don't set processing immediately - let the onstop handler do it
    }
  };

  const safePaste = async (text) => {
    try {
      await window.electronAPI.pasteText(text);
    } catch (err) {
      toast({
        title: "Paste Error",
        description:
          "Failed to paste text. Please check accessibility permissions.",
        variant: "destructive",
      });
    }
  };

  const processAudio = async (audioBlob) => {
    try {
      // Cache preferences to avoid repeated localStorage calls
      const useLocalWhisper =
        localStorage.getItem("useLocalWhisper") === "true";
      const whisperModel = localStorage.getItem("whisperModel") || "base";

      if (useLocalWhisper) {
        await processWithLocalWhisper(audioBlob, whisperModel);
      } else {
        await processWithOpenAIAPI(audioBlob);
      }
    } catch (err) {
      console.error("Transcription error:", err);
      toast({
        title: "Transcription Error",
        description: "Transcription failed: " + err.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const processWithLocalWhisper = async (audioBlob, model = "base") => {
    try {
      // Convert Blob to ArrayBuffer for IPC transfer - do this early
      const arrayBuffer = await audioBlob.arrayBuffer();
      const options = { model };
      const result = await window.electronAPI.transcribeLocalWhisper(
        arrayBuffer,
        options
      );

      if (result.success && result.text) {
        const text = result.text.trim();

        if (text) {
          setTranscript(text);

          // Paste immediately - don't wait for database save
          const pastePromise = safePaste(text);

          // Save to database in parallel
          const savePromise = window.electronAPI
            .saveTranscription(text)
            .catch((err) => {
              console.error("Failed to save transcription:", err);
            });

          // Wait for paste to complete, but don't block on database save
          await pastePromise;
        } else {
          toast({
            title: "No Audio",
            description: "No text transcribed. Try again.",
            variant: "destructive",
          });
        }
      } else if (
        result.success === false &&
        result.message === "No audio detected"
      ) {
        toast({
          title: "No Audio",
          description: "No audio detected",
          variant: "destructive",
        });
        return;
      } else {
        throw new Error(result.error || "Local Whisper transcription failed");
      }
    } catch (err) {
      console.error("Local Whisper error:", err);
      const allowFallback =
        localStorage.getItem("allowOpenAIFallback") === "true";

      if (allowFallback) {
        toast({
          title: "Fallback Mode",
          description: "Local Whisper failed. Retrying with OpenAI API...",
          variant: "default",
        });
        await processWithOpenAIAPI(audioBlob);
      } else {
        throw new Error(`Local Whisper failed: ${err.message}`);
      }
    }
  };

  const processWithOpenAIAPI = async (audioBlob) => {
    try {
      // Get API key early and cache it
      let apiKey = await window.electronAPI.getOpenAIKey();
      if (
        !apiKey ||
        apiKey.trim() === "" ||
        apiKey === "your_openai_api_key_here"
      ) {
        apiKey = localStorage.getItem("openaiApiKey");
      }

      if (
        !apiKey ||
        apiKey.trim() === "" ||
        apiKey === "your_openai_api_key_here"
      ) {
        toast({
          title: "API Key Missing",
          description:
            "OpenAI API key not found. Please set your API key in the .env file or Control Panel.",
          variant: "destructive",
        });
        return;
      }

      const formData = new FormData();
      formData.append("file", audioBlob, "audio.wav");
      formData.append("model", "whisper-1");

      const response = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API Error:", errorText);
        toast({
          title: "API Error",
          description: `Transcription failed: ${response.status} ${errorText}`,
          variant: "destructive",
        });
        throw new Error(
          `Failed to transcribe audio: ${response.status} ${errorText}`
        );
      }

      const result = await response.json();
      const text = result.text.trim();

      if (text) {
        setTranscript(text);

        // Paste immediately - don't wait for database save
        const pastePromise = safePaste(text);

        // Save to database in parallel
        const savePromise = window.electronAPI
          .saveTranscription(text)
          .catch((err) => {
            console.error("Failed to save transcription:", err);
          });

        // Wait for paste to complete, but don't block on database save
        await pastePromise;
      } else {
        toast({
          title: "No Audio",
          description: "No text transcribed. Try again.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("OpenAI API error:", err);
      throw err;
    }
  };

  const handleClose = () => {
    window.electronAPI.hideWindow();
  };

  useEffect(() => {
    let recording = false;
    const handleToggle = () => {
      if (!recording && !isRecording && !isProcessing) {
        startRecording();
        recording = true;
      } else if (isRecording) {
        stopRecording();
        recording = false;
      }
    };
    window.electronAPI.onToggleDictation(handleToggle);
    return () => {
      // No need to remove listener, as it's handled in preload
    };
  }, [isRecording, isProcessing]);

  const toggleListening = () => {
    if (!isRecording && !isProcessing) {
      startRecording();
    } else if (isRecording) {
      stopRecording();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Escape") {
      handleClose();
    }
  };

  useEffect(() => {
    document.addEventListener("keydown", handleKeyPress);
    return () => document.removeEventListener("keydown", handleKeyPress);
  }, []);

  // Determine current mic state
  const getMicState = () => {
    if (isRecording) return "recording";
    if (isProcessing) return "processing";
    if (isHovered && !isRecording && !isProcessing) return "hover";
    return "idle";
  };

  const micState = getMicState();
  const isListening = isRecording || isProcessing;

  // Get microphone button properties based on state
  const getMicButtonProps = () => {
    const baseClasses =
      "rounded-full w-10 h-10 flex items-center justify-center relative overflow-hidden border-2 border-white/70 cursor-pointer";

    switch (micState) {
      case "idle":
        return {
          className: `${baseClasses} bg-black/50 cursor-pointer`,
          tooltip: `Press [${hotkey}] to speak`,
        };
      case "hover":
        return {
          className: `${baseClasses} bg-black/50 cursor-pointer`,
          tooltip: `Press [${hotkey}] to speak`,
        };
      case "recording":
        return {
          className: `${baseClasses} bg-blue-600 cursor-pointer`,
          tooltip: "Recording...",
        };
      case "processing":
        return {
          className: `${baseClasses} bg-purple-600 cursor-not-allowed`,
          tooltip: "Processing...",
        };
      default:
        return {
          className: `${baseClasses} bg-black/50 cursor-pointer`,
          style: { transform: "scale(0.8)" },
          tooltip: "Click to speak",
        };
    }
  };

  const micProps = getMicButtonProps();

  return (
    <>
      {/* Fixed bottom-right voice button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Tooltip content={micProps.tooltip}>
          <button
            onMouseDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setDragStartPos({ x: e.clientX, y: e.clientY });
              setHasDragged(false);
              handleMouseDown(e);
            }}
            onMouseMove={(e) => {
              if (dragStartPos && !hasDragged) {
                const distance = Math.sqrt(
                  Math.pow(e.clientX - dragStartPos.x, 2) + 
                  Math.pow(e.clientY - dragStartPos.y, 2)
                );
                if (distance > 5) { // 5px threshold for drag
                  setHasDragged(true);
                }
              }
            }}
            onMouseUp={(e) => {
              handleMouseUp(e);
              setDragStartPos(null);
            }}
            onClick={(e) => {
              if (!hasDragged) {
                toggleListening();
              }
              e.preventDefault();
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onFocus={() => setIsHovered(true)}
            onBlur={() => setIsHovered(false)}
            className={micProps.className}
            disabled={micState === "processing"}
            style={{
              ...micProps.style,
              cursor:
                micState === "processing"
                  ? "not-allowed !important"
                  : isDragging
                  ? "grabbing !important"
                  : "pointer !important",
              transition:
                "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.25s ease-out",
            }}
          >
            {/* Background effects */}
            <div
              className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent transition-opacity duration-150"
              style={{ opacity: micState === "hover" ? 0.8 : 0 }}
            ></div>
            <div
              className="absolute inset-0 transition-colors duration-150"
              style={{
                backgroundColor:
                  micState === "hover" ? "rgba(0,0,0,0.1)" : "transparent",
              }}
            ></div>

            {/* Dynamic content based on state */}
            {micState === "idle" || micState === "hover" ? (
              <SoundWaveIcon size={micState === "idle" ? 12 : 14} />
            ) : micState === "recording" ? (
              <LoadingDots />
            ) : micState === "processing" ? (
              <VoiceWaveIndicator isListening={true} />
            ) : null}

            {/* State indicator ring for recording */}
            {micState === "recording" && (
              <div className="absolute inset-0 rounded-full border-2 border-blue-300 animate-pulse"></div>
            )}

            {/* State indicator ring for processing */}
            {micState === "processing" && (
              <div className="absolute inset-0 rounded-full border-2 border-purple-300 opacity-50"></div>
            )}
          </button>
        </Tooltip>
      </div>
    </>
  );
}
