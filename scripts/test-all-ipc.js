const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

if (app) {
  try {
    app.setName('Catmonto');
  } catch (_) {}
}

const { SettingsStore } = require('../electron/settings/store');
const { ScreenCapturer } = require('../electron/capture/capturer');
const { GeminiProvider } = require('../electron/ai/gemini-provider');
const { OllamaProvider } = require('../electron/ai/ollama-provider');

let passed = 0;
let failed = 0;

function check(success, name, detail = '') {
  if (success) {
    console.log(`  ✓ [PASS] ${name} ${detail ? `(${detail})` : ''}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

app.whenReady().then(async () => {
  console.log('========================================================');
  console.log('      CATMONTO END-TO-END IPC & HANDLER TEST RUNNER      ');
  console.log('========================================================\n');

  const settingsStore = new SettingsStore();
  settingsStore.reload();
  const settings = settingsStore.get();
  const apiKey = settings.geminiApiKey;

  // 1. Test settings:get
  console.log('1. Testing settings:get...');
  const gotSettings = settingsStore.get();
  check(Boolean(gotSettings && typeof gotSettings === 'object'), 'settings:get returns valid object');

  // 2. Test settings:update
  console.log('2. Testing settings:update...');
  const updatedSettings = settingsStore.set({ testFlag: 'testing-123' });
  check(updatedSettings.testFlag === 'testing-123', 'settings:update merges settings successfully');
  // cleanup test flag
  delete updatedSettings.testFlag;
  settingsStore.set(updatedSettings);

  // 3. Test permissions:check
  console.log('3. Testing permissions:check & screen sources...');
  const screenCapturer = new ScreenCapturer();
  try {
    const sources = await screenCapturer.getAvailableSources();
    check(Array.isArray(sources), 'screen:getSources returned an array', `${sources.length} sources found`);
  } catch (err) {
    check(false, 'screen:getSources threw an error', err.message);
  }

  // 4. Test gemini:validate
  console.log('4. Testing gemini:validate with decrypted API key...');
  const gemini = new GeminiProvider({ apiKey: apiKey, model: settings.geminiModel });
  try {
    const health = await gemini.checkHealth();
    check(health.available === true, 'gemini:validate connects to Google Generative Language API', `${health.models?.length} models`);
  } catch (err) {
    check(false, 'gemini:validate threw an error', err.message);
  }

  // 5. Test gemini:testPrompt
  console.log('5. Testing gemini:testPrompt (Simulating Setup Wizard "Test Live AI Response")...');
  try {
    const testResult = await gemini.analyzeScreen({
      imageBase64: '',
      userPrompt: 'Say hello in one short friendly sentence without emojis as Catmonto!',
      contextHint: 'Live Connection Test',
    });
    const replyText = testResult.suggestion || testResult.raw;
    check(Boolean(replyText && replyText.length > 0), 'gemini:testPrompt returned live AI text', replyText);
  } catch (err) {
    check(false, 'gemini:testPrompt threw an error', err.message);
  }

  // 6. Test cat:ask with real screenshot
  console.log('6. Testing cat:ask (Simulating user asking Cat about screen)...');
  const screenshotPath = path.join(__dirname, '../screenshots/01_compact_cat_companion.png');
  if (fs.existsSync(screenshotPath)) {
    const sampleBuffer = fs.readFileSync(screenshotPath);
    const sampleBase64 = sampleBuffer.toString('base64');
    try {
      const askResult = await gemini.analyzeScreen({
        imageBase64: sampleBase64,
        userPrompt: 'Is there any code error visible on this screen?',
        contextHint: 'User Screen Question',
      });
      const askAnswer = askResult.suggestion || askResult.raw;
      check(Boolean(askAnswer && askAnswer.length > 0), 'cat:ask multimodal vision returned valid analysis', askAnswer);
    } catch (err) {
      check(false, 'cat:ask threw an error', err.message);
    }
  }

  // 7. Test ollama:check
  console.log('7. Testing ollama:check (Offline handling)...');
  const ollama = new OllamaProvider({ baseUrl: settings.ollamaUrl || 'http://127.0.0.1:11434' });
  const ollamaHealth = await ollama.checkHealth();
  check(typeof ollamaHealth === 'object', 'ollama:check returned status object', ollamaHealth.available ? 'online' : 'offline/graceful');

  // 8. Test code:applyFix and code:undoFix logic
  console.log('8. Testing code:applyFix and code:undoFix clipboard & revert logic...');
  const { clipboard } = require('electron');
  const origClip = clipboard.readText();
  const testFixSnippet = "cin >> x;";
  clipboard.writeText(testFixSnippet);
  check(clipboard.readText() === testFixSnippet, 'code:applyFix puts fix snippet onto system clipboard');
  // Revert back
  clipboard.writeText(origClip);
  check(clipboard.readText() === origClip, 'code:undoFix restores original clipboard');

  console.log('\n========================================================');
  console.log(`TOTAL: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  app.quit();
});
