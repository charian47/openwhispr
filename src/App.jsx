import React, { useState, useEffect, useRef } from "react";
import "./index.css";
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
import { LoadingDots } from "./components/ui/LoadingDots";
import { DotFlashing } from "./components/ui/DotFlashing";
import { Toast } from "./components/ui/Toast";

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      mediaRecorderRef.current = new window.MediaRecorder(stream);
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Recording error:", err)
      setError('Failed to access microphone: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const safePaste = async (text) => {
    try {
      await window.electronAPI.pasteText(text);
    } catch (err) {
      setError('Failed to paste text. Please check accessibility permissions.');
    }
  };

  const processAudio = async (audioBlob) => {
    try {
      // Check if local Whisper is available and user preference
      const useLocalWhisper = localStorage.getItem('useLocalWhisper') === 'true';
      const whisperModel = localStorage.getItem('whisperModel') || 'base';
      
      if (useLocalWhisper) {
        await processWithLocalWhisper(audioBlob, whisperModel);
      } else {
        await processWithOpenAIAPI(audioBlob);
      }
      
    } catch (err) {
      console.error("Transcription error:", err)
      setError('Transcription failed: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const processWithLocalWhisper = async (audioBlob, model = 'base') => {
    try {
      // Check Whisper installation first
      const installCheck = await window.electronAPI.checkWhisperInstallation();
      if (!installCheck.installed || !installCheck.working) {
        throw new Error(`Local Whisper not available: ${installCheck.error || 'Installation check failed'}`);
      }

      const options = { model };
      const result = await window.electronAPI.transcribeLocalWhisper(audioBlob, options);
      
      if (result.success && result.text) {
        const text = result.text.trim();
        
        if (text) {
          setTranscript(text);
          
          // Save transcription to database
          try {
            await window.electronAPI.saveTranscription(text);
          } catch (err) {
            console.error("Failed to save transcription:", err);
          }
          
          // Automatically paste the text
          await safePaste(text);
        } else {
          setError('No text transcribed. Try again.');
        }
      } else {
        throw new Error(result.error || 'Local Whisper transcription failed');
      }
      
    } catch (err) {
      console.error("Local Whisper error:", err);
      // Fallback to OpenAI API if local fails
      setError('Local Whisper failed, trying OpenAI API...');
      await processWithOpenAIAPI(audioBlob);
    }
  };

  const processWithOpenAIAPI = async (audioBlob) => {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.wav');
      formData.append('model', 'whisper-1');

      // Get API key from main process via IPC (will check .env and in-memory storage)
      let apiKey = await window.electronAPI.getOpenAIKey();
      
      // Fallback to localStorage if no key from main process
      if (!apiKey || apiKey.trim() === '' || apiKey === 'your_openai_api_key_here') {
        apiKey = localStorage.getItem('openaiApiKey');
      }
      
      if (!apiKey || apiKey.trim() === '' || apiKey === 'your_openai_api_key_here') {
        setError('OpenAI API key not found. Please set your API key in the .env file or Control Panel.');
        return;
      }

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text()
        console.error("API Error:", errorText)
        setError(`Transcription failed: ${response.status} ${errorText}`);
        throw new Error(`Failed to transcribe audio: ${response.status} ${errorText}`)
      }

      const result = await response.json();
      const text = result.text.trim();
      
      if (text) {
        setTranscript(text);
        
        // Save transcription to database
        try {
          await window.electronAPI.saveTranscription(text);
        } catch (err) {
          console.error("Failed to save transcription:", err);
        }
        
        // Automatically paste the text
        await safePaste(text);
      } else {
        setError('No text transcribed. Try again.');
      }
    } catch (err) {
      console.error("OpenAI API error:", err)
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

  const handleKeyPress = (e) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };
  
  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, []);

  let tabWidth = 40, tabHeight = 8, content = null;
  if (isRecording) {
    tabWidth = 70; tabHeight = 32;
    content = <LoadingDots />;
  } else if (isProcessing) {
    tabWidth = 90; tabHeight = 24;
    content = <DotFlashing />;
  }
  const transition = 'all 0.25s cubic-bezier(0.4,0.2,0.2,1)';

  return (
    <>
      <div style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}>
        <div
          className="glass-effect"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 8,
            transform: 'translateX(-50%)',
            width: tabWidth,
            height: tabHeight,
            background: 'rgba(30,30,30,0.85)',
            border: '1px solid #ccc',
            borderRadius: 20,
            boxShadow: '0 1px 6px rgba(0,0,0,0.10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            pointerEvents: 'auto',
            transition,
          }}
        >
          {content}
        </div>
      </div>
      <Toast message={error} onClose={() => setError('')} />
    </>
  );
}
