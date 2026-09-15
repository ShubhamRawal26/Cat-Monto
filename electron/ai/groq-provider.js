const { AIProvider } = require('./provider');
const { validateGeminiResponse, formatErrorNotification } = require('./response-validator');

const GROQ_SYSTEM_INSTRUCTION = `You are a high-precision, ultra-fast real-time coding error detector watching a developer's screen.
Your goal: detect REAL, DEFINITE syntax errors visible on screen and report them in structured JSON.

CRITICAL RULES:
1. NEVER claim an identifier is undeclared without checking earlier lines in the function or file.
2. Look at the exact gutter line number in the IDE/editor.
3. Detect clear syntax errors: missing semicolons, unmatched braces/parentheses, invalid operators, broken tags.
4. If code is clean or has no definite syntax errors, return {"error": false}.
5. Keep explanations ultra-concise (1 sentence).

Return ONLY valid JSON matching this schema:
If error:
{
  "error": true,
  "severity": "high" | "medium",
  "language": string,
  "line": number,
  "title": string,
  "message": string,
  "suggestion": string
}
If no error:
{
  "error": false
}

Output ONLY valid JSON. No markdown wrapper.`;

const GROQ_MANUAL_ASK_SYSTEM = `You are Catmonto, an ultra-fast AI desktop coding companion.
CRITICAL RULES:
1. Maximum 1 or 2 short sentences total. Strictly under 30 words.
2. NO GREETINGS. NO INTROS ("Based on your screen..."). NO FLUFF. NO EMOJIS.
3. If user asks about errors:
   - If error exists: "Line <num>: <concise error>. Fix: <concise fix>."
   - If code is clean: "Screen par koi error nahi hai. Code clean hai."
4. If general question: give the direct 1-line answer immediately.`;

class GroqProvider extends AIProvider {
  constructor(options = {}) {
    super('groq');
    this.apiKey = (options.apiKey || '').trim();
    this.model = options.model || 'qwen/qwen3.6-27b';
    this.baseUrl = 'https://api.groq.com/openai/v1';
  }

  setApiKey(key) {
    this.apiKey = (key || '').trim();
  }

  setModel(model) {
    if (model && model.trim()) {
      this.model = model.trim();
    }
  }

  async checkHealth(testKey = null) {
    const key = (testKey !== null ? testKey : this.apiKey || '').trim();
    if (!key) {
      return { available: false, error: 'No Groq API key configured.' };
    }

    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          available: false,
          error: data?.error?.message || `Groq returned status ${res.status}`,
        };
      }

      const data = await res.json();
      const models = (data.data || []).map((m) => m.id);
      return { available: true, models };
    } catch (err) {
      return { available: false, error: err.message || 'Failed to connect to Groq.' };
    }
  }

  async analyzeScreen({ imageBase64, userPrompt, contextHint }) {
    if (!this.apiKey) {
      throw new Error('Groq API key is not configured. Please add it in settings.');
    }

    const tStart = Date.now();
    const isManualAsk = Boolean(userPrompt && userPrompt.trim());

    const systemPrompt = isManualAsk ? GROQ_MANUAL_ASK_SYSTEM : GROQ_SYSTEM_INSTRUCTION;
    const userText = isManualAsk
      ? `User question: "${userPrompt.trim()}"\nContext: ${contextHint || 'Desktop screen'}`
      : `Inspect the code visible in this screen capture for definite syntax errors. Context: ${contextHint || 'Desktop'}. Return JSON only.`;

    const userContent = [];
    if (userText) {
      userContent.push({ type: 'text', text: userText });
    }

    if (imageBase64 && imageBase64.trim()) {
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${cleanBase64}`,
        },
      });
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    const bodyPayload = {
      model: this.model || 'qwen/qwen3.6-27b',
      messages,
      temperature: 0.1,
      max_tokens: 100,
    };

    if (!isManualAsk) {
      bodyPayload.response_format = { type: 'json_object' };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(8000),
    });

    const networkMs = Date.now() - tStart;

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const msg = errData?.error?.message || `Groq API returned HTTP ${response.status}`;
      throw new Error(msg);
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content || '';

    if (isManualAsk) {
      return {
        hasError: false,
        suggestion: rawText.trim(),
        raw: rawText,
        activeModel: `Groq (${this.model})`,
        perf: { networkMs },
      };
    }

    const validation = validateGeminiResponse(rawText);
    if (!validation.hasError || !validation.errorObj) {
      return {
        hasError: false,
        suggestion: null,
        errorObj: null,
        fingerprint: null,
        raw: rawText,
        activeModel: `Groq (${this.model})`,
        perf: { networkMs },
      };
    }

    const formattedText = formatErrorNotification(validation.errorObj, false);
    return {
      hasError: true,
      suggestion: formattedText,
      errorObj: validation.errorObj,
      fingerprint: validation.fingerprint,
      raw: rawText,
      activeModel: `Groq (${this.model})`,
      perf: { networkMs },
    };
  }
}

module.exports = { GroqProvider };
