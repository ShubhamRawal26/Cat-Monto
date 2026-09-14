/**
 * Catmonto Structured Response Validator & Error Fingerprinter
 * Validates JSON schema from Gemini AI and produces consistent error signatures
 * to prevent repeated alerts.
 */

function cleanJsonString(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();
  // Strip markdown code fences if model enclosed JSON in ```json ... ```
  if (str.startsWith('```')) {
    str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return str.trim();
}

/**
 * Validate and sanitize structured Gemini response
 * @param {string|object} rawResponse
 * @returns {{ valid: boolean, hasError: boolean, errorObj: object|null, fingerprint: string|null }}
 */
function validateGeminiResponse(rawResponse) {
  if (!rawResponse) {
    return { valid: false, hasError: false, errorObj: null, fingerprint: null };
  }

  let data = null;
  if (typeof rawResponse === 'object') {
    data = rawResponse;
  } else {
    const cleaned = cleanJsonString(rawResponse);
    try {
      data = JSON.parse(cleaned);
    } catch (err) {
      // If freeform text was returned (e.g. from fallback or older prompt)
      // Attempt extraction of [Line X] Error: ... Fix: ...
      const lineMatch = cleaned.match(/\[Line\s*(\d+)\]\s*(?:(?:HTML|CSS|JS|Syntax)?\s*Error:)?\s*(.*?)(?:\n\s*Fix:\s*(.*))?$/is);
      if (lineMatch) {
        data = {
          error: true,
          line: parseInt(lineMatch[1], 10),
          title: 'Syntax Issue',
          message: (lineMatch[2] || '').trim(),
          suggestion: (lineMatch[3] || '').trim(),
          severity: 'medium',
          language: 'code',
        };
      } else if (cleaned.toUpperCase().includes('NO_SUGGESTION')) {
        return { valid: true, hasError: false, errorObj: null, fingerprint: null };
      } else {
        return { valid: false, hasError: false, errorObj: null, fingerprint: null };
      }
    }
  }

  // Schema validation
  if (!data || typeof data !== 'object') {
    return { valid: false, hasError: false, errorObj: null, fingerprint: null };
  }

  // If explicit error: false -> clean code, no error
  if (data.error === false) {
    return { valid: true, hasError: false, errorObj: null, fingerprint: null };
  }

  if (data.error === true) {
    const line = typeof data.line === 'number' ? data.line : parseInt(data.line, 10) || null;
    const title = typeof data.title === 'string' ? data.title.trim() : 'Code Error';
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    const suggestion = typeof data.suggestion === 'string' ? data.suggestion.trim() : '';
    const language = typeof data.language === 'string' ? data.language.toLowerCase().trim() : 'code';
    const severity = ['high', 'medium', 'low'].includes(data.severity) ? data.severity : 'medium';

    // Reject empty / vague structured answers, but do not throw away a real
    // compiler or editor error merely because the vision model could not read
    // the tiny gutter number or omitted a separate "suggestion" field.
    // The UI can still show the model's message in that case.
    if (!message) {
      return { valid: false, hasError: false, errorObj: null, fingerprint: null };
    }

    const sanitizedError = {
      error: true,
      line,
      title,
      message,
      suggestion,
      language,
      severity,
    };

    // Calculate unique fingerprint for deduplication
    const cleanMsgShort = message.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
    const cleanTitleShort = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const fingerprint = `${language}:${line || 0}:${cleanTitleShort}:${cleanMsgShort}`;

    return {
      valid: true,
      hasError: true,
      errorObj: sanitizedError,
      fingerprint,
    };
  }

  return { valid: false, hasError: false, errorObj: null, fingerprint: null };
}

/**
 * Format a validated error object into a clean, concise notification message
 * Supports Exhibition Mode formatting (short, punchy) and standard developer format.
 */
function formatErrorNotification(errorObj, isExhibitionMode = false) {
  if (!errorObj) return '';

  const loc = errorObj.line ? `Line ${errorObj.line}` : 'Terminal';

  if (isExhibitionMode) {
    // Punchy, friendly, immediate reaction for exhibition audience
    return `[${loc}] ${errorObj.title}: ${errorObj.message}\nFix: ${errorObj.suggestion || 'Check syntax'}`;
  }

  // Clean, professional developer format (zero emojis)
  let text = `[${loc}] ${errorObj.title}: ${errorObj.message}`;
  if (errorObj.suggestion) {
    text += `\nFix: ${errorObj.suggestion}`;
  }
  return text;
}

module.exports = {
  validateGeminiResponse,
  formatErrorNotification,
  cleanJsonString,
};
