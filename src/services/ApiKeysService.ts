interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface CreateApiKeyResponse extends ApiKey {
  key: string;
}

interface CreateApiKeyOptions {
  name: string;
  scopes: string[];
  expiresInDays?: number | null;
}

async function listApiKeys(): Promise<{ keys: ApiKey[] }> {
  const result = await window.electronAPI?.cloudApiKeysList?.();
  if (!result?.success) throw new Error(result?.error ?? "Failed to list API keys");
  return { keys: result.keys ?? [] };
}

async function createApiKey(options: CreateApiKeyOptions): Promise<CreateApiKeyResponse> {
  const result = await window.electronAPI?.cloudApiKeysCreate?.({
    name: options.name,
    scopes: options.scopes,
    expires_in_days: options.expiresInDays ?? undefined,
  });
  if (!result?.success) throw new Error(result?.error ?? "Failed to create API key");
  return result as unknown as CreateApiKeyResponse;
}

async function revokeApiKey(id: string): Promise<{ revoked: true }> {
  const result = await window.electronAPI?.cloudApiKeysRevoke?.(id);
  if (!result?.success) throw new Error(result?.error ?? "Failed to revoke API key");
  return { revoked: true };
}

export { listApiKeys, createApiKey, revokeApiKey };
export type { ApiKey, CreateApiKeyResponse, CreateApiKeyOptions };

export const ApiKeysService = {
  list: listApiKeys,
  create: createApiKey,
  revoke: revokeApiKey,
};
