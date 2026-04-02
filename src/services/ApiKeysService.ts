import { OPENWHISPR_API_URL } from "../config/constants.js";

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

async function listApiKeys(): Promise<{ keys: ApiKey[] }> {
  const res = await fetch(`${OPENWHISPR_API_URL}/api/api-keys/list`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ keys: ApiKey[] }>;
}

async function createApiKey(name: string, scopes: string[]): Promise<CreateApiKeyResponse> {
  const res = await fetch(`${OPENWHISPR_API_URL}/api/api-keys/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, scopes }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CreateApiKeyResponse>;
}

async function revokeApiKey(id: string): Promise<{ revoked: true }> {
  const res = await fetch(`${OPENWHISPR_API_URL}/api/api-keys/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ revoked: true }>;
}

export { listApiKeys, createApiKey, revokeApiKey };
export type { ApiKey, CreateApiKeyResponse };

export const ApiKeysService = {
  list: listApiKeys,
  create: createApiKey,
  revoke: revokeApiKey,
};
