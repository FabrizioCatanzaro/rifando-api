import crypto from 'crypto';

// AES-256-GCM. Formato guardado: v1:<iv base64>:<tag base64>:<cifrado base64>.
// El IV es aleatorio por cada valor. El tag detecta cualquier alteración.
const VERSION = 'v1';
const IV_BYTES = 12;

function keyFrom(hexKey: string): Buffer {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== 32) throw new Error('La clave de cifrado debe tener 32 bytes');
  return key;
}

export function encryptSecret(plain: string, hexKey: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFrom(hexKey), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(payload: string, hexKey: string): string {
  const [version, iv, tag, encrypted] = payload.split(':');
  if (version !== VERSION || !iv || !tag || !encrypted) throw new Error('Formato de secreto cifrado inválido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFrom(hexKey), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
}
