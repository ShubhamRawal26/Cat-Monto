const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const DEFAULT_SETTINGS = {
  monitoringEnabled: true,
  aiProvider: 'gemini', // 'gemini' | 'groq' | 'ollama'
  geminiApiKey: '',
  geminiApiKeyEncrypted: '',
  geminiModel: 'gemini-3.5-flash',
  groqApiKey: '',
  groqApiKeyEncrypted: '',
  groqModel: 'qwen/qwen3.6-27b',
  ollamaUrl: 'http://127.0.0.1:11434',
  model: 'qwen2.5-vl:latest',
  checkIntervalSeconds: 3,
  typingPauseDelaySeconds: 0.6,
  suggestionCooldownSeconds: 4,
  windowBounds: { x: null, y: null, width: 190, height: 175 },
  targetSourceId: 'entire-screen',
  targetSourceName: 'Entire Screen',
  rememberSecurely: true,
  privacyShield: true,
  completedOnboarding: false,
  excludedApps: [
    'bitwarden',
    '1password',
    'keepass',
    'lastpass',
    'banking',
    'paytm',
    'paypal',
    'auth',
    'authenticator',
    'private',
    'incognito',
  ],
  simulationMode: false,
};

class SettingsStore {
  getSettingsFilePath() {
    if (!app) return path.join(process.cwd(), 'catmonto-settings.json');
    try {
      const preferred = path.join(app.getPath('appData'), 'Catmonto', 'catmonto-settings.json');
      if (fs.existsSync(preferred)) return preferred;
    } catch (_) {}
    return path.join(app.getPath('userData'), 'catmonto-settings.json');
  }

  constructor() {
    this.filePath = this.getSettingsFilePath();
    this.settings = this.load();
  }

  encryptValue(val) {
    if (!val) return '';
    try {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        const buffer = safeStorage.encryptString(val);
        return buffer.toString('base64');
      }
    } catch (e) {
      console.warn('[SettingsStore] safeStorage encryption failed:', e.message);
    }
    return val;
  }

  decryptValue(encryptedVal) {
    if (!encryptedVal) return '';
    try {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(encryptedVal, 'base64');
        const dec = safeStorage.decryptString(buffer);
        if (dec && dec.length > 5) return dec;
      }
    } catch (e) {
      console.warn('[SettingsStore] safeStorage decryption failed:', e.message);
    }
    return '';
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        const merged = { ...DEFAULT_SETTINGS, ...parsed };

        // If encrypted keys exist, decrypt them if safeStorage is ready
        if (merged.geminiApiKeyEncrypted) {
          if (safeStorage && safeStorage.isEncryptionAvailable()) {
            const dec = this.decryptValue(merged.geminiApiKeyEncrypted);
            if (dec) merged.geminiApiKey = dec;
          }
        }
        if (merged.groqApiKeyEncrypted) {
          if (safeStorage && safeStorage.isEncryptionAvailable()) {
            const dec = this.decryptValue(merged.groqApiKeyEncrypted);
            if (dec) merged.groqApiKey = dec;
          }
        }

        // Migrate deprecated/overloaded models to rock-solid gemini-2.0-flash
        if (
          !merged.geminiModel ||
          merged.geminiModel.includes('3.5') ||
          merged.geminiModel.includes('flash-latest')
        ) {
          merged.geminiModel = 'gemini-2.0-flash';
        }

        // Automatically migrate decommissioned Groq models
        if (!merged.groqModel || merged.groqModel.includes('llama-3.2')) {
          merged.groqModel = 'qwen/qwen3.6-27b';
        }

        return merged;
      }
    } catch (err) {
      console.error('[SettingsStore] Failed to load settings:', err.message);
    }
    return { ...DEFAULT_SETTINGS };
  }

  reload() {
    this.filePath = this.getSettingsFilePath();
    this.settings = this.load();
    return this.settings;
  }

  save() {
    try {
      const toSave = { ...this.settings };
      // Encrypt sensitive keys if requested
      if (toSave.rememberSecurely && toSave.geminiApiKey) {
        const enc = this.encryptValue(toSave.geminiApiKey);
        if (enc && enc !== toSave.geminiApiKey) {
          toSave.geminiApiKeyEncrypted = enc;
        }
      } else if (!toSave.rememberSecurely) {
        toSave.geminiApiKeyEncrypted = '';
      }

      if (toSave.rememberSecurely && toSave.groqApiKey) {
        const enc = this.encryptValue(toSave.groqApiKey);
        if (enc && enc !== toSave.groqApiKey) {
          toSave.groqApiKeyEncrypted = enc;
        }
      } else if (!toSave.rememberSecurely) {
        toSave.groqApiKeyEncrypted = '';
      }

      fs.writeFileSync(this.filePath, JSON.stringify(toSave, null, 2), 'utf-8');
    } catch (err) {
      console.error('[SettingsStore] Failed to save settings:', err.message);
    }
  }

  get(key) {
    if (key) return this.settings[key];
    return { ...this.settings };
  }

  set(key, value) {
    if (typeof key === 'object') {
      this.settings = { ...this.settings, ...key };
    } else {
      this.settings[key] = value;
    }
    this.save();
    return this.settings;
  }
}

module.exports = { SettingsStore, DEFAULT_SETTINGS };
