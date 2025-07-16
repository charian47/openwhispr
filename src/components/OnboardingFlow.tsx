import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Settings,
  Mic,
  Download,
  Key,
  Zap,
  RefreshCw,
  Trash2,
  Cloud,
  Shield,
  Keyboard,
  TestTube,
  Sparkles,
  Globe,
  Lock,
  Play,
  ArrowRight,
  X,
} from "lucide-react";

// Type declaration for electronAPI
declare global {
  interface Window {
    electronAPI: {
      pasteText: (text: string) => Promise<void>;
      hideWindow: () => Promise<void>;
      onToggleDictation: (callback: () => void) => void;
      saveTranscription: (text: string) => Promise<{ id: number; success: boolean }>;
      getTranscriptions: (limit?: number) => Promise<any[]>;
      clearTranscriptions: () => Promise<{ cleared: number; success: boolean }>;
      deleteTranscription: (id: number) => Promise<{ success: boolean }>;
      getOpenAIKey: () => Promise<string>;
      saveOpenAIKey: (key: string) => Promise<{ success: boolean }>;
      readClipboard: () => Promise<string>;
      createProductionEnvFile: (key: string) => Promise<void>;
      transcribeLocalWhisper: (audioBlob: Blob, options?: any) => Promise<any>;
      checkWhisperInstallation: () => Promise<{
        installed: boolean;
        working: boolean;
        error?: string;
      }>;
      installWhisper: () => Promise<{
        success: boolean;
        message: string;
        output: string;
      }>;
      onWhisperInstallProgress: (
        callback: (event: any, data: { type: string; message: string; output?: string }) => void
      ) => void;
      downloadWhisperModel: (modelName: string) => Promise<{
        success: boolean;
        model: string;
        downloaded: boolean;
        size_mb?: number;
        error?: string;
      }>;
      onWhisperDownloadProgress: (
        callback: (event: any, data: {
          type: string;
          model: string;
          percentage?: number;
          downloaded_bytes?: number;
          total_bytes?: number;
          error?: string;
          result?: any;
        }) => void
      ) => void;
      checkModelStatus: (modelName: string) => Promise<{
        success: boolean;
        model: string;
        downloaded: boolean;
        size_mb?: number;
        error?: string;
      }>;
      listWhisperModels: () => Promise<{
        success: boolean;
        models: Array<{ model: string; downloaded: boolean; size_mb?: number }>;
        cache_dir: string;
      }>;
      deleteWhisperModel: (modelName: string) => Promise<{
        success: boolean;
        model: string;
        deleted: boolean;
        freed_mb?: number;
        error?: string;
      }>;
      windowMinimize: () => Promise<void>;
      windowMaximize: () => Promise<void>;
      windowClose: () => Promise<void>;
      windowIsMaximized: () => Promise<boolean>;
    };
  }
}

interface OnboardingFlowProps {
  onComplete: () => void;
}

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [useLocalWhisper, setUseLocalWhisper] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [whisperModel, setWhisperModel] = useState("base");
  const [hotkey, setHotkey] = useState("`");
  const [whisperInstalled, setWhisperInstalled] = useState(false);
  const [installingWhisper, setInstallingWhisper] = useState(false);
  const [installProgress, setInstallProgress] = useState("");
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [modelList, setModelList] = useState<Array<{ model: string; downloaded: boolean; size_mb?: number }>>([]);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [accessibilityPermissionGranted, setAccessibilityPermissionGranted] = useState(false);
  const [practiceText, setPracticeText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  const steps = [
    { title: "Welcome", icon: Sparkles },
    { title: "Choose Mode", icon: Globe },
    { title: "Setup Processing", icon: Settings },
    { title: "Permissions", icon: Shield },
    { title: "Choose Hotkey", icon: Keyboard },
    { title: "Test & Practice", icon: TestTube },
    { title: "Complete", icon: Check },
  ];

  useEffect(() => {
    // Set up progress listeners
    window.electronAPI.onWhisperInstallProgress((event, data) => {
      setInstallProgress(data.message);
    });

    window.electronAPI.onWhisperDownloadProgress((event, data) => {
      if (data.type === "progress") {
        setDownloadProgress(data.percentage || 0);
      } else if (data.type === "complete") {
        setDownloadingModel(null);
        setDownloadProgress(0);
        loadModelList();
      } else if (data.type === "error") {
        setDownloadingModel(null);
        setDownloadProgress(0);
      }
    });

    // Load initial model list if going local
    if (useLocalWhisper) {
      loadModelList();
    }
  }, [useLocalWhisper]);

  const loadModelList = async () => {
    try {
      const result = await window.electronAPI.listWhisperModels();
      if (result.success) {
        setModelList(result.models);
      }
    } catch (error) {
      console.error("Failed to load model list:", error);
    }
  };

  const checkWhisperInstallation = async () => {
    try {
      const result = await window.electronAPI.checkWhisperInstallation();
      setWhisperInstalled(result.installed && result.working);
      if (result.installed && result.working) {
        loadModelList();
      }
    } catch (error) {
      setWhisperInstalled(false);
    }
  };

  const installWhisper = async () => {
    try {
      setInstallingWhisper(true);
      setInstallProgress("Starting Whisper installation...");
      
      const result = await window.electronAPI.installWhisper();
      
      if (result.success) {
        setWhisperInstalled(true);
        setInstallProgress("Installation complete!");
        await loadModelList();
      } else {
        alert(`❌ Failed to install Whisper: ${result.message}`);
      }
    } catch (error) {
      alert(`❌ Failed to install Whisper: ${error}`);
    } finally {
      setInstallingWhisper(false);
      setInstallProgress("");
    }
  };

  const downloadModel = async (modelName: string) => {
    try {
      setDownloadingModel(modelName);
      setDownloadProgress(0);
      
      const result = await window.electronAPI.downloadWhisperModel(modelName);
      
      if (result.success) {
        await loadModelList();
      } else {
        alert(`❌ Failed to download model "${modelName}": ${result.error}`);
      }
    } catch (error) {
      alert(`❌ Failed to download model "${modelName}": ${error}`);
    } finally {
      setDownloadingModel(null);
      setDownloadProgress(0);
    }
  };

  const requestMicPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermissionGranted(true);
    } catch (err) {
      alert("Please grant microphone permissions to use voice dictation.");
    }
  };

  const testAccessibilityPermission = async () => {
    try {
      await window.electronAPI.pasteText("OpenWispr accessibility test");
      setAccessibilityPermissionGranted(true);
      alert("✅ Accessibility permissions working! Check if the test text appeared in another app.");
    } catch (err) {
      alert("❌ Accessibility permissions needed! Please grant them in System Settings.");
    }
  };

  const startPracticeRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };
      
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        setRecordingBlob(blob);
        setIsProcessing(true);
        
        // Process the audio
        try {
          let result;
          if (useLocalWhisper) {
            result = await window.electronAPI.transcribeLocalWhisper(blob, { model: whisperModel });
          } else {
            // For demo purposes, we'll use a simple OpenAI API call
            const formData = new FormData();
            formData.append('file', blob, 'audio.wav');
            formData.append('model', 'whisper-1');
            
            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`
              },
              body: formData
            });
            
            if (response.ok) {
              result = await response.json();
            } else {
              throw new Error('Transcription failed');
            }
          }
          
          if (result.text || result.success) {
            const text = result.text || result.transcript || "Transcription successful!";
            setPracticeText(text);
            // Test paste functionality
            await window.electronAPI.pasteText(text);
          }
        } catch (error) {
          alert("Transcription failed. Please try again.");
        } finally {
          setIsProcessing(false);
          stream.getTracks().forEach(track => track.stop());
        }
      };
      
      setMediaRecorder(recorder);
      setAudioChunks(chunks);
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      alert("Failed to start recording. Please check microphone permissions.");
    }
  };

  const stopPracticeRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const saveSettings = async () => {
    // Save all settings
    localStorage.setItem("useLocalWhisper", useLocalWhisper.toString());
    localStorage.setItem("whisperModel", whisperModel);
    localStorage.setItem("dictationKey", hotkey);
    localStorage.setItem("onboardingCompleted", "true");
    
    if (!useLocalWhisper && apiKey) {
      await window.electronAPI.saveOpenAIKey(apiKey);
      localStorage.setItem("openaiApiKey", apiKey);
    }
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const finishOnboarding = async () => {
    await saveSettings();
    onComplete();
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0: // Welcome
        return (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-indigo-100 rounded-full flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to OpenWispr</h2>
              <p className="text-gray-600">
                Let's set up your voice dictation in just a few simple steps.
              </p>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-800">
                🎤 Turn your voice into text instantly<br />
                ⚡ Works anywhere on your computer<br />
                🔒 Your privacy is protected
              </p>
            </div>
          </div>
        );

      case 1: // Choose Mode
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose Your Processing Mode</h2>
              <p className="text-gray-600">
                How would you like to convert your speech to text?
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setUseLocalWhisper(false)}
                className={`p-6 border-2 rounded-xl text-left transition-all ${
                  !useLocalWhisper
                    ? "border-indigo-500 bg-indigo-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Cloud className="w-6 h-6 text-indigo-600" />
                    <h3 className="font-semibold text-gray-900">Cloud Processing</h3>
                  </div>
                  <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                    Fastest
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Uses OpenAI's servers for lightning-fast transcription
                </p>
                <div className="text-xs text-gray-500">
                  ✓ Fastest processing<br />
                  ✓ Best accuracy<br />
                  • Requires internet<br />
                  • Needs API key
                </div>
              </button>

              <button
                onClick={() => setUseLocalWhisper(true)}
                className={`p-6 border-2 rounded-xl text-left transition-all ${
                  useLocalWhisper
                    ? "border-indigo-500 bg-indigo-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Lock className="w-6 h-6 text-indigo-600" />
                    <h3 className="font-semibold text-gray-900">Local Processing</h3>
                  </div>
                  <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                    Private
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Processes everything on your device for complete privacy
                </p>
                <div className="text-xs text-gray-500">
                  ✓ Complete privacy<br />
                  ✓ Works offline<br />
                  ✓ No monthly costs<br />
                  • Slower processing
                </div>
              </button>
            </div>
          </div>
        );

      case 2: // Setup Processing
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {useLocalWhisper ? "Local Processing Setup" : "Cloud Processing Setup"}
              </h2>
              <p className="text-gray-600">
                {useLocalWhisper 
                  ? "Let's install and configure Whisper on your device" 
                  : "Enter your OpenAI API key to get started"}
              </p>
            </div>

            {useLocalWhisper ? (
              <div className="space-y-4">
                {!whisperInstalled ? (
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto bg-purple-100 rounded-full flex items-center justify-center">
                      <Download className="w-8 h-8 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Install Whisper</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        We'll automatically install Whisper for you. No technical setup required.
                      </p>
                    </div>
                    
                    {installingWhisper ? (
                      <div className="bg-purple-50 p-4 rounded-lg">
                        <div className="flex items-center justify-center gap-3 mb-3">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                          <span className="font-medium text-purple-900">Installing...</span>
                        </div>
                        {installProgress && (
                          <div className="text-xs text-purple-600 bg-white p-2 rounded font-mono">
                            {installProgress}
                          </div>
                        )}
                        <p className="text-xs text-purple-600 mt-2">
                          This may take a few minutes. Please keep the app open.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <Button onClick={installWhisper} className="w-full">
                          Install Whisper
                        </Button>
                        <Button 
                          onClick={checkWhisperInstallation} 
                          variant="outline" 
                          size="sm"
                          className="w-full"
                        >
                          Check if already installed
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                        <Check className="w-8 h-8 text-green-600" />
                      </div>
                      <h3 className="font-semibold text-green-900 mb-2">Whisper Installed!</h3>
                      <p className="text-sm text-gray-600">Now choose your model quality:</p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Model Quality
                      </label>
                      <select
                        value={whisperModel}
                        onChange={(e) => setWhisperModel(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="tiny">Tiny - Fastest, lower quality</option>
                        <option value="base">Base - Good balance (recommended)</option>
                        <option value="small">Small - Better quality, slower</option>
                        <option value="medium">Medium - High quality</option>
                        <option value="large">Large - Best quality, slowest</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-2">
                        You can download the model on the next step.
                      </p>
                    </div>

                    {modelList.length > 0 && (
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-medium text-gray-900 mb-3">Available Models</h4>
                        <div className="space-y-2">
                          {modelList.map((model) => (
                            <div key={model.model} className="flex items-center justify-between p-2 bg-white rounded border">
                              <span className="capitalize font-medium">{model.model}</span>
                              <div className="flex items-center gap-2">
                                {model.downloaded ? (
                                  <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                                    ✓ Downloaded
                                  </span>
                                ) : (
                                  <Button
                                    onClick={() => downloadModel(model.model)}
                                    size="sm"
                                    disabled={downloadingModel === model.model}
                                  >
                                    {downloadingModel === model.model 
                                      ? `${Math.round(downloadProgress)}%` 
                                      : "Download"}
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <Key className="w-8 h-8 text-blue-600" />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    OpenAI API Key
                  </label>
                  <div className="flex gap-3">
                    <Input
                      type="password"
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const text = await window.electronAPI.readClipboard();
                          if (text && text.trim()) {
                            setApiKey(text.trim());
                          }
                        } catch (err) {
                          alert("Could not paste from clipboard.");
                        }
                      }}
                    >
                      Paste
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Get your API key from <strong>platform.openai.com</strong>
                  </p>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">How to get your API key:</h4>
                  <ol className="text-sm text-blue-800 space-y-1">
                    <li>1. Go to platform.openai.com</li>
                    <li>2. Sign in to your account</li>
                    <li>3. Navigate to API Keys</li>
                    <li>4. Create a new secret key</li>
                    <li>5. Copy and paste it here</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        );

      case 3: // Permissions
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Grant Permissions</h2>
              <p className="text-gray-600">
                OpenWispr needs a couple of permissions to work properly
              </p>
            </div>

            <div className="space-y-4">
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Mic className="w-6 h-6 text-indigo-600" />
                    <div>
                      <h3 className="font-semibold text-gray-900">Microphone Access</h3>
                      <p className="text-sm text-gray-600">Required to record your voice</p>
                    </div>
                  </div>
                  {micPermissionGranted ? (
                    <div className="text-green-600">
                      <Check className="w-5 h-5" />
                    </div>
                  ) : (
                    <Button onClick={requestMicPermission} size="sm">
                      Grant Access
                    </Button>
                  )}
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Shield className="w-6 h-6 text-indigo-600" />
                    <div>
                      <h3 className="font-semibold text-gray-900">Accessibility Permission</h3>
                      <p className="text-sm text-gray-600">Required to paste text automatically</p>
                    </div>
                  </div>
                  {accessibilityPermissionGranted ? (
                    <div className="text-green-600">
                      <Check className="w-5 h-5" />
                    </div>
                  ) : (
                    <Button onClick={testAccessibilityPermission} size="sm">
                      Test & Grant
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-amber-50 p-4 rounded-lg">
              <h4 className="font-medium text-amber-900 mb-2">🔒 Privacy Note</h4>
              <p className="text-sm text-amber-800">
                OpenWispr only uses these permissions for dictation. 
                {useLocalWhisper ? " With local processing, your voice never leaves your device." : " Your voice is sent to OpenAI's servers for transcription."}
              </p>
            </div>
          </div>
        );

      case 4: // Choose Hotkey
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose Your Hotkey</h2>
              <p className="text-gray-600">
                Select which key you want to press to start/stop dictation
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Activation Key
                </label>
                <Input
                  placeholder="Default: ` (backtick)"
                  value={hotkey}
                  onChange={(e) => setHotkey(e.target.value)}
                  className="text-center text-lg font-mono"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Press this key from anywhere to start/stop dictation
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">Popular Choices:</h4>
                <div className="grid grid-cols-2 gap-2">
                  {['`', 'F1', 'F2', 'F3', 'F4'].map((key) => (
                    <button
                      key={key}
                      onClick={() => setHotkey(key)}
                      className={`p-2 text-sm font-mono rounded border transition-all ${
                        hotkey === key 
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700' 
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 5: // Test & Practice
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Test & Practice</h2>
              <p className="text-gray-600">
                Let's test your setup and practice using OpenWispr
              </p>
            </div>

            <div className="space-y-6">
              <div className="bg-blue-50 p-6 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-3">Practice Recording</h3>
                <p className="text-sm text-blue-800 mb-4">
                  Click the button below, then speak something. We'll transcribe it and paste it into the text area.
                </p>
                
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <Button
                      onClick={isRecording ? stopPracticeRecording : startPracticeRecording}
                      className={`w-32 h-12 ${
                        isRecording 
                          ? 'bg-red-500 hover:bg-red-600' 
                          : isProcessing 
                            ? 'bg-purple-500 hover:bg-purple-600' 
                            : 'bg-indigo-500 hover:bg-indigo-600'
                      }`}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Processing...
                        </>
                      ) : isRecording ? (
                        <>
                          <div className="animate-pulse w-2 h-2 bg-white rounded-full mr-2"></div>
                          Stop Recording
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4 mr-2" />
                          Start Recording
                        </>
                      )}
                    </Button>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Transcribed Text (will be pasted automatically):
                    </label>
                    <textarea
                      value={practiceText}
                      onChange={(e) => setPracticeText(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      rows={4}
                      placeholder="Your transcribed text will appear here..."
                    />
                  </div>
                </div>
              </div>

              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-medium text-green-900 mb-2">💡 How to use OpenWispr:</h4>
                <ol className="text-sm text-green-800 space-y-1">
                  <li>1. Click in any text field (email, document, etc.)</li>
                  <li>2. Press <kbd className="bg-white px-2 py-1 rounded text-xs font-mono">{hotkey}</kbd> to start recording</li>
                  <li>3. Speak your text clearly</li>
                  <li>4. Press <kbd className="bg-white px-2 py-1 rounded text-xs font-mono">{hotkey}</kbd> again to stop</li>
                  <li>5. Your text will automatically appear where you were typing!</li>
                </ol>
              </div>
            </div>
          </div>
        );

      case 6: // Complete
        return (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">You're All Set!</h2>
              <p className="text-gray-600">
                OpenWispr is now configured and ready to use.
              </p>
            </div>
            
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3">Your Setup Summary:</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Processing:</span>
                  <span className="font-medium">
                    {useLocalWhisper ? `Local (${whisperModel})` : 'OpenAI Cloud'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Hotkey:</span>
                  <kbd className="bg-white px-2 py-1 rounded text-xs font-mono">{hotkey}</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Permissions:</span>
                  <span className="font-medium text-green-600">
                    {micPermissionGranted && accessibilityPermissionGranted ? '✓ Granted' : '⚠ Review needed'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Pro tip:</strong> You can always change these settings later in the Control Panel.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return true;
      case 1: return true; // Mode selection
      case 2: 
        if (useLocalWhisper) {
          return whisperInstalled && modelList.some(m => m.downloaded);
        } else {
          return apiKey.trim() !== '';
        }
      case 3: return micPermissionGranted && accessibilityPermissionGranted;
      case 4: return hotkey.trim() !== '';
      case 5: return practiceText.trim() !== '';
      case 6: return true;
      default: return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">OW</span>
            </div>
            <h1 className="text-lg font-semibold text-gray-900">OpenWispr Setup</h1>
          </div>
          <div className="text-sm text-gray-500">
            Step {currentStep + 1} of {steps.length}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-2">
        <div className="flex items-center justify-between mb-2">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            
            return (
              <div key={index} className="flex items-center">
                <div className={`flex items-center gap-2 ${
                  isActive ? 'text-indigo-600' : isCompleted ? 'text-green-600' : 'text-gray-400'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                    isActive 
                      ? 'border-indigo-600 bg-indigo-50' 
                      : isCompleted 
                        ? 'border-green-600 bg-green-50' 
                        : 'border-gray-300 bg-white'
                  }`}>
                    {isCompleted ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>
                  <span className="text-xs font-medium hidden md:block">{step.title}</span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-8 h-0.5 mx-2 ${
                    isCompleted ? 'bg-green-600' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 py-8">
        <div className="max-w-2xl mx-auto">
          <Card className="bg-white shadow-lg">
            <CardContent className="p-8">
              {renderStep()}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Button
            onClick={prevStep}
            variant="outline"
            disabled={currentStep === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          
          <div className="flex items-center gap-2">
            {currentStep === steps.length - 1 ? (
              <Button onClick={finishOnboarding} className="bg-green-600 hover:bg-green-700">
                <Check className="w-4 h-4 mr-2" />
                Finish Setup
              </Button>
            ) : (
              <Button
                onClick={nextStep}
                disabled={!canProceed()}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
