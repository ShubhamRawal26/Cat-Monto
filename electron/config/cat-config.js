/**
 * Catmonto Centralized Configuration
 * Controls performance thresholds, frame rates, debounce timings, and exhibition mode.
 */
const CAT_CONFIG = {
  // Capture Loop interval in milliseconds (500ms = 2 checks/sec)
  SCREEN_CAPTURE_INTERVAL_MS: 500,

  // Smart Debounce: wait until user has paused typing for 750ms before calling AI
  TYPING_DEBOUNCE_MS: 750,

  // Change detection sensitivity: 0.003 ignores cursor blinking while detecting real code changes
  THUMBNAIL_DIFF_THRESHOLD: 0.003,

  // Micro-thumbnail grid dimensions for instant difference comparison
  MICRO_THUMBNAIL_SIZE: { width: 128, height: 72 },

  // Optimized capture bounds: 1024x576 at quality 68 is ultra-sharp for code but cuts token/data size by 55%
  CAPTURE_MAX_WIDTH: 1024,
  CAPTURE_MAX_HEIGHT: 576,
  JPEG_QUALITY: 68,

  // Optional custom capture crop region { x, y, width, height }
  CAPTURE_REGION: null,

  // Gemini AI Models: Use Gemini 2.0 Flash (official production model with high-speed vision)
  PRIMARY_GEMINI_MODEL: 'gemini-2.0-flash',
  FALLBACK_GEMINI_MODEL: 'gemini-1.5-flash',

  // Rate-limit backoff timeout in milliseconds (15s)
  RATE_LIMIT_BACKOFF_MS: 15000,

  // Exhibition mode: faster animations, concise friendly messages, highlighted cards
  EXHIBITION_MODE: false,

  // Performance logging in console (set false to reduce noise)
  DEBUG_PERF: false,
};

module.exports = { CAT_CONFIG };
