import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

let secretClient: SecretManagerServiceClient | null = null;
const secretCache = new Map<string, string>();

/**
 * Lazily retrieves a secret from Google Cloud Secret Manager at runtime.
 * Never logs secrets or returns undefined.
 */
export async function getSecret(
  secretName: string,
  version: string = 'latest'
): Promise<string | null> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'wire-trap-26';
  const cacheKey = `${projectId}/${secretName}/${version}`;

  if (secretCache.has(cacheKey)) {
    return secretCache.get(cacheKey) || null;
  }

  try {
    if (!secretClient) {
      secretClient = new SecretManagerServiceClient();
    }
    const name = `projects/${projectId}/secrets/${secretName}/versions/${version}`;
    const [versionResponse] = await secretClient.accessSecretVersion({ name });
    const payload = versionResponse.payload?.data?.toString();
    if (payload) {
      secretCache.set(cacheKey, payload);
      return payload;
    }
  } catch (err: any) {
    // Note: Never log secret values
    console.warn(
      `[SecretManager] Note: Could not access secret "${secretName}" in project "${projectId}": ${err?.message || err}`
    );
  }
  return null;
}
