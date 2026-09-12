const ENCRYPTED_KEY_PREFIX = "enc:v1:";

function encryptionSecret() {
  const secret = process.env.APP_CREDENTIALS_ENCRYPTION_KEY;
  if (!secret?.trim()) throw new Error("App credential encryption is not configured on the server.");
  return new TextEncoder().encode(secret.trim());
}

async function encryptionKey() {
  const material = await crypto.subtle.digest("SHA-256", new Uint8Array([...encryptionSecret(), ...new TextEncoder().encode("\0driftos-app-store-key-v1")]));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function isEncryptedAppKey(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(ENCRYPTED_KEY_PREFIX));
}

export async function encryptAppPrivateKey(privateKey: string): Promise<string> {
  const normalized = privateKey.replace(/\r\n/g, "\n").trim();
  if (!normalized.startsWith("-----BEGIN PRIVATE KEY-----") || !normalized.includes("-----END PRIVATE KEY-----")) {
    throw new Error("The selected file is not a valid App Store Connect .p8 private key.");
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(normalized));
  const bytes = new Uint8Array(encrypted);
  const encoded = btoa(String.fromCharCode(...bytes));
  return `${ENCRYPTED_KEY_PREFIX}${btoa(String.fromCharCode(...iv))}:${encoded}`;
}

export async function decryptAppPrivateKey(value: string): Promise<string> {
  if (!isEncryptedAppKey(value)) throw new Error("Stored App Store Connect key has an unsupported format.");
  const [, , ivEncoded, encryptedEncoded] = value.split(":");
  const decode = (encoded: string) => Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(ivEncoded) }, await encryptionKey(), decode(encryptedEncoded));
  return new TextDecoder().decode(decrypted);
}
