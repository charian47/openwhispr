import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Cloud, Lock, Brain, Zap, Globe, Cpu, Download, Check } from 'lucide-react';
import ApiKeyInput from './ui/ApiKeyInput';
import { UnifiedModelPickerCompact } from './UnifiedModelPicker';
import { REASONING_PROVIDERS } from '../utils/languages';
import { modelRegistry } from '../models/ModelRegistry';

interface AIModelSelectorEnhancedProps {
  useReasoningModel: boolean;
  setUseReasoningModel: (value: boolean) => void;
  reasoningModel: string;
  setReasoningModel: (model: string) => void;
  localReasoningProvider: string;
  setLocalReasoningProvider: (provider: string) => void;
  openaiApiKey: string;
  setOpenaiApiKey: (key: string) => void;
  anthropicApiKey: string;
  setAnthropicApiKey: (key: string) => void;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  pasteFromClipboard: (setter: (value: string) => void) => void;
  showAlertDialog: (dialog: { title: string; description: string }) => void;
}

// Provider Icon Component  
const ProviderIcon = ({ provider }: { provider: string }) => {
  const iconClass = "w-5 h-5";
  const [svgError, setSvgError] = React.useState(false);
  
  // Default fallback icons for each provider
  const getFallbackIcon = () => {
    switch (provider) {
      // Cloud providers
      case 'openai': return <Brain className={iconClass} />;
      case 'anthropic': return <Zap className={iconClass} />;
      case 'gemini': return <Globe className={iconClass} />;
      // Local providers
      case 'qwen': return <Brain className={iconClass} />;
      case 'mistral': return <Zap className={iconClass} />;
      case 'llama': return <Cpu className={iconClass} />;
      case 'openai-oss': return <Globe className={iconClass} />;
      default: return <Brain className={iconClass} />;
    }
  };
  
  // Try to load SVG if it exists and we haven't had an error
  if (!svgError) {
    return (
      <>
        <img 
          src={`/assets/icons/providers/${provider}.svg`}
          alt={`${provider} icon`}
          className={iconClass}
          onError={() => setSvgError(true)}
          style={{ display: svgError ? 'none' : 'block' }}
        />
        {svgError && getFallbackIcon()}
      </>
    );
  }
  
  return getFallbackIcon();
};

export default function AIModelSelectorEnhanced({
  useReasoningModel,
  setUseReasoningModel,
  reasoningModel,
  setReasoningModel,
  localReasoningProvider,
  setLocalReasoningProvider,
  openaiApiKey,
  setOpenaiApiKey,
  anthropicApiKey,
  setAnthropicApiKey,
  geminiApiKey,
  setGeminiApiKey,
  pasteFromClipboard,
  showAlertDialog,
}: AIModelSelectorEnhancedProps) {
  const [selectedMode, setSelectedMode] = useState<'cloud' | 'local'>('cloud');
  const [selectedCloudProvider, setSelectedCloudProvider] = useState('openai');
  const [selectedLocalProvider, setSelectedLocalProvider] = useState('qwen');
  const [downloadedModels, setDownloadedModels] = useState<Set<string>>(new Set());
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);

  const cloudProviders = ['openai', 'anthropic', 'gemini'];
  const localProviders = modelRegistry.getAllProviders().map(p => p.id);

  // Initialize based on current provider
  useEffect(() => {
    if (localProviders.includes(localReasoningProvider)) {
      setSelectedMode('local');
      setSelectedLocalProvider(localReasoningProvider);
    } else if (cloudProviders.includes(localReasoningProvider)) {
      setSelectedMode('cloud');
      setSelectedCloudProvider(localReasoningProvider);
    }
    
    // Check downloaded models
    checkDownloadedModels();
  }, []);
  
  // Check which models are downloaded
  const checkDownloadedModels = async () => {
    try {
      const result = await window.electronAPI?.modelGetAll?.();
      if (result && Array.isArray(result)) {
        const downloaded = new Set(result.filter(m => m.isDownloaded).map(m => m.id));
        setDownloadedModels(downloaded);
      }
    } catch (error) {
      console.error('Failed to check downloaded models:', error);
    }
  };
  
  // Handle model download with minimal code
  const downloadModel = async (modelId: string) => {
    setDownloadingModel(modelId);
    try {
      await window.electronAPI?.modelDownload?.(modelId);
      setDownloadedModels(prev => new Set([...prev, modelId]));
      if (!reasoningModel) setReasoningModel(modelId);
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setDownloadingModel(null);
    }
  };

  const handleModeChange = async (newMode: 'cloud' | 'local') => {
    setSelectedMode(newMode);
    
    if (newMode === 'cloud') {
      // Switch to cloud mode
      setLocalReasoningProvider(selectedCloudProvider);
      const provider = REASONING_PROVIDERS[selectedCloudProvider as keyof typeof REASONING_PROVIDERS];
      if (provider?.models?.length > 0) {
        setReasoningModel(provider.models[0].value);
      }
    } else {
      // Switch to local mode
      setLocalReasoningProvider(selectedLocalProvider);
      const provider = modelRegistry.getProvider(selectedLocalProvider);
      if (provider?.models?.length > 0) {
        setReasoningModel(provider.models[0].id);
      }
    }
  };

  const handleCloudProviderChange = (provider: string) => {
    setSelectedCloudProvider(provider);
    setLocalReasoningProvider(provider);
    // Update model to first available
    const providerData = REASONING_PROVIDERS[provider as keyof typeof REASONING_PROVIDERS];
    if (providerData?.models?.length > 0) {
      setReasoningModel(providerData.models[0].value);
    }
  };

  const handleLocalProviderChange = (provider: string) => {
    setSelectedLocalProvider(provider);
    setLocalReasoningProvider(provider);
    // Update model to first available
    const providerData = modelRegistry.getProvider(provider);
    if (providerData?.models?.length > 0) {
      setReasoningModel(providerData.models[0].id);
    }
  };

  const getProviderColor = (provider: string) => {
    const colors: Record<string, string> = {
      'openai': 'green',
      'anthropic': 'purple', 
      'gemini': 'blue',
      'qwen': 'indigo',
      'mistral': 'orange',
      'llama': 'blue',
      'openai-oss': 'teal'
    };
    return colors[provider] || 'gray';
  };

  return (
    <div className="space-y-6">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-xl">
        <div>
          <label className="text-sm font-medium text-green-800">
            Enable AI Text Enhancement
          </label>
          <p className="text-xs text-green-700">
            Use AI to automatically improve transcription quality
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only"
            checked={useReasoningModel}
            onChange={(e) => setUseReasoningModel(e.target.checked)}
          />
          <div className={`w-11 h-6 bg-gray-200 rounded-full transition-colors duration-200 ${
            useReasoningModel ? "bg-green-600" : "bg-gray-300"
          }`}>
            <div className={`absolute top-0.5 left-0.5 bg-white border border-gray-300 rounded-full h-5 w-5 transition-transform duration-200 ${
              useReasoningModel ? "translate-x-5" : "translate-x-0"
            }`} />
          </div>
        </label>
      </div>

      {useReasoningModel && (
        <>
          {/* Cloud vs Local Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={() => handleModeChange('cloud')}
              className={`p-4 border-2 rounded-xl text-left transition-all cursor-pointer ${
                selectedMode === 'cloud'
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-neutral-200 bg-white hover:border-neutral-300"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Cloud className="w-6 h-6 text-blue-600" />
                  <h4 className="font-medium text-neutral-900">Cloud AI</h4>
                </div>
                <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                  Powerful
                </span>
              </div>
              <p className="text-sm text-neutral-600">
                Advanced models via API. Fast and capable, requires internet.
              </p>
            </button>

            <button
              onClick={() => handleModeChange('local')}
              className={`p-4 border-2 rounded-xl text-left transition-all cursor-pointer ${
                selectedMode === 'local'
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-neutral-200 bg-white hover:border-neutral-300"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Lock className="w-6 h-6 text-purple-600" />
                  <h4 className="font-medium text-neutral-900">Local AI</h4>
                </div>
                <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                  Private
                </span>
              </div>
              <p className="text-sm text-neutral-600">
                Runs on your device. Complete privacy, works offline.
              </p>
            </button>
          </div>

          {/* Provider Content */}
          {selectedMode === 'cloud' ? (
            <div className="space-y-4">
              {/* Cloud Provider Tabs */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex bg-gray-50 border-b border-gray-200">
                  {cloudProviders.map((provider) => {
                    const isSelected = selectedCloudProvider === provider;
                    const color = getProviderColor(provider);
                    return (
                      <button
                        key={provider}
                        onClick={() => handleCloudProviderChange(provider)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium transition-all ${
                          isSelected
                            ? `text-${color}-700 border-b-2`
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                        style={isSelected ? {
                          borderBottomColor: `rgb(99 102 241)`,
                          backgroundColor: 'rgb(238 242 255)'
                        } : {}}
                      >
                        <ProviderIcon provider={provider} />
                        <span>{REASONING_PROVIDERS[provider as keyof typeof REASONING_PROVIDERS]?.name}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="p-4">
                  {/* Use UnifiedModelPickerCompact for cloud models */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-700">Select Model</h4>
                    <UnifiedModelPickerCompact
                      models={REASONING_PROVIDERS[selectedCloudProvider as keyof typeof REASONING_PROVIDERS]?.models || []}
                      selectedModel={reasoningModel}
                      onModelSelect={setReasoningModel}
                    />
                  </div>

                  {/* API Key Configuration */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    {selectedCloudProvider === 'openai' && (
                      <div className="space-y-3">
                        <h4 className="font-medium text-gray-900">API Configuration</h4>
                        <ApiKeyInput
                          apiKey={openaiApiKey}
                          setApiKey={setOpenaiApiKey}
                          helpText="Get your API key from platform.openai.com"
                        />
                      </div>
                    )}

                    {selectedCloudProvider === 'anthropic' && (
                      <div className="space-y-3">
                        <h4 className="font-medium text-gray-900">API Configuration</h4>
                        <div className="flex gap-2">
                          <Input
                            type="password"
                            placeholder="sk-ant-..."
                            value={anthropicApiKey}
                            onChange={(e) => setAnthropicApiKey(e.target.value)}
                            className="flex-1 text-sm"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => pasteFromClipboard(setAnthropicApiKey)}
                          >
                            Paste
                          </Button>
                        </div>
                        <p className="text-xs text-gray-600">
                          Get your API key from console.anthropic.com
                        </p>
                      </div>
                    )}

                    {selectedCloudProvider === 'gemini' && (
                      <div className="space-y-3">
                        <h4 className="font-medium text-gray-900">API Configuration</h4>
                        <div className="flex gap-2">
                          <Input
                            type="password"
                            placeholder="AIza..."
                            value={geminiApiKey}
                            onChange={(e) => setGeminiApiKey(e.target.value)}
                            className="flex-1 text-sm"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => pasteFromClipboard(setGeminiApiKey)}
                          >
                            Paste
                          </Button>
                        </div>
                        <p className="text-xs text-gray-600">
                          Get your API key from makersuite.google.com/app/apikey
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Local Provider Tabs */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex bg-gray-50 border-b border-gray-200 overflow-x-auto">
                  {localProviders.map((provider) => {
                    const isSelected = selectedLocalProvider === provider;
                    const providerData = modelRegistry.getProvider(provider);
                    return (
                      <button
                        key={provider}
                        onClick={() => handleLocalProviderChange(provider)}
                        className={`flex items-center justify-center gap-2 px-4 py-3 font-medium transition-all whitespace-nowrap ${
                          isSelected
                            ? 'text-purple-700 border-b-2'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                        style={isSelected ? {
                          borderBottomColor: 'rgb(147 51 234)',
                          backgroundColor: 'rgb(250 245 255)'
                        } : {}}
                      >
                        <ProviderIcon provider={provider} />
                        <span>{providerData?.name}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Local Model List with Download */}
                <div className="p-4">
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-700">Available Models</h4>
                    {(() => {
                      const provider = modelRegistry.getProvider(selectedLocalProvider);
                      if (!provider || !provider.models) {
                        return <p className="text-sm text-gray-500">No models available for this provider</p>;
                      }
                      
                      return (
                        <div className="space-y-2">
                          {provider.models.map((model) => {
                            const isDownloaded = downloadedModels.has(model.id);
                            const isDownloading = downloadingModel === model.id;
                            const isSelected = reasoningModel === model.id;
                            
                            return (
                              <div
                                key={model.id}
                                className={`p-3 rounded-lg border-2 transition-all ${
                                  isSelected
                                    ? 'border-purple-500 bg-purple-50'
                                    : 'border-gray-200 bg-white hover:border-gray-300'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900">{model.name}</div>
                                    <div className="text-xs text-gray-600 mt-1">{model.description}</div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-xs text-gray-500">Size: {model.size}</span>
                                      {isDownloaded && (
                                        <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">
                                          <Check className="inline w-3 h-3 mr-1" />
                                          Downloaded
                                        </span>
                                      )}
                                      {model.recommended && (
                                        <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                                          Recommended
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    {isDownloaded ? (
                                      !isSelected && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => setReasoningModel(model.id)}
                                        >
                                          Select
                                        </Button>
                                      )
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="default"
                                        disabled={isDownloading}
                                        onClick={() => downloadModel(model.id)}
                                      >
                                        {isDownloading ? (
                                          <>Downloading...</>
                                        ) : (
                                          <>
                                            <Download className="w-3 h-3 mr-1" />
                                            Download
                                          </>
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}