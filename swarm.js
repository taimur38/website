"use strict";

/**
 * initSwarm(canvas, opts)
 * Starts a WebGL2 boid flocking simulation on the given <canvas>.
 * Returns { destroy } to tear down if needed.
 *
 * opts (all optional):
 *   numBoids, trailLen, sepRadius, aliRadius, cohRadius, connRadius,
 *   maxSpeed, minSpeed, sepWeight, aliWeight, cohWeight, randWeight,
 *   maxForce, cellSize, mouseRadius, mouseForce
 */
function initSwarm(canvas, opts = {}) {
  const NUM_BOIDS    = opts.numBoids   ?? 300;
  const TRAIL_LEN    = opts.trailLen   ?? 4;
  const SEP_RADIUS   = opts.sepRadius  ?? 25;
  const ALI_RADIUS   = opts.aliRadius  ?? 50;
  const COH_RADIUS   = opts.cohRadius  ?? 50;
  const CONN_RADIUS  = opts.connRadius ?? 40;
  const MAX_SPEED    = opts.maxSpeed   ?? 3.0;
  const MIN_SPEED    = opts.minSpeed   ?? 1.0;
  const SEP_WEIGHT   = opts.sepWeight  ?? 1.5;
  const ALI_WEIGHT   = opts.aliWeight  ?? 1.0;
  const COH_WEIGHT   = opts.cohWeight  ?? 1.0;
  const RAND_WEIGHT  = opts.randWeight ?? 0.15;
  const MAX_FORCE    = opts.maxForce   ?? 0.15;
  const CELL_SIZE    = opts.cellSize   ?? 50;
  const MOUSE_RADIUS = opts.mouseRadius ?? 120;
  const MOUSE_FORCE  = opts.mouseForce  ?? 3.0;

  // ── WebGL2 Setup ───────────────────────────────────────────
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) { canvas.parentElement.textContent = 'WebGL2 not supported'; return; }

  let W, H, dpr;
  let destroyed = false;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  // ── Color Parsing ──────────────────────────────────────────
  function parseCSSColor(varName) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    const d = document.createElement('div');
    d.style.color = v;
    document.body.appendChild(d);
    const c = getComputedStyle(d).color;
    document.body.removeChild(d);
    const m = c.match(/(\d+)/g);
    return m ? [+m[0]/255, +m[1]/255, +m[2]/255] : [0,0,0];
  }

  let fgColor, bgColor;
  function updateColors() {
    fgColor = parseCSSColor('--fg');
    bgColor = parseCSSColor('--bg');
  }
  updateColors();
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', updateColors);

  // ── Shader Compilation ─────────────────────────────────────
  function compileShader(src, type) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function createProgram(vsSrc, fsSrc) {
    const vs = compileShader(vsSrc, gl.VERTEX_SHADER);
    const fs = compileShader(fsSrc, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  // ── Shaders ────────────────────────────────────────────────
  const boidVS = `#version 300 es
    in vec2 a_vertex;
    in vec2 a_position;
    in float a_angle;
    in float a_alpha;
    uniform vec2 u_resolution;
    out float v_alpha;
    void main() {
      float c = cos(a_angle), s = sin(a_angle);
      mat2 rot = mat2(c, s, -s, c);
      vec2 pos = a_position + rot * a_vertex;
      vec2 clip = (pos / u_resolution) * 2.0 - 1.0;
      clip.y *= -1.0;
      gl_Position = vec4(clip, 0.0, 1.0);
      v_alpha = a_alpha;
    }
  `;

  const boidFS = `#version 300 es
    precision mediump float;
    uniform vec4 u_color;
    in float v_alpha;
    out vec4 fragColor;
    void main() {
      fragColor = vec4(u_color.rgb, u_color.a * v_alpha);
    }
  `;

  const lineVS = `#version 300 es
    in vec2 a_position;
    in float a_alpha;
    uniform vec2 u_resolution;
    out float v_alpha;
    void main() {
      vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
      clip.y *= -1.0;
      gl_Position = vec4(clip, 0.0, 1.0);
      v_alpha = a_alpha;
    }
  `;

  const lineFS = `#version 300 es
    precision mediump float;
    uniform vec4 u_color;
    in float v_alpha;
    out vec4 fragColor;
    void main() {
      fragColor = vec4(u_color.rgb, u_color.a * v_alpha);
    }
  `;

  const boidProg = createProgram(boidVS, boidFS);
  const lineProg = createProgram(lineVS, lineFS);

  // ── Locations ──────────────────────────────────────────────
  const bLoc = {
    a_vertex:     gl.getAttribLocation(boidProg, 'a_vertex'),
    a_position:   gl.getAttribLocation(boidProg, 'a_position'),
    a_angle:      gl.getAttribLocation(boidProg, 'a_angle'),
    a_alpha:      gl.getAttribLocation(boidProg, 'a_alpha'),
    u_resolution: gl.getUniformLocation(boidProg, 'u_resolution'),
    u_color:      gl.getUniformLocation(boidProg, 'u_color'),
  };

  const lLoc = {
    a_position:   gl.getAttribLocation(lineProg, 'a_position'),
    a_alpha:      gl.getAttribLocation(lineProg, 'a_alpha'),
    u_resolution: gl.getUniformLocation(lineProg, 'u_resolution'),
    u_color:      gl.getUniformLocation(lineProg, 'u_color'),
  };

  // ── Boid Triangle Template ─────────────────────────────────
  const BOID_VERTS = new Float32Array([0, -4, -2, 3, 2, 3]);

  // ── GPU Buffers ────────────────────────────────────────────
  const vertexBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuf);
  gl.bufferData(gl.ARRAY_BUFFER, BOID_VERTS, gl.STATIC_DRAW);

  const instanceData = new Float32Array(NUM_BOIDS * 4);
  const instanceBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
  gl.bufferData(gl.ARRAY_BUFFER, instanceData.byteLength, gl.DYNAMIC_DRAW);

  const MAX_LINE_VERTS = NUM_BOIDS * 20 + NUM_BOIDS * TRAIL_LEN * 2;
  const lineData = new Float32Array(MAX_LINE_VERTS * 3);
  const lineBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
  gl.bufferData(gl.ARRAY_BUFFER, lineData.byteLength, gl.DYNAMIC_DRAW);

  // ── Boid VAO ───────────────────────────────────────────────
  const boidVAO = gl.createVertexArray();
  gl.bindVertexArray(boidVAO);

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuf);
  gl.enableVertexAttribArray(bLoc.a_vertex);
  gl.vertexAttribPointer(bLoc.a_vertex, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
  gl.enableVertexAttribArray(bLoc.a_position);
  gl.vertexAttribPointer(bLoc.a_position, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribDivisor(bLoc.a_position, 1);
  gl.enableVertexAttribArray(bLoc.a_angle);
  gl.vertexAttribPointer(bLoc.a_angle, 1, gl.FLOAT, false, 16, 8);
  gl.vertexAttribDivisor(bLoc.a_angle, 1);
  gl.enableVertexAttribArray(bLoc.a_alpha);
  gl.vertexAttribPointer(bLoc.a_alpha, 1, gl.FLOAT, false, 16, 12);
  gl.vertexAttribDivisor(bLoc.a_alpha, 1);

  gl.bindVertexArray(null);

  // ── Line VAO ───────────────────────────────────────────────
  const lineVAO = gl.createVertexArray();
  gl.bindVertexArray(lineVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
  gl.enableVertexAttribArray(lLoc.a_position);
  gl.vertexAttribPointer(lLoc.a_position, 2, gl.FLOAT, false, 12, 0);
  gl.enableVertexAttribArray(lLoc.a_alpha);
  gl.vertexAttribPointer(lLoc.a_alpha, 1, gl.FLOAT, false, 12, 8);
  gl.bindVertexArray(null);

  // ── Boids State ────────────────────────────────────────────
  const boids = [];
  for (let i = 0; i < NUM_BOIDS; i++) {
    const trail = [];
    const px = Math.random() * W;
    const py = Math.random() * H;
    for (let t = 0; t < TRAIL_LEN; t++) trail.push(px, py);
    boids.push({
      x: px, y: py,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      trail: trail,
      trailIdx: 0,
    });
  }

  // ── Spatial Hash ───────────────────────────────────────────
  let gridCols, gridRows, grid;

  function buildGrid() {
    gridCols = Math.ceil(W / CELL_SIZE) || 1;
    gridRows = Math.ceil(H / CELL_SIZE) || 1;
    const totalCells = gridCols * gridRows;
    if (!grid || grid.length !== totalCells) {
      grid = new Array(totalCells);
      for (let i = 0; i < totalCells; i++) grid[i] = [];
    } else {
      for (let i = 0; i < totalCells; i++) grid[i].length = 0;
    }
    for (let i = 0; i < NUM_BOIDS; i++) {
      const b = boids[i];
      const col = Math.min(Math.floor(b.x / CELL_SIZE), gridCols - 1);
      const row = Math.min(Math.floor(b.y / CELL_SIZE), gridRows - 1);
      grid[row * gridCols + col].push(i);
    }
  }

  function* neighbors(bi) {
    const b = boids[bi];
    const col = Math.min(Math.floor(b.x / CELL_SIZE), gridCols - 1);
    const row = Math.min(Math.floor(b.y / CELL_SIZE), gridRows - 1);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = (row + dr + gridRows) % gridRows;
        const c = (col + dc + gridCols) % gridCols;
        const cell = grid[r * gridCols + c];
        for (let k = 0; k < cell.length; k++) {
          const j = cell[k];
          if (j !== bi) yield j;
        }
      }
    }
  }

  function wrapDelta(d, size) {
    if (d > size * 0.5) return d - size;
    if (d < -size * 0.5) return d + size;
    return d;
  }

  // ── Mouse Tracking ─────────────────────────────────────────
  let mouseX = -1000, mouseY = -1000;

  function onMouseMove(e) { mouseX = e.clientX; mouseY = e.clientY; }
  function onMouseLeave() { mouseX = -1000; mouseY = -1000; }
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);

  // ── Physics Step ───────────────────────────────────────────
  function step() {
    buildGrid();
    for (let i = 0; i < NUM_BOIDS; i++) {
      const b = boids[i];
      let sepX = 0, sepY = 0, sepCount = 0;
      let aliX = 0, aliY = 0, aliCount = 0;
      let cohX = 0, cohY = 0, cohCount = 0;

      for (const j of neighbors(i)) {
        const o = boids[j];
        const dx = wrapDelta(o.x - b.x, W);
        const dy = wrapDelta(o.y - b.y, H);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.001) continue;

        if (dist < SEP_RADIUS) { sepX -= dx / dist; sepY -= dy / dist; sepCount++; }
        if (dist < ALI_RADIUS) { aliX += o.vx; aliY += o.vy; aliCount++; }
        if (dist < COH_RADIUS) { cohX += dx; cohY += dy; cohCount++; }
      }

      let ax = 0, ay = 0;

      if (sepCount > 0) { ax += (sepX / sepCount) * SEP_WEIGHT; ay += (sepY / sepCount) * SEP_WEIGHT; }
      if (aliCount > 0) {
        const avgVx = aliX / aliCount, avgVy = aliY / aliCount;
        ax += (avgVx - b.vx) * ALI_WEIGHT * 0.1;
        ay += (avgVy - b.vy) * ALI_WEIGHT * 0.1;
      }
      if (cohCount > 0) {
        ax += (cohX / cohCount) * COH_WEIGHT * 0.01;
        ay += (cohY / cohCount) * COH_WEIGHT * 0.01;
      }

      // Mouse avoidance
      const mdx = b.x - mouseX, mdy = b.y - mouseY;
      const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
      if (mDist < MOUSE_RADIUS && mDist > 0.1) {
        const strength = (1 - mDist / MOUSE_RADIUS) * MOUSE_FORCE;
        ax += (mdx / mDist) * strength;
        ay += (mdy / mDist) * strength;
      }

      // Random perturbation
      ax += (Math.random() - 0.5) * RAND_WEIGHT;
      ay += (Math.random() - 0.5) * RAND_WEIGHT;

      // Clamp force
      const fMag = Math.sqrt(ax * ax + ay * ay);
      if (fMag > MAX_FORCE) { ax = (ax / fMag) * MAX_FORCE; ay = (ay / fMag) * MAX_FORCE; }

      b.vx += ax; b.vy += ay;

      // Clamp speed
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (speed > MAX_SPEED) { b.vx = (b.vx / speed) * MAX_SPEED; b.vy = (b.vy / speed) * MAX_SPEED; }
      else if (speed < MIN_SPEED && speed > 0.001) { b.vx = (b.vx / speed) * MIN_SPEED; b.vy = (b.vy / speed) * MIN_SPEED; }

      // Update trail
      const ti = b.trailIdx * 2;
      b.trail[ti] = b.x; b.trail[ti + 1] = b.y;
      b.trailIdx = (b.trailIdx + 1) % TRAIL_LEN;

      // Move
      b.x += b.vx; b.y += b.vy;

      // Edge wrapping
      if (b.x < 0) b.x += W; else if (b.x >= W) b.x -= W;
      if (b.y < 0) b.y += H; else if (b.y >= H) b.y -= H;
    }
  }

  // ── Build GPU Data ─────────────────────────────────────────
  function buildBuffers() {
    for (let i = 0; i < NUM_BOIDS; i++) {
      const b = boids[i];
      const off = i * 4;
      instanceData[off]     = b.x * dpr;
      instanceData[off + 1] = b.y * dpr;
      instanceData[off + 2] = Math.atan2(b.vy, b.vx) + Math.PI * 0.5;
      instanceData[off + 3] = 0.6;
    }

    let li = 0;

    // Connections
    for (let i = 0; i < NUM_BOIDS; i++) {
      const b = boids[i];
      for (const j of neighbors(i)) {
        if (j <= i) continue;
        const o = boids[j];
        const dx = wrapDelta(o.x - b.x, W);
        const dy = wrapDelta(o.y - b.y, H);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONN_RADIUS && dist > 0.001) {
          if (li + 6 > MAX_LINE_VERTS * 3) break;
          const alpha = 0.03 + (1 - dist / CONN_RADIUS) * 0.09;
          lineData[li++] = b.x * dpr; lineData[li++] = b.y * dpr; lineData[li++] = alpha;
          lineData[li++] = (b.x + dx) * dpr; lineData[li++] = (b.y + dy) * dpr; lineData[li++] = alpha;
        }
      }
    }

    // Trails
    for (let i = 0; i < NUM_BOIDS; i++) {
      const b = boids[i];
      let prevX = -1, prevY = -1;
      for (let t = 0; t < TRAIL_LEN; t++) {
        const idx = ((b.trailIdx + t) % TRAIL_LEN) * 2;
        const tx = b.trail[idx], ty = b.trail[idx + 1];
        if (prevX >= 0) {
          const dx = Math.abs(tx - prevX), dy = Math.abs(ty - prevY);
          if (dx < W * 0.5 && dy < H * 0.5 && li + 6 <= MAX_LINE_VERTS * 3) {
            const alphaStart = 0.05 + (t / TRAIL_LEN) * 0.10;
            const alphaEnd   = 0.05 + ((t + 1) / TRAIL_LEN) * 0.10;
            lineData[li++] = prevX * dpr; lineData[li++] = prevY * dpr; lineData[li++] = alphaStart;
            lineData[li++] = tx * dpr; lineData[li++] = ty * dpr; lineData[li++] = alphaEnd;
          }
        }
        prevX = tx; prevY = ty;
      }
      if (prevX >= 0) {
        const dx = Math.abs(b.x - prevX), dy = Math.abs(b.y - prevY);
        if (dx < W * 0.5 && dy < H * 0.5 && li + 6 <= MAX_LINE_VERTS * 3) {
          lineData[li++] = prevX * dpr; lineData[li++] = prevY * dpr; lineData[li++] = 0.15;
          lineData[li++] = b.x * dpr; lineData[li++] = b.y * dpr; lineData[li++] = 0.15;
        }
      }
    }

    return li / 3;
  }

  // ── Render ─────────────────────────────────────────────────
  function render() {
    if (destroyed) return;
    step();
    const numLineVerts = buildBuffers();

    const scaledVerts = new Float32Array(BOID_VERTS.length);
    for (let i = 0; i < BOID_VERTS.length; i++) scaledVerts[i] = BOID_VERTS[i] * dpr;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, scaledVerts);

    const cw = canvas.width, ch = canvas.height;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (numLineVerts > 0) {
      gl.useProgram(lineProg);
      gl.uniform2f(lLoc.u_resolution, cw, ch);
      gl.uniform4f(lLoc.u_color, fgColor[0], fgColor[1], fgColor[2], 1.0);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineData.subarray(0, numLineVerts * 3));
      gl.bindVertexArray(lineVAO);
      gl.drawArrays(gl.LINES, 0, numLineVerts);
      gl.bindVertexArray(null);
    }

    gl.useProgram(boidProg);
    gl.uniform2f(bLoc.u_resolution, cw, ch);
    gl.uniform4f(bLoc.u_color, fgColor[0], fgColor[1], fgColor[2], 1.0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData);
    gl.bindVertexArray(boidVAO);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, NUM_BOIDS);
    gl.bindVertexArray(null);

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);

  return {
    destroy() {
      destroyed = true;
      window.removeEventListener('resize', resize);
      mql.removeEventListener('change', updateColors);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    }
  };
}
