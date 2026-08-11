import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey() {
  const source = (process.env.FACEBOOK_TOKEN_ENCRYPTION_KEY || process.env.FACEBOOK_APP_SECRET || "").trim();
  if (!source) {
    throw new Error("Falta FACEBOOK_APP_SECRET (o FACEBOOK_TOKEN_ENCRYPTION_KEY) para proteger los tokens de Facebook.");
  }

  return crypto.createHash("sha256").update(source, "utf8").digest();
}

export function encryptSecret(value: string) {
  if (!value) return "";

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSecret(value: string) {
  if (!value) return "";

  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("El token cifrado de Facebook no tiene un formato válido.");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
