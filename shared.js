/* ── shared.js — canvas + color utilities for taimur.sh ──── */

var site = (function () {
  var dpr = window.devicePixelRatio || 1;
  var colors = {};

  function readColors() {
    var s = getComputedStyle(document.documentElement);
    colors.fg = s.getPropertyValue('--fg').trim();
    colors.muted = s.getPropertyValue('--muted').trim();
    colors.border = s.getPropertyValue('--border').trim();
    colors.accent = s.getPropertyValue('--accent').trim();
  }
  readColors();
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors);
  }

  /* ── Visibility-based animation gating ─────────────────── */
  var _visMap = new Map();
  var _restartMap = new Map();

  var _observer = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var el = entry.target;
      var wasVisible = _visMap.get(el);
      _visMap.set(el, entry.isIntersecting);
      if (entry.isIntersecting && !wasVisible) {
        var cb = _restartMap.get(el);
        if (cb) {
          _restartMap.delete(el);
          requestAnimationFrame(cb);
        }
      }
    }
  }, { threshold: 0.01 });

  /**
   * Start observing an element for visibility.
   * Called automatically by initCanvas.
   */
  function observe(el) {
    _visMap.set(el, true);
    _observer.observe(el);
  }

  /**
   * Schedule next animation frame only if the element is visible.
   * When the element scrolls back into view, the callback fires automatically.
   * @param {HTMLElement|string} elOrId - element or its id
   * @param {Function} fn - draw callback
   */
  function requestFrame(elOrId, fn) {
    var el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (_visMap.get(el) !== false) {
      requestAnimationFrame(fn);
    } else {
      _restartMap.set(el, fn);
    }
  }

  /**
   * Initialize a square canvas at a given logical size.
   * Returns { canvas, ctx, size }. Automatically observes for visibility.
   */
  function initCanvas(id, size) {
    var c = document.getElementById(id);
    if (!c) return null;
    var sz = size || 200;
    c.width = sz * dpr;
    c.height = sz * dpr;
    c.style.width = sz + 'px';
    c.style.height = sz + 'px';
    var ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    observe(c);
    return { canvas: c, ctx: ctx, size: sz };
  }

  /**
   * 3D rotation around X then Y axes, returns [x2d, y2d].
   */
  function rotateXY(x, y, z, ax, ay) {
    var ca = Math.cos(ax), sa = Math.sin(ax);
    var y1 = y * ca - z * sa;
    var z1 = y * sa + z * ca;
    var cb = Math.cos(ay), sb = Math.sin(ay);
    var x2 = x * cb + z1 * sb;
    return [x2, y1];
  }

  return {
    dpr: dpr,
    colors: colors,
    readColors: readColors,
    initCanvas: initCanvas,
    rotateXY: rotateXY,
    observe: observe,
    requestFrame: requestFrame
  };
})();
