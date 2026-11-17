const ENVELOPE_FORMAT = 'estuda-aes-256-gcm-v1';

export interface EncryptedBackupEnvelope {
  format: typeof ENVELOPE_FORMAT;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  exportedAt: string;
}

function toBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(parts.join(''));
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  usage: KeyUsage[],
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  );
}

export function isEncryptedBackupEnvelope(parsed: unknown): parsed is EncryptedBackupEnvelope {
  if (!parsed || typeof parsed !== 'object') return false;
  const obj = parsed as Record<string, unknown>;
  return (
    obj.format === ENVELOPE_FORMAT &&
    typeof obj.salt === 'string' &&
    typeof obj.iv === 'string' &&
    typeof obj.ciphertext === 'string'
  );
}

export async function encryptBackupJson(
  plainJsonText: string,
  passphrase: string,
): Promise<EncryptedBackupEnvelope> {
  const cleanPass = passphrase.trim();
  if (!cleanPass || cleanPass.length < 4) {
    throw new Error('Informe uma senha de pelo menos 4 caracteres para criptografar o backup.');
  }
  const iterations = 150_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(cleanPass, salt, iterations, ['encrypt']);
  const encoded = new TextEncoder().encode(plainJsonText);
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    encoded,
  );

  return {
    format: ENVELOPE_FORMAT,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encryptedBuf)),
    exportedAt: new Date().toISOString(),
  };
}

export async function decryptBackupEnvelope(
  envelope: EncryptedBackupEnvelope,
  passphrase: string,
): Promise<string> {
  const cleanPass = passphrase.trim();
  if (!cleanPass) {
    throw new Error('Este arquivo JSON está criptografado. Informe a senha do backup para restaurar.');
  }
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  const iterations = Number(envelope.iterations) || 150_000;

  try {
    const key = await deriveAesKey(cleanPass, salt, iterations, ['decrypt']);
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource,
    );
    return new TextDecoder().decode(decryptedBuf);
  } catch {
    throw new Error('Senha incorreta ou arquivo criptografado corrompido.');
  }
}
