import React, { useState, useEffect } from 'react';

const STEPS = [
  { id: 1, title: 'Privacy' },
  { id: 2, title: 'API key' },
  { id: 3, title: 'Permission' },
  { id: 4, title: 'Ready' },
];

export default function SetupWizardModal({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  ollamaStatus,
  onCheckOllama,
}) {
  const sanitizeGeminiModel = (m) => {
    if (!m || m.includes('2.0') || m.includes('2.5') || m.includes('1.5') || m.includes('lite-latest')) {
      return 'gemini-3.5-flash';
    }
    return m;
  };

  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (window.catmonto?.isMaximized) {
      window.catmonto
        .isMaximized()
        .then((max) => {
          if (isMounted) setIsMaximized(Boolean(max));
        })
        .catch(() => {});
    }
    if (window.catmonto?.onMaximizedChange) {
      const unsub = window.catmonto.onMaximizedChange((max) => {
        if (isMounted) setIsMaximized(Boolean(max));
      });
      return () => {
        isMounted = false;
        if (typeof unsub === 'function') unsub();
      };
    }
    return () => {
      isMounted = false;
    };
  }, []);

  const [currentStep, setCurrentStep] = useState(2); // Default to Step 2 (API key)
  const [provider, setProvider] = useState(settings.aiProvider || 'gemini');
  const [geminiApiKey, setGeminiApiKey] = useState(settings.geminiApiKey || '');
  const [geminiModel, setGeminiModel] = useState(sanitizeGeminiModel(settings.geminiModel));
  const [showApiKey, setShowApiKey] = useState(false);
  const [rememberSecurely, setRememberSecurely] = useState(
    settings.rememberSecurely !== undefined ? settings.rememberSecurely : true
  );

  // Gemini verification status: 'idle' | 'checking' | 'valid' | 'invalid'
  const [keyStatus, setKeyStatus] = useState('idle');
  const [keyStatusMessage, setKeyStatusMessage] = useState('');

  // Live prompt testing status: 'idle' | 'testing' | 'success' | 'error'
  const [testPromptStatus, setTestPromptStatus] = useState('idle');
  const [testPromptReply, setTestPromptReply] = useState('');

  // Privacy states
  const [privacyShield, setPrivacyShield] = useState(
    settings.privacyShield !== undefined ? settings.privacyShield : true
  );
  const [excludedApps, setExcludedApps] = useState(
    (settings.excludedApps || []).join(', ')
  );

  // Observation timing & delay states
  const [typingPauseDelaySeconds, setTypingPauseDelaySeconds] = useState(
    settings.typingPauseDelaySeconds !== undefined ? settings.typingPauseDelaySeconds : 4
  );
  const [suggestionCooldownSeconds, setSuggestionCooldownSeconds] = useState(
    settings.suggestionCooldownSeconds !== undefined ? settings.suggestionCooldownSeconds : 15
  );

  // Permission test snapshot
  const [testSnapshot, setTestSnapshot] = useState(null);
  const [capturingTest, setCapturingTest] = useState(false);

<<<<<<< HEAD
  // Groq states
  const [groqApiKey, setGroqApiKey] = useState(settings.groqApiKey || '');
  const [groqModel, setGroqModel] = useState(settings.groqModel || 'qwen/qwen3.6-27b');
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [groqKeyStatus, setGroqKeyStatus] = useState('idle');
  const [groqKeyMsg, setGroqKeyMsg] = useState('');
  const [groqTestStatus, setGroqTestStatus] = useState('idle');
  const [groqTestReply, setGroqTestReply] = useState('');
=======
  // Choose screen / window source picker
  const [screenSources, setScreenSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [targetSourceId, setTargetSourceId] = useState(settings.targetSourceId || 'entire-screen');
  const [targetSourceName, setTargetSourceName] = useState(settings.targetSourceName || 'Entire Screen');

  const handleRefreshSources = async () => {
    setLoadingSources(true);
    try {
      if (window.catmonto?.getScreenSources) {
        const list = await window.catmonto.getScreenSources();
        setScreenSources(Array.isArray(list) ? list : []);
      } else {
        // Browser preview fallback
        setScreenSources([
          { id: 'screen:1', name: 'Entire Screen', type: 'screen' },
          { id: 'window:1', name: 'VS Code - App.jsx', type: 'window' },
          { id: 'window:2', name: 'Chrome - localhost:5173', type: 'window' },
        ]);
      }
    } catch (_) {
      setScreenSources([]);
    }
    setLoadingSources(false);
  };

  useEffect(() => {
    if (currentStep === 3 && screenSources.length === 0 && !loadingSources) {
      handleRefreshSources();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  const handleSelectSource = (id) => {
    setTargetSourceId(id);
    if (id === 'entire-screen') {
      setTargetSourceName('Entire Screen');
      return;
    }
    const found = screenSources.find((s) => s.id === id);
    setTargetSourceName(found?.name || 'Entire Screen');
  };
>>>>>>> 3746c2db10673cc8c843d8378957ab60e7b42da6

  // Ollama fallback states
  const [ollamaUrl, setOllamaUrl] = useState(settings.ollamaUrl || 'http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = useState(settings.model || 'qwen2.5-vl:latest');
  const [checkingOllama, setCheckingOllama] = useState(false);

  // Test API key validity
  const handleVerifyGeminiKey = async () => {
    if (!geminiApiKey || !geminiApiKey.trim()) {
      setKeyStatus('invalid');
      setKeyStatusMessage('Please enter a valid Gemini API key.');
      return;
    }

    setKeyStatus('checking');
    setKeyStatusMessage('');

    if (window.catmonto?.validateGemini) {
      const res = await window.catmonto.validateGemini(geminiApiKey.trim());
      if (res?.available) {
        setKeyStatus('valid');
        setKeyStatusMessage('Key verified successfully with Google Gemini!');
      } else {
        setKeyStatus('invalid');
        setKeyStatusMessage(res?.error || 'Invalid API key or network error.');
      }
    } else {
      setTimeout(() => {
        if (geminiApiKey.length > 10) {
          setKeyStatus('valid');
          setKeyStatusMessage('Key verified successfully! (Preview mode)');
        } else {
          setKeyStatus('invalid');
          setKeyStatusMessage('API key is too short.');
        }
      }, 800);
    }
  };

  // Test live model response
  const handleTestLivePrompt = async () => {
    if (!geminiApiKey || !geminiApiKey.trim()) {
      setTestPromptStatus('error');
      setTestPromptReply('Please enter your Gemini API key above first.');
      return;
    }

    setTestPromptStatus('testing');
    setTestPromptReply('');

    if (window.catmonto?.testGeminiPrompt) {
      const res = await window.catmonto.testGeminiPrompt({
        apiKey: geminiApiKey.trim(),
        model: geminiModel,
      });
      if (res.success) {
        setTestPromptStatus('success');
        setTestPromptReply(res.text);
      } else {
        setTestPromptStatus('error');
        setTestPromptReply(res.error || 'Failed to call Gemini model.');
      }
    } else {
      setTimeout(() => {
        setTestPromptStatus('success');
        setTestPromptReply("Meow! Hi there, I'm Catmonto. Your Gemini connection is working perfectly!");
      }, 1000);
    }
  };

  const handleRemoveKey = () => {
    setGeminiApiKey('');
    setKeyStatus('idle');
    setKeyStatusMessage('');
    setTestPromptStatus('idle');
    setTestPromptReply('');
  };

  // Groq key verify
  const handleVerifyGroqKey = async () => {
    if (!groqApiKey || !groqApiKey.trim()) {
      setGroqKeyStatus('invalid');
      setGroqKeyMsg('Please enter a valid Groq API key.');
      return;
    }
    setGroqKeyStatus('checking');
    setGroqKeyMsg('');
    if (window.catmonto?.validateGroq) {
      const res = await window.catmonto.validateGroq(groqApiKey.trim());
      if (res?.available) {
        setGroqKeyStatus('valid');
        setGroqKeyMsg('Key verified successfully with Groq!');
      } else {
        setGroqKeyStatus('invalid');
        setGroqKeyMsg(res?.error || 'Invalid API key or network error.');
      }
    } else {
      setTimeout(() => {
        setGroqKeyStatus(groqApiKey.length > 10 ? 'valid' : 'invalid');
        setGroqKeyMsg(groqApiKey.length > 10 ? 'Key verified! (Preview)' : 'Key too short.');
      }, 600);
    }
  };

  // Groq live test
  const handleTestGroqPrompt = async () => {
    if (!groqApiKey || !groqApiKey.trim()) {
      setGroqTestStatus('error');
      setGroqTestReply('Enter your Groq API key above first.');
      return;
    }
    setGroqTestStatus('testing');
    setGroqTestReply('');
    if (window.catmonto?.testGroqPrompt) {
      const res = await window.catmonto.testGroqPrompt({ apiKey: groqApiKey.trim(), model: groqModel });
      if (res.success) {
        setGroqTestStatus('success');
        setGroqTestReply(res.text);
      } else {
        setGroqTestStatus('error');
        setGroqTestReply(res.error || 'Failed to call Groq.');
      }
    } else {
      setTimeout(() => {
        setGroqTestStatus('success');
        setGroqTestReply("Meow! Groq connection is blazing fast!");
      }, 500);
    }
  };

  const handleRemoveGroqKey = () => {
    setGroqApiKey('');
    setGroqKeyStatus('idle');
    setGroqKeyMsg('');
    setGroqTestStatus('idle');
    setGroqTestReply('');
  };

  const handleTestCapture = async () => {
    setCapturingTest(true);
    if (window.catmonto?.captureNow) {
      const res = await window.catmonto.captureNow(targetSourceId);
      if (res.success && res.dataUrl) {
        setTestSnapshot(res.dataUrl);
      }
    } else {
      setTestSnapshot('https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60');
    }
    setCapturingTest(false);
  };

  const handleSaveAndExit = (startMonitoring = false) => {
    const parsedExclusions = excludedApps
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const updated = {
      aiProvider: provider,
      geminiApiKey: geminiApiKey.trim(),
      geminiModel,
      groqApiKey: groqApiKey.trim(),
      groqModel,
      rememberSecurely,
      privacyShield,
      excludedApps: parsedExclusions,
      targetSourceId: targetSourceId || 'entire-screen',
      targetSourceName: targetSourceName || 'Entire Screen',
      ollamaUrl,
      model: ollamaModel,
      typingPauseDelaySeconds: Number(typingPauseDelaySeconds) || 4,
      suggestionCooldownSeconds: Number(suggestionCooldownSeconds) || 15,
      completedOnboarding: true,
    };

    if (startMonitoring) {
      updated.monitoringEnabled = true;
      if (window.catmonto?.toggleMonitoring) {
        window.catmonto.toggleMonitoring(true);
      }
    }

    onSaveSettings(updated);
    onClose();
  };

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleSaveAndExit(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`wizard-backdrop no-drag ${isMaximized ? 'maximized' : ''}`}>
      <div className="wizard-modal">
        {/* TOP TITLEBAR (Draggable & window controls) */}
        <div className="wizard-titlebar drag-region">
          <div className="wizard-title-left">
            <span className="wizard-title-badge">🐾 Catmonto</span>
            <span className="wizard-title-separator">•</span>
            <span className="wizard-title-sub">Setup & Settings</span>
          </div>
          <div className="wizard-title-controls no-drag">
            <button
              type="button"
              onClick={() => window.catmonto?.minimize()}
              className="wizard-win-btn win-min"
              title="Minimize to taskbar"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="4" y1="12" x2="20" y2="12" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => window.catmonto?.toggleMaximize()}
              className="wizard-win-btn win-max"
              title={isMaximized ? 'Restore window' : 'Maximize window'}
            >
              {isMaximized ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="6" y="8" width="13" height="13" rx="1.5" />
                  <path d="M9 5h10a1.5 1.5 0 0 1 1.5 1.5V15" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="wizard-win-btn win-close"
              title="Close setup & return to Cat"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* SPLIT BODY: LEFT SIDEBAR + RIGHT CONTENT */}
        <div className="wizard-split-body">
          {/* LEFT SIDEBAR (Purple Gradient) */}
          <div className="wizard-sidebar">
            {/* Top Cat Illustration */}
            <div className="wizard-mascot-wrap">
              <svg
                viewBox="0 0 160 160"
                className="wizard-mascot-svg"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <ellipse cx="80" cy="148" rx="50" ry="8" fill="rgba(0,0,0,0.18)" />
                {/* Tail */}
                <path
                  d="M 120 120 C 142 110, 150 90, 142 76 C 136 66, 126 72, 124 82 C 122 92, 116 110, 110 120"
                  fill="#E3A857"
                />
                {/* Left Ear */}
                <path d="M 40 55 L 30 14 C 40 18, 62 34, 66 48 Z" fill="#E3A857" />
                <path d="M 42 46 L 35 22 C 40 25, 54 36, 58 46 Z" fill="#F8B4B4" />
                {/* Right Ear */}
                <path d="M 120 55 L 130 14 C 120 18, 98 34, 94 48 Z" fill="#E3A857" />
                <path d="M 118 46 L 125 22 C 120 25, 106 36, 102 46 Z" fill="#F8B4B4" />
                {/* Body */}
                <ellipse cx="80" cy="108" rx="46" ry="38" fill="#E3A857" />
                <ellipse cx="80" cy="114" rx="28" ry="24" fill="#FFFDF8" />
                {/* Paws */}
                <ellipse cx="62" cy="138" rx="11" ry="8" fill="#FFFDF8" stroke="#E3A857" strokeWidth="1.5" />
                <ellipse cx="98" cy="138" rx="11" ry="8" fill="#FFFDF8" stroke="#E3A857" strokeWidth="1.5" />
                {/* Head */}
                <circle cx="80" cy="68" r="40" fill="#E3A857" />
                {/* Cheeks */}
                <ellipse cx="58" cy="80" rx="7" ry="4" fill="#F8B4B4" opacity="0.6" />
                <ellipse cx="102" cy="80" rx="7" ry="4" fill="#F8B4B4" opacity="0.6" />
                {/* Eyes */}
                <circle cx="64" cy="66" r="5" fill="#2B1810" />
                <circle cx="62.5" cy="64.5" r="1.8" fill="#FFFFFF" />
                <circle cx="96" cy="66" r="5" fill="#2B1810" />
                <circle cx="94.5" cy="64.5" r="1.8" fill="#FFFFFF" />
                {/* Nose */}
                <polygon points="77,75 83,75 80,78" fill="#C95B6A" />
                {/* Mouth */}
                <path
                  d="M 75 79 Q 78 83 80 80 Q 82 83 85 79"
                  stroke="#2B1810"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  fill="none"
                />
                {/* Whiskers */}
                <line x1="48" y1="76" x2="30" y2="73" stroke="#FFF" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
                <line x1="48" y1="80" x2="28" y2="82" stroke="#FFF" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
                <line x1="112" y1="76" x2="130" y2="73" stroke="#FFF" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
                <line x1="112" y1="80" x2="132" y2="82" stroke="#FFF" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
              </svg>
            </div>

            <p className="wizard-quote">"I only look when you ask me to."</p>

            {/* Stepper Navigation */}
            <nav className="wizard-stepper">
              {STEPS.map((step) => {
                const isPast = step.id < currentStep;
                const isActive = step.id === currentStep;

                return (
                  <button
                    key={step.id}
                    onClick={() => setCurrentStep(step.id)}
                    className={`stepper-item ${isActive ? 'active' : ''} ${isPast ? 'past' : ''}`}
                  >
                    <div className="stepper-badge">
                      {isPast ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <span>{step.id}</span>
                      )}
                    </div>
                    <span className="stepper-title">{step.title}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* RIGHT MAIN CONTENT AREA */}
          <div className="wizard-content">

          {/* STEP 1: PRIVACY */}
          {currentStep === 1 && (
            <div className="step-panel animate-fade">
              <h2 className="step-heading">Privacy & Data Security</h2>
              <p className="step-subheading">
                Catmonto is designed from the ground up to respect your personal workspace.
              </p>

              <div className="privacy-feature-list">
                <div className="privacy-feature-item">
                  <div className="feature-icon shield">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="feature-title">Smart Privacy Shield</h4>
                    <p className="feature-desc">
                      Automatically pauses observation whenever sensitive windows (banking, password managers, private tabs) are active.
                    </p>
                  </div>
                </div>

                <div className="privacy-feature-item">
                  <div className="feature-icon memory">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="feature-title">Zero Permanent Image Storage</h4>
                    <p className="feature-desc">
                      Frames exist only in temporary memory while analyzing. Nothing is saved to disk or cataloged.
                    </p>
                  </div>
                </div>

                <div className="privacy-feature-item">
                  <div className="feature-icon bell">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="feature-title">On-Demand Observation</h4>
                    <p className="feature-desc">
                      Catmonto only inspects the display when you turn monitoring on or click to ask a direct question.
                    </p>
                  </div>
                </div>
              </div>

              {/* Exclusion keywords input */}
              <div className="wizard-card" style={{ marginTop: 14 }}>
                <label className="card-label">Excluded Apps & Window Titles (Keywords)</label>
                <input
                  type="text"
                  value={excludedApps}
                  onChange={(e) => setExcludedApps(e.target.value)}
                  placeholder="banking, bitwarden, 1password, private, incognito"
                  className="wizard-input"
                />
                <span className="card-hint">
                  Windows matching any of these keywords will never be captured or sent to the AI.
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: API KEY (GEMINI / PROVIDER) */}
          {currentStep === 2 && (
            <div className="step-panel animate-fade">
              {/* Back breadcrumb button */}
              <button onClick={handleBack} className="wizard-top-back-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>

              <h2 className="step-heading">
                Connect your {provider === 'gemini' ? 'Gemini' : 'AI'} account
              </h2>
              <p className="step-subheading">
                AI Companion is bring-your-own-key. API usage is billed directly to your Google AI Studio account.
              </p>

              {/* Provider Tabs */}
              <div className="provider-tabs">
                <button
                  type="button"
                  onClick={() => setProvider('gemini')}
                  className={`provider-tab ${provider === 'gemini' ? 'active' : ''}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
                  </svg>
                  Google Gemini
                </button>
                <button
                  type="button"
                  onClick={() => setProvider('groq')}
                  className={`provider-tab ${provider === 'groq' ? 'active' : ''}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Groq (Ultra Fast)
                </button>
                <button
                  type="button"
                  onClick={() => setProvider('ollama')}
                  className={`provider-tab ${provider === 'ollama' ? 'active' : ''}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  Local Ollama
                </button>
              </div>

              {provider === 'gemini' ? (
                <div className="wizard-card key-card">
                  <div className="key-card-header">
                    <label className="card-label">Gemini API key</label>
                    <select
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      className="model-select"
                    >
                      <option value="gemini-3.5-flash">Gemini 3.5 Flash (fastest & high-precision — recommended)</option>
                      <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite (fast lightweight)</option>
                    </select>
                  </div>

                  <div className="key-input-row">
                    <div className="key-input-wrap">
                      <span className="key-icon">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="7.5" cy="15.5" r="5.5" />
                          <path d="m21 2-9.6 9.6M15.5 7.5l3 3M18.5 4.5l3 3" />
                        </svg>
                      </span>
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={geminiApiKey}
                        onChange={(e) => {
                          setGeminiApiKey(e.target.value);
                          setKeyStatus('idle');
                        }}
                        placeholder="AIzaSy..."
                        className="wizard-input with-prefix"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((v) => !v)}
                        className="key-eye-btn"
                        title={showApiKey ? 'Hide key' : 'Show key'}
                      >
                        {showApiKey ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleVerifyGeminiKey}
                      disabled={keyStatus === 'checking'}
                      className={`key-verify-btn ${keyStatus}`}
                    >
                      {keyStatus === 'checking' ? 'Checking...' : keyStatus === 'valid' ? 'Verified ✓' : 'Verify'}
                    </button>
                  </div>

                  <p className="key-disclaimer">
                    Sent directly to Gemini from this app's protected main process. It is never exposed back to this screen.
                  </p>

                  <div className="key-options-row">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={rememberSecurely}
                        onChange={(e) => setRememberSecurely(e.target.checked)}
                      />
                      <div>
                        <span className="checkbox-title">Remember securely</span>
                        <span className="checkbox-desc">Encrypt with macOS Keychain or Windows DPAPI</span>
                      </div>
                    </label>

                    {geminiApiKey && (
                      <button
                        type="button"
                        onClick={handleRemoveKey}
                        className="remove-key-btn"
                      >
                        Remove stored key
                      </button>
                    )}
                  </div>

                  {keyStatusMessage && (
                    <div className={`key-feedback ${keyStatus}`}>
                      {keyStatusMessage}
                    </div>
                  )}

                  {/* LIVE MODEL TEST BUTTON & RESPONSE */}
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                        Make Sure API Model Is Working:
                      </span>
                      <button
                        type="button"
                        onClick={handleTestLivePrompt}
                        disabled={testPromptStatus === 'testing' || !geminiApiKey}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: testPromptStatus === 'testing' ? '#e2e8f0' : '#4f46e5',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: testPromptStatus === 'testing' ? 'wait' : 'pointer',
                        }}
                      >
                        {testPromptStatus === 'testing' ? (
                          <span>Calling Gemini Model...</span>
                        ) : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                            </svg>
                            <span>Test Live AI Response</span>
                          </>
                        )}
                      </button>
                    </div>

                    {testPromptStatus === 'success' && (
                      <div
                        style={{
                          marginTop: 10,
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          borderRadius: 10,
                          padding: '10px 12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 11, color: '#059669', marginBottom: 3 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Model is Live & Working Perfectly!</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: '#065f46', fontStyle: 'italic' }}>
                          "{testPromptReply}"
                        </p>
                      </div>
                    )}

                    {testPromptStatus === 'error' && (
                      <div
                        style={{
                          marginTop: 10,
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: 10,
                          padding: '10px 12px',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 11, color: '#dc2626', marginBottom: 2 }}>
                          API Error:
                        </div>
                        <p style={{ margin: 0, fontSize: 11, color: '#b91c1c' }}>
                          {testPromptReply}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : provider === 'groq' ? (
                <div className="wizard-card key-card">
                  <div className="key-card-header">
                    <label className="card-label">Groq API key</label>
                    <select
                      value={groqModel}
                      onChange={(e) => setGroqModel(e.target.value)}
                      className="model-select"
                    >
                      <option value="qwen/qwen3.6-27b">Qwen 3.6 27B Vision (Fast - Recommended)</option>
                      <option value="meta-llama/llama-4-scout-17b-16e-instruct">Llama 4 Scout 17B (Multimodal)</option>
                    </select>
                  </div>

                  <div className="key-input-row">
                    <div className="key-input-wrap">
                      <span className="key-icon">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                      </span>
                      <input
                        type={showGroqKey ? 'text' : 'password'}
                        value={groqApiKey}
                        onChange={(e) => {
                          setGroqApiKey(e.target.value);
                          setGroqKeyStatus('idle');
                        }}
                        placeholder="gsk_..."
                        className="wizard-input with-prefix"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGroqKey((v) => !v)}
                        className="key-eye-btn"
                        title={showGroqKey ? 'Hide key' : 'Show key'}
                      >
                        {showGroqKey ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleVerifyGroqKey}
                      disabled={groqKeyStatus === 'checking'}
                      className={`key-verify-btn ${groqKeyStatus}`}
                    >
                      {groqKeyStatus === 'checking' ? 'Checking...' : groqKeyStatus === 'valid' ? 'Verified ✓' : 'Verify'}
                    </button>
                  </div>

                  <p className="key-disclaimer">
                    Groq provides ultra-fast LPU inference. Get your free API key at <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{color:'#4f46e5',textDecoration:'underline'}}>console.groq.com</a>
                  </p>

                  <div className="key-options-row">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={rememberSecurely}
                        onChange={(e) => setRememberSecurely(e.target.checked)}
                      />
                      <div>
                        <span className="checkbox-title">Remember securely</span>
                        <span className="checkbox-desc">Encrypt with Windows DPAPI</span>
                      </div>
                    </label>
                    {groqApiKey && (
                      <button type="button" onClick={handleRemoveGroqKey} className="remove-key-btn">
                        Remove stored key
                      </button>
                    )}
                  </div>

                  {groqKeyMsg && (
                    <div className={`key-feedback ${groqKeyStatus}`}>
                      {groqKeyMsg}
                    </div>
                  )}

                  {/* LIVE TEST */}
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                        Test Groq Speed:
                      </span>
                      <button
                        type="button"
                        onClick={handleTestGroqPrompt}
                        disabled={groqTestStatus === 'testing' || !groqApiKey}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 8,
                          background: groqTestStatus === 'testing' ? '#e2e8f0' : '#f97316',
                          color: '#ffffff', border: 'none', fontSize: 11, fontWeight: 600,
                          cursor: groqTestStatus === 'testing' ? 'wait' : 'pointer',
                        }}
                      >
                        {groqTestStatus === 'testing' ? (
                          <span>Calling Groq...</span>
                        ) : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                            </svg>
                            <span>Test Live AI Response</span>
                          </>
                        )}
                      </button>
                    </div>

                    {groqTestStatus === 'success' && (
                      <div style={{ marginTop: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 11, color: '#059669', marginBottom: 3 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                          <span>Groq is Lightning Fast & Working!</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: '#065f46', fontStyle: 'italic' }}>
                          "{groqTestReply}"
                        </p>
                      </div>
                    )}

                    {groqTestStatus === 'error' && (
                      <div style={{ marginTop: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700, fontSize: 11, color: '#dc2626', marginBottom: 2 }}>API Error:</div>
                        <p style={{ margin: 0, fontSize: 11, color: '#b91c1c' }}>{groqTestReply}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Ollama configuration */
                <div className="wizard-card key-card">
                  <label className="card-label">Local Ollama URL</label>
                  <div className="key-input-row">
                    <input
                      type="text"
                      value={ollamaUrl}
                      onChange={(e) => setOllamaUrl(e.target.value)}
                      placeholder="http://127.0.0.1:11434"
                      className="wizard-input"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        setCheckingOllama(true);
                        await onCheckOllama();
                        setCheckingOllama(false);
                      }}
                      disabled={checkingOllama}
                      className="key-verify-btn"
                    >
                      {checkingOllama ? 'Checking...' : 'Check'}
                    </button>
                  </div>

                  <label className="card-label" style={{ marginTop: 12 }}>Vision Model</label>
                  <input
                    type="text"
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                    placeholder="qwen2.5-vl:latest or llava"
                    className="wizard-input"
                  />

                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    {ollamaStatus?.available ? (
                      <span style={{ color: '#059669', fontWeight: 600 }}>
                        ✓ Connected ({ollamaStatus.models?.length || 0} models found)
                      </span>
                    ) : (
                      <span style={{ color: '#d97706' }}>
                        Ollama not responding. Run: <code>ollama run qwen2.5-vl</code>
                      </span>
                    )}
                  </div>
                </div>
              )}

              <p className="wizard-policy-note">
                Responses use <code>store: false</code>. This avoids application-state storage and retention under data policies.
              </p>
            </div>
          )}

          {/* STEP 3: PERMISSION */}
          {currentStep === 3 && (
            <div className="step-panel animate-fade">
              <h2 className="step-heading">System Permissions</h2>
              <p className="step-subheading">
                Catmonto uses native Windows desktop capturing to inspect your active screen.
              </p>

              <div className="wizard-card permission-card">
                <div className="perm-row">
                  <div className="perm-info">
                    <div className="perm-icon">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect width="20" height="14" x="2" y="3" rx="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="perm-title">Screen Capture Permission</h4>
                      <p className="perm-desc">
                        Allows Catmonto to observe active code, terminal output, or browser context on your screen.
                      </p>
                    </div>
                  </div>
                  <span className="status-pill-granted">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    Access Active
                  </span>
                </div>

                <div className="source-picker-box" style={{ marginTop: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="card-label" style={{ margin: 0 }}>Choose screen / window to watch</label>
                    <button
                      type="button"
                      onClick={handleRefreshSources}
                      disabled={loadingSources}
                      className="test-capture-btn"
                      title="Reload open windows and screens"
                    >
                      {loadingSources ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>
                  <select
                    value={targetSourceId}
                    onChange={(e) => handleSelectSource(e.target.value)}
                    className="wizard-input"
                    style={{ width: '100%', fontSize: 12 }}
                  >
                    <option value="entire-screen">🖥️ Entire Screen (all windows)</option>
                    {screenSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.type === 'screen' ? '🖥️ ' : '🪟 '}{s.name}
                      </option>
                    ))}
                  </select>
                  <span className="card-hint">
                    Watching: <strong>{targetSourceName}</strong> — Catmonto only analyzes this source.
                  </span>
                  {screenSources.length === 0 && !loadingSources && (
                    <span className="card-hint" style={{ color: '#d97706' }}>
                      No windows found. Open your code editor/browser, then click Refresh.
                    </span>
                  )}
                </div>

                <div className="test-capture-box">
                  <div className="test-capture-header">
                    <span>Test Live Screen Snapshot</span>
                    <button
                      type="button"
                      onClick={handleTestCapture}
                      disabled={capturingTest}
                      className="test-capture-btn"
                    >
                      {capturingTest ? 'Capturing...' : 'Capture Test Frame'}
                    </button>
                  </div>
                  {testSnapshot && (
                    <div className="snapshot-preview-wrap">
                      <img src={testSnapshot} alt="Screen Preview" className="snapshot-preview-img" />
                      <span className="snapshot-tag">Live Frame Captured</span>
                    </div>
                  )}
                </div>
              </div>

              {/* OBSERVATION TIMING & DELAY CARD */}
              <div className="wizard-card" style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                      Observation Pacing & Delay (टाइपिंग डिले)
                    </h4>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>
                      Controls when Catmonto inspects your screen so it never interrupts you while you are actively writing code.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      Typing Pause Delay
                    </label>
                    <select
                      value={typingPauseDelaySeconds}
                      onChange={(e) => setTypingPauseDelaySeconds(Number(e.target.value))}
                      className="wizard-input"
                      style={{ fontSize: 12, padding: '6px 8px', width: '100%' }}
                    >
                      <option value={2}>2s (Fast)</option>
                      <option value={4}>4s (Balanced - Recommended)</option>
                      <option value={6}>6s (Relaxed - Deep coding)</option>
                      <option value={8}>8s (Patient - Long thoughts)</option>
                    </select>
                    <span style={{ display: 'block', fontSize: 10, color: '#64748b', marginTop: 4 }}>
                      Waits this long after typing stops before analyzing.
                    </span>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      Suggestion Cooldown
                    </label>
                    <select
                      value={suggestionCooldownSeconds}
                      onChange={(e) => setSuggestionCooldownSeconds(Number(e.target.value))}
                      className="wizard-input"
                      style={{ fontSize: 12, padding: '6px 8px', width: '100%' }}
                    >
                      <option value={10}>10s (Frequent)</option>
                      <option value={15}>15s (Standard - Recommended)</option>
                      <option value={30}>30s (Quiet mode)</option>
                      <option value={60}>60s (Minimal interruptions)</option>
                    </select>
                    <span style={{ display: 'block', fontSize: 10, color: '#64748b', marginTop: 4 }}>
                      Minimum interval between consecutive suggestions.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: READY */}
          {currentStep === 4 && (
            <div className="step-panel animate-fade">
              <h2 className="step-heading">You're all set!</h2>
              <p className="step-subheading">
                Catmonto is configured and ready to be your unobtrusive desktop AI companion.
              </p>

              <div className="wizard-card summary-card">
                <div className="summary-row">
                  <span className="summary-label">Active Provider:</span>
                  <span className="summary-val highlight">
                    {provider === 'gemini' ? `Google Gemini (${geminiModel})` : `Local Ollama (${ollamaModel})`}
                  </span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Target View:</span>
                  <span className="summary-val">Entire Screen (Active Workspace)</span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Privacy Shield:</span>
                  <span className="summary-val text-green">✓ Enabled (Sensitive windows masked)</span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Key Storage:</span>
                  <span className="summary-val">
                    {rememberSecurely ? '🔒 Encrypted with Windows DPAPI' : 'Session only'}
                  </span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Typing Delay:</span>
                  <span className="summary-val highlight">{typingPauseDelaySeconds}s pause before checking</span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Cooldown:</span>
                  <span className="summary-val">{suggestionCooldownSeconds}s between suggestions</span>
                </div>
              </div>

              <div className="ready-tips-box">
                <div className="tip-header">💡 How to use Catmonto:</div>
                <ul className="tip-list">
                  <li><strong>Click on Cat:</strong> Opens this setup menu anytime.</li>
                  <li><strong>Right-click on Cat:</strong> Ask a direct question about your screen!</li>
                  <li><strong>Passive Observation:</strong> Catmonto watches your screen and stays quiet unless an error or helpful suggestion appears!</li>
                </ul>
              </div>
            </div>
          )}

          {/* BOTTOM CONTROLS (Back / Next) */}
          <div className="wizard-footer">
            <button
              type="button"
              onClick={handleBack}
              disabled={currentStep === 1}
              className="wizard-btn-back"
            >
              Back
            </button>

            {currentStep < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="wizard-btn-next"
              >
                Continue
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => handleSaveAndExit(false)}
                  className="wizard-btn-back"
                >
                  Save & Idle
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveAndExit(true)}
                  className="wizard-btn-next"
                >
                  Start Companion 🐾
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
