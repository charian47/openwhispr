import TextCleanup from '../utils/textCleanup';

class AudioManager {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.isProcessing = false;
    this.onStateChange = null;
    this.onError = null;
    this.onTranscriptionComplete = null;
  }

  // Set callback functions
  setCallbacks({ onStateChange, onError, onTranscriptionComplete }) {
    this.onStateChange = onStateChange;
    this.onError = onError;
    this.onTranscriptionComplete = onTranscriptionComplete;
  }

  async startRecording() {
    try {
      if (this.isRecording) {
        console.warn("Recording already in progress");
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = async () => {
        this.isRecording = false;
        this.isProcessing = true;
        this.onStateChange?.({ isRecording: false, isProcessing: true });

        const audioBlob = new Blob(this.audioChunks, { type: "audio/wav" });
        await this.processAudio(audioBlob);

        // Clean up stream
        stream.getTracks().forEach((track) => track.stop());
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.onStateChange?.({ isRecording: true, isProcessing: false });

      return true;
    } catch (error) {
      console.error("Recording error:", error);
      this.onError?.({
        title: "Recording Error",
        description: `Failed to access microphone: ${error.message}`,
      });
      return false;
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      // State change will be handled in onstop callback
      return true;
    }
    return false;
  }

  async processAudio(audioBlob) {
    try {
      // Get user preferences
      const useLocalWhisper =
        localStorage.getItem("useLocalWhisper") === "true";
      const whisperModel = localStorage.getItem("whisperModel") || "base";

      let result;
      if (useLocalWhisper) {
        result = await this.processWithLocalWhisper(audioBlob, whisperModel);
      } else {
        result = await this.processWithOpenAIAPI(audioBlob);
      }

      this.onTranscriptionComplete?.(result);
    } catch (error) {
      console.error("Transcription error:", error);
      this.onError?.({
        title: "Transcription Error",
        description: `Transcription failed: ${error.message}`,
      });
    } finally {
      this.isProcessing = false;
      this.onStateChange?.({ isRecording: false, isProcessing: false });
    }
  }

  // Clean text transcription using comprehensive utility
  static cleanTranscription(text, options = {}) {
    return TextCleanup.cleanTranscription(text, {
      removeArtifacts: true,
      normalizeSpaces: true,
      fixPunctuation: true,
      removeFillers: true, // Enable filler removal by default
      removeRepetitions: true,
      capitalizeFirst: true,
      addPeriod: false, // Don't auto-add periods to preserve user intent
      ...options
    });
  }

  async processWithLocalWhisper(audioBlob, model = "base") {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const options = { model };
      const result = await window.electronAPI.transcribeLocalWhisper(
        arrayBuffer,
        options
      );

      if (result.success && result.text) {
        let text = AudioManager.cleanTranscription(result.text);
        if (text) {
          return { success: true, text, source: "local" };
        } else {
          throw new Error("No text transcribed");
        }
      } else if (
        result.success === false &&
        result.message === "No audio detected"
      ) {
        throw new Error("No audio detected");
      } else {
        throw new Error(result.error || "Local Whisper transcription failed");
      }
    } catch (error) {
      console.error("Local Whisper error:", error);

      // Check if it's a "No audio detected" error and don't retry
      if (error.message === "No audio detected") {
        throw error;
      }

      // Try fallback to OpenAI API if enabled
      const allowFallback =
        localStorage.getItem("allowOpenAIFallback") === "true";
      if (allowFallback) {
        console.log("Falling back to OpenAI API...");
        try {
          return await this.processWithOpenAIAPI(audioBlob);
        } catch (fallbackError) {
          // If OpenAI fallback also fails, throw the original error
          throw new Error(
            `Local Whisper failed: ${error.message}. OpenAI fallback also failed: ${fallbackError.message}`
          );
        }
      } else {
        throw new Error(`Local Whisper failed: ${error.message}`);
      }
    }
  }

  async processWithOpenAIAPI(audioBlob) {
    try {
      // Get API key
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
        throw new Error(
          "OpenAI API key not found. Please set your API key in the .env file or Control Panel."
        );
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
        throw new Error(`API Error: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      const text = AudioManager.cleanTranscription(result.text);

      if (text) {
        return { success: true, text, source: "openai" };
      } else {
        throw new Error("No text transcribed");
      }
    } catch (error) {
      console.error("OpenAI API error:", error);
      throw error;
    }
  }

  async safePaste(text) {
    try {
      await window.electronAPI.pasteText(text);
      return true;
    } catch (error) {
      this.onError?.({
        title: "Paste Error",
        description: `Failed to paste text. Please check accessibility permissions. ${error.message}`,
      });
      return false;
    }
  }

  async saveTranscription(text) {
    try {
      await window.electronAPI.saveTranscription(text);
      return true;
    } catch (error) {
      console.error("Failed to save transcription:", error);
      return false;
    }
  }

  getState() {
    return {
      isRecording: this.isRecording,
      isProcessing: this.isProcessing,
    };
  }

  cleanup() {
    if (this.mediaRecorder && this.isRecording) {
      this.stopRecording();
    }
    this.onStateChange = null;
    this.onError = null;
    this.onTranscriptionComplete = null;
  }
}

export default AudioManager;
