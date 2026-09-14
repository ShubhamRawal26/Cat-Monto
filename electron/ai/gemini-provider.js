const { AIProvider } = require('./provider');
const { CAT_CONFIG } = require('../config/cat-config');
const { validateGeminiResponse, formatErrorNotification } = require('./response-validator');
const { GeminiLiveClient } = require('./gemini-live-client');

const REALTIME_ERROR_DETECTION_INSTRUCTION = `You are a high-precision real-time coding error detector watching a developer's code editor.
Your goal: detect REAL, DEFINITE syntax errors visible on screen and report them in structured JSON.

CRITICAL RULES TO PREVENT FALSE ALERTS & HALLUCINATIONS:
1. NEVER CLAIM A VARIABLE OR IDENTIFIER IS UNDECLARED OR UNINITIALIZED WITHOUT CHECKING ALL PRECEDING LINES:
   - Always read the entire visible function/block from the top before claiming an identifier is undeclared!
   - Example: if line 5 has "int x;", 'x' IS ALREADY DECLARED. Never claim 'x' is undeclared on subsequent lines!
2. USE EXACT GUTTER LINE NUMBERS:
   - Look at the line numbers printed on the left margin gutter in the editor (VS Code / IDE).
   - Use the EXACT line number shown in the gutter where the error actually is. Do not guess line numbers.
3. DETECT COMMON SYNTAX ERRORS & IDE RED SQUIGGLY UNDERLINES:
   - C / C++:
     * Invalid stream operators: 'cin' uses extraction operator '>>' (e.g. 'cin >> x;'). 'cin<<<x;' or 'cin<<x;' is a SYNTAX ERROR.
     * 'cout' uses insertion operator '<<' (e.g. 'cout << "hello";'). 'cout<"hello";' or 'cout>>' is a SYNTAX ERROR.
     * Empty control statements: 'if()' or 'while()' with empty parentheses is a SYNTAX ERROR.
     * Missing semicolons ';' at the end of statements.
     * Unmatched or unclosed braces '{' or '}'.
   - Python:
     * Missing colons ':', invalid indentation, unmatched parentheses.
   - HTML / XML:
     * Unclosed tags (<div> without </div>), misspelled tags (<sectio>, <divv>).
   - JavaScript / TypeScript:
     * Syntax errors, unbalanced brackets, unexpected tokens.
   - Terminal / Compiler Output:
     * If an active terminal or compiler output is visible at the bottom showing an error, pinpoint the error mentioned by the compiler.
4. DO NOT REPORT INCOMPLETE TOKENS WHERE USER IS CURRENTLY TYPING:
   - If the cursor is at the end of a line actively typing, ignore that single unfinished token. Focus on completed statements with errors.
5. IF CODE IS VALID OR CLEAN:
   - If previous errors have been visibly fixed or removed, return {"error": false}
- NEVER REPEAT PAST SUGGESTIONS: Analyze solely the current visible code. If an error was already fixed or is gone, return {"error": false}
- Do NOT report style/formatting/variable naming issues
- Keep 'title', 'message', and 'suggestion' ultra-concise (1 sentence each). Speed is critical.

Return ONLY valid JSON matching the schema. No markdown outside JSON.`;

const STRUCTURED_JSON_PROMPT = `Inspect the active code editor on screen for real syntax errors or red squiggly underlines.

If a definite syntax error exists on any line:
{
  "error": true,
  "severity": "high" | "medium",
  "language": string,
  "line": number (exact editor gutter line number),
  "title": string (e.g. "Invalid Stream Operator", "Empty Condition", "Missing Semicolon"),
  "message": string (1 concise sentence explaining the exact mistake),
  "suggestion": string (the exact fix, e.g. "Change 'cin<<<x;' to 'cin >> x;'")
}

If all code is valid, clean, or has no syntax errors:
{
  "error": false
}

Keep descriptions 1 brief sentence. Output ONLY valid JSON.`;


const GEMINI_MANUAL_ASK_PROMPT = `You are Catmonto, a professional AI programming assistant.
The user is asking a direct question about their screen.

INSTRUCTIONS:
1. Answer the user's question directly, accurately, and professionally without emojis.
2. If the user asks whether there is an error in their code or screen:
   - Carefully verify the visible code and terminal.
   - If there is NO error: State clearly: "Screen par koi error nahi hai. Code bilkul theek hai." (or in English: "No errors detected on screen. Code is clean.")
   - If there IS an error: Pinpoint the exact line number, explain the issue, and provide the exact fix without emojis.
3. If the user asks an instructional or debugging question:
   - Provide a direct, practical, concise answer in 2 to 3 sentences with code if applicable.
4. Tone: Professional, direct, helpful. NO EMOJIS.`;

class GeminiProvider extends AIProvider {
  constructor(options = {}) {
    super('gemini');
    this.apiKey = options.apiKey || '';
    const deprecated = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-lite-latest'];
    const initial = options.model || CAT_CONFIG.PRIMARY_GEMINI_MODEL;
    this.model = deprecated.includes(initial) ? 'gemini-3.5-flash' : initial;
    this.liveClient = new GeminiLiveClient({ apiKey: this.apiKey });
  }

  setApiKey(key) {
    this.apiKey = (key || '').trim();
    if (this.liveClient) {
      this.liveClient.setApiKey(this.apiKey);
    }
  }

  setModel(model) {
    const deprecated = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-lite-latest'];
    const chosen = model || CAT_CONFIG.PRIMARY_GEMINI_MODEL;
    this.model = deprecated.includes(chosen) ? 'gemini-3.5-flash' : chosen;
  }

  /**
   * Fast verification of Gemini API Key validity without generating heavy tokens.
   */
  async checkHealth(testKey = null) {
    const keyToTest = (testKey !== null ? testKey : this.apiKey || '').trim();
    if (!keyToTest) {
      return { available: false, error: 'No Gemini API key configured.' };
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(keyToTest)}`;
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(6000),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData?.error?.message || `Google API returned status ${response.status}`;
        return { available: false, error: msg };
      }

      const data = await response.json();
      const models = (data.models || []).map((m) => m.name.replace('models/', ''));
      return {
        available: true,
        models,
        activeModel: this.model,
      };
    } catch (err) {
      return {
        available: false,
        error: `Network error reaching Google Gemini: ${err.message}`,
      };
    }
  }

  /**
   * Multimodal vision analysis.
   * Fast Watch Mode: Returns validated structured JSON ({ error, severity, line, title, message, suggestion }).
   * Deep Explanation Mode: Detailed multi-line response for manual questions.
   */
  async analyzeScreen({ imageBase64, userPrompt, contextHint, isExhibitionMode = false }) {
    if (!this.apiKey) {
      throw new Error('Gemini API key is not configured. Please add it in settings.');
    }

    const tStart = Date.now();
    const isManualAsk = Boolean(userPrompt && userPrompt.trim().length > 0);
    const systemPrompt = isManualAsk ? GEMINI_MANUAL_ASK_PROMPT : REALTIME_ERROR_DETECTION_INSTRUCTION;

    // Remove data URL scheme prefix if present
    const cleanBase64 = (imageBase64 || '').replace(/^data:image\/[a-z]+;base64,/, '');

    let promptText;
    if (isManualAsk) {
      promptText = `User Question: "${userPrompt}"\nContext: ${contextHint || 'Desktop Workspace'}\nAnswer directly with exact line numbers and solutions. No emojis.`;
    } else {
      promptText = STRUCTURED_JSON_PROMPT;
    }

    const userParts = [{ text: promptText }];
    if (cleanBase64 && cleanBase64.length > 50) {
      userParts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: cleanBase64,
        },
      });
    }

    // Prioritized model chain: Fast-lite first, then fallback
    const primaryModel = this.model || CAT_CONFIG.PRIMARY_GEMINI_MODEL;
    const fallbackModel = primaryModel === CAT_CONFIG.PRIMARY_GEMINI_MODEL
      ? CAT_CONFIG.FALLBACK_GEMINI_MODEL
      : CAT_CONFIG.PRIMARY_GEMINI_MODEL;
    const modelsToTry = [...new Set([primaryModel, fallbackModel])];

    const generationConfig = {
      temperature: isManualAsk ? 0.2 : 0.0,
      maxOutputTokens: isManualAsk ? 512 : 180,
    };

    if (!isManualAsk) {
      generationConfig.responseMimeType = 'application/json';
    }

    let lastError = null;

    for (const modelToUse of modelsToTry) {
      const modelConfig = { ...generationConfig };

      const payload = {
        contents: [{ role: 'user', parts: userParts }],
        system_instruction: { parts: [{ text: systemPrompt }] },
        generationConfig: modelConfig,
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey.trim())}`;

      try {
        const netStart = Date.now();
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          const errMsg = errJson?.error?.message || `HTTP ${response.status}`;
          if (response.status === 400 || response.status === 404 || response.status === 429 || response.status === 503) {
            console.warn(`[GeminiProvider] ${modelToUse} returned ${response.status} (${errMsg}). Trying fallback...`);
            lastError = new Error(errMsg);
            continue;
          }
          throw new Error(errMsg);
        }

        // Parse SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let rawText = '';
        let firstTokenTime = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          if (!firstTokenTime) {
            firstTokenTime = Date.now() - netStart;
          }

          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
              const chunk = JSON.parse(jsonStr);
              const parts = chunk?.candidates?.[0]?.content?.parts || [];
              for (const p of parts) {
                if (p.text) rawText += p.text;
              }
            } catch {
              // skip malformed chunk
            }
          }

          // Early stream exit: in auto-watch mode, as soon as complete valid JSON is detected,
          // stop reading immediately to save 300-600ms socket teardown latency.
          if (!isManualAsk && rawText.includes('}')) {
            const trimmed = rawText.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
              try {
                const candidate = JSON.parse(trimmed);
                if (candidate && typeof candidate === 'object' && ('error' in candidate)) {
                  try { await reader.cancel(); } catch (_) {}
                  break;
                }
              } catch (_) {}
            }
          }
        }

        const networkElapsed = Date.now() - netStart;
        const totalElapsed = Date.now() - tStart;
        rawText = rawText.trim();

        if (isManualAsk) {
          return {
            suggestion: rawText,
            raw: rawText,
            activeModel: modelToUse,
            perf: { networkMs: networkElapsed, totalMs: totalElapsed, firstTokenMs: firstTokenTime },
          };
        }

        // Validate structured JSON response
        const validated = validateGeminiResponse(rawText);

        if (!validated.hasError) {
          return {
            hasError: false,
            suggestion: null,
            errorObj: null,
            fingerprint: null,
            raw: rawText,
            activeModel: modelToUse,
            perf: { networkMs: networkElapsed, totalMs: totalElapsed, firstTokenMs: firstTokenTime },
          };
        }

        const formattedText = formatErrorNotification(validated.errorObj, isExhibitionMode);

        return {
          hasError: true,
          suggestion: formattedText,
          errorObj: validated.errorObj,
          fingerprint: validated.fingerprint,
          raw: rawText,
          activeModel: modelToUse,
          perf: { networkMs: networkElapsed, totalMs: totalElapsed, firstTokenMs: firstTokenTime },
        };

      } catch (err) {
        lastError = err;
        console.warn(`[GeminiProvider] ${modelToUse} failed: ${err.message}. Trying next model...`);
        continue;
      }
    }

    console.error('[GeminiProvider] All models failed. Last error:', lastError?.message);
    throw lastError || new Error('All Gemini models failed.');
  }
}

module.exports = {
  GeminiProvider,
  REALTIME_ERROR_DETECTION_INSTRUCTION,
};
