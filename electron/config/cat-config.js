/**
 * Catmonto Centralized Configuration
 * Controls performance thresholds, frame rates, debounce timings, and exhibition mode.
 */
const CAT_CONFIG = {
  // Capture Loop interval in milliseconds (400ms = 2.5 frames/sec)
  SCREEN_CAPTURE_INTERVAL_MS: 400,

  // Debounce: how long user must pause typing before AI is called (500ms)
  TYPING_DEBOUNCE_MS: 500,

  // Change detection sensitivity threshold on micro-grid (0.0003 = ~3 pixels diff)
  THUMBNAIL_DIFF_THRESHOLD: 0.0003,

  // Micro-thumbnail grid dimensions for instant difference comparison
  MICRO_THUMBNAIL_SIZE: { width: 128, height: 72 },

  // Capture Image downsample bounds (1280x720 ensures code fonts, brackets, and line numbers are razor-sharp)
  CAPTURE_MAX_WIDTH: 1280,
  CAPTURE_MAX_HEIGHT: 720,
  JPEG_QUALITY: 78,

  // Optional custom capture crop region { x, y, width, height }
  // When null, captures full primary display or active target source
  CAPTURE_REGION: null,

  // Gemini AI Models: Use Gemini 3.5 Flash for high-speed, state-of-the-art vision & zero hallucinations
  PRIMARY_GEMINI_MODEL: 'gemini-3.5-flash',
  FALLBACK_GEMINI_MODEL: 'gemini-3.5-flash-lite',

  // Rate-limit backoff timeout in milliseconds (30s)
  RATE_LIMIT_BACKOFF_MS: 30000,

  // Exhibition mode: faster animations, concise friendly messages, highlighted cards
  EXHIBITION_MODE: false,

  // Performance logging in console (set false to reduce noise)
  DEBUG_PERF: false,
};

module.exports = { CAT_CONFIG };
