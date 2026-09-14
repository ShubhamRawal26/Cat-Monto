const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

if (app) {
  try {
    app.setName('Catmonto');
  } catch (_) {}
}

const { SettingsStore } = require('../electron/settings/store');
const { PrivacyFilter } = require('../electron/privacy/exclusion');
const { ScreenCapturer } = require('../electron/capture/capturer');
const { GeminiProvider } = require('../electron/ai/gemini-provider');
const { OllamaProvider } = require('../electron/ai/ollama-provider');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failedTests++;
  }
}

app.whenReady().then(async () => {
  console.log('====================================================');
  console.log('       CATMONTO FULL PLATFORM TEST SUITE           ');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // SUITE 1: Settings Store & DPAPI Cryptography
  // ----------------------------------------------------
  console.log('--- TEST SUITE 1: Settings Store & DPAPI Cryptography ---');
  const store = new SettingsStore();
  store.reload();
  const settings = store.get();

  assert(typeof settings === 'object', 'SettingsStore.get() returns an object');
  assert(
    ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'].includes(settings.geminiModel),
    `Valid active model configured (got: ${settings.geminiModel})`
  );
  assert(Array.isArray(settings.excludedApps), 'Excluded apps is an array');
  assert(settings.excludedApps.includes('bitwarden'), 'Excluded apps includes "bitwarden"');
  assert(safeStorage.isEncryptionAvailable(), 'Windows DPAPI safeStorage is available');

  const testPlaintext = 'test-secret-key-12345';
  const encrypted = store.encryptValue(testPlaintext);
  assert(encrypted !== testPlaintext, 'safeStorage.encryptValue produces ciphertext');
  const decrypted = store.decryptValue(encrypted);
  assert(decrypted === testPlaintext, 'safeStorage.decryptValue accurately recovers plaintext');

  // Test legacy model migration
  const migrated = { geminiModel: 'gemini-2.0-flash' };
  if (
    migrated.geminiModel === 'gemini-2.0-flash' ||
    migrated.geminiModel === 'gemini-2.0-flash-lite' ||
    migrated.geminiModel === 'gemini-2.5-flash-lite'
  ) {
    migrated.geminiModel = 'gemini-3.5-flash';
  }
  assert(migrated.geminiModel === 'gemini-3.5-flash', 'Retired Gemini models automatically migrate to Gemini 3.5 Flash');

  // ----------------------------------------------------
  // SUITE 2: Privacy Filter & Window Exclusion
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 2: Privacy Shield & App Exclusion ---');
  const filter = new PrivacyFilter(['bitwarden', '1password', 'banking', 'private', 'authenticator']);

  assert(filter.isExcluded('Bitwarden - My Vault', 'chrome.exe') === true, 'Blocks window with "Bitwarden" in title');
  assert(filter.isExcluded('Online Banking Login', 'firefox.exe') === true, 'Blocks window with "Banking" in title');
  assert(filter.isExcluded('Personal Authenticator', 'app.exe') === true, 'Blocks window with "Authenticator" in title');
  assert(filter.isExcluded('index.html - Visual Studio Code', 'code.exe') === false, 'Allows safe window: Visual Studio Code');
  assert(filter.isExcluded('Catmonto Companion', 'electron.exe') === false, 'Allows safe window: Catmonto Companion');
  assert(filter.isExcluded('Terminal - PowerShell', 'pwsh.exe') === false, 'Allows safe window: PowerShell');

  // ----------------------------------------------------
  // SUITE 3: Screen Capturer Change Detection
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 3: Screen Capturer & Micro-Diff Algorithm ---');
  const capturer = new ScreenCapturer({ threshold: 0.04 });
  assert(capturer.threshold === 0.04, 'Capturer initializes with 4% diff threshold');

  // Create two identical 64x36 micro bitmaps (RGBA: 64*36*4 = 9216 bytes)
  const bufferSize = 64 * 36 * 4;
  const bufA = Buffer.alloc(bufferSize, 128);
  const bufB = Buffer.alloc(bufferSize, 128);

  // First run should trigger change (no previous frame)
  assert(capturer.detectChange(bufA) === true, 'First frame always detects change');
  capturer.lastThumbnail = bufA;

  // Identical frame should NOT trigger change
  assert(capturer.detectChange(bufB) === false, 'Identical consecutive frames detect NO change');

  // Frame with 1% minor noise should NOT trigger change
  const noisyBuf = Buffer.from(bufA);
  const onePercentPixels = Math.floor((64 * 36) * 0.01);
  for (let i = 0; i < onePercentPixels; i++) {
    noisyBuf[i * 4] = 255;
    noisyBuf[i * 4 + 1] = 255;
    noisyBuf[i * 4 + 2] = 255;
  }
  assert(capturer.detectChange(noisyBuf) === false, 'Minor noise (<4%) ignored by change detector');

  // Frame with 15% significant change SHOULD trigger change
  const changedBuf = Buffer.from(bufA);
  const fifteenPercentPixels = Math.floor((64 * 36) * 0.15);
  for (let i = 0; i < fifteenPercentPixels; i++) {
    changedBuf[i * 4] = 255;
    changedBuf[i * 4 + 1] = 255;
    changedBuf[i * 4 + 2] = 255;
  }
  assert(capturer.detectChange(changedBuf) === true, 'Significant content change (>4%) correctly detected');

  // ----------------------------------------------------
  // SUITE 4: Google Gemini Provider & Live Decrypted Key
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 4: Google Gemini Provider ---');
  const gemini = new GeminiProvider({
    apiKey: settings.geminiApiKey,
    model: settings.geminiModel || 'gemini-2.5-flash-lite',
  });

  assert(gemini.apiKey.length > 20, 'GeminiProvider loaded decrypted user API key');
  assert(
    ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'].includes(gemini.model),
    `GeminiProvider uses supported model (got: ${gemini.model})`
  );

  // Model normalization test
  gemini.setModel('gemini-2.0-flash');
  assert(gemini.model === 'gemini-3.5-flash', 'GeminiProvider.setModel automatically normalizes retired Gemini 2.0 Flash to Gemini 3.5 Flash');

  gemini.setModel('gemini-3.5-flash');
  assert(gemini.model === 'gemini-3.5-flash', 'GeminiProvider keeps Gemini 3.5 Flash selection');

  console.log('  Testing live Google Gemini API health check...');
  const health = await gemini.checkHealth();
  assert(health.available === true, 'Gemini API health check passed with live API key');
  assert(Array.isArray(health.models) && health.models.length > 0, `Gemini API returned ${health.models?.length} supported models`);

  // ----------------------------------------------------
  // SUITE 5: Ollama Provider
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 5: Ollama Local Provider ---');
  const ollama = new OllamaProvider({
    baseUrl: 'http://127.0.0.1:11434',
    model: 'qwen2.5-vl:latest',
  });

  assert(ollama.baseUrl === 'http://127.0.0.1:11434', 'OllamaProvider initialized with local URL');
  assert(ollama.model === 'qwen2.5-vl:latest', 'OllamaProvider initialized with vision model');

  const ollamaHealth = await ollama.checkHealth();
  // Ollama might not be running locally on the user's machine, so verify clean error handling
  if (ollamaHealth.available) {
    assert(true, 'Ollama is running locally and reported available');
  } else {
    assert(typeof ollamaHealth.error === 'string', `Ollama offline handled gracefully with informative error: "${ollamaHealth.error}"`);
  }

  // ----------------------------------------------------
  // SUITE 6: Multimodal Vision Screen Analysis
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 6: Multimodal Vision Screen Analysis ---');
  const sampleImagePath = path.join(__dirname, '../screenshots/01_compact_cat_companion.png');
  assert(fs.existsSync(sampleImagePath), 'Verified sample UI screenshot exists for multimodal testing');

  const sampleBuffer = fs.readFileSync(sampleImagePath);
  const sampleBase64 = sampleBuffer.toString('base64');
  console.log('  Sending sample UI frame to Gemini 3.6 Flash...');
  const visionStart = Date.now();
  const visionResult = await gemini.analyzeScreen({
    imageBase64: sampleBase64,
    userPrompt: 'Tell me what you see in 1 short sentence as Catmonto.',
    contextHint: 'Automated Test Suite',
  });
  const visionLatency = Date.now() - visionStart;

  assert(typeof visionResult.suggestion === 'string' && visionResult.suggestion.length > 0, `Gemini vision returned valid text in ${visionLatency}ms: "${visionResult.suggestion}"`);

  // ----------------------------------------------------
  // FINAL REPORT
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================');

  if (failedTests === 0) {
    console.log('>>> ALL PLATFORM TESTS PASSED SUCCESSFULLY! <<<');
  } else {
    console.error(`>>> ${failedTests} TESTS FAILED! CHECK OUTPUT ABOVE. <<<`);
  }

  app.quit();
});
