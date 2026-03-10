import { useState, useEffect, useRef, useCallback } from "react";

// ── Audio Analyzer ──────────────────────────────────────────────
const ANA_VOICE_COLORS = ["#ff4d4d","#ff9900","#ffff00","#00ff00","#00ccff","#cc00ff"];
const ANA_VOICE_FREQS  = [120, 250, 450, 800, 1400, 2400];
const ANA_VOICE_LABELS = ["Voice 1","Voice 2","Voice 3","Voice 4","Voice 5","Voice 6"];

function drawWaveform(canvas, buffer) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = "#060610"; ctx.fillRect(0, 0, W, H);
  const data = buffer.getChannelData(0);
  const step = Math.ceil(data.length / W);
  ctx.strokeStyle = "#00ffcc"; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 0; x < W; x++) {
    let min = 1, max = -1;
    for (let i = 0; i < step; i++) { const v = data[x * step + i] || 0; if (v < min) min = v; if (v > max) max = v; }
    const y1 = ((1 - max) / 2) * H, y2 = ((1 - min) / 2) * H;
    if (x === 0) ctx.moveTo(x, y1); else ctx.lineTo(x, y1);
    ctx.lineTo(x, y2);
  }
  ctx.stroke();
}

function computeSpectrogram(buffer) {
  const fftSize = 2048, hopSize = 4096;
  const sr = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  const halfFFT = fftSize / 2;
  const win = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  const mags = [];
  const maxFrames = 200;
  const totalSamples = data.length;
  const actualHop = Math.max(hopSize, Math.floor(totalSamples / maxFrames));
  for (let offset = 0; offset + fftSize <= totalSamples; offset += actualHop) {
    const mag = new Float32Array(halfFFT);
    const sampleStep = 8;
    for (let k = 0; k < halfFFT; k += 2) {
      let re = 0, im = 0;
      for (let n = 0; n < fftSize; n += sampleStep) {
        const angle = (2 * Math.PI * k * n) / fftSize;
        re += data[offset + n] * win[n] * Math.cos(angle);
        im -= data[offset + n] * win[n] * Math.sin(angle);
      }
      mag[k] = Math.sqrt(re * re + im * im);
      if (k + 1 < halfFFT) mag[k + 1] = mag[k];
    }
    mags.push(mag);
    if (mags.length >= maxFrames) break;
  }
  return { mags, freqBin: sr / fftSize, halfFFT };
}

function drawSpectrogram(canvas, spectro) {
  const { mags, freqBin, halfFFT } = spectro;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = "#060610"; ctx.fillRect(0, 0, W, H);
  const minHz = 80, maxHz = 3200;
  const minBin = Math.floor(minHz / freqBin);
  const maxBin = Math.min(Math.floor(maxHz / freqBin), halfFFT - 1);
  const numBins = maxBin - minBin;
  let globalMax = 0;
  for (const f of mags) for (let b = minBin; b <= maxBin; b++) if (f[b] > globalMax) globalMax = f[b];
  for (let fi = 0; fi < mags.length; fi++) {
    const x = Math.floor((fi / mags.length) * W);
    for (let b = minBin; b <= maxBin; b++) {
      const norm = mags[fi][b] / (globalMax + 1e-9);
      const dB = 20 * Math.log10(norm + 1e-6);
      const t = Math.max(0, Math.min(1, (dB + 60) / 60));
      const r = Math.floor(255 * Math.min(1, t * 2.5));
      const g = Math.floor(255 * Math.max(0, t * 2 - 0.5));
      const bl = Math.floor(255 * Math.max(0, 0.5 - t));
      ctx.fillStyle = `rgb(${r},${g},${bl})`;
      const y = H - Math.floor(((b - minBin) / numBins) * H) - 1;
      ctx.fillRect(x, y, Math.max(1, Math.floor(W / mags.length)), 2);
    }
  }
  ANA_VOICE_FREQS.forEach((hz, i) => {
    const y = H - Math.floor(((hz / freqBin - minBin) / numBins) * H);
    ctx.strokeStyle = ANA_VOICE_COLORS[i]; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = ANA_VOICE_COLORS[i]; ctx.font = "9px monospace";
    ctx.fillText(ANA_VOICE_LABELS[i], 4, y - 2);
  });
}

function drawFreqDist(canvas, spectro) {
  const { mags, freqBin, halfFFT } = spectro;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = "#060610"; ctx.fillRect(0, 0, W, H);
  const minHz = 80, maxHz = 3200;
  const minBin = Math.floor(minHz / freqBin);
  const maxBin = Math.min(Math.floor(maxHz / freqBin), halfFFT - 1);
  const numBins = maxBin - minBin;
  const avg = new Float32Array(numBins);
  for (const f of mags) for (let b = minBin; b < maxBin; b++) avg[b - minBin] += f[b];
  for (let i = 0; i < numBins; i++) avg[i] /= mags.length;
  const maxAvg = Math.max(...avg);
  const logMin = Math.log10(minHz), logMax = Math.log10(maxHz);
  ctx.beginPath(); ctx.strokeStyle = "#ff9f60"; ctx.lineWidth = 2;
  for (let i = 0; i < numBins; i++) {
    const hz = (i + minBin) * freqBin;
    const x = ((Math.log10(hz) - logMin) / (logMax - logMin)) * W;
    const y = H - (avg[i] / maxAvg) * (H - 10) - 5;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.beginPath(); ctx.fillStyle = "rgba(255,107,53,0.3)"; ctx.moveTo(0, H);
  for (let i = 0; i < numBins; i++) {
    const hz = (i + minBin) * freqBin;
    const x = ((Math.log10(hz) - logMin) / (logMax - logMin)) * W;
    const y = H - (avg[i] / maxAvg) * (H - 10) - 5;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H); ctx.fill();
  ANA_VOICE_FREQS.forEach((hz, i) => {
    const x = ((Math.log10(hz) - logMin) / (logMax - logMin)) * W;
    ctx.strokeStyle = ANA_VOICE_COLORS[i]; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = ANA_VOICE_COLORS[i]; ctx.font = "9px monospace";
    ctx.fillText(ANA_VOICE_LABELS[i], x + 2, 12 + i * 12);
  });
  [100, 200, 500, 1000, 2000, 3000].forEach(hz => {
    const x = ((Math.log10(hz) - logMin) / (logMax - logMin)) * W;
    ctx.fillStyle = "#444"; ctx.font = "8px monospace"; ctx.fillText(`${hz}`, x + 1, H - 2);
  });
}

function AudioAnalyzer() {
  const [status, setStatus] = useState("idle");
  const [fileName, setFileName] = useState("");
  const [info, setInfo] = useState(null);
  const [progress, setProgress] = useState(0);
  const waveRef = useRef(null);
  const spectRef = useRef(null);
  const freqRef = useRef(null);
  const pendingRef = useRef(null);

  useEffect(() => {
    if (status === "done" && pendingRef.current) {
      const { buffer, spectro } = pendingRef.current;
      setTimeout(() => {
        if (waveRef.current) drawWaveform(waveRef.current, buffer);
        if (spectRef.current) drawSpectrogram(spectRef.current, spectro);
        if (freqRef.current) drawFreqDist(freqRef.current, spectro);
        pendingRef.current = null;
      }, 50);
    }
  }, [status]);

  const processFile = useCallback(async (file) => {
    setFileName(file.name); setStatus("loading"); setProgress(20);
    try {
      const arrayBuf = await file.arrayBuffer(); setProgress(40);
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = await audioCtx.decodeAudioData(arrayBuf); setProgress(60);
      setInfo({ duration: buffer.duration.toFixed(2), sr: buffer.sampleRate, ch: buffer.numberOfChannels });
      setProgress(75);
      const spectro = computeSpectrogram(buffer); setProgress(90);
      pendingRef.current = { buffer, spectro };
      setProgress(100); setStatus("done");
    } catch(e) { console.error(e); setStatus("error"); }
  }, []);

  const onFile = (e) => { const f = e.target.files?.[0]; if (f) processFile(f); };
  const onDrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); };

  const S = {
    root: { flex: 1, overflowY: "auto", background: "#060610", color: "#aaa", fontFamily: "'Share Tech Mono', monospace", padding: "20px" },
    drop: { border: "1px dashed #2a2a5a", borderRadius: "4px", padding: "60px", textAlign: "center", cursor: "pointer", background: "#0a0a1a" },
    bar: { width: "280px", height: "2px", background: "#1a1a3a", margin: "12px auto", borderRadius: "2px", overflow: "hidden" },
    fill: { height: "100%", background: "#00ffcc", transition: "width 0.3s" },
    section: { background: "#080818", border: "1px solid #12123a", borderRadius: "3px", padding: "14px", marginBottom: "16px" },
    secLabel: { fontSize: "9px", color: "#00ffcc", letterSpacing: "3px", fontWeight: "bold", marginRight: "10px" },
    secSub: { fontSize: "8px", color: "#333", letterSpacing: "1px" },
    canvas: { width: "100%", height: "auto", display: "block" },
    pill: { fontSize: "9px", color: "#444", border: "1px solid #1a1a3a", padding: "2px 8px", borderRadius: "2px", marginRight: "6px" },
    reset: { padding: "3px 12px", background: "transparent", border: "1px solid #2a2a5a", color: "#444", cursor: "pointer", fontFamily: "monospace", fontSize: "10px" },
  };

  return (
    <div style={S.root}>
      {status === "idle" && (
        <div style={S.drop} onDrop={onDrop} onDragOver={e => e.preventDefault()} onClick={() => document.getElementById("ana-fi").click()}>
          <div style={{ fontSize: "36px", color: "#2a2a5a", marginBottom: "12px" }}>◎</div>
          <div style={{ fontSize: "13px", color: "#555", letterSpacing: "2px" }}>Drop MP3 / WAV / WebM here</div>
          <div style={{ fontSize: "10px", color: "#333", marginTop: "6px" }}>or click to select</div>
          <input id="ana-fi" type="file" accept="audio/*" style={{ display: "none" }} onChange={onFile} />
        </div>
      )}
      {status === "loading" && (
        <div style={{ padding: "40px", textAlign: "center" }}>
          <div style={{ fontSize: "11px", color: "#555" }}>Analyzing — {fileName}</div>
          <div style={S.bar}><div style={{ ...S.fill, width: `${progress}%` }} /></div>
          <div style={{ fontSize: "10px", color: "#333" }}>{progress}%</div>
        </div>
      )}
      {status === "error" && (
        <div style={{ padding: "40px", textAlign: "center", color: "#ff4d4d" }}>
          Decoding failed.
          <br /><button style={{ marginTop: "12px", padding: "6px 20px", background: "transparent", border: "1px solid #ff4d4d", color: "#ff4d4d", cursor: "pointer", fontFamily: "monospace" }} onClick={() => setStatus("idle")}>↺ Try Again</button>
        </div>
      )}
      {status === "done" && (
        <>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px", alignItems: "center" }}>
            {[fileName, `${info.duration}s`, `${info.sr}Hz`, `${info.ch}ch`].map(t => <span key={t} style={S.pill}>{t}</span>)}
            <button style={S.reset} onClick={() => { setStatus("idle"); setInfo(null); }}>↺ Reset</button>
          </div>
          <div style={S.section}>
            <div style={{ marginBottom: "10px" }}><span style={S.secLabel}>WAVEFORM</span><span style={S.secSub}>Time × Amplitude</span></div>
            <canvas ref={waveRef} width={800} height={100} style={S.canvas} />
          </div>
          <div style={S.section}>
            <div style={{ marginBottom: "10px" }}><span style={S.secLabel}>SPECTROGRAM</span><span style={S.secSub}>Time × Frequency × Intensity — 80Hz to 3200Hz</span></div>
            <canvas ref={spectRef} width={800} height={180} style={S.canvas} />
          </div>
          <div style={S.section}>
            <div style={{ marginBottom: "10px" }}><span style={S.secLabel}>FREQUENCY DISTRIBUTION</span><span style={S.secSub}>Average power — log scale</span></div>
            <canvas ref={freqRef} width={800} height={140} style={S.canvas} />
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "8px" }}>
              {ANA_VOICE_LABELS.map((l, i) => <span key={l} style={{ fontSize: "9px", color: ANA_VOICE_COLORS[i] }}>▎ {l}</span>)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Graphic Score (元のコード) ──────────────────────────────────
const MIN_FREQ = 80;
const MAX_FREQ = 3200;
const DEFAULT_DURATION = 8;
const VOICE_COLORS = ["#00e5ff", "#ff6b6b", "#a8ff3e", "#ffd93d", "#c77dff", "#ff922b"];

function freqToY(freq, height) {
  const logMin = Math.log2(MIN_FREQ), logMax = Math.log2(MAX_FREQ);
  const logF = Math.log2(Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq)));
  return height - ((logF - logMin) / (logMax - logMin)) * height;
}
function yToFreq(y, height) {
  const logMin = Math.log2(MIN_FREQ), logMax = Math.log2(MAX_FREQ);
  return Math.pow(2, logMin + (1 - y / height) * (logMax - logMin));
}
function timeToX(t, width, duration) { return (t / duration) * width; }

function calcStrokeEnergy(strokes) {
  let totalDelta = 0, count = 0;
  strokes.forEach(stroke => {
    for (let i = 1; i < stroke.points.length; i++) {
      const dy = Math.abs(stroke.points[i].y - stroke.points[i - 1].y);
      const dx = Math.abs(stroke.points[i].x - stroke.points[i - 1].x);
      totalDelta += dy / (dx + 1); count++;
    }
  });
  return count === 0 ? 0.5 : Math.min(1, totalDelta / count / 3);
}

function getLFOPeriod(duration, index) {
  const ratios = [1, 2, 3, 1.5, 4, 0.75];
  return duration / ratios[index % ratios.length];
}

const WAVEFORMS = [
  { type: "sine", label: "正弦", symbol: "∿" },
  { type: "triangle", label: "三角", symbol: "△" },
  { type: "sawtooth", label: "鋸歯", symbol: "╱" },
  { type: "square", label: "矩形", symbol: "□" },
];

const makeLayer = (id, label, color) => ({ id, label, color, strokes: [], muted: false, waveform: "sine", pan: 0, filterOn: false });
const INITIAL_LAYERS = [
  makeLayer(1, "Voice 1", VOICE_COLORS[0]),
  makeLayer(2, "Voice 2", VOICE_COLORS[1]),
  makeLayer(3, "Voice 3", VOICE_COLORS[2]),
];

function PanKnob({ value, onChange, color }) {
  const startY = useRef(null), startVal = useRef(null);
  const onMouseDown = (e) => {
    e.stopPropagation(); startY.current = e.clientY; startVal.current = value;
    const onMove = (ev) => { const dy = startY.current - ev.clientY; onChange(Math.max(-1, Math.min(1, Math.round((startVal.current + dy / 60) * 100) / 100))); };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  };
  const onTouchStart = (e) => {
    e.stopPropagation(); startY.current = e.touches[0].clientY; startVal.current = value;
    const onMove = (ev) => { const dy = startY.current - ev.touches[0].clientY; onChange(Math.max(-1, Math.min(1, Math.round((startVal.current + dy / 60) * 100) / 100))); };
    const onUp = () => { window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onUp); };
    window.addEventListener("touchmove", onMove, { passive: false }); window.addEventListener("touchend", onUp);
  };
  const angle = value * 135;
  const label = value === 0 ? "C" : value < 0 ? `L${Math.round(-value * 100)}` : `R${Math.round(value * 100)}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
      <div style={{ fontSize: "7px", color: "#444", fontFamily: "'Share Tech Mono', monospace" }}>PAN</div>
      <div onMouseDown={onMouseDown} onTouchStart={onTouchStart} onDoubleClick={e => { e.stopPropagation(); onChange(0); }}
        style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#111", border: `2px solid ${value === 0 ? "#2a2a2a" : color}`, cursor: "ns-resize", position: "relative", boxShadow: value !== 0 ? `0 0 6px ${color}44` : "none" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", width: "2px", height: "10px", background: value === 0 ? "#444" : color, borderRadius: "1px", transformOrigin: "50% 100%", transform: `translate(-50%, -100%) rotate(${angle}deg)` }} />
      </div>
      <div style={{ fontSize: "7px", color: value === 0 ? "#444" : color, fontFamily: "'Share Tech Mono', monospace" }}>{label}</div>
    </div>
  );
}

function GraphicScore() {
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const oscsRef = useRef({});
  const rafRef = useRef(null);
  const startTimeRef = useRef(null);
  const playingRef = useRef(false);
  const durationRef = useRef(DEFAULT_DURATION);
  const volumeRef = useRef(0.5);
  const lfoSensRef = useRef(0);
  const voiceTraitsRef = useRef({});
  const sizeRef = useRef({ w: 800, h: 400 });
  const layersRef = useRef(INITIAL_LAYERS);
  const activeLayerIdRef = useRef(1);
  const drawingRef = useRef(false);

  const [layers, setLayers] = useState(INITIAL_LAYERS);
  const [activeLayerId, setActiveLayerId] = useState(1);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [tool, setTool] = useState("pen");
  const [showGrid, setShowGrid] = useState(true);
  const [volume, setVolume] = useState(0.5);
  const [lfoSens, setLfoSens] = useState(0);
  const [size, setSize] = useState({ w: 800, h: 400 });
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recTimerRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [recDuration, setRecDuration] = useState(60);
  const [recRemaining, setRecRemaining] = useState(0);
  const destNodeRef = useRef(null);

  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { lfoSensRef.current = lfoSens; }, [lfoSens]);
  useEffect(() => { sizeRef.current = size; }, [size]);
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { activeLayerIdRef.current = activeLayerId; }, [activeLayerId]);

  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: width, h: height });
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const computeVoiceTraits = useCallback(() => {
    const traits = {};
    layersRef.current.forEach((layer, i) => {
      const energy = calcStrokeEnergy(layer.strokes);
      const period = getLFOPeriod(durationRef.current, i);
      const phase = (i * 0.618) % 1;
      const depth = 0.3 + energy * 0.7;
      const inertia = 0.02 + (1 - energy) * 0.08;
      const filterPeriodL = getLFOPeriod(durationRef.current, i + 1);
      const filterPeriodR = getLFOPeriod(durationRef.current, i + 3);
      const filterPhaseL = (i * 0.382) % 1;
      const filterPhaseR = (i * 0.764) % 1;
      const baseFilterFreq = 400 + energy * 2000;
      const resonance = 1 + energy * 15;
      traits[layer.id] = { energy, period, phase, depth, inertia, filterPeriodL, filterPeriodR, filterPhaseL, filterPhaseR, baseFilterFreq, resonance };
    });
    voiceTraitsRef.current = traits;
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { w, h } = sizeRef.current;
    ctx.clearRect(0, 0, w, h);
    if (showGrid) {
      ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 1;
      for (let i = 0; i <= durationRef.current; i++) {
        const x = (i / durationRef.current) * w;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      [80, 160, 320, 640, 1280, 2560].forEach(f => {
        const y = freqToY(f, h);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      });
    }
    layersRef.current.forEach(layer => {
      if (layer.muted) return;
      const isActive = layer.id === activeLayerIdRef.current;
      layer.strokes.forEach(stroke => {
        if (stroke.points.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = layer.color + (isActive ? "ff" : "77");
        ctx.lineWidth = isActive ? 2.5 : 1.5;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.shadowBlur = isActive ? 10 : 3; ctx.shadowColor = layer.color;
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        stroke.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke(); ctx.shadowBlur = 0;
      });
    });
  }, [showGrid]);

  useEffect(() => { redraw(); }, [redraw, layers, activeLayerId, size]);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    const touch = e.touches?.[0] ?? e.changedTouches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const onPointerDown = useCallback((e) => {
    if (tool !== "pen") return;
    const pos = getPos(e, canvasRef.current);
    const newStroke = { id: Date.now(), points: [pos] };
    setLayers(prev => { const next = prev.map(l => l.id === activeLayerIdRef.current ? { ...l, strokes: [...l.strokes, newStroke] } : l); layersRef.current = next; return next; });
    drawingRef.current = true; redraw();
  }, [tool, redraw]);

  const onPointerMove = useCallback((e) => {
    if (!drawingRef.current || tool !== "pen") return;
    const pos = getPos(e, canvasRef.current);
    setLayers(prev => {
      const next = prev.map(l => {
        if (l.id !== activeLayerIdRef.current) return l;
        const strokes = [...l.strokes];
        if (!strokes.length) return l;
        strokes[strokes.length - 1] = { ...strokes[strokes.length - 1], points: [...strokes[strokes.length - 1].points, pos] };
        return { ...l, strokes };
      });
      layersRef.current = next; return next;
    });
    redraw();
  }, [tool, redraw]);

  const onPointerUp = useCallback(() => { drawingRef.current = false; }, []);

  const onErase = useCallback((e) => {
    if (tool !== "eraser") return;
    const pos = getPos(e, canvasRef.current);
    const r = 24;
    setLayers(prev => {
      const next = prev.map(l => l.id === activeLayerIdRef.current ? { ...l, strokes: l.strokes.filter(s => !s.points.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) < r)) } : l);
      layersRef.current = next; return next;
    });
    redraw();
  }, [tool, redraw]);

  const getFreqAtTime = useCallback((layerId, t) => {
    const { w, h } = sizeRef.current;
    const x = timeToX(t, w, durationRef.current);
    const layer = layersRef.current.find(l => l.id === layerId);
    if (!layer || layer.muted) return null;
    let bestDist = Infinity, bestFreq = null;
    layer.strokes.forEach(stroke => {
      stroke.points.forEach(p => {
        const dist = Math.abs(p.x - x);
        if (dist < bestDist) { bestDist = dist; bestFreq = yToFreq(p.y, h); }
      });
    });
    return bestDist > (w / durationRef.current) * 0.5 ? null : bestFreq;
  }, []);

  const getLFOOffset = useCallback((layerId, elapsed) => {
    const sens = lfoSensRef.current;
    if (sens === 0) return 0;
    const traits = voiceTraitsRef.current[layerId];
    if (!traits) return 0;
    const { period, phase, depth } = traits;
    const lfo = Math.sin((elapsed / period + phase) * Math.PI * 2);
    return lfo * depth * sens * 24;
  }, []);

  const applyLFO = (freq, semiOffset) => freq * Math.pow(2, semiOffset / 12);

  const startPlay = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtxRef.current;
    Object.values(oscsRef.current).forEach(({ osc }) => { try { osc.stop(); } catch (e) {} });
    oscsRef.current = {};
    computeVoiceTraits();
    const dest = ctx.createMediaStreamDestination();
    destNodeRef.current = dest;
    layersRef.current.forEach(layer => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = layer.waveform || "sine"; gain.gain.value = 0;
      if (layer.filterOn) {
        const filterL = ctx.createBiquadFilter(), filterR = ctx.createBiquadFilter();
        filterL.type = filterR.type = "lowpass";
        filterL.frequency.value = 1200; filterR.frequency.value = 800;
        filterL.Q.value = filterR.Q.value = 2;
        const pannerL = ctx.createStereoPanner(), pannerR = ctx.createStereoPanner();
        pannerL.pan.value = -1; pannerR.pan.value = 1;
        gain.connect(filterL); filterL.connect(pannerL); pannerL.connect(ctx.destination); pannerL.connect(dest);
        gain.connect(filterR); filterR.connect(pannerR); pannerR.connect(ctx.destination); pannerR.connect(dest);
        osc.connect(gain); osc.start();
        oscsRef.current[layer.id] = { osc, gain, filterL, filterR, pannerL, pannerR, hasFilter: true };
      } else {
        const panner = ctx.createStereoPanner(); panner.pan.value = layer.pan || 0;
        osc.connect(gain); gain.connect(panner); panner.connect(ctx.destination); panner.connect(dest);
        osc.start(); oscsRef.current[layer.id] = { osc, gain, panner, hasFilter: false };
      }
    });
    startTimeRef.current = ctx.currentTime; playingRef.current = true;
    if (ctx.state === "suspended") ctx.resume();
    const tick = () => {
      if (!playingRef.current) return;
      const elapsed = (ctx.currentTime - startTimeRef.current) % durationRef.current;
      setPlayhead(elapsed / durationRef.current);
      const activeLayers = layersRef.current.filter(l => !l.muted);
      const perVol = volumeRef.current / Math.max(1, activeLayers.length);
      const traits = voiceTraitsRef.current;
      layersRef.current.forEach(layer => {
        const voice = oscsRef.current[layer.id]; if (!voice) return;
        const baseFreq = getFreqAtTime(layer.id, elapsed);
        const t = ctx.currentTime, tr = traits[layer.id];
        if (voice.hasFilter) {
          if (tr) {
            const sens = lfoSensRef.current;
            const lfoL = Math.sin((elapsed / tr.filterPeriodL + tr.filterPhaseL) * Math.PI * 2);
            const lfoR = Math.sin((elapsed / tr.filterPeriodR + tr.filterPhaseR) * Math.PI * 2);
            const cutoffL = Math.max(80, Math.min(18000, tr.baseFilterFreq + lfoL * tr.energy * sens * 1800));
            const cutoffR = Math.max(80, Math.min(18000, tr.baseFilterFreq + lfoR * tr.energy * sens * 1800));
            const resL = Math.max(0.5, tr.resonance + lfoL * tr.energy * sens * 8);
            const resR = Math.max(0.5, tr.resonance + lfoR * tr.energy * sens * 8);
            voice.filterL.frequency.setTargetAtTime(cutoffL, t, 0.05);
            voice.filterR.frequency.setTargetAtTime(cutoffR, t, 0.05);
            voice.filterL.Q.setTargetAtTime(resL, t, 0.08);
            voice.filterR.Q.setTargetAtTime(resR, t, 0.08);
          }
          if (baseFreq) { const lfoOffset = getLFOOffset(layer.id, elapsed); voice.osc.frequency.setTargetAtTime(applyLFO(baseFreq, lfoOffset), t, tr?.inertia || 0.05); voice.gain.gain.setTargetAtTime(perVol * 1.4, t, 0.01); }
          else { voice.gain.gain.setTargetAtTime(0, t, 0.02); }
        } else {
          voice.panner.pan.setTargetAtTime(layer.pan || 0, t, 0.05);
          if (baseFreq) { const lfoOffset = getLFOOffset(layer.id, elapsed); voice.osc.frequency.setTargetAtTime(applyLFO(baseFreq, lfoOffset), t, tr?.inertia || 0.05); voice.gain.gain.setTargetAtTime(perVol, t, 0.01); }
          else { voice.gain.gain.setTargetAtTime(0, t, 0.02); }
        }
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [getFreqAtTime, getLFOOffset, computeVoiceTraits]);

  const stopPlay = useCallback(() => {
    playingRef.current = false; cancelAnimationFrame(rafRef.current);
    const ctx = audioCtxRef.current;
    if (ctx) { Object.values(oscsRef.current).forEach(({ osc, gain }) => { try { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } catch (e) {} setTimeout(() => { try { osc.stop(); } catch (e) {} }, 200); }); }
    oscsRef.current = {};
  }, []);

  const togglePlay = () => { if (playing) { stopPlay(); setPlaying(false); } else { startPlay(); setPlaying(true); } };

  const startRecording = useCallback(() => {
    if (!playingRef.current) { startPlay(); setPlaying(true); }
    const dest = destNodeRef.current; if (!dest) return;
    recordedChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const mr = new MediaRecorder(dest.stream, { mimeType });
    mr.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    mr.onstop = () => { const blob = new Blob(recordedChunksRef.current, { type: mimeType }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `graphic-score-${Date.now()}.webm`; a.click(); URL.revokeObjectURL(url); };
    mr.start(100); mediaRecorderRef.current = mr; setRecording(true); setRecRemaining(recDuration);
    let remaining = recDuration;
    recTimerRef.current = setInterval(() => { remaining -= 1; setRecRemaining(remaining); if (remaining <= 0) stopRecording(); }, 1000);
  }, [recDuration, startPlay]);

  const stopRecording = useCallback(() => {
    clearInterval(recTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    setRecording(false); setRecRemaining(0);
  }, []);

  const addLayer = () => { if (layers.length >= VOICE_COLORS.length) return; const id = Date.now(); setLayers(prev => [...prev, makeLayer(id, `Voice ${prev.length + 1}`, VOICE_COLORS[prev.length])]); setActiveLayerId(id); };
  const removeLayer = (id) => { if (layers.length <= 1) return; setLayers(prev => { const next = prev.filter(l => l.id !== id); if (activeLayerId === id) setActiveLayerId(next[0].id); return next; }); };
  const toggleMute = (id) => setLayers(prev => prev.map(l => l.id === id ? { ...l, muted: !l.muted } : l));
  const clearLayer = (id) => setLayers(prev => prev.map(l => l.id === id ? { ...l, strokes: [] } : l));
  const setWaveform = (id, wf) => setLayers(prev => prev.map(l => l.id === id ? { ...l, waveform: wf } : l));
  const toggleFilter = (id) => { setLayers(prev => { const next = prev.map(l => l.id === id ? { ...l, filterOn: !l.filterOn } : l); layersRef.current = next; return next; }); if (playingRef.current) { stopPlay(); setTimeout(() => { startPlay(); setPlaying(true); }, 100); } };
  const setPan = (id, pan) => { setLayers(prev => { const next = prev.map(l => l.id === id ? { ...l, pan } : l); layersRef.current = next; return next; }); };
  const clearAll = () => { stopPlay(); setPlaying(false); setLayers(prev => prev.map(l => ({ ...l, strokes: [] }))); setPlayhead(0); };

  const saveToFile = () => { const data = { version: 2, duration, layers }; const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `graphic-score-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url); };
  const loadFromFile = (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => { try { const data = JSON.parse(ev.target.result); if (data.layers) { stopPlay(); setPlaying(false); setLayers(data.layers); if (data.duration) { setDuration(data.duration); durationRef.current = data.duration; } setActiveLayerId(data.layers[0].id); } } catch (err) { alert("読み込みに失敗しました"); } }; reader.readAsText(file); e.target.value = ""; };

  const activeLayer = layers.find(l => l.id === activeLayerId);
  const accentColor = activeLayer?.color || "#00e5ff";

  const [lfoIndicators, setLfoIndicators] = useState({});
  useEffect(() => {
    if (!playing || lfoSens === 0) { setLfoIndicators({}); return; }
    const id = setInterval(() => {
      const elapsed = audioCtxRef.current ? (audioCtxRef.current.currentTime - startTimeRef.current) % durationRef.current : 0;
      const indicators = {};
      layersRef.current.forEach(layer => { const traits = voiceTraitsRef.current[layer.id]; if (!traits) return; const lfo = Math.sin((elapsed / traits.period + traits.phase) * Math.PI * 2); indicators[layer.id] = lfo * traits.depth * lfoSens; });
      setLfoIndicators(indicators);
    }, 50);
    return () => clearInterval(id);
  }, [playing, lfoSens]);

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".json" style={{ display: "none" }} onChange={loadFromFile} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", background: "#0c0c0c" }}>
          <button onClick={togglePlay} style={{ padding: "5px 16px", borderRadius: "7px", border: "none", background: playing ? "#ff4d6d" : "#00e5ff", color: "#000", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", fontSize: "12px" }}>{playing ? "■ STOP" : "▶ PLAY"}</button>
          <div style={{ display: "flex", gap: "3px" }}>
            {["pen", "eraser"].map(t => (<button key={t} onClick={() => setTool(t)} style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid", borderColor: tool === t ? accentColor : "#2a2a2a", background: tool === t ? accentColor + "22" : "transparent", color: tool === t ? accentColor : "#555", cursor: "pointer", fontSize: "13px" }}>{t === "pen" ? "✏" : "⌫"}</button>))}
          </div>
          <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
            <span style={{ fontSize: "9px", color: "#444", fontFamily: "'Share Tech Mono', monospace" }}>LOOP</span>
            {[4, 8, 16, 32].map(d => (<button key={d} onClick={() => { setDuration(d); durationRef.current = d; redraw(); }} style={{ padding: "3px 7px", borderRadius: "5px", border: "1px solid", borderColor: duration === d ? "#00e5ff" : "#2a2a2a", background: duration === d ? "#00e5ff15" : "transparent", color: duration === d ? "#00e5ff" : "#555", cursor: "pointer", fontFamily: "'Share Tech Mono', monospace", fontSize: "10px" }}>{d}s</button>))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ fontSize: "9px", color: "#444", fontFamily: "'Share Tech Mono', monospace" }}>VOL</span>
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => { setVolume(Number(e.target.value)); volumeRef.current = Number(e.target.value); }} style={{ width: "55px", accentColor: "#00e5ff" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "8px", border: `1px solid ${lfoSens > 0 ? "#ff922b44" : "#2a2a2a"}`, background: lfoSens > 0 ? "#ff922b08" : "transparent" }}>
            <span style={{ fontSize: "9px", color: lfoSens > 0 ? "#ff922b" : "#444", fontFamily: "'Share Tech Mono', monospace", letterSpacing: "1px" }}>LFO SENS</span>
            <input type="range" min="0" max="1" step="0.01" value={lfoSens} onChange={e => setLfoSens(Number(e.target.value))} style={{ width: "70px", accentColor: "#ff922b" }} />
            <span style={{ fontSize: "9px", color: lfoSens > 0 ? "#ff922b" : "#333", fontFamily: "'Share Tech Mono', monospace", minWidth: "24px" }}>{Math.round(lfoSens * 100)}</span>
          </div>
          <button onClick={() => setShowGrid(g => !g)} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #2a2a2a", background: "transparent", color: showGrid ? "#555" : "#2a2a2a", cursor: "pointer", fontSize: "10px" }}>GRID</button>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "8px", border: `1px solid ${recording ? "#ff4d6d88" : "#2a2a2a"}`, background: recording ? "#ff4d6d0a" : "transparent" }}>
            {!recording ? (<>
              <span style={{ fontSize: "9px", color: "#555", fontFamily: "'Share Tech Mono', monospace" }}>REC</span>
              {[60, 180, 300, 600].map(s => (<button key={s} onClick={() => setRecDuration(s)} style={{ padding: "2px 5px", borderRadius: "4px", border: "1px solid", borderColor: recDuration === s ? "#ff4d6d" : "#2a2a2a", background: recDuration === s ? "#ff4d6d15" : "transparent", color: recDuration === s ? "#ff4d6d" : "#444", cursor: "pointer", fontFamily: "'Share Tech Mono', monospace", fontSize: "9px" }}>{s >= 60 ? `${s / 60}m` : `${s}s`}</button>))}
              <button onClick={startRecording} style={{ padding: "3px 9px", borderRadius: "5px", border: "none", background: "#ff4d6d", color: "#fff", fontWeight: "700", cursor: "pointer", fontSize: "10px", fontFamily: "inherit" }}>● REC</button>
            </>) : (<>
              <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#ff4d6d", animation: "pulse 1s infinite" }} />
              <span style={{ fontSize: "10px", color: "#ff4d6d", fontFamily: "'Share Tech Mono', monospace", minWidth: "36px" }}>{Math.floor(recRemaining / 60)}:{String(recRemaining % 60).padStart(2, "0")}</span>
              <button onClick={stopRecording} style={{ padding: "3px 9px", borderRadius: "5px", border: "1px solid #ff4d6d", background: "transparent", color: "#ff4d6d", cursor: "pointer", fontSize: "10px", fontFamily: "inherit" }}>■ STOP</button>
            </>)}
          </div>
          <div style={{ display: "flex", gap: "4px", marginLeft: "auto" }}>
            <button onClick={saveToFile} style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #2a2a2a", background: "transparent", color: "#00e5ff", cursor: "pointer", fontSize: "10px", fontFamily: "'Share Tech Mono', monospace" }}>↓ SAVE</button>
            <button onClick={() => fileInputRef.current.click()} style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #2a2a2a", background: "transparent", color: "#a8ff3e", cursor: "pointer", fontSize: "10px", fontFamily: "'Share Tech Mono', monospace" }}>↑ LOAD</button>
          </div>
          <button onClick={clearAll} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #2a2a2a", background: "transparent", color: "#555", cursor: "pointer", fontSize: "10px" }}>CLEAR</button>
        </div>

        {/* Main */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div style={{ width: "110px", flexShrink: 0, background: "#0a0a0a", borderRight: "1px solid #1a1a1a", display: "flex", flexDirection: "column", padding: "8px 6px", gap: "5px", overflowY: "auto" }}>
            <div style={{ fontSize: "8px", color: "#333", letterSpacing: "2px", fontFamily: "'Share Tech Mono', monospace", marginBottom: "2px" }}>VOICES</div>
            {layers.map(layer => {
              const isActive = layer.id === activeLayerId;
              const lfoInd = lfoIndicators[layer.id] || 0;
              return (
                <div key={layer.id} onClick={() => setActiveLayerId(layer.id)} style={{ borderRadius: "7px", border: `1px solid ${isActive ? layer.color + "88" : "#1a1a1a"}`, background: isActive ? layer.color + "12" : "transparent", padding: "6px 7px", cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "5px" }}>
                    <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: layer.muted ? "#333" : layer.color, flexShrink: 0, boxShadow: lfoInd !== 0 ? `0 0 ${Math.abs(lfoInd) * 8}px ${layer.color}` : "none", transition: "box-shadow 0.05s" }} />
                    <span style={{ fontSize: "10px", color: isActive ? "#fff" : "#555", fontWeight: isActive ? "600" : "400", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{layer.label}</span>
                  </div>
                  {lfoSens > 0 && (<div style={{ height: "2px", background: "#1a1a1a", borderRadius: "1px", marginBottom: "5px", overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.abs(lfoInd) * 100}%`, background: layer.color, marginLeft: lfoInd < 0 ? `${(1 + lfoInd) * 100}%` : "50%", transition: "all 0.05s", opacity: 0.8 }} /></div>)}
                  {isActive && (<>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px", marginBottom: "6px" }}>
                      {WAVEFORMS.map(wf => (<button key={wf.type} onClick={e => { e.stopPropagation(); setWaveform(layer.id, wf.type); }} style={{ padding: "3px 0", fontSize: "11px", border: "1px solid", borderColor: layer.waveform === wf.type ? layer.color : "#222", borderRadius: "4px", background: layer.waveform === wf.type ? layer.color + "22" : "transparent", color: layer.waveform === wf.type ? layer.color : "#444", cursor: "pointer" }}>{wf.symbol}</button>))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px" }} onClick={e => e.stopPropagation()}><PanKnob value={layer.pan || 0} onChange={v => setPan(layer.id, v)} color={layer.color} /></div>
                  </>)}
                  <div style={{ display: "flex", gap: "3px", marginBottom: "3px" }}>
                    <button onClick={e => { e.stopPropagation(); toggleMute(layer.id); }} style={{ flex: 1, padding: "2px 0", fontSize: "8px", border: "1px solid #222", borderRadius: "3px", background: layer.muted ? "#333" : "transparent", color: layer.muted ? "#fff" : "#444", cursor: "pointer", fontFamily: "inherit" }}>{layer.muted ? "UN" : "M"}</button>
                    <button onClick={e => { e.stopPropagation(); clearLayer(layer.id); }} style={{ flex: 1, padding: "2px 0", fontSize: "8px", border: "1px solid #222", borderRadius: "3px", background: "transparent", color: "#444", cursor: "pointer" }}>CLR</button>
                    {layers.length > 1 && (<button onClick={e => { e.stopPropagation(); removeLayer(layer.id); }} style={{ padding: "2px 4px", fontSize: "8px", border: "1px solid #222", borderRadius: "3px", background: "transparent", color: "#444", cursor: "pointer" }}>×</button>)}
                  </div>
                  <button onClick={e => { e.stopPropagation(); toggleFilter(layer.id); }} style={{ width: "100%", padding: "3px 0", fontSize: "8px", border: "1px solid", borderColor: layer.filterOn ? "#c77dff88" : "#222", borderRadius: "3px", background: layer.filterOn ? "#c77dff18" : "transparent", color: layer.filterOn ? "#c77dff" : "#333", cursor: "pointer", fontFamily: "'Share Tech Mono', monospace", letterSpacing: "1px", transition: "all 0.2s" }}>{layer.filterOn ? "⊛ VCF ON" : "⊙ VCF"}</button>
                </div>
              );
            })}
            {layers.length < VOICE_COLORS.length && (<button onClick={addLayer} style={{ padding: "5px", borderRadius: "7px", border: "1px dashed #222", background: "transparent", color: "#333", cursor: "pointer", fontSize: "10px", fontFamily: "inherit" }}>+ ADD</button>)}
          </div>

          <div style={{ width: "36px", flexShrink: 0, position: "relative", borderRight: "1px solid #1a1a1a" }}>
            {[100, 200, 400, 800, 1600, 3200].map(f => (<div key={f} style={{ position: "absolute", right: "3px", top: `${(freqToY(f, size.h) / size.h) * 100}%`, transform: "translateY(-50%)", fontSize: "7px", color: "#333", fontFamily: "'Share Tech Mono', monospace", whiteSpace: "nowrap" }}>{f >= 1000 ? `${f / 1000}k` : f}</div>))}
          </div>

          <div ref={containerRef} style={{ flex: 1, position: "relative", cursor: tool === "eraser" ? "cell" : "crosshair" }}>
            <canvas ref={canvasRef} width={size.w} height={size.h} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", touchAction: "none" }}
              onMouseDown={e => { onPointerDown(e); onErase(e); }}
              onMouseMove={e => { onPointerMove(e); if (e.buttons === 1) onErase(e); }}
              onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
              onTouchStart={e => { e.preventDefault(); onPointerDown(e); onErase(e); }}
              onTouchMove={e => { e.preventDefault(); onPointerMove(e); }}
              onTouchEnd={onPointerUp}
            />
            {playing && (<div style={{ position: "absolute", top: 0, bottom: 0, left: `${playhead * 100}%`, width: "2px", background: "#fff", boxShadow: "0 0 10px #ffffff88", pointerEvents: "none" }} />)}
            {layers.every(l => l.strokes.length === 0) && (<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}><div style={{ textAlign: "center", color: "#2a2a2a" }}><div style={{ fontSize: "32px", marginBottom: "8px" }}>✏</div><div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: "11px", letterSpacing: "2px" }}>DRAW TO COMPOSE</div><div style={{ fontSize: "9px", marginTop: "6px", color: "#222" }}>左のパネルで声部を選んで描く</div></div></div>)}
          </div>
        </div>

        <div style={{ height: "20px", borderTop: "1px solid #1a1a1a", background: "#0c0c0c", position: "relative", paddingLeft: "146px" }}>
          {Array.from({ length: duration + 1 }).map((_, i) => (<div key={i} style={{ position: "absolute", left: `calc(146px + ${(i / duration) * 100}%)`, fontSize: "7px", color: "#333", fontFamily: "'Share Tech Mono', monospace", transform: "translateX(-50%)", top: "4px" }}>{i}s</div>))}
        </div>
      </div>
    </>
  );
}

// ── Root App with tab switching ─────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("score");

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080808; overflow: hidden; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.2; } }
      `}</style>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#080808", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>

        {/* Top nav */}
        <div style={{ padding: "6px 12px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: "12px", background: "#0c0c0c", flexShrink: 0 }}>
          <span style={{ fontFamily: "'Share Tech Mono', monospace", color: "#00e5ff", fontSize: "11px", letterSpacing: "2px" }}>GRAPHIC SCORE</span>
          <div style={{ display: "flex", gap: "4px" }}>
            {[{ id: "score", label: "✏ SCORE" }, { id: "analyze", label: "◎ ANALYZE" }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ padding: "4px 12px", borderRadius: "6px", border: "1px solid", borderColor: tab === t.id ? "#00e5ff" : "#2a2a2a", background: tab === t.id ? "#00e5ff15" : "transparent", color: tab === t.id ? "#00e5ff" : "#444", cursor: "pointer", fontFamily: "'Share Tech Mono', monospace", fontSize: "10px", letterSpacing: "1px" }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "score" ? <GraphicScore /> : <AudioAnalyzer />}
      </div>
    </>
  );
}
