import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Settings,
  Mic,
  Download,
  Key,
  Shield,
  Keyboard,
  TestTube,
  Sparkles,
  Lock,
  X,
} from "lucide-react";
import TitleBar from "./TitleBar";
import WhisperModelPicker from "./WhisperModelPicker";
import ProcessingModeSelector from "./ui/ProcessingModeSelector";
import ApiKeyInput from "./ui/ApiKeyInput";
import PermissionCard from "./ui/PermissionCard";
import StepProgress from "./ui/StepProgress";
import { AlertDialog } from "./ui/dialog";
import { useWhisper } from "../hooks/useWhisper";
import { usePermissions } from "../hooks/usePermissions";
import { useClipboard } from "../hooks/useClipboard";

interface OnboardingFlowProps {
  onComplete: () => void;
}

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(() => {
    // Load the current step from localStorage on component mount
    const savedStep = localStorage.getItem("onboardingCurrentStep");
    return savedStep ? parseInt(savedStep, 10) : 0;
  });
  const [useLocalWhisper, setUseLocalWhisper] = useState(() => {
    // Load saved setting or default to false
    const saved = localStorage.getItem("useLocalWhisper");
    return saved === "true";
  });
  const [apiKey, setApiKey] = useState("");
  const [whisperModel, setWhisperModel] = useState("base");
  const [hotkey, setHotkey] = useState("`");

  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description?: string;
  }>({
    open: false,
    title: "",
  });
  const practiceTextareaRef = useRef<HTMLInputElement>(null);

  // Use our custom hooks
  const whisperHook = useWhisper(setAlertDialog);
  const permissionsHook = usePermissions(setAlertDialog);
  const { pasteFromClipboard } = useClipboard(setAlertDialog);

  const steps = [
    { title: "Welcome", icon: Sparkles },
    { title: "Privacy", icon: Lock },
    { title: "Setup", icon: Settings },
    { title: "Permissions", icon: Shield },
    { title: "Hotkey", icon: Keyboard },
    { title: "Test", icon: TestTube },
    { title: "Finish", icon: Check },
  ];

  useEffect(() => {
    // Set up progress listeners
    whisperHook.setupProgressListener();
  }, [whisperHook]);

  // Helper function to update processing mode and save immediately
  const updateProcessingMode = (useLocal: boolean) => {
    setUseLocalWhisper(useLocal);
    localStorage.setItem("useLocalWhisper", useLocal.toString());
  };

  useEffect(() => {
    if (currentStep === 5) {
      if (practiceTextareaRef.current) {
        practiceTextareaRef.current.focus();
      }
    }
  }, [currentStep]);

  const saveSettings = async () => {
    // Save all settings
    localStorage.setItem("useLocalWhisper", useLocalWhisper.toString());
    localStorage.setItem("whisperModel", whisperModel);
    localStorage.setItem("dictationKey", hotkey);
    localStorage.setItem(
      "micPermissionGranted",
      permissionsHook.micPermissionGranted.toString()
    );
    localStorage.setItem(
      "accessibilityPermissionGranted",
      permissionsHook.accessibilityPermissionGranted.toString()
    );
    localStorage.setItem("onboardingCompleted", "true");

    if (!useLocalWhisper && apiKey) {
      await window.electronAPI.saveOpenAIKey(apiKey);
      localStorage.setItem("openaiApiKey", apiKey);
    }
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      const newStep = currentStep + 1;
      setCurrentStep(newStep);
      localStorage.setItem("onboardingCurrentStep", newStep.toString());

      // Show dictation panel when moving from permissions step (3) to hotkey step (4)
      if (currentStep === 3 && newStep === 4) {
        // Show dictation panel after permissions are granted
        if (window.electronAPI?.showDictationPanel) {
          window.electronAPI.showDictationPanel();
        }
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      const newStep = currentStep - 1;
      setCurrentStep(newStep);
      localStorage.setItem("onboardingCurrentStep", newStep.toString());
    }
  };

  const finishOnboarding = async () => {
    await saveSettings();
    // Clear the onboarding step since we're done
    localStorage.removeItem("onboardingCurrentStep");
    onComplete();
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0: // Welcome
        return (
          <div
            className="text-center space-y-6"
            style={{ fontFamily: "Noto Sans, sans-serif" }}
          >
            <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h2
                className="text-2xl font-bold text-stone-900 mb-2"
                style={{ fontFamily: "Noto Sans, sans-serif" }}
              >
                Welcome to OpenWispr
              </h2>
              <p
                className="text-stone-600"
                style={{ fontFamily: "Noto Sans, sans-serif" }}
              >
                Let's set up your voice dictation in just a few simple steps.
              </p>
            </div>
            <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-200/60">
              <p
                className="text-sm text-blue-800"
                style={{ fontFamily: "Noto Sans, sans-serif" }}
              >
                🎤 Turn your voice into text instantly
                <br />
                ⚡ Works anywhere on your computer
                <br />
                🔒 Your privacy is protected
              </p>
            </div>
          </div>
        );

      case 1: // Choose Mode
        return (
          <div
            className="space-y-6"
            style={{ fontFamily: "Noto Sans, sans-serif" }}
          >
            <div className="text-center">
              <h2
                className="text-2xl font-bold text-stone-900 mb-2"
                style={{ fontFamily: "Noto Sans, sans-serif" }}
              >
                Choose Your Processing Mode
              </h2>
              <p
                className="text-stone-600"
                style={{ fontFamily: "Noto Sans, sans-serif" }}
              >
                How would you like to convert your speech to text?
              </p>
            </div>

            <ProcessingModeSelector
              useLocalWhisper={useLocalWhisper}
              setUseLocalWhisper={updateProcessingMode}
            />
          </div>
        );

      case 2: // Setup Processing
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {useLocalWhisper
                  ? "Local Processing Setup"
                  : "Cloud Processing Setup"}
              </h2>
              <p className="text-gray-600">
                {useLocalWhisper
                  ? "Let's install and configure Whisper on your device"
                  : "Enter your OpenAI API key to get started"}
              </p>
            </div>

            {useLocalWhisper ? (
              <div className="space-y-4">
                {!whisperHook.whisperInstalled ? (
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto bg-purple-100 rounded-full flex items-center justify-center">
                      <Download className="w-8 h-8 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">
                        Install Whisper
                      </h3>
                      <p className="text-sm text-gray-600 mb-4">
                        We'll automatically install Whisper for you. No
                        technical setup required.
                      </p>
                    </div>

                    {whisperHook.installingWhisper ? (
                      <div className="bg-purple-50 p-4 rounded-lg">
                        <div className="flex items-center justify-center gap-3 mb-3">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                          <span className="font-medium text-purple-900">
                            Installing...
                          </span>
                        </div>
                        {whisperHook.installProgress && (
                          <div className="text-xs text-purple-600 bg-white p-2 rounded font-mono">
                            {whisperHook.installProgress}
                          </div>
                        )}
                        <p className="text-xs text-purple-600 mt-2">
                          This may take a few minutes. Please keep the app open.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <Button
                          onClick={whisperHook.installWhisper}
                          className="w-full"
                        >
                          Install Whisper
                        </Button>
                        <Button
                          onClick={whisperHook.checkWhisperInstallation}
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
                      <h3 className="font-semibold text-green-900 mb-2">
                        Whisper Installed!
                      </h3>
                      <p className="text-sm text-gray-600">
                        Now choose your model quality:
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Choose your model quality below
                      </label>
                      <p className="text-xs text-gray-500">
                        Download and select the model that best fits your needs.
                      </p>
                    </div>

                    <WhisperModelPicker
                      selectedModel={whisperModel}
                      onModelSelect={setWhisperModel}
                      variant="onboarding"
                    />
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

                <ApiKeyInput
                  apiKey={apiKey}
                  setApiKey={setApiKey}
                  label="OpenAI API Key"
                  helpText="Get your API key from platform.openai.com"
                />

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">
                    How to get your API key:
                  </h4>
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
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Grant Permissions
              </h2>
              <p className="text-gray-600">
                OpenWispr needs a couple of permissions to work properly
              </p>
            </div>

            <div className="space-y-4">
              <PermissionCard
                icon={Mic}
                title="Microphone Access"
                description="Required to record your voice"
                granted={permissionsHook.micPermissionGranted}
                onRequest={permissionsHook.requestMicPermission}
                buttonText="Grant Access"
              />

              <PermissionCard
                icon={Shield}
                title="Accessibility Permission"
                description="Required to paste text automatically"
                granted={permissionsHook.accessibilityPermissionGranted}
                onRequest={permissionsHook.testAccessibilityPermission}
                buttonText="Test & Grant"
              />
            </div>

            <div className="bg-amber-50 p-4 rounded-lg">
              <h4 className="font-medium text-amber-900 mb-2">
                🔒 Privacy Note
              </h4>
              <p className="text-sm text-amber-800">
                OpenWispr only uses these permissions for dictation.
                {useLocalWhisper
                  ? " With local processing, your voice never leaves your device."
                  : " Your voice is sent to OpenAI's servers for transcription."}
              </p>
            </div>
          </div>
        );

      case 4: // Choose Hotkey
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Choose Your Hotkey
              </h2>
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
                <h4 className="font-medium text-gray-900 mb-3">
                  Popular Choices:
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {["`", "F1", "F2", "F3", "F4"].map((key) => (
                    <button
                      key={key}
                      onClick={() => setHotkey(key)}
                      className={`p-2 text-sm font-mono rounded border transition-all ${
                        hotkey === key
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 bg-white hover:border-gray-300"
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
          <div
            className="space-y-6"
            style={{ fontFamily: "Noto Sans, sans-serif" }}
          >
            <div className="text-center">
              <h2
                className="text-2xl font-bold text-stone-900 mb-2"
                style={{ fontFamily: "Noto Sans, sans-serif" }}
              >
                Test & Practice
              </h2>
              <p
                className="text-stone-600"
                style={{ fontFamily: "Noto Sans, sans-serif" }}
              >
                Let's test your setup and practice using OpenWispr
              </p>
            </div>

            <div className="space-y-6">
              <div className="bg-blue-50/50 p-6 rounded-lg border border-blue-200/60">
                <h3
                  className="font-semibold text-blue-900 mb-3"
                  style={{ fontFamily: "Noto Sans, sans-serif" }}
                >
                  Practice with Your Hotkey
                </h3>
                <p
                  className="text-sm text-blue-800 mb-4"
                  style={{ fontFamily: "Noto Sans, sans-serif" }}
                >
                  <strong>Step 1:</strong> Click in the text area below to place
                  your cursor there.
                  <br />
                  <strong>Step 2:</strong> Press{" "}
                  <kbd className="bg-white px-2 py-1 rounded text-xs font-mono border border-blue-200">
                    {hotkey}
                  </kbd>{" "}
                  to start recording, then speak something.
                  <br />
                  <strong>Step 3:</strong> Press{" "}
                  <kbd className="bg-white px-2 py-1 rounded text-xs font-mono border border-blue-200">
                    {hotkey}
                  </kbd>{" "}
                  again to stop and see your transcribed text appear where your
                  cursor is!
                </p>

                <div className="space-y-4">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 text-stone-600">
                      <Mic className="w-4 h-4" />
                      <span style={{ fontFamily: "Noto Sans, sans-serif" }}>
                        Click in the text area below, then press{" "}
                        <kbd className="bg-white px-1 py-0.5 rounded text-xs font-mono border">
                          {hotkey}
                        </kbd>{" "}
                        to start dictation
                      </span>
                    </div>
                  </div>

                  <div>
                    <label
                      className="block text-sm font-medium text-stone-700 mb-2"
                      style={{ fontFamily: "Noto Sans, sans-serif" }}
                    >
                      Transcribed Text:
                    </label>
                    <Textarea
                      // ref={practiceTextareaRef}
                      rows={4}
                      placeholder="Click here to place your cursor, then use your hotkey to start dictation..."
                    />
                  </div>
                </div>
              </div>

              <div className="bg-green-50/50 p-4 rounded-lg border border-green-200/60">
                <h4
                  className="font-medium text-green-900 mb-2"
                  style={{ fontFamily: "Noto Sans, sans-serif" }}
                >
                  💡 How to use OpenWispr:
                </h4>
                <ol
                  className="text-sm text-green-800 space-y-1"
                  style={{ fontFamily: "Noto Sans, sans-serif" }}
                >
                  <li>1. Click in any text field (email, document, etc.)</li>
                  <li>
                    2. Press{" "}
                    <kbd className="bg-white px-2 py-1 rounded text-xs font-mono border border-green-200">
                      {hotkey}
                    </kbd>{" "}
                    to start recording
                  </li>
                  <li>3. Speak your text clearly</li>
                  <li>
                    4. Press{" "}
                    <kbd className="bg-white px-2 py-1 rounded text-xs font-mono border border-green-200">
                      {hotkey}
                    </kbd>{" "}
                    again to stop
                  </li>
                  <li>
                    5. Your text will automatically appear where you were
                    typing!
                  </li>
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
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                You're All Set!
              </h2>
              <p className="text-gray-600">
                OpenWispr is now configured and ready to use.
              </p>
            </div>

            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3">
                Your Setup Summary:
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Processing:</span>
                  <span className="font-medium">
                    {useLocalWhisper
                      ? `Local (${whisperModel})`
                      : "OpenAI Cloud"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Hotkey:</span>
                  <kbd className="bg-white px-2 py-1 rounded text-xs font-mono">
                    {hotkey}
                  </kbd>
                </div>
                <div className="flex justify-between">
                  <span>Permissions:</span>
                  <span className="font-medium text-green-600">
                    {permissionsHook.micPermissionGranted &&
                    permissionsHook.accessibilityPermissionGranted
                      ? "✓ Granted"
                      : "⚠ Review needed"}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Pro tip:</strong> You can always change these settings
                later in the Control Panel.
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
      case 0:
        return true;
      case 1:
        return true; // Mode selection
      case 2:
        if (useLocalWhisper) {
          return whisperHook.whisperInstalled;
        } else {
          return apiKey.trim() !== "";
        }
      case 3:
        return (
          permissionsHook.micPermissionGranted &&
          permissionsHook.accessibilityPermissionGranted
        );
      case 4:
        return hotkey.trim() !== "";
      case 5:
        return true; // Practice step is always ready to proceed
      case 6:
        return true;
      default:
        return false;
    }
  };

  // Load Google Font only in the browser
  React.useEffect(() => {
    const link = document.createElement("link");
    link.href =
      "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@300;400;500;600;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  return (
    <div
      className="h-screen flex flex-col bg-gradient-to-br from-stone-50 via-white to-blue-50/30"
      style={{
        backgroundImage: `repeating-linear-gradient(
          transparent,
          transparent 24px,
          #e7e5e4 24px,
          #e7e5e4 25px
        )`,
        fontFamily: "Noto Sans, sans-serif",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog((prev) => ({ ...prev, open }))}
        title={alertDialog.title}
        description={alertDialog.description}
        onOk={() => {}}
      />
      {/* Left margin line for entire page */}
      <div className="fixed left-6 md:left-12 top-0 bottom-0 w-px bg-red-300/40 z-0"></div>

      {/* Title Bar */}
      <div className="flex-shrink-0 z-10">
        <TitleBar
          showTitle={true}
          className="bg-white/95 backdrop-blur-xl border-b border-stone-200/60 shadow-sm"
        ></TitleBar>
      </div>

      {/* Progress Bar */}
      <div className="flex-shrink-0 bg-white/90 backdrop-blur-xl border-b border-stone-200/60 p-6 md:px-16 z-10">
        <div className="max-w-4xl mx-auto">
          <StepProgress steps={steps} currentStep={currentStep} />
        </div>
      </div>

      {/* Content - This will grow to fill available space */}
      <div className="flex-1 px-6 md:pl-16 md:pr-6 py-12 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-white/95 backdrop-blur-xl border border-stone-200/60 shadow-lg rounded-2xl overflow-hidden">
            <CardContent
              className="p-12 md:p-16"
              style={{ fontFamily: "Noto Sans, sans-serif" }}
            >
              <div className="space-y-8">{renderStep()}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer - This will stick to the bottom */}
      <div className="flex-shrink-0 bg-white/95 backdrop-blur-xl border-t border-stone-200/60 px-6 md:pl-16 md:pr-6 py-8 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Button
            onClick={prevStep}
            variant="outline"
            disabled={currentStep === 0}
            className="px-8 py-3 h-12 text-sm font-medium"
            style={{ fontFamily: "Noto Sans, sans-serif" }}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>

          <div className="flex items-center gap-3">
            {currentStep === steps.length - 1 ? (
              <Button
                onClick={finishOnboarding}
                className="bg-green-600 hover:bg-green-700 px-8 py-3 h-12 text-sm font-medium"
                style={{ fontFamily: "Noto Sans, sans-serif" }}
              >
                <Check className="w-4 h-4 mr-2" />
                Finish Setup
              </Button>
            ) : (
              <Button
                onClick={nextStep}
                disabled={!canProceed()}
                className="px-8 py-3 h-12 text-sm font-medium"
                style={{ fontFamily: "Noto Sans, sans-serif" }}
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
