const { app, BrowserWindow, ipcMain, screen, desktopCapturer } = require('electron');
const path = require('path');

// Ensure consistent application name in dev and prod
if (app) {
  try {
    app.setName('Catmonto');
  } catch (_) {}

  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    console.log('[main] Another instance of Catmonto is already running. Focusing existing instance and exiting.');
    app.quit();
    process.exit(0);
  } else {
    app.on('second-instance', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}

const { CAT_CONFIG } = require('./config/cat-config');
const { SettingsStore } = require('./settings/store');
const { PrivacyFilter } = require('./privacy/exclusion');
const { ScreenCapturer } = require('./capture/capturer');
const { OllamaProvider } = require('./ai/ollama-provider');
const { GeminiProvider } = require('./ai/gemini-provider');
const { GroqProvider } = require('./ai/groq-provider');

let mainWindow = null;
let monitorInterval = null;
let isAnalyzing = false;
let lastAnalysisTime = 0;
let lastErrorAlertTime = 0;
let lastScreenChangeTime = 0;
let screenHasChangedSinceLastAnalysis = false;
let lastAutoRecheckTime = 0;
let activeErrorFingerprint = null;
let currentCatState = 'WATCHING';

const settingsStore = new SettingsStore();
const privacyFilter = new PrivacyFilter(settingsStore.get('excludedApps'));
const screenCapturer = new ScreenCapturer();

// Cat Finite State Machine (FSM) manager
function setCatState(newState) {
  currentCatState = newState;
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // Map FSM states to renderer animations:
  // WATCHING / IDLE -> sleeping
  // ANALYZING -> thinking
  // ERROR_FOUND -> attention
  // EXPLAINING -> speaking
  // SUCCESS -> attention (wake up celebration)
  // OFFLINE -> sleeping
  let legacyState = 'sleeping';
  if (newState === 'ANALYZING') legacyState = 'thinking';
  else if (newState === 'ERROR_FOUND') legacyState = 'attention';
  else if (newState === 'EXPLAINING') legacyState = 'speaking';
  else if (newState === 'SUCCESS') legacyState = 'attention';
  else if (newState === 'IDLE' || newState === 'WATCHING' || newState === 'OFFLINE') legacyState = 'sleeping';

  mainWindow.webContents.send('cat:state', legacyState);
  mainWindow.webContents.send('cat:fsmState', newState);
}

let ollamaProvider = new OllamaProvider({
  baseUrl: settingsStore.get('ollamaUrl'),
  model: settingsStore.get('model'),
});

let geminiProvider = new GeminiProvider({
  apiKey: settingsStore.get('geminiApiKey'),
  model: settingsStore.get('geminiModel') || CAT_CONFIG.PRIMARY_GEMINI_MODEL,
});

let groqProvider = new GroqProvider({
  apiKey: settingsStore.get('groqApiKey'),
  model: settingsStore.get('groqModel') || 'qwen/qwen3.6-27b',
});

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const savedBounds = settingsStore.get('windowBounds') || {};
  let winWidth = savedBounds.width || 190;
  let winHeight = savedBounds.height || 175;
  // If legacy oversized bounds are stored, reset to new compact size
  if (winWidth > 240) {
    winWidth = 190;
    winHeight = 175;
  }
  const winX = savedBounds.x !== null && savedBounds.x !== undefined ? savedBounds.x : screenWidth - winWidth - 24;
  const winY = savedBounds.y !== null && savedBounds.y !== undefined ? savedBounds.y : screenHeight - winHeight - 32;

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: winX,
    y: winY,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: true,
    maximizable: false,
    hasShadow: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Keep window on top across all workspaces
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // Broadcast maximize state changes
  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximizedChange', true);
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximizedChange', false);
    }
  });

  // Save bounds on move
  mainWindow.on('moved', () => {
    if (!mainWindow || mainWindow.isMaximized()) return;
    const bounds = mainWindow.getBounds();
    // Only save if it's the normal compact size (don't overwrite default with modal or suggestion size)
    if (bounds.width <= 240) {
      settingsStore.set('windowBounds', bounds);
    }
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).catch(() => {});
      }
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).catch(() => {});
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopMonitoring();
  });
}

/**
 * Screen monitoring loop with Smart Typing Debounce & Latest-Frame Priority Pipeline
 */
function startMonitoring() {
  if (monitorInterval) return;

  setCatState('WATCHING');
  const tickIntervalMs = CAT_CONFIG.SCREEN_CAPTURE_INTERVAL_MS || 500;

  monitorInterval = setInterval(async () => {
    const now = Date.now();
    // Backoff protection if rate-limited
    if (now < lastAnalysisTime) return;

    try {
      const targetSourceId = settingsStore.get('targetSourceId');
      const isErrorActive = activeErrorFingerprint !== null;
      const captureResult = await screenCapturer.captureScreen(targetSourceId, isErrorActive);

      // Check Privacy Filter
      if (settingsStore.get('privacyShield') !== false) {
        if (privacyFilter.isExcluded(captureResult.name, captureResult.name)) {
          screenHasChangedSinceLastAnalysis = false;
          return;
        }
      }

      if (captureResult.hasMeaningfulChange) {
        // Active typing / editing detected! Record timestamp and set flag
        lastScreenChangeTime = now;
        screenHasChangedSinceLastAnalysis = true;
      }

      // If screen is steady and no edits happened, stay resting (ZERO continuous idle polling/spam)
      if (!screenHasChangedSinceLastAnalysis) {
        return;
      }

      // Check typing debounce: wait until user has paused typing for TYPING_DEBOUNCE_MS
      const quietDuration = now - lastScreenChangeTime;
      const debounceDelay = CAT_CONFIG.TYPING_DEBOUNCE_MS || 400;
      if (quietDuration < debounceDelay) {
        return; // User is actively typing right now
      }

      // If currently analyzing a prior frame, let it finish.
      if (isAnalyzing) {
        return;
      }

      // User has paused editing! Capture is ready for fresh analysis
      screenHasChangedSinceLastAnalysis = false;
      processFrame(captureResult);

    } catch (err) {
      if (!err.message?.includes('Screen capture image buffer is empty')) {
        console.error('[Monitoring loop error]:', err.message);
      }
    }
  }, tickIntervalMs);
}

async function processFrame(captureResult) {
  if (!captureResult || isAnalyzing) return;

  const isSim = settingsStore.get('simulationMode');
  const aiProviderType = settingsStore.get('aiProvider') || 'gemini';

  // Check provider readiness
  if (!isSim) {
    if (aiProviderType === 'gemini') {
      if (!geminiProvider.apiKey) return;
    } else if (aiProviderType === 'groq') {
      if (!groqProvider.apiKey) return;
    } else {
      const health = await ollamaProvider.checkHealth();
      if (!health.available) return;
    }
  }

  isAnalyzing = true;
  setCatState('ANALYZING');
  const tProcessStart = Date.now();

  try {
    let result = null;
    const isExhibition = Boolean(CAT_CONFIG.EXHIBITION_MODE);

    if (isSim) {
      result = {
        hasError: false,
        suggestion: null,
      };
    } else if (aiProviderType === 'gemini') {
      const activeHint = activeErrorFingerprint
        ? `Previous error was: "${activeErrorFingerprint}". Check if this error was fixed, or if there is a new/different error in the visible code. If all visible code is now valid or has no syntax errors, return error: false.`
        : (captureResult.name || 'Desktop Workspace');

      result = await geminiProvider.analyzeScreen({
        imageBase64: captureResult.base64,
        contextHint: activeHint,
        isExhibitionMode: isExhibition,
      });
    } else if (aiProviderType === 'groq') {
      const activeHint = activeErrorFingerprint
        ? `Previous error was: "${activeErrorFingerprint}". Check if fixed or new error.`
        : (captureResult.name || 'Desktop Workspace');

      result = await groqProvider.analyzeScreen({
        imageBase64: captureResult.base64,
        contextHint: activeHint,
      });
    } else {
      result = await ollamaProvider.analyzeScreen({
        imageBase64: captureResult.base64,
        contextHint: captureResult.name || 'Desktop Workspace',
      });
    }

    const totalLatency = Date.now() - tProcessStart;
    if (CAT_CONFIG.DEBUG_PERF && captureResult.perf && result?.perf) {
      console.log(
        `[PERF] Capture: ${captureResult.perf.captureMs}ms | Optimize: ${captureResult.perf.optimizeMs}ms | Network/AI: ${result.perf.networkMs}ms | Total: ${totalLatency}ms`
      );
    }

    if (result && result.hasError && result.suggestion) {
      const isSameError = Boolean(
        result.fingerprint &&
        activeErrorFingerprint &&
        result.fingerprint === activeErrorFingerprint
      );

      if (!isSameError) {
        // Verified new or different error! Immediately notify user
        activeErrorFingerprint = result.fingerprint;
        lastErrorAlertTime = Date.now();

        setCatState('ERROR_FOUND');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('cat:suggestion', {
            text: result.suggestion,
            errorObj: result.errorObj,
            model: result.activeModel || geminiProvider.model,
            timestamp: Date.now(),
          });
          setCatState('EXPLAINING');
        }
      }
    } else {
      // Screen is error-free (hasError is false)
      if (activeErrorFingerprint !== null) {
        // User successfully fixed the previous error! Celebrate & clear
        activeErrorFingerprint = null;
        setCatState('SUCCESS');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('cat:suggestion', {
            text: null,
            resolved: true,
            timestamp: Date.now(),
          });
        }
        setTimeout(() => {
          setCatState('WATCHING');
        }, 1500);
      } else {
        setCatState('WATCHING');
      }
    }

  } catch (err) {
    console.error('[processFrame error]:', err.message);
    const isRateLimit = err.message && (
      err.message.includes('quota') ||
      err.message.includes('429') ||
      err.message.includes('rate-limit') ||
      err.message.includes('exceeded your current quota')
    );
    if (isRateLimit) {
      lastAnalysisTime = Date.now() + CAT_CONFIG.RATE_LIMIT_BACKOFF_MS;
      setCatState('OFFLINE');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('cat:suggestion', {
          text: '[System] Gemini API rate limit reached. Pausing checks for 30 seconds.',
          timestamp: Date.now(),
        });
      }
    } else {
      setCatState('OFFLINE');
      setTimeout(() => setCatState('WATCHING'), 4000);
      lastAnalysisTime = Date.now();
    }
  } finally {
    isAnalyzing = false;
  }
}

function stopMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  screenHasChangedSinceLastAnalysis = false;
  activeErrorFingerprint = null;
  lastAutoRecheckTime = 0;
  setCatState('IDLE');
}

// IPC Handlers
ipcMain.handle('monitoring:toggle', async (event, enabled) => {
  const current = enabled !== undefined ? enabled : !settingsStore.get('monitoringEnabled');
  settingsStore.set('monitoringEnabled', current);
  if (current) {
    startMonitoring();
  } else {
    stopMonitoring();
  }
  return { monitoringEnabled: current };
});

ipcMain.handle('monitoring:status', async () => {
  return {
    monitoringEnabled: settingsStore.get('monitoringEnabled'),
    isAnalyzing,
  };
});

ipcMain.handle('screen:captureNow', async () => {
  try {
    const targetSourceId = settingsStore.get('targetSourceId');
    const result = await screenCapturer.captureScreen(targetSourceId);
    return { success: true, base64: result.base64, dataUrl: result.dataUrl, name: result.name };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('screen:getSources', async () => {
  return await screenCapturer.getAvailableSources();
});

ipcMain.handle('permissions:check', async () => {
  try {
    const sources = await screenCapturer.getAvailableSources();
    return { granted: sources.length > 0 };
  } catch (err) {
    return { granted: false, error: err.message };
  }
});

ipcMain.handle('config:get', async () => {
  return CAT_CONFIG;
});

ipcMain.handle('config:update', async (event, overrides) => {
  if (overrides && typeof overrides === 'object') {
    Object.assign(CAT_CONFIG, overrides);
  }
  return CAT_CONFIG;
});

ipcMain.handle('capture:setRegion', async (event, region) => {
  screenCapturer.setCaptureRegion(region);
  return { success: true, region: screenCapturer.captureRegion };
});

ipcMain.handle('fsm:getState', async () => {
  return { fsmState: currentCatState };
});

ipcMain.handle('cat:clearError', async () => {
  activeErrorFingerprint = null;
  setCatState('WATCHING');
  return { success: true };
});

ipcMain.handle('ollama:check', async () => {
  return await ollamaProvider.checkHealth();
});

ipcMain.handle('gemini:validate', async (event, testKey) => {
  return await geminiProvider.checkHealth(testKey);
});

ipcMain.handle('gemini:testPrompt', async (event, { apiKey, model }) => {
  try {
    const testKey = apiKey || settingsStore.get('geminiApiKey');
    if (!testKey || !testKey.trim()) {
      return { success: false, error: 'No API key provided.' };
    }
    const testModel = model || settingsStore.get('geminiModel') || 'gemini-3.5-flash';
    const tester = new GeminiProvider({ apiKey: testKey, model: testModel });
    const res = await tester.analyzeScreen({
      imageBase64: '',
      userPrompt: 'Say hello in one short friendly sentence as Catmonto the desktop pet!',
      contextHint: 'Live Connection Test',
    });
    return { success: true, text: res.suggestion || res.raw || 'Catmonto API connected!' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('groq:validate', async (event, testKey) => {
  return await groqProvider.checkHealth(testKey);
});

ipcMain.handle('groq:testPrompt', async (event, { apiKey, model }) => {
  try {
    const testKey = apiKey || settingsStore.get('groqApiKey');
    if (!testKey || !testKey.trim()) {
      return { success: false, error: 'No Groq API key provided.' };
    }
    let testModel = model || settingsStore.get('groqModel') || 'qwen/qwen3.6-27b';
    if (testModel.includes('llama-3.2')) {
      testModel = 'qwen/qwen3.6-27b';
    }
    const tester = new GroqProvider({ apiKey: testKey, model: testModel });
    const res = await tester.analyzeScreen({
      imageBase64: '',
      userPrompt: 'Say hello in one short friendly sentence as Catmonto the desktop pet!',
      contextHint: 'Live Connection Test',
    });
    return { success: true, text: res.suggestion || res.raw || 'Catmonto Groq API connected!' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('cat:ask', async (event, userPrompt) => {
  try {
    if (!userPrompt || !userPrompt.trim()) return { error: 'Empty prompt' };

    // Broadcast thinking state
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cat:state', 'thinking');
    }

    const targetSourceId = settingsStore.get('targetSourceId');
    const capture = await screenCapturer.captureScreen(targetSourceId);
    const isSim = settingsStore.get('simulationMode');
    const aiProviderType = settingsStore.get('aiProvider') || 'gemini';

    let answer = '';

    if (isSim) {
      answer = `Main samajh gaya: "${userPrompt}". Screen par sab clear dikh raha hai!`;
    } else if (aiProviderType === 'gemini') {
      if (!geminiProvider.apiKey) {
        return { error: 'Gemini API key is missing. Click on Cat to set it up.' };
      }
      const res = await geminiProvider.analyzeScreen({
        imageBase64: capture.base64,
        userPrompt: userPrompt.trim(),
        contextHint: capture.name || 'User direct question about screen',
      });
      answer = res.suggestion || res.raw || "Screen dekhi, sab theek lag raha hai!";
    } else if (aiProviderType === 'groq') {
      if (!groqProvider.apiKey) {
        return { error: 'Groq API key is missing. Click on Cat to set it up.' };
      }
      const res = await groqProvider.analyzeScreen({
        imageBase64: capture.base64,
        userPrompt: userPrompt.trim(),
        contextHint: capture.name || 'User direct question about screen',
      });
      answer = res.suggestion || res.raw || "Screen dekhi, sab theek lag raha hai!";
    } else {
      const health = await ollamaProvider.checkHealth();
      if (!health.available) {
        return {
          error: `Ollama is not running. Please start Ollama at ${settingsStore.get('ollamaUrl')}`,
        };
      }
      const res = await ollamaProvider.analyzeScreen({
        imageBase64: capture.base64,
        userPrompt: userPrompt.trim(),
        contextHint: capture.name || 'User direct question about screen',
      });
      answer = res.suggestion || res.raw || "Mujhe screen par koi specific issue nahi dikha.";
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cat:suggestion', {
        text: answer,
        timestamp: Date.now(),
      });
      mainWindow.webContents.send('cat:state', 'speaking');
    }

    return { success: true, text: answer };
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cat:state', 'sleeping');
    }
    return { success: false, error: err.message };
  }
});

ipcMain.handle('settings:get', async () => {
  return settingsStore.get();
});

ipcMain.handle('settings:update', async (event, newSettings) => {
  const updated = settingsStore.set(newSettings);

  if (newSettings.ollamaUrl || newSettings.model) {
    ollamaProvider = new OllamaProvider({
      baseUrl: updated.ollamaUrl,
      model: updated.model,
    });
  }

  if (newSettings.geminiApiKey !== undefined) {
    geminiProvider.setApiKey(updated.geminiApiKey);
  }
  if (newSettings.geminiModel) {
    geminiProvider.setModel(updated.geminiModel);
  }

  if (newSettings.groqApiKey !== undefined) {
    groqProvider.setApiKey(updated.groqApiKey);
  }
  if (newSettings.groqModel) {
    groqProvider.setModel(updated.groqModel);
  }

  if (newSettings.excludedApps) {
    privacyFilter.setExclusions(updated.excludedApps);
  }

  return updated;
});

ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.on('window:maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('window:resize', (event, { width, height, center }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // If the window is currently maximized, unmaximize it first before applying new bounds
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  }

  const currentBounds = mainWindow.getBounds();
  // Multi-monitor safe: find display that actually contains the window
  const currentDisplay = screen.getDisplayMatching(currentBounds) || screen.getPrimaryDisplay();
  const { x: dispX, y: dispY, width: screenWidth, height: screenHeight } = currentDisplay.workArea;

  const isWizard = width >= 500;
  mainWindow.setMaximizable(isWizard);

  // Clamp target dimensions to current screen work area
  const targetWidth = Math.min(width, screenWidth - 20);
  const targetHeight = Math.min(height, screenHeight - 20);

  let newX = currentBounds.x;
  let newY = currentBounds.y;

  if (center) {
    newX = dispX + Math.round((screenWidth - targetWidth) / 2);
    newY = dispY + Math.round((screenHeight - targetHeight) / 2);
  } else if (isWizard) {
    // Opening wizard: expand smoothly from current center
    if (targetWidth > currentBounds.width) {
      newX = currentBounds.x - Math.round((targetWidth - currentBounds.width) / 2);
      newY = currentBounds.y - Math.round((targetHeight - currentBounds.height) / 2);
    } else {
      newX = currentBounds.x + Math.round((currentBounds.width - targetWidth) / 2);
      newY = currentBounds.y + Math.round((currentBounds.height - targetHeight) / 2);
    }
  } else if (currentBounds.width >= 500) {
    // Shrinking back from wizard to compact cat window, restore saved bounds
    const savedBounds = settingsStore.get('windowBounds') || {};
    newX = savedBounds.x !== null && savedBounds.x !== undefined ? savedBounds.x : dispX + screenWidth - targetWidth - 24;
    newY = savedBounds.y !== null && savedBounds.y !== undefined ? savedBounds.y : dispY + screenHeight - targetHeight - 32;
  } else {
    // In compact mode: anchor the cat's bottom so cat remains fixed in place when bubbles/dialogs appear
    newY = currentBounds.y + (currentBounds.height - targetHeight);
    newX = currentBounds.x + Math.round((currentBounds.width - targetWidth) / 2);
  }

  // Clamp to visible work area of this display
  if (newX < dispX + 10) newX = dispX + 10;
  if (newY < dispY + 10) newY = dispY + 10;
  if (newX + targetWidth > dispX + screenWidth - 10) {
    newX = dispX + screenWidth - targetWidth - 10;
  }
  if (newY + targetHeight > dispY + screenHeight - 10) {
    newY = dispY + screenHeight - targetHeight - 10;
  }

  mainWindow.setBounds({
    x: Math.round(newX),
    y: Math.round(newY),
    width: Math.round(targetWidth),
    height: Math.round(targetHeight),
  });
});

// App Lifecycle
app.whenReady().then(() => {
  // Reload settings now that safeStorage DPAPI is ready
  settingsStore.reload();
  const currentKey = settingsStore.get('geminiApiKey');
  if (currentKey) {
    geminiProvider.setApiKey(currentKey);
  }
  let configuredModel = settingsStore.get('geminiModel') || CAT_CONFIG.PRIMARY_GEMINI_MODEL;
  if (!configuredModel || configuredModel === 'gemini-flash-lite-latest') {
    configuredModel = CAT_CONFIG.PRIMARY_GEMINI_MODEL;
    settingsStore.set('geminiModel', configuredModel);
  }
  geminiProvider.setModel(configuredModel);

  createWindow();

  if (settingsStore.get('monitoringEnabled')) {
    startMonitoring();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
