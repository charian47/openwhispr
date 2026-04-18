import { ProviderTabs } from "./ui/ProviderTabs";
import EnterpriseProviderConfig from "./EnterpriseProviderConfig";
import { REASONING_PROVIDERS } from "../models/ModelRegistry";
import { useSettingsStore } from "../stores/settingsStore";

const ENTERPRISE_PROVIDER_TABS = [
  { id: "bedrock", name: "AWS Bedrock" },
  { id: "azure", name: "Azure OpenAI", disabled: true, disabledLabel: "Soon" },
  { id: "vertex", name: "Vertex AI", disabled: true, disabledLabel: "Soon" },
];

interface EnterpriseSectionProps {
  currentProvider: string;
  reasoningModel: string;
  setReasoningModel: (m: string) => void;
  setLocalReasoningProvider: (p: string) => void;
}

// Selected tab is derived from currentProvider. Clicking a tab propagates
// through setLocalReasoningProvider so currentProvider stays authoritative.
export default function EnterpriseSection({
  currentProvider,
  reasoningModel,
  setReasoningModel,
  setLocalReasoningProvider,
}: EnterpriseSectionProps) {
  const selectedEnterprise = ENTERPRISE_PROVIDER_TABS.some((p) => p.id === currentProvider)
    ? currentProvider
    : "";
  const store = useSettingsStore();

  const handleEnterpriseSelect = (providerId: string) => {
    if (selectedEnterprise === providerId) return;
    setLocalReasoningProvider(providerId);

    const providerData = REASONING_PROVIDERS[providerId];
    if (providerData?.models?.length) {
      setReasoningModel(providerData.models[0].value);
    } else if (providerId === "azure" && store.azureDeploymentName) {
      setReasoningModel(store.azureDeploymentName);
    }
  };

  return (
    <div className="space-y-2">
      <div className="border border-border rounded-lg overflow-hidden">
        <ProviderTabs
          providers={ENTERPRISE_PROVIDER_TABS}
          selectedId={selectedEnterprise}
          onSelect={handleEnterpriseSelect}
          colorScheme="purple"
        />

        {selectedEnterprise && (
          <div className="p-3">
            <EnterpriseProviderConfig
              provider={selectedEnterprise as "bedrock" | "azure" | "vertex"}
              reasoningModel={reasoningModel}
              setReasoningModel={setReasoningModel}
              bedrockAuthMode={store.bedrockAuthMode}
              setBedrockAuthMode={store.setBedrockAuthMode}
              bedrockRegion={store.bedrockRegion}
              setBedrockRegion={store.setBedrockRegion}
              bedrockProfile={store.bedrockProfile}
              setBedrockProfile={store.setBedrockProfile}
              bedrockAccessKeyId={store.bedrockAccessKeyId}
              setBedrockAccessKeyId={store.setBedrockAccessKeyId}
              bedrockSecretAccessKey={store.bedrockSecretAccessKey}
              setBedrockSecretAccessKey={store.setBedrockSecretAccessKey}
              bedrockSessionToken={store.bedrockSessionToken}
              setBedrockSessionToken={store.setBedrockSessionToken}
              azureEndpoint={store.azureEndpoint}
              setAzureEndpoint={store.setAzureEndpoint}
              azureApiKey={store.azureApiKey}
              setAzureApiKey={store.setAzureApiKey}
              azureDeploymentName={store.azureDeploymentName}
              setAzureDeploymentName={store.setAzureDeploymentName}
              azureApiVersion={store.azureApiVersion}
              setAzureApiVersion={store.setAzureApiVersion}
              vertexAuthMode={store.vertexAuthMode}
              setVertexAuthMode={store.setVertexAuthMode}
              vertexProject={store.vertexProject}
              setVertexProject={store.setVertexProject}
              vertexLocation={store.vertexLocation}
              setVertexLocation={store.setVertexLocation}
              vertexApiKey={store.vertexApiKey}
              setVertexApiKey={store.setVertexApiKey}
            />
          </div>
        )}
      </div>
    </div>
  );
}
