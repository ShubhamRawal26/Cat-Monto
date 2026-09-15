const { desktopCapturer, screen } = require('electron');
const { exec } = require('child_process');
const { CAT_CONFIG } = require('../config/cat-config');

/**
 * Helper to query active application windows in the interactive console session on Windows.
 */
function getConsoleWindows() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve([]);

    exec('tasklist /v /fi "SESSIONNAME eq Console" /fo csv', { timeout: 3500 }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      try {
        const lines = stdout.split('\r\n').filter((l) => l.trim().length > 0);
        const windows = [];
        for (let i = 1; i < lines.length; i++) {
          const match = lines[i].match(
            /^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","(.*)"$/
          );
          if (match) {
            const [, imgName, pid, , , , , , , title] = match;
            const cleanTitle = (title || '').trim();
            if (
              cleanTitle &&
              cleanTitle !== 'N/A' &&
              cleanTitle !== 'OleMainThreadWndName' &&
              cleanTitle !== 'DWM Notification Window' &&
              cleanTitle !== 'OLEChannelWnd' &&
              cleanTitle !== 'Default IME' &&
              cleanTitle !== 'MSCTFIME UI' &&
              cleanTitle !== 'DesktopWindowXamlSource' &&
              cleanTitle !== 'New notification' &&
              cleanTitle !== 'Quick Settings' &&
              !cleanTitle.startsWith('Catmonto')
            ) {
              windows.push({
                id: `win:${pid}`,
                name: cleanTitle,
                appName: imgName.replace('.exe', ''),
                type: 'window',
              });
            }
          }
        }
        resolve(windows);
      } catch (e) {
        resolve([]);
      }
    });
  });
}

/**
 * Screen Capturer & Intelligent Change Detector
 * Supports capturing Entire Display, Specific Application Windows, or Cropped Code Regions.
 * Prevents redundant AI calls by computing quick thumbnail downscaled pixel differences.
 */
class ScreenCapturer {
  constructor(options = {}) {
    this.threshold = options.threshold || CAT_CONFIG.THUMBNAIL_DIFF_THRESHOLD;
    this.lastThumbnail = null;
    this.thumbnailSize = options.thumbnailSize || CAT_CONFIG.MICRO_THUMBNAIL_SIZE;
    this.captureRegion = options.captureRegion || CAT_CONFIG.CAPTURE_REGION;
    this.jpegQuality = options.jpegQuality || CAT_CONFIG.JPEG_QUALITY;
    this.maxWidth = options.maxWidth || CAT_CONFIG.CAPTURE_MAX_WIDTH;
    this.maxHeight = options.maxHeight || CAT_CONFIG.CAPTURE_MAX_HEIGHT;
  }

  setCaptureRegion(region) {
    this.captureRegion = region;
    this.lastThumbnail = null; // reset cache when region changes
  }

  /**
   * Get list of all capture sources (Screens + Open Windows)
   */
  async getAvailableSources() {
    let rawSources = [];

    // Attempt standard desktopCapturer first
    try {
      rawSources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 240, height: 135 },
        fetchWindowIcons: false,
      });
    } catch (err) {
      console.warn('[ScreenCapturer] desktopCapturer with thumbnails failed, retrying without:', err.message);
      try {
        rawSources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 0, height: 0 },
        });
      } catch (e) {
        console.error('[ScreenCapturer] desktopCapturer fallback error:', e.message);
      }
    }

    let formatted = (rawSources || [])
      .filter((s) => s.name && !s.name.includes('Taskbar') && !s.name.startsWith('Catmonto'))
      .map((s) => ({
        id: s.id,
        name: s.name,
        type: s.id.startsWith('window') ? 'window' : 'screen',
        thumbnail: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : null,
      }));

    // If desktopCapturer returned no window sources (known Windows 11 WGC quirk), augment with console process windows
    const hasWindows = formatted.some((s) => s.type === 'window');
    if (!hasWindows && process.platform === 'win32') {
      const consoleWins = await getConsoleWindows();
      for (const cw of consoleWins) {
        if (!formatted.some((s) => s.name.toLowerCase() === cw.name.toLowerCase())) {
          formatted.push({
            id: cw.id,
            name: cw.name,
            appName: cw.appName,
            type: 'window',
            thumbnail: null,
          });
        }
      }
    }

    return formatted;
  }

  /**
   * Capture active screen display or specific window using Electron desktopCapturer.
   * Returns full-res JPEG base64 and micro-thumbnail.
   */
  async captureScreen(targetSourceId = null, isErrorActive = false) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    const isTargetSpecific = Boolean(targetSourceId && targetSourceId !== 'entire-screen');

    let sources = [];
    const targetW = this.maxWidth || CAT_CONFIG.CAPTURE_MAX_WIDTH || 1280;
    const targetH = this.maxHeight || CAT_CONFIG.CAPTURE_MAX_HEIGHT || 720;

    try {
      // IMPORTANT: When capturing 'entire-screen', ONLY request type 'screen'.
      // Requesting 'window' type on Windows 11 triggers WGC capturer errors for every
      // uncapturable window (elevated/system windows), flooding the console and failing captures.
      const captureTypes = isTargetSpecific ? ['window', 'screen'] : ['screen'];
      sources = await desktopCapturer.getSources({
        types: captureTypes,
        thumbnailSize: { width: Math.min(width, targetW), height: Math.min(height, targetH) },
        fetchWindowIcons: false,
      });
    } catch (err) {
      console.warn('[ScreenCapturer] getSources failed, retrying screen-only:', err?.message || err);
      try {
        sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: Math.min(width, targetW), height: Math.min(height, targetH) },
          fetchWindowIcons: false,
        });
      } catch (e2) {
        console.error('[ScreenCapturer] screen-only fallback failed:', e2?.message || e2);
      }
    }

    if (!sources || sources.length === 0) {
      throw new Error('No screen or window sources found');
    }

    let source = sources[0];
    if (isTargetSpecific) {
      const matched = sources.find((s) => {
        if (s.id === targetSourceId) return true;
        const targetPid = targetSourceId.replace(/^(win:|window:)/, '').split(':')[0];
        const sPid = s.id.replace(/^(win:|window:)/, '').split(':')[0];
        return Boolean(targetPid && sPid && targetPid === sPid);
      });
      if (matched) {
        source = matched;
      }
    }

    const tCaptureStart = Date.now();
    let image = source.thumbnail;
    // If target window image is empty (e.g. minimized), fall back to primary screen display
    if (!image || image.isEmpty()) {
      const screenSource = sources.find((s) => s.id.startsWith('screen:')) || sources[0];
      if (screenSource && screenSource.thumbnail && !screenSource.thumbnail.isEmpty()) {
        source = screenSource;
        image = screenSource.thumbnail;
      }
    }

    if (!image || image.isEmpty()) {
      throw new Error('Screen capture image buffer is empty. Please ensure your desktop display is visible.');
    }

    const captureDurationMs = Date.now() - tCaptureStart;
    const tOptStart = Date.now();

    // Crop to focused code region if configured
    if (this.captureRegion && !image.isEmpty()) {
      const imgSize = image.getSize();
      const cropX = Math.max(0, Math.min(this.captureRegion.x || 0, imgSize.width - 20));
      const cropY = Math.max(0, Math.min(this.captureRegion.y || 0, imgSize.height - 20));
      const cropW = Math.min(this.captureRegion.width || imgSize.width, imgSize.width - cropX);
      const cropH = Math.min(this.captureRegion.height || imgSize.height, imgSize.height - cropY);
      if (cropW > 20 && cropH > 20) {
        image = image.crop({
          x: Math.round(cropX),
          y: Math.round(cropY),
          width: Math.round(cropW),
          height: Math.round(cropH),
        });
      }
    }

    // Generate downsampled thumbnail for lightning fast diffing
    const microThumb = image.resize({
      width: this.thumbnailSize.width,
      height: this.thumbnailSize.height,
      quality: 'fast',
    });

    const microBitmap = microThumb.toBitmap();
    const hasMeaningfulChange = this.detectChange(microBitmap, isErrorActive);

    // Save current as last
    this.lastThumbnail = microBitmap;
    const optimizeDurationMs = Date.now() - tOptStart;

    const jpegQuality = this.jpegQuality || 72;

    // Return result with lazy base64 encoding (only computed when AI analysis reads it)
    return {
      hasMeaningfulChange,
      image,
      _base64: null,
      get base64() {
        if (!this._base64) {
          this._base64 = image.toJPEG(jpegQuality).toString('base64');
        }
        return this._base64;
      },
      get dataUrl() {
        return `data:image/jpeg;base64,${this.base64}`;
      },
      width: image.getSize().width,
      height: image.getSize().height,
      name: source.name,
      sourceId: source.id,
      perf: {
        captureMs: captureDurationMs,
        optimizeMs: optimizeDurationMs,
      },
    };
  }

  /**
   * Compare micro-bitmap buffer with previous frame.
   * Accurately detects keystrokes while filtering stationary cursor blink noise.
   */
  detectChange(currentBitmap, isErrorActive = false) {
    if (!this.lastThumbnail || this.lastThumbnail.length !== currentBitmap.length) {
      return true; // First run or size changed -> trigger
    }

    let diffPixels = 0;
    const totalPixels = currentBitmap.length / 4; // RGBA 4 bytes per pixel

    for (let i = 0; i < currentBitmap.length; i += 4) {
      const dr = Math.abs(currentBitmap[i] - this.lastThumbnail[i]);
      const dg = Math.abs(currentBitmap[i + 1] - this.lastThumbnail[i + 1]);
      const db = Math.abs(currentBitmap[i + 2] - this.lastThumbnail[i + 2]);

      // If RGB channel delta exceeds noise tolerance (30 captures subtle syntax highlight changes)
      if (dr + dg + db > 30) {
        diffPixels++;
      }
    }

    const diffRatio = diffPixels / totalPixels;
    // When an error is active, require at least 15 pixels to filter stationary cursor blinking
    if (isErrorActive) {
      return diffPixels >= 15;
    }
    // Respect configured threshold (e.g. 0.04 in unit tests or CAT_CONFIG.THUMBNAIL_DIFF_THRESHOLD)
    return diffRatio >= this.threshold;
  }

  reset() {
    this.lastThumbnail = null;
  }
}

module.exports = { ScreenCapturer };
