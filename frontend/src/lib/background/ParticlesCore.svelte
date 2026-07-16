<script>
  import { onMount, onDestroy, tick } from 'svelte';

  export let hermesOnline = false;
  export let openclawOnline = false;
  export let openPencilRunning = false;
  export let apiKeyActive = 0;
  export let dockerActive = 0;
  export let rotationTrigger = 0;

  let canvas;
  let ctx;
  let chars = [];
  let planets = [];
  let stormNodes = [];
  let bolts = [];
  let mouse = { x: -2000, y: -2000, radius: 180 };
  let animationId;
  let w, h;
  let time = 0;
  let resizeTimer;
  let spinVelocity = 0;
  let lineDashOffset = 0;
  let prevRotationTrigger = 0;
  const TRACER_COUNT = 3;

  const MAX_CHARS = 500;
  const MATRIX_GLYPH =
    'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
    'ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ' +
    '0123456789ABCDEF';

  const PLANET_CONFIG = [
    { name: 'Hermes', radOffset: 15, speed: 0.003, size: 4.5, startAngle: 0 },
    { name: 'OpenClaw', radOffset: 45, speed: -0.004, size: 4, startAngle: 1.2 },
    { name: 'OpenPencil', radOffset: 75, speed: 0.002, size: 4, startAngle: 2.8 },
    { name: 'API Keys', radOffset: 105, speed: -0.005, size: 3.5, startAngle: 4.1 },
    { name: 'Docker', radOffset: 135, speed: 0.0035, size: 3.5, startAngle: 5.3 },
  ];

  const STORM_COUNT = 14;
  const BOLT_DIST = 180;
  const BOLT_DIST_SQ = BOLT_DIST * BOLT_DIST;
  const MAX_BOLTS = 18;

  function getPlanetColor(idx) {
    const s = [hermesOnline, openclawOnline, openPencilRunning, apiKeyActive > 0, dockerActive > 0][idx];
    if (s) return '#4ade80';
    if (s === false) return '#fb7185';
    return '#c8a44e';
  }

  // ── Matrix chars (sin cambios) ──
  class MatrixChar {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.glyph = MATRIX_GLYPH[Math.floor(Math.random() * MATRIX_GLYPH.length)];
      this.brightness = 0.5 + Math.random() * 0.5;
      this.size = 14 + Math.random() * 5;
      this.changeInterval = 10 + Math.floor(Math.random() * 40);
      this.counter = Math.floor(Math.random() * this.changeInterval);
      this.spring = 0.08 + Math.random() * 0.04;
      this.tx = x;
      this.ty = y;
    }

    update() {
      const dx = mouse.x - this.x;
      const dy = mouse.y - this.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < mouse.radius * mouse.radius) {
        const dist = Math.sqrt(distSq);
        const angle = Math.atan2(dy, dx);
        const force = (mouse.radius - dist) / mouse.radius * 3.5;
        this.x -= Math.cos(angle) * force;
        this.y -= Math.sin(angle) * force;
      }
      this.x += (this.tx - this.x) * this.spring;
      this.y += (this.ty - this.y) * this.spring;

      this.counter++;
      if (this.counter >= this.changeInterval) {
        this.glyph = MATRIX_GLYPH[Math.floor(Math.random() * MATRIX_GLYPH.length)];
        this.changeInterval = 8 + Math.floor(Math.random() * 35);
        this.counter = 0;
        this.brightness = 0.6 + Math.random() * 0.4;
      }
    }

    draw(ctx) {
      const base = ctx.shadowBlur;
      if (this.brightness > 0.5) {
        ctx.shadowColor = 'rgba(74, 222, 128, 0.3)';
        ctx.shadowBlur = 10;
      }
      ctx.font = `${this.size}px "Courier New", "Consolas", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(74, 222, 128, ${this.brightness})`;
      ctx.fillText(this.glyph, this.x, this.y);
      ctx.shadowBlur = base;
    }
  }

  // ── Storm nodes orbiting like a graph ──
  class StormNode {
    constructor() {
      this.angle = Math.random() * Math.PI * 2;
      this.baseRadius = 200;
      this.speed = (0.003 + Math.random() * 0.009) * (Math.random() > 0.5 ? 1 : -1);
      this.oscRad = 15 + Math.random() * 35;
      this.oscSpeed = 0.008 + Math.random() * 0.025;
      this.phase = Math.random() * Math.PI * 2;
      this.size = 1.5 + Math.random() * 2.5;
      this.bright = 0.6 + Math.random() * 0.4;
      this.hue = 220 + Math.random() * 40;
    }

    update(cx, cy) {
      this.angle += this.speed;
      this.phase += this.oscSpeed;
      const r = this.baseRadius + Math.sin(this.phase) * this.oscRad;
      this.x = cx + Math.cos(this.angle) * r;
      this.y = cy + Math.sin(this.angle) * r;
    }

    draw(ctx) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${this.hue}, 70%, 80%, ${this.bright * 0.9})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 4, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${this.hue}, 60%, 70%, ${this.bright * 0.15})`;
      ctx.fill();
    }
  }

  // ── Lightning bolt between nodes ──
  class LightningBolt {
    constructor(x1, y1, x2, y2, intensity) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const segs = 5 + Math.floor(Math.random() * 6);
      const perpX = dist > 0.5 ? -dy / dist : 0;
      const perpY = dist > 0.5 ? dx / dist : 1;
      const jitter = dist * (0.04 + Math.random() * 0.04);
      this.points = [{ x: x1, y: y1 }];
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        this.points.push({
          x: x1 + dx * t + perpX * (Math.random() - 0.5) * jitter * 2,
          y: y1 + dy * t + perpY * (Math.random() - 0.5) * jitter * 2,
        });
      }
      this.points.push({ x: x2, y: y2 });
      this.life = 1;
      this.decay = 0.018 + Math.random() * 0.025;
      this.intensity = Math.min(1, intensity);
    }

    update() { this.life -= this.decay; }

    isDead() { return this.life <= 0; }

    draw(ctx) {
      if (this.life <= 0) return;
      const a = this.life * this.intensity;

      ctx.beginPath();
      ctx.moveTo(this.points[0].x, this.points[0].y);
      for (let i = 1; i < this.points.length; i++) {
        ctx.lineTo(this.points[i].x, this.points[i].y);
      }

      ctx.strokeStyle = `rgba(200, 210, 255, ${a * 0.12})`;
      ctx.lineWidth = 8 + this.intensity * 10;
      ctx.stroke();

      ctx.strokeStyle = `rgba(210, 220, 255, ${a * 0.35})`;
      ctx.lineWidth = 3 + this.intensity * 3;
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 255, 255, ${a * 0.8})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // ── Init ──
  function initStorm() {
    const maxR = Math.min(w, h) * 0.35;
    const minR = Math.min(w, h) * 0.15;
    stormNodes = [];
    bolts = [];
    for (let i = 0; i < STORM_COUNT; i++) {
      const node = new StormNode();
      node.baseRadius = minR + Math.random() * (maxR - minR);
      stormNodes.push(node);
    }
  }

  function initChars() {
    ctx.clearRect(0, 0, w, h);
    const fontSize = Math.min(w, h) * 0.18;
    ctx.font = `700 ${fontSize}px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText('AXISPANEL', w / 2, h / 2);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const grid = Math.max(14, Math.round(18 * (w / 1920)));
    chars = [];

    for (let y = 0; y < h; y += grid) {
      for (let x = 0; x < w; x += grid) {
        if (chars.length >= MAX_CHARS) break;
        if (data[(y * w + x) * 4 + 3] > 128) {
          chars.push(new MatrixChar(x, y));
        }
      }
      if (chars.length >= MAX_CHARS) break;
    }

    const base = Math.min(w, h) * 0.24;
    planets = PLANET_CONFIG.map((c, i) => ({
      ...c,
      angle: c.startAngle,
      radius: base + c.radOffset,
    }));

    initStorm();
  }

  // ── Frame ──
  function animate() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.09)';
    ctx.fillRect(0, 0, w, h);
    time++;
    const cx = w / 2;
    const cy = h / 2;

    // storm — update positions
    for (const n of stormNodes) n.update(cx, cy);

    // storm — generate bolts
    if (time % 2 === 0 && bolts.length < MAX_BOLTS) {
      for (let i = 0; i < stormNodes.length; i++) {
        for (let j = i + 1; j < stormNodes.length; j++) {
          if (bolts.length >= MAX_BOLTS) break;
          const a = stormNodes[i], b = stormNodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < BOLT_DIST_SQ && Math.random() < 0.08) {
            const intensity = 1 - Math.sqrt(distSq) / BOLT_DIST;
            bolts.push(new LightningBolt(a.x, a.y, b.x, b.y, intensity));
          }
        }
        if (bolts.length >= MAX_BOLTS) break;
      }
    }

    // storm — draw bolts
    for (const b of bolts) b.draw(ctx);

    // storm — draw nodes
    for (const n of stormNodes) n.draw(ctx);

    // matrix text
    for (let i = 0; i < chars.length; i++) {
      chars[i].update();
      chars[i].draw(ctx);
    }

    // spin trigger
    if (rotationTrigger !== prevRotationTrigger) {
      spinVelocity = 0.3;
      prevRotationTrigger = rotationTrigger;
    }
    if (spinVelocity > 0.001) {
      lineDashOffset += spinVelocity;
      spinVelocity *= 0.97;
    } else {
      spinVelocity = 0;
    }

    // orbit lines (planets background)
    for (const p of planets) {
      ctx.beginPath();
      ctx.arc(cx, cy, p.radius, 0, Math.PI * 2);
      if (spinVelocity > 0.001) {
        ctx.setLineDash([5, 20]);
        ctx.lineDashOffset = -lineDashOffset * 10;
        ctx.strokeStyle = 'rgba(200, 164, 78, 0.25)';
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(200, 164, 78, 0.12)';
      }
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // tracer particles on orbits during spin
    if (spinVelocity > 0.001) {
      for (let i = 0; i < planets.length; i++) {
        const p = planets[i];
        const color = getPlanetColor(i);
        const tracerSpeed = spinVelocity * 8;
        for (let t = 0; t < TRACER_COUNT; t++) {
          const a = lineDashOffset * 12 + (t / TRACER_COUNT) * Math.PI * 2;
          const tx = cx + Math.cos(a) * p.radius;
          const ty = cy + Math.sin(a) * p.radius;
          ctx.beginPath();
          ctx.arc(tx, ty, 3, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(tx, ty, 8, 0, Math.PI * 2);
          ctx.fillStyle = color + '30';
          ctx.fill();
        }
      }
    }

    // planet nodes
    const speedBoost = spinVelocity > 0.001 ? 1 + spinVelocity * 14 : 1;
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      p.angle += p.speed * speedBoost;
      const px = cx + Math.cos(p.angle) * p.radius;
      const py = cy + Math.sin(p.angle) * p.radius;
      const color = getPlanetColor(i);

      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, p.size * 3.5, 0, Math.PI * 2);
      ctx.fillStyle = color + '30';
      ctx.fill();
    }

    // cleanup dead bolts
    for (let i = bolts.length - 1; i >= 0; i--) {
      bolts[i].update();
      if (bolts[i].isDead()) bolts.splice(i, 1);
    }

    animationId = requestAnimationFrame(animate);
  }

  function resize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      if (chars.length) initChars();
    }, 150);
  }

  function onMouseMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }

  onMount(() => {
    ctx = canvas.getContext('2d');
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    tick().then(() => { initChars(); animate(); });
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove);
  });

  onDestroy(() => {
    cancelAnimationFrame(animationId);
    clearTimeout(resizeTimer);
    window.removeEventListener('resize', resize);
    window.removeEventListener('mousemove', onMouseMove);
  });
</script>

<canvas bind:this={canvas}></canvas>

<style>
  canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 0;
    pointer-events: none;
    display: block;
  }
</style>
