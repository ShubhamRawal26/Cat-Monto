import React, { useState, useEffect } from 'react';

/**
 * Remove all emojis to maintain a clean, professional developer interface
 */
function stripEmojis(str) {
  if (!str) return '';
  return str
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
    .trim();
}

/**
 * Parses structured AI suggestions into clean segments:
 * - Line / Location badge
 * - Error description
 * - Fix / Solution snippet
 */
function parseSuggestion(rawText) {
  const clean = stripEmojis(rawText);

  let locationBadge = null;
  let errorText = clean;
  let fixText = null;

  // Check for [Line 102] or [Terminal] or [System]
  const badgeMatch = clean.match(/^\[(Line\s*\d+|Terminal|System|Error)\]/i);
  if (badgeMatch) {
    locationBadge = badgeMatch[1];
    errorText = clean.substring(badgeMatch[0].length).trim();
  } else {
    // Check for "Line 102:" format
    const lineMatch = clean.match(/^Line\s*(\d+)[\s:]+/i);
    if (lineMatch) {
      locationBadge = `Line ${lineMatch[1]}`;
      errorText = clean.substring(lineMatch[0].length).trim();
    }
  }

  // Check for "Fix:" or "Solution:" divider
  const fixSplit = errorText.split(/\n(?:\s*(?:Fix|Solution):\s*)/i);
  if (fixSplit.length > 1) {
    errorText = fixSplit[0].replace(/^(?:Error:\s*)/i, '').trim();
    fixText = fixSplit.slice(1).join('\n').trim();
  } else {
    const inlineFixMatch = errorText.match(/^(.*?)(?:\s+(?:Fix|Solution):\s+)(.*)$/is);
    if (inlineFixMatch) {
      errorText = inlineFixMatch[1].replace(/^(?:Error:\s*)/i, '').trim();
      fixText = inlineFixMatch[2].trim();
    }
  }

  return { locationBadge, errorText, fixText, clean };
}

/**
 * Render text with inline markdown code tags `code` and **bold**
 */
function renderFormattedText(text) {
  if (!text) return null;
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <strong key={i} className="bubble-inline-code">
          {part.slice(1, -1)}
        </strong>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={i} className="bubble-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

/**
 * Professional SpeechBubble component with beautiful typography, bold error fixes,
 * and 1-click Fix Code / Undo Fix buttons
 */
export default function SpeechBubble({
  text,
  onDismiss,
  autoDismissMs = 30000,
  onHeightChange,
  modelName,
}) {
  const [copied, setCopied] = useState(false);
  const [isFixApplied, setIsFixApplied] = useState(false);
  const [fixStatusMsg, setFixStatusMsg] = useState('');
  const cardRef = React.useRef(null);

  // Auto-dismiss after configured dwell time (defaults to 30s)
  useEffect(() => {
    if (!text || autoDismissMs <= 0) return;
    const timer = setTimeout(() => {
      if (onDismiss) onDismiss();
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [text, autoDismissMs, onDismiss]);

  // Dynamically measure bubble height so Electron window expands to fit without cutoff
  useEffect(() => {
    if (!cardRef.current || !onHeightChange) return;

    const reportHeight = () => {
      if (cardRef.current) {
        const height = cardRef.current.offsetHeight;
        if (height > 0) {
          onHeightChange(height);
        }
      }
    };

    reportHeight();

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const h = Math.ceil(entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height);
          if (h > 0) {
            onHeightChange(h);
          }
        }
      });
      observer.observe(cardRef.current);
    }

    return () => {
      if (observer) observer.disconnect();
    };
  }, [text, onHeightChange, isFixApplied, fixStatusMsg]);

  if (!text) return null;

  const { locationBadge, errorText, fixText, clean } = parseSuggestion(text);

  const formattedModel = modelName
    ? modelName
        .replace(/^models\//, '')
        .replace(/-latest$/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Gemini Flash';

  const handleCopyFix = async (e) => {
    e.stopPropagation();
    const textToCopy = fixText || clean;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  const handleApplyFix = async (e) => {
    e.stopPropagation();
    const textToApply = fixText || clean;
    if (!textToApply) return;

    if (!isFixApplied) {
      // 1. Copy to clipboard
      try {
        await navigator.clipboard.writeText(textToApply);
      } catch (_) {}

      // 2. Trigger native paste into active editor
      if (window.catmonto?.applyFix) {
        await window.catmonto.applyFix(textToApply);
      }

      setIsFixApplied(true);
      setFixStatusMsg('Applied! (Pasted to editor)');
      setTimeout(() => setFixStatusMsg(''), 3000);
    } else {
      // 3. Revert / Undo change in editor
      if (window.catmonto?.undoFix) {
        await window.catmonto.undoFix();
      }

      setIsFixApplied(false);
      setFixStatusMsg('Reverted! (Ctrl+Z restored)');
      setTimeout(() => setFixStatusMsg(''), 3000);
    }
  };

  return (
    <div ref={cardRef} className="bubble-card no-drag">
      {/* Sleek Header */}
      <div className="bubble-header">
        <div className="bubble-meta-left">
          <span className="bubble-brand">Catmonto</span>
          {formattedModel && (
            <span className="bubble-model-badge" title={`Active AI Model: ${formattedModel}`}>
              {formattedModel}
            </span>
          )}
          {locationBadge && (
            <span className="bubble-badge-pill">
              {locationBadge}
            </span>
          )}
        </div>

        <div className="bubble-actions">
          {fixText && (
            <button
              type="button"
              onClick={handleCopyFix}
              className="bubble-copy-btn"
              title="Copy fix to clipboard"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onDismiss}
            className="bubble-close-btn"
            title="Dismiss notification"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Structured Content */}
      <div className="bubble-content">
        {fixText ? (
          <>
            <div className="bubble-error-desc">
              {renderFormattedText(errorText)}
            </div>
            <div className="bubble-fix-container">
              <div className="bubble-fix-header">
                <div className="bubble-fix-label">Suggested Fix:</div>
                <button
                  type="button"
                  onClick={handleApplyFix}
                  className={`bubble-fix-action-btn ${isFixApplied ? 'is-applied' : ''}`}
                  title={isFixApplied ? "Click to revert code changes (Ctrl+Z)" : "Click to apply fix directly to code editor (Ctrl+V)"}
                >
                  {isFixApplied ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                      </svg>
                      <span>Undo Fix</span>
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                      <span>Fix Code</span>
                    </>
                  )}
                </button>
              </div>
              <div className="bubble-fix-code">
                {renderFormattedText(fixText)}
              </div>
              {fixStatusMsg && (
                <div className={`bubble-status-toast ${isFixApplied ? 'toast-success' : 'toast-undo'}`}>
                  {fixStatusMsg}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bubble-plain-text">
            {renderFormattedText(clean)}
            {clean && !clean.includes('no errors') && !clean.includes('clean') && clean.length > 5 && (
              <div className="bubble-plain-action-row">
                <button
                  type="button"
                  onClick={handleApplyFix}
                  className={`bubble-fix-action-btn ${isFixApplied ? 'is-applied' : ''}`}
                >
                  {isFixApplied ? 'Undo Fix' : 'Fix Code'}
                </button>
                {fixStatusMsg && (
                  <span className="bubble-inline-status">{fixStatusMsg}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bubble-arrow" />
    </div>
  );
}
