import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const KEY_STRING = process.env.TOKEN_ENCRYPTION_KEY;

if (!KEY_STRING || KEY_STRING.length !== 64) { 
  throw new Error("TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
}

const KEY = Buffer.from(KEY_STRING, "hex");
const IV_LENGTH = 16;

export function encrypt(text: string): string {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

export function decrypt(encrypted: string): string {
  try {
    const parts = encrypted.split(":");
    if (parts.length !== 2) {
      throw new Error("Invalid encrypted data format");
    }
    
    const [ivHex, encryptedText] = parts;
    if (!ivHex) {
      throw new Error("Invalid IV: undefined or null");
    }
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    if (!encryptedText) {
      throw new Error("Invalid encrypted text: undefined or null");
    }
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

// Generate a secure encryption key (run this once to generate your key)
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}