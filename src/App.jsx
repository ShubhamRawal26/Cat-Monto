import React, { useState, useEffect } from 'react';
import CatCharacter from './components/Cat/CatCharacter';
import SpeechBubble from './components/SpeechBubble/SpeechBubble';
import AskCatInput from './components/AskCat/AskCatInput';
import SetupWizardModal from './components/Wizard/SetupWizardModal';

export default function App() {
  const [catState, setCatState] = useState('sleeping'); // 'sleeping' (no errors) | 'attention' | 'speaking' | 'thinking' | 'idle'
  const [fsmState, setFsmState] = useState('WATCHING');
  const [suggestion, setSuggestion] = useState(null);
  const [activeModel, setActiveModel] = useState('gemini-3.5-flash');
  const [bubbleHeight, setBubbleHeight] = useState(190);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [showAskInput, setShowAskInput] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [settings, setSettings] = useState({});
  const [ollamaStatus, setOllamaStatus] = useState({ available: false });

  // Load initial settings and status from Electron preload bridge
  useEffect(() => {
    if (window.catmonto) {
      window.catmonto
        .getSettings()
        .then((s) => {
          setSettings(s || {});
          setIsMonitoring(Boolean(s?.monitoringEnabled));
          if (s?.geminiModel) {
            setActiveModel(s.geminiModel);
          }
        })
        .catch((err) => console.warn('[App] getSettings error:', err));

      window.catmonto
        .checkOllama()
        .then((status) => {
          setOllamaStatus(status);
        })
        .catch((err) => console.warn('[App] checkOllama error:', err));

      // Listen for suggestions from background screen analysis (errors in code)
      const unsubscribeSuggestion = window.catmonto.onSuggestion((data) => {
        if (data?.resolved) {
          setSuggestion(null);
          setCatState('attention');
          setTimeout(() => setCatState('sleeping'), 1500);
          return;
        }
        if (data?.text) {
          setSuggestion(data.text);
          if (data?.model) {
            setActiveModel(data.model);
          }
          setCatState('speaking');
        }
      });

      // Listen for cat animation state changes
      const unsubscribeState = window.catmonto.onStateChange((state) => {
        setCatState(state || 'sleeping');
      });

      // Listen for Cat FSM state changes
      const unsubscribeFsm = window.catmonto.onFsmStateChange?.((state) => {
        if (state) setFsmState(state);
      });

      return () => {
        unsubscribeSuggestion();
        unsubscribeState();
        unsubscribeFsm?.();
      };
    }
  }, []);

  // Dynamically adapt window size so Catmonto only occupies the exact space needed
  useEffect(() => {
    if (!window.catmonto?.setWindowSize) return;

    if (isWizardOpen) {
      window.catmonto.setWindowSize(780, 560, false);
    } else if (suggestion) {
      // Dynamic height: measured bubble height + cat wrapper (~145px) + drag bar/margins (~35px)
      // Clamped between 330px and 480px to fit any error without clipping
      const targetHeight = Math.min(480, Math.max(330, (bubbleHeight || 190) + 180));
      window.catmonto.setWindowSize(330, targetHeight, false);
    } else if (showAskInput) {
      window.catmonto.setWindowSize(280, 220, false);
    } else {
      window.catmonto.setWindowSize(190, 175, false);
    }
  }, [isWizardOpen, suggestion, bubbleHeight, showAskInput]);

  const openWizard = () => {
    setIsWizardOpen(true);
  };

  const closeWizard = () => {
    setIsWizardOpen(false);
  };

  const handleToggleMonitoring = async () => {
    const nextState = !isMonitoring;
    setIsMonitoring(nextState);
    if (window.catmonto) {
      await window.catmonto.toggleMonitoring(nextState);
    }
    if (nextState) {
      setSuggestion("Observation enabled! I'll sleep quietly and wake up whenever an error appears in your code.");
      setCatState('attention');
      setTimeout(() => {
        setCatState('sleeping');
        setSuggestion(null);
      }, 3500);
    } else {
      setSuggestion(null);
      setCatState('sleeping');
      window.catmonto?.clearError?.();
    }
  };

  const handleAskCat = async (query) => {
    setIsAsking(true);
    setCatState('thinking');
    if (window.catmonto) {
      const res = await window.catmonto.askCat(query);
      setIsAsking(false);
      if (res.success && res.text) {
        setSuggestion(res.text);
        setCatState('speaking');
      } else if (res.error) {
        setSuggestion(`Oops: ${res.error}`);
        setCatState('speaking');
      }
    } else {
      // Mock browser reply
      setTimeout(() => {
        setIsAsking(false);
        setSuggestion(`I checked your screen: no errors found! Going back to sleep.`);
        setCatState('speaking');
        setTimeout(() => setCatState('sleeping'), 3500);
      }, 1000);
    }
  };

  // Quick toggle to simulate a code error and test cat wake-up
  const handleClearError = () => {
    setSuggestion(null);
    setCatState('sleeping');
    window.catmonto?.clearError?.();
  };

  const handleSaveSettings = async (newSettings) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
    if (window.catmonto) {
      await window.catmonto.updateSettings(newSettings);
      if (newSettings.monitoringEnabled !== undefined) {
        setIsMonitoring(Boolean(newSettings.monitoringEnabled));
      }
      if (newSettings.aiProvider === 'ollama') {
        const status = await window.catmonto.checkOllama();
        setOllamaStatus(status);
      }
    }
  };

  const handleCheckOllama = async () => {
    if (window.catmonto) {
      const status = await window.catmonto.checkOllama();
      setOllamaStatus(status);
      return status;
    }
    return { available: false };
  };

  const hasActiveError = Boolean(suggestion) || catState === 'attention' || catState === 'speaking';

  return (
    <div className={`app-container ${isWizardOpen ? 'wizard-active' : ''}`}>
      {/* Draggable handle bar at top (compact cat mode) */}
      {!isWizardOpen && (
        <div className="drag-handle-bar drag-region" title="Drag to move Catmonto">
          <div className="drag-pill" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.catmonto?.minimize();
            }}
            className="cat-min-btn no-drag"
            title="Minimize Cat to taskbar"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      )}

      {/* Speech Bubble / Suggestions */}
      {!isWizardOpen && suggestion && (
        <SpeechBubble
          text={suggestion}
          modelName={activeModel}
          onHeightChange={(h) => setBubbleHeight(h)}
          onDismiss={() => {
            setSuggestion(null);
            setCatState('sleeping');
            window.catmonto?.clearError?.();
          }}
        />
      )}

      {/* Ask Cat manual input */}
      {!isWizardOpen && showAskInput && (
        <AskCatInput
          isLoading={isAsking}
          onAsk={handleAskCat}
          onClose={() => setShowAskInput(false)}
        />
      )}

      {/* Main Cat (Click = Settings, Right-click = Ask) */}
      {!isWizardOpen && (
        <div
          className="cat-wrapper no-drag"
          onContextMenu={(e) => {
            e.preventDefault();
            setShowAskInput((prev) => !prev);
          }}
          title="Click for Settings • Right-click to Ask"
        >
          <CatCharacter
            state={catState}
            hasError={hasActiveError}
            onCatClick={openWizard}
          />

          {/* Simple actions: Ask + Watch + status (only when active) */}
          {/* Floating Quick Action buttons */}
          <div className="cat-quick-actions no-drag">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowAskInput((prev) => !prev);
              }}
              className="quick-action-pill ask-pill"
              title="Ask Cat about your screen"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Ask</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleMonitoring();
              }}
              className={`quick-action-pill toggle-watch-pill ${isMonitoring ? 'is-watching' : 'is-paused'}`}
              title={isMonitoring ? 'Watching screen (click to pause)' : 'Paused (click to watch)'}
            >
              {isMonitoring ? (
                <>
                  <span className="watch-pulse-dot" />
                  <span>Watch</span>
                </>
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                  <span>Paused</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Multi-step Setup & Settings Wizard matching reference UI */}
      {isWizardOpen && (
        <SetupWizardModal
          isOpen={isWizardOpen}
          onClose={closeWizard}
          settings={settings}
          onSaveSettings={handleSaveSettings}
          onCheckOllama={handleCheckOllama}
          ollamaStatus={ollamaStatus}
        />
      )}
    </div>
  );
}
