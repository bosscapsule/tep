'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const fallbackSecret = 'anatomyzh-desktop-secure-seed-v1';
const defaultSuperPasswordHash = 'scrypt:v1:4sXfFciZKaclZUiU0OAQjw$_7uEhTsX6ukuGE0tvjbz-WoQ9c9Y46OuLIC6ZEYZqWM7B5BlVwwqoeU0RbvVlj_P9fWPkoWJbsc1nTZ8TSC_8g';

function resolveUserDataPath() {
  const envOverride = process.env.ANATOMYZH_USER_DATA || process.env.APPDATA || process.env.XDG_DATA_HOME || path.join(os.homedir(), '.config');
  if (envOverride && envOverride.includes('AppData')) return envOverride;
  return path.join(os.homedir(), '.anatomyzh');
}

function readOrCreateSecret(userDataPath = null) {
  const secretFile = userDataPath ? path.join(userDataPath, 'anatomyzh-app-secret.key') : path.join(resolveUserDataPath(), 'anatomyzh-app-secret.key');
  try {
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    if (fs.existsSync(secretFile)) {
      return fs.readFileSync(secretFile, 'utf8').trim();
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, generated, 'utf8');
    return generated;
  } catch (error) {
    return fallbackSecret;
  }
}

function normalizeString(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function deriveKey(secret, salt = 'field') {
  return crypto.createHash('sha256').update(String(secret || fallbackSecret) + ':' + String(salt)).digest();
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function decodeBase64Url(value) {
  if (!value) return Buffer.alloc(0);
  return Buffer.from(String(value), 'base64url');
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const derivedKey = crypto.scryptSync(normalizeString(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:v1:${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string' || !storedHash.startsWith('scrypt:v1:')) return false;
  const [saltValue, hashValue] = storedHash.slice('scrypt:v1:'.length).split('$');
  if (!saltValue || !hashValue) return false;
  try {
    const expected = decodeBase64Url(hashValue);
    const actual = crypto.scryptSync(normalizeString(password), decodeBase64Url(saltValue), expected.length, { N: 16384, r: 8, p: 1 });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (error) {
    return false;
  }
}

function encryptString(value, salt = 'field', userDataPath = null) {
  const text = normalizeString(value);
  if (text === '') return '';
  const secret = readOrCreateSecret(userDataPath);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(secret, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return 'enc:gcm:v3:' + encodeBase64Url(iv) + ':' + encodeBase64Url(cipher.getAuthTag()) + ':' + encodeBase64Url(encrypted);
}

function decryptString(value, salt = 'field', userDataPath = null) {
  if (!value || typeof value !== 'string') return value;
  if (!value.startsWith('enc:')) return value;
  const parts = value.split(':');
  if (parts[1] === 'gcm') {
    if (parts.length < 6) return value;
    const iv = decodeBase64Url(parts[3]);
    const authTag = decodeBase64Url(parts[4]);
    const encrypted = decodeBase64Url(parts[5]);
    const key = deriveKey(readOrCreateSecret(userDataPath), salt);
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (error) {
      return value;
    }
  }
  if (parts.length < 4) return value;
  const version = parts[1] || 'v1';
  const iv = decodeBase64Url(parts[2]);
  const encrypted = decodeBase64Url(parts[3]);
  const secret = version === 'v2' ? readOrCreateSecret(userDataPath) : fallbackSecret;
  const key = deriveKey(secret, salt);
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    return value;
  }
}

function createCredentialsStore(userDataPath, secureStorage = null) {
  const storeFile = path.join(userDataPath, 'anatomyzh-credentials.json');
  function readStore() {
    try {
      const raw = fs.readFileSync(storeFile, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }
  function writeStore(nextState) {
    try {
      fs.mkdirSync(path.dirname(storeFile), { recursive: true });
      fs.writeFileSync(storeFile, JSON.stringify(nextState, null, 2), 'utf8');
    } catch (error) {
      // noop
    }
  }
  function getPlainValue(value, fallback = '') {
    if (typeof value === 'string' && value.startsWith('safe:v1:') && secureStorage) {
      try {
        return secureStorage.decryptString(Buffer.from(value.slice('safe:v1:'.length), 'base64')).toString();
      } catch (error) {
        return fallback;
      }
    }
    const decrypted = decryptString(value || '', 'credentials', userDataPath);
    return typeof decrypted === 'string' && decrypted !== '' ? decrypted : fallback;
  }
  return {
    ensureInitialized(superPassword) {
      const nextState = { ...readStore() };
      if (superPassword) {
        const normalized = normalizeString(superPassword);
        nextState.superPassword = hashPassword(normalized);
      } else if (!nextState.superPassword) {
        nextState.superPassword = defaultSuperPasswordHash;
      }
      writeStore(nextState);
      return nextState;
    },
    verifyAdminLogin(password, universities = []) {
      const cleanPassword = normalizeString(password).trim();
      if (!cleanPassword) return { ok: false, reason: 'invalid' };
      const state = readStore();
      if (verifyPassword(cleanPassword, state.superPassword)) return { ok: true, role: 'super' };
      const superValue = getPlainValue(state.superPassword);
      if (superValue && cleanPassword === superValue) {
        writeStore({ ...state, superPassword: hashPassword(cleanPassword) });
        return { ok: true, role: 'super' };
      }
      const normalized = cleanPassword.toUpperCase();
      const matched = (universities || []).find((uni) => {
        const key = normalizeString(uni && uni.key).toUpperCase();
        return key === normalized;
      });
      if (matched) {
        const expiresAt = matched.expiresAt ? new Date(matched.expiresAt).getTime() : null;
        if (!expiresAt || expiresAt >= Date.now()) return { ok: true, role: 'university', universityId: matched.id };
        return { ok: false, reason: 'expired' };
      }
      return { ok: false, reason: 'invalid' };
    },
  };
}

function encryptField(value, userDataPath = null) {
  return encryptString(value, 'field', userDataPath);
}

function decryptField(value, userDataPath = null) {
  return decryptString(value, 'field', userDataPath);
}

function encryptSyncPayload(payload, channelKey = 'sync', userDataPath = null) {
  return { v: 1, enc: encryptString(JSON.stringify(payload), channelKey, userDataPath) };
}

function decryptSyncPayload(payload, channelKey = 'sync', userDataPath = null) {
  if (!payload || typeof payload !== 'object' || !('enc' in payload)) return payload;
  const raw = decryptString(payload.enc, channelKey, userDataPath);
  try {
    return JSON.parse(raw);
  } catch (error) {
    return raw;
  }
}

module.exports = {
  createCredentialsStore,
  encryptField,
  decryptField,
  encryptSyncPayload,
  decryptSyncPayload,
};
