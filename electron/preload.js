const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('catmonto', {
  // Screen & Monitoring
  toggleMonitoring: (enabled) => ipcRenderer.invoke('monitoring:toggle', enabled),
  getMonitoringStatus: () => ipcRenderer.invoke('monitoring:status'),
  captureNow: () => ipcRenderer.invoke('screen:captureNow'),
  getScreenSources: () => ipcRenderer.invoke('screen:getSources'),
  checkPermissions: () => ipcRenderer.invoke('permissions:check'),
  setCaptureRegion: (region) => ipcRenderer.invoke('capture:setRegion', region),

  // Cat Config & FSM
  getCatConfig: () => ipcRenderer.invoke('config:get'),
  updateCatConfig: (newConfig) => ipcRenderer.invoke('config:update', newConfig),
  getFsmState: () => ipcRenderer.invoke('fsm:getState'),
  clearError: () => ipcRenderer.invoke('cat:clearError'),

  // AI & Ask Cat
  checkOllama: () => ipcRenderer.invoke('ollama:check'),
  validateGemini: (apiKey) => ipcRenderer.invoke('gemini:validate', apiKey),
  testGeminiPrompt: (options) => ipcRenderer.invoke('gemini:testPrompt', options),
  validateGroq: (apiKey) => ipcRenderer.invoke('groq:validate', apiKey),
  testGroqPrompt: (options) => ipcRenderer.invoke('groq:testPrompt', options),
  askCat: (prompt) => ipcRenderer.invoke('cat:ask', prompt),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (newSettings) => ipcRenderer.invoke('settings:update', newSettings),

  // Window operations
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  toggleMaximize: () => ipcRenderer.send('window:maximize'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizedChange: (callback) => {
    const handler = (event, isMax) => callback(isMax);
    ipcRenderer.on('window:maximizedChange', handler);
    return () => ipcRenderer.removeListener('window:maximizedChange', handler);
  },
  setWindowSize: (width, height, center = false) =>
    ipcRenderer.send('window:resize', { width, height, center }),

  // Subscriptions from main process
  onSuggestion: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('cat:suggestion', handler);
    return () => ipcRenderer.removeListener('cat:suggestion', handler);
  },
  onStateChange: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('cat:state', handler);
    return () => ipcRenderer.removeListener('cat:state', handler);
  },
  onFsmStateChange: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('cat:fsmState', handler);
    return () => ipcRenderer.removeListener('cat:fsmState', handler);
  },
  onEyeTarget: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('cat:eyeTarget', handler);
    return () => ipcRenderer.removeListener('cat:eyeTarget', handler);
  },
});
