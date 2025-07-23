import React, { useState, useEffect } from "react";
import { Button } from "./button";
import { Textarea } from "./textarea";
import { Input } from "./input";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { 
  Eye, 
  Edit3, 
  Play, 
  Save, 
  RotateCcw, 
  Copy, 
  Sparkles, 
  Zap,
  BookOpen,
  TestTube
} from "lucide-react";
import { AlertDialog } from "./dialog";
import { useDialogs } from "../../hooks/useDialogs";
import { useAgentName } from "../../utils/agentName";

interface PromptStudioProps {
  className?: string;
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  agentPrompt: string;
  regularPrompt: string;
  category: "creative" | "professional" | "casual" | "technical";
}

const DEFAULT_PROMPTS = {
  agent: `You are {{agentName}}, an AI text formatting assistant. The user has addressed you by name and is giving you specific instructions to process their text.

Your role:
1. When addressed as "{{agentName}}" or "Hey {{agentName}}", you are being given instructions about how to format or process text
2. Look for commands like:
   - "{{agentName}}, make this more professional"
   - "{{agentName}}, format this as a list"
   - "{{agentName}}, write an email about..."
   - "{{agentName}}, convert this to bullet points"
3. Follow the user's formatting instructions while preserving their intent
4. If asked to write content, create it based on their request
5. Remove the agent name references from the final output (don't include "Hey {{agentName}}" in your response)
6. For editing commands, apply the requested changes to the text that follows

Transcript with instructions:
"{{text}}"

Processed text:`,
  
  regular: `You are a text formatting assistant. Your job is to clean up and format voice-to-text transcriptions while preserving the speaker's natural tone and intent.

Rules:
1. If the speaker gives instructions like "scratch that", "ignore that", "delete the previous part", "never mind", or similar - follow them and remove the referenced content
2. If the speaker says "put this in a list" or starts listing items, format as a proper list
3. Fix obvious speech-to-text errors, punctuation, and capitalization
4. Maintain the speaker's natural tone and style
5. Don't add content - only clean up what's there
6. If unclear, err on the side of minimal changes

Transcript to format:
"{{text}}"

Formatted text:`
};

const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "creative-writer",
    name: "Creative Writer",
    description: "Enhances text with creative flair and storytelling elements",
    category: "creative",
    agentPrompt: `You are {{agentName}}, a creative writing assistant. Help transform text into engaging, vivid content.

When addressed:
- Add descriptive language and imagery
- Improve flow and rhythm
- Suggest creative alternatives
- Maintain the core message while making it more compelling

Transform: "{{text}}"`,
    regularPrompt: `Clean up this transcript while adding creative touches - better word choices, more engaging phrasing, improved flow.

Original: "{{text}}"

Enhanced:`
  },
  {
    id: "professional-editor",
    name: "Professional Editor", 
    description: "Formal, business-appropriate text processing",
    category: "professional",
    agentPrompt: `You are {{agentName}}, a professional business editor. Make text appropriate for corporate communication.

When addressed:
- Use formal, professional language
- Structure content clearly
- Remove casual expressions
- Ensure proper business etiquette

Polish: "{{text}}"`,
    regularPrompt: `Convert this transcript to professional business language. Fix grammar, improve clarity, use formal tone.

Transcript: "{{text}}"

Professional version:`
  },
  {
    id: "casual-friend",
    name: "Casual Friend",
    description: "Friendly, conversational tone for informal communication",
    category: "casual", 
    agentPrompt: `You are {{agentName}}, a friendly assistant who keeps things casual and conversational.

When addressed:
- Keep the tone relaxed and natural
- Use everyday language
- Preserve personality and humor
- Make it sound like a friend talking

Refine: "{{text}}"`,
    regularPrompt: `Clean up this transcript while keeping it casual and friendly. Fix errors but maintain the conversational tone.

Raw transcript: "{{text}}"

Cleaned up:`
  }
];

export default function PromptStudio({ className = "" }: PromptStudioProps) {
  const [activeTab, setActiveTab] = useState<"current" | "edit" | "templates" | "test">("current");
  const [editedAgentPrompt, setEditedAgentPrompt] = useState(DEFAULT_PROMPTS.agent);
  const [editedRegularPrompt, setEditedRegularPrompt] = useState(DEFAULT_PROMPTS.regular);
  const [testText, setTestText] = useState("Hey Assistant, make this more professional: This is a test message that needs some work.");
  const [testResult, setTestResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  
  const { alertDialog, showAlertDialog, hideAlertDialog } = useDialogs();
  const { agentName } = useAgentName();

  // Load saved custom prompts from localStorage
  useEffect(() => {
    const savedPrompts = localStorage.getItem("customPrompts");
    if (savedPrompts) {
      try {
        const parsed = JSON.parse(savedPrompts);
        setEditedAgentPrompt(parsed.agent || DEFAULT_PROMPTS.agent);
        setEditedRegularPrompt(parsed.regular || DEFAULT_PROMPTS.regular);
      } catch (error) {
        console.error("Failed to load custom prompts:", error);
      }
    }
  }, []);

  const savePrompts = () => {
    const customPrompts = {
      agent: editedAgentPrompt,
      regular: editedRegularPrompt
    };
    
    localStorage.setItem("customPrompts", JSON.stringify(customPrompts));
    showAlertDialog({
      title: "Prompts Saved!",
      description: "Your custom prompts have been saved and will be used for all future AI processing."
    });
  };

  const resetToDefaults = () => {
    setEditedAgentPrompt(DEFAULT_PROMPTS.agent);
    setEditedRegularPrompt(DEFAULT_PROMPTS.regular);
    localStorage.removeItem("customPrompts");
    showAlertDialog({
      title: "Reset Complete",
      description: "Prompts have been reset to default values."
    });
  };

  const applyTemplate = (template: PromptTemplate) => {
    setEditedAgentPrompt(template.agentPrompt);
    setEditedRegularPrompt(template.regularPrompt);
    setSelectedTemplate(template);
    setActiveTab("edit");
  };

  const testPrompt = async () => {
    if (!testText.trim()) return;
    
    setIsLoading(true);
    try {
      // Simulate AI processing with the custom prompt
      const isAgentMode = testText.toLowerCase().includes(agentName.toLowerCase());
      const prompt = isAgentMode ? editedAgentPrompt : editedRegularPrompt;
      
      // Replace placeholders
      const processedPrompt = prompt
        .replace(/\{\{agentName\}\}/g, agentName)
        .replace(/\{\{text\}\}/g, testText);

      // This would normally call your AI service
      // For now, just show the prompt that would be sent
      setTestResult(`[PROMPT THAT WOULD BE SENT TO AI]\n\n${processedPrompt}\n\n[This is a preview - actual AI processing would happen here]`);
      
    } catch (error) {
      console.error("Test failed:", error);
      setTestResult("Test failed: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const copyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
    showAlertDialog({
      title: "Copied!",
      description: "Prompt copied to clipboard."
    });
  };

  const renderCurrentPrompts = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Eye className="w-5 h-5 text-blue-600" />
          Current AI Prompts
        </h3>
        <p className="text-sm text-gray-600 mb-6">
          These are the exact prompts currently being sent to your AI models. Understanding these helps you see how OpenWispr thinks!
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-purple-600" />
            Agent Mode Prompt (when you say "Hey {agentName}")
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 border rounded-lg p-4 font-mono text-sm">
            <pre className="whitespace-pre-wrap">{editedAgentPrompt.replace(/\{\{agentName\}\}/g, agentName)}</pre>
          </div>
          <Button 
            onClick={() => copyPrompt(editedAgentPrompt)} 
            variant="outline" 
            size="sm" 
            className="mt-3"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy Prompt
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="w-4 h-4 text-green-600" />
            Regular Mode Prompt (for automatic cleanup)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 border rounded-lg p-4 font-mono text-sm">
            <pre className="whitespace-pre-wrap">{editedRegularPrompt}</pre>
          </div>
          <Button 
            onClick={() => copyPrompt(editedRegularPrompt)} 
            variant="outline" 
            size="sm" 
            className="mt-3"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy Prompt
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const renderEditPrompts = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Edit3 className="w-5 h-5 text-indigo-600" />
          Customize Your AI Prompts
        </h3>
        <p className="text-sm text-gray-600 mb-6">
          Edit these prompts to change how your AI behaves. Use <code>{"{{agentName}}"}</code> and <code>{"{{text}}"}</code> as placeholders.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent Mode Prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={editedAgentPrompt}
            onChange={(e) => setEditedAgentPrompt(e.target.value)}
            rows={12}
            className="font-mono text-sm"
            placeholder="Enter your custom agent prompt..."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regular Mode Prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={editedRegularPrompt}
            onChange={(e) => setEditedRegularPrompt(e.target.value)}
            rows={12}
            className="font-mono text-sm"
            placeholder="Enter your custom regular prompt..."
          />
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={savePrompts} className="flex-1">
          <Save className="w-4 h-4 mr-2" />
          Save Custom Prompts
        </Button>
        <Button onClick={resetToDefaults} variant="outline">
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset to Defaults
        </Button>
      </div>
    </div>
  );

  const renderTemplates = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-purple-600" />
          Prompt Templates
        </h3>
        <p className="text-sm text-gray-600 mb-6">
          Pre-built prompt templates for different use cases. Click to apply and customize.
        </p>
      </div>

      <div className="grid gap-4">
        {PROMPT_TEMPLATES.map((template) => (
          <Card key={template.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => applyTemplate(template)}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-gray-900">{template.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                  <span className={`inline-block mt-2 px-2 py-1 text-xs rounded-full ${
                    template.category === 'professional' ? 'bg-blue-100 text-blue-800' :
                    template.category === 'creative' ? 'bg-purple-100 text-purple-800' :
                    template.category === 'casual' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {template.category}
                  </span>
                </div>
                <Button variant="outline" size="sm">
                  Apply Template
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderTestPlayground = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TestTube className="w-5 h-5 text-green-600" />
          Test Your Prompts
        </h3>
        <p className="text-sm text-gray-600 mb-6">
          Try your custom prompts with sample text to see how they work before saving.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Test Input</label>
            <Textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              rows={3}
              placeholder="Enter text to test with your custom prompts..."
            />
          </div>

          <Button 
            onClick={testPrompt} 
            disabled={!testText.trim() || isLoading}
            className="w-full"
          >
            <Play className="w-4 h-4 mr-2" />
            {isLoading ? "Testing..." : "Test Prompt"}
          </Button>

          {testResult && (
            <div>
              <label className="block text-sm font-medium mb-2">Result Preview</label>
              <div className="bg-gray-50 border rounded-lg p-4 font-mono text-sm max-h-60 overflow-y-auto">
                <pre className="whitespace-pre-wrap">{testResult}</pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className={className}>
      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => !open && hideAlertDialog()}
        title={alertDialog.title}
        description={alertDialog.description}
        onOk={() => {}}
      />

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-6">
        {[
          { id: "current", label: "Current Prompts", icon: Eye },
          { id: "edit", label: "Customize", icon: Edit3 },
          { id: "templates", label: "Templates", icon: BookOpen },
          { id: "test", label: "Test", icon: TestTube }
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "current" && renderCurrentPrompts()}
      {activeTab === "edit" && renderEditPrompts()}
      {activeTab === "templates" && renderTemplates()}
      {activeTab === "test" && renderTestPlayground()}
    </div>
  );
}
