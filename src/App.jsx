import { useState, useEffect, useRef, useCallback } from "react";

const MIN_FREQ = 80;
const MAX_FREQ = 3200;
const DEFAULT_DURATION = 8;
const VOICE_COLORS = ["#00e5ff", "#ff6b6b", "#a8ff3e", "#ffd93d", "#c77dff", "#ff922b"];

function freqToY(freq, height) {
  const logMin = Math.log2(MIN_FREQ);
  const logMax = Math.log2(MAX_FREQ);
  const logF = Math.log2(Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq)));
  return height - ((logF - logMin) / (logMax - logMin)) * height;
}
function yToFreq(y, height) {
  const logMin = Math.log2(MIN_FREQ);
  const logMax = Math.log2(MAX_FREQ);
  return Math.pow(2, logMin + (1 - y / height) * (logMax - logMin));
}
function timeToX(t, width, duration) { return (t / duration) * width; }

// ── 線の「激しさ」を計算（点間の変化量の平均）
function calcStrokeEnergy(strokes) {
  let totalDelta = 0, count = 0;
  strokes.forEach(stroke => {
    for (let i = 1; i < stroke.points.length; i++) {
      const dy = Math.abs(stroke.points[i].y - stroke.points[i - 1].y);
      const dx = Math.abs(stroke.points[i].x - stroke.points[i - 1].x);
      totalDelta += dy / (dx + 1);
      count++;
    }
  });
  return count === 0 ? 0.5 : Math.min(1, totalDelta / count / 3);
}

// ── ループ秒数と整数比で連動するLFO周期を返す
function getLFOPeriod(duration, index) {
  // 整数比: 1:1, 1:2, 1:3, 2:3, 1:4, 3:4
  const ratios = [1, 2, 3, 1.5, 4, 0.75];
  return duration / ratios[index % ratios.length];
}

const WAVEFORMS = [
  { type: "sine",     label: "正弦", symbol: "∿" },
  { type: "triangle", label: "三角", symbol: "△" },
  { type: "sawtooth", label: "鋸歯", symbol: "╱" },
  { type: "square",   label: "矩形", symbol: "□" },
];

const makeLayer = (id, label, color) => ({
  id, label, color, strokes: [], muted: false, waveform: "sine", pan: 0
});

const INITIAL_LAYERS = [
  makeLayer(1, "Voice 1", VOICE_COLORS[0]),
  makeLayer(2, "Voice 2", VOICE_COLORS[1]),
  makeLayer(3, "Voice 3", VOICE_COLORS[2]),
];

// ── Pan knob
function PanKnob({ value, onChange, color }) {
  const startY = useRef(null);
  const startVal = useRef(null);
  const onMouseDown = (e) => {
    e.stopPropagation();
    startY.current = e.clientY; startVal.current = value;
    const onMove = (ev) => { const dy = startY.current - ev.clientY; onChange(Math.max(-1, Math.min(1, Math.round((startVal.current + dy / 60) * 100) / 100))); };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  };
  const onTouchStart = (e) => {
    e.stopPropagation();
    startY.current = e.touches[0].clientY; startVal.current = value;
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

export default function GraphicScore() {
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const oscsRef = useRef({});
  const rafRef = useRef(null);
  const startTimeRef = useRef(null);
  const playingRef = useRef(false);
  const durationRef = useRef(DEFAULT_DURATION);
  const volumeRef = useRef(0.5);
  const lfoSensRef = useRef(0);         // 0〜1: LFO感度グローバル
  const voiceTraitsRef = useRef({});    // layerId → { energy, period, phase, depth }
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
  const [recDuration, setRecDuration] = useState(60); // 秒
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

  // ── 各ボイスの個性（LFO特性）を計算・キャッシュ
  const computeVoiceTraits = useCallback(() => {
    const traits = {};
    layersRef.current.forEach((layer, i) => {
      const energy = calcStrokeEnergy(layer.strokes); // 0〜1: 線の激しさ
      const period = getLFOPeriod(durationRef.current, i);
      // 位相はボイスごとにずらす（ランダム性だが再現性あり）
      const phase = (i * 0.618) % 1; // 黄金角で分散
      // 深さは「激しい線 = 大きく揺れる」
      const depth = 0.3 + energy * 0.7;
      // 慣性（感応の遅さ）は「穏やかな線 = ゆっくり反応」
      const inertia = 0.02 + (1 - energy) * 0.08;
      traits[layer.id] = { energy, period, phase, depth, inertia };
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
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
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
        ctx.shadowBlur = isActive ? 10 : 3;
        ctx.shadowColor = layer.color;
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        stroke.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
        ctx.shadowBlur = 0;
      });
    });
  }, [showGrid]);

  useEffect(() => { redraw(); }, [redraw, layers, activeLayerId, size]);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const touch = e.touches?.[0] ?? e.changedTouches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const onPointerDown = useCallback((e) => {
    if (tool !== "pen") return;
    const pos = getPos(e, canvasRef.current);
    const newStroke = { id: Date.now(), points: [pos] };
    setLayers(prev => {
      const next = prev.map(l => l.id === activeLayerIdRef.current ? { ...l, strokes: [...l.strokes, newStroke] } : l);
      layersRef.current = next;
      return next;
    });
    drawingRef.current = true;
    redraw();
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
      layersRef.current = next;
      return next;
    });
    redraw();
  }, [tool, redraw]);

  const onPointerUp = useCallback(() => { drawingRef.current = false; }, []);

  const onErase = useCallback((e) => {
    if (tool !== "eraser") return;
    const pos = getPos(e, canvasRef.current);
    const r = 24;
    setLayers(prev => {
      const next = prev.map(l => l.id === activeLayerIdRef.current
        ? { ...l, strokes: l.strokes.filter(s => !s.points.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) < r)) } : l);
      layersRef.current = next;
      return next;
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

  // ── LFOオフセットを計算（各ボイス固有の周期・位相・深さ）
  const getLFOOffset = useCallback((layerId, elapsed) => {
    const sens = lfoSensRef.current;
    if (sens === 0) return 0;
    const traits = voiceTraitsRef.current[layerId];
    if (!traits) return 0;
    const { period, phase, depth } = traits;
    // サイン波LFO（位相をボイスごとにずらす）
    const lfo = Math.sin((elapsed / period + phase) * Math.PI * 2);
    // semitone単位のオフセット（最大±24半音）
    return lfo * depth * sens * 24;
  }, []);

  // ── 音程にLFOオフセット（半音単位）を加える
  const applyLFO = (freq, semiOffset) => {
    return freq * Math.pow(2, semiOffset / 12);
  };

  const startPlay = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;

    Object.values(oscsRef.current).forEach(({ osc }) => { try { osc.stop(); } catch (e) {} });
    oscsRef.current = {};

    // ボイスの個性を計算
    computeVoiceTraits();

    // 録音用 MediaStreamDestination
    const dest = ctx.createMediaStreamDestination();
    destNodeRef.current = dest;

    layersRef.current.forEach(layer => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      osc.type = layer.waveform || "sine";
      gain.gain.value = 0;
      panner.pan.value = layer.pan || 0;
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(ctx.destination);
      panner.connect(dest); // 録音にも流す
      osc.start();
      oscsRef.current[layer.id] = { osc, gain, panner };
    });

    startTimeRef.current = ctx.currentTime;
    playingRef.current = true;
    if (ctx.state === "suspended") ctx.resume();

    const tick = () => {
      if (!playingRef.current) return;
      const elapsed = (ctx.currentTime - startTimeRef.current) % durationRef.current;
      setPlayhead(elapsed / durationRef.current);

      const activeLayers = layersRef.current.filter(l => !l.muted);
      const perVol = volumeRef.current / Math.max(1, activeLayers.length);
      const traits = voiceTraitsRef.current;

      layersRef.current.forEach(layer => {
        const voice = oscsRef.current[layer.id];
        if (!voice) return;
        voice.panner.pan.setTargetAtTime(layer.pan || 0, ctx.currentTime, 0.05);

        const baseFreq = getFreqAtTime(layer.id, elapsed);
        if (baseFreq) {
          // LFOオフセットを加算
          const lfoOffset = getLFOOffset(layer.id, elapsed);
          const finalFreq = applyLFO(baseFreq, lfoOffset);
          // 慣性（ボイスごとに異なる追従速度）
          const inertia = traits[layer.id]?.inertia || 0.05;
          voice.osc.frequency.setTargetAtTime(finalFreq, ctx.currentTime, inertia);
          voice.gain.gain.setTargetAtTime(perVol, ctx.currentTime, 0.01);
        } else {
          voice.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        }
      });

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [getFreqAtTime, getLFOOffset, computeVoiceTraits]);

  const stopPlay = useCallback(() => {
    playingRef.current = false;
    cancelAnimationFrame(rafRef.current);
    const ctx = audioCtxRef.current;
    if (ctx) {
      Object.values(oscsRef.current).forEach(({ osc, gain }) => {
        try { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } catch (e) {}
        setTimeout(() => { try { osc.stop(); } catch (e) {} }, 200);
      });
    }
    oscsRef.current = {};
  }, []);

  const togglePlay = () => {
    if (playing) { stopPlay(); setPlaying(false); }
    else { startPlay(); setPlaying(true); }
  };

  // ── 録音開始
  const startRecording = useCallback(() => {
    // まず再生開始（していなければ）
    if (!playingRef.current) { startPlay(); setPlaying(true); }

    const dest = destNodeRef.current;
    if (!dest) return;

    recordedChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus" : "audio/webm";

    const mr = new MediaRecorder(dest.stream, { mimeType });
    mr.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `graphic-score-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };

    mr.start(100);
    mediaRecorderRef.current = mr;
    setRecording(true);
    setRecRemaining(recDuration);

    // カウントダウン
    let remaining = recDuration;
    recTimerRef.current = setInterval(() => {
      remaining -= 1;
      setRecRemaining(remaining);
      if (remaining <= 0) stopRecording();
    }, 1000);
  }, [recDuration, startPlay]);

  // ── 録音停止
  const stopRecording = useCallback(() => {
    clearInterval(recTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    setRecRemaining(0);
  }, []);

  const addLayer = () => {
    if (layers.length >= VOICE_COLORS.length) return;
    const id = Date.now();
    setLayers(prev => [...prev, makeLayer(id, `Voice ${prev.length + 1}`, VOICE_COLORS[prev.length])]);
    setActiveLayerId(id);
  };

  const removeLayer = (id) => {
    if (layers.length <= 1) return;
    setLayers(prev => { const next = prev.filter(l => l.id !== id); if (activeLayerId === id) setActiveLayerId(next[0].id); return next; });
  };

  const toggleMute = (id) => setLayers(prev => prev.map(l => l.id === id ? { ...l, muted: !l.muted } : l));
  const clearLayer = (id) => setLayers(prev => prev.map(l => l.id === id ? { ...l, strokes: [] } : l));
  const setWaveform = (id, wf) => setLayers(prev => prev.map(l => l.id === id ? { ...l, waveform: wf } : l));
  const setPan = (id, pan) => {
    setLayers(prev => { const next = prev.map(l => l.id === id ? { ...l, pan } : l); layersRef.current = next; return next; });
  };
  const clearAll = () => { stopPlay(); setPlaying(false); setLayers(prev => prev.map(l => ({ ...l, strokes: [] }))); setPlayhead(0); };

  const saveToFile = () => {
    const data = { version: 2, duration, layers };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `graphic-score-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const loadFromFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.layers) {
          stopPlay(); setPlaying(false);
          setLayers(data.layers);
          if (data.duration) { setDuration(data.duration); durationRef.current = data.duration; }
          setActiveLayerId(data.layers[0].id);
        }
      } catch (err) { alert("読み込みに失敗しました"); }
    };
    reader.readAsText(file); e.target.value = "";
  };

  const activeLayer = layers.find(l => l.id === activeLayerId);
  const accentColor = activeLayer?.color || "#00e5ff";

  // LFOインジケーター（再生中の各ボイスの揺れ量を可視化）
  const [lfoIndicators, setLfoIndicators] = useState({});
  useEffect(() => {
    if (!playing || lfoSens === 0) { setLfoIndicators({}); return; }
    const id = setInterval(() => {
      const elapsed = audioCtxRef.current ? (audioCtxRef.current.currentTime - startTimeRef.current) % durationRef.current : 0;
      const indicators = {};
      layersRef.current.forEach(layer => {
        const traits = voiceTraitsRef.current[layer.id];
        if (!traits) return;
        const lfo = Math.sin((elapsed / traits.period + traits.phase) * Math.PI * 2);
        indicators[layer.id] = lfo * traits.depth * lfoSens;
      });
      setLfoIndicators(indicators);
    }, 50);
    return () => clearInterval(id);
  }, [playing, lfoSens]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080808; overflow: hidden; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.2; } }
      `}</style>

      <input ref={fileInputRef} type="file" accept=".json" style={{ display: "none" }} onChange={loadFromFile} />

      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#080808", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>

        {/* Header */}
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", background: "#0c0c0c" }}>
          <span style={{ fontFamily: "'Share Tech Mono', monospace", color: "#00e5ff", fontSize: "11px", letterSpacing: "2px", flexShrink: 0 }}>GRAPHIC SCORE</span>

          <button onClick={togglePlay}
            style={{ padding: "5px 16px", borderRadius: "7px", border: "none", background: playing ? "#ff4d6d" : "#00e5ff", color: "#000", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", fontSize: "12px" }}>
            {playing ? "■ STOP" : "▶ PLAY"}
          </button>

          <div style={{ display: "flex", gap: "3px" }}>
            {["pen", "eraser"].map(t => (
              <button key={t} onClick={() => setTool(t)}
                style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid", borderColor: tool === t ? accentColor : "#2a2a2a", background: tool === t ? accentColor + "22" : "transparent", color: tool === t ? accentColor : "#555", cursor: "pointer", fontSize: "13px" }}>
                {t === "pen" ? "✏" : "⌫"}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
            <span style={{ fontSize: "9px", color: "#444", fontFamily: "'Share Tech Mono', monospace" }}>LOOP</span>
            {[4, 8, 16, 32].map(d => (
              <button key={d} onClick={() => { setDuration(d); durationRef.current = d; redraw(); }}
                style={{ padding: "3px 7px", borderRadius: "5px", border: "1px solid", borderColor: duration === d ? "#00e5ff" : "#2a2a2a", background: duration === d ? "#00e5ff15" : "transparent", color: duration === d ? "#00e5ff" : "#555", cursor: "pointer", fontFamily: "'Share Tech Mono', monospace", fontSize: "10px" }}>
                {d}s
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ fontSize: "9px", color: "#444", fontFamily: "'Share Tech Mono', monospace" }}>VOL</span>
            <input type="range" min="0" max="1" step="0.01" value={volume}
              onChange={e => { setVolume(Number(e.target.value)); volumeRef.current = Number(e.target.value); }}
              style={{ width: "55px", accentColor: "#00e5ff" }} />
          </div>

          {/* LFO SENS — メインコントロール */}
          <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "8px", border: `1px solid ${lfoSens > 0 ? "#ff922b44" : "#2a2a2a"}`, background: lfoSens > 0 ? "#ff922b08" : "transparent", transition: "all 0.3s" }}>
            <span style={{ fontSize: "9px", color: lfoSens > 0 ? "#ff922b" : "#444", fontFamily: "'Share Tech Mono', monospace", letterSpacing: "1px", transition: "color 0.3s" }}>LFO SENS</span>
            <input type="range" min="0" max="1" step="0.01" value={lfoSens}
              onChange={e => setLfoSens(Number(e.target.value))}
              style={{ width: "70px", accentColor: "#ff922b" }} />
            <span style={{ fontSize: "9px", color: lfoSens > 0 ? "#ff922b" : "#333", fontFamily: "'Share Tech Mono', monospace", minWidth: "24px" }}>
              {Math.round(lfoSens * 100)}
            </span>
          </div>

          <button onClick={() => setShowGrid(g => !g)}
            style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #2a2a2a", background: "transparent", color: showGrid ? "#555" : "#2a2a2a", cursor: "pointer", fontSize: "10px" }}>
            GRID
          </button>

          {/* REC コントロール */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "8px", border: `1px solid ${recording ? "#ff4d6d88" : "#2a2a2a"}`, background: recording ? "#ff4d6d0a" : "transparent", transition: "all 0.3s" }}>
            {!recording ? (
              <>
                <span style={{ fontSize: "9px", color: "#555", fontFamily: "'Share Tech Mono', monospace" }}>REC</span>
                {[60, 180, 300, 600].map(s => (
                  <button key={s} onClick={() => setRecDuration(s)}
                    style={{ padding: "2px 5px", borderRadius: "4px", border: "1px solid", borderColor: recDuration === s ? "#ff4d6d" : "#2a2a2a", background: recDuration === s ? "#ff4d6d15" : "transparent", color: recDuration === s ? "#ff4d6d" : "#444", cursor: "pointer", fontFamily: "'Share Tech Mono', monospace", fontSize: "9px" }}>
                    {s >= 60 ? `${s / 60}m` : `${s}s`}
                  </button>
                ))}
                <button onClick={startRecording}
                  style={{ padding: "3px 9px", borderRadius: "5px", border: "none", background: "#ff4d6d", color: "#fff", fontWeight: "700", cursor: "pointer", fontSize: "10px", fontFamily: "inherit" }}>
                  ● REC
                </button>
              </>
            ) : (
              <>
                <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#ff4d6d", animation: "pulse 1s infinite" }} />
                <span style={{ fontSize: "10px", color: "#ff4d6d", fontFamily: "'Share Tech Mono', monospace", minWidth: "36px" }}>
                  {Math.floor(recRemaining / 60)}:{String(recRemaining % 60).padStart(2, "0")}
                </span>
                <button onClick={stopRecording}
                  style={{ padding: "3px 9px", borderRadius: "5px", border: "1px solid #ff4d6d", background: "transparent", color: "#ff4d6d", cursor: "pointer", fontSize: "10px", fontFamily: "inherit" }}>
                  ■ STOP
                </button>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: "4px", marginLeft: "auto" }}>
            <button onClick={saveToFile}
              style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #2a2a2a", background: "transparent", color: "#00e5ff", cursor: "pointer", fontSize: "10px", fontFamily: "'Share Tech Mono', monospace" }}>
              ↓ SAVE
            </button>
            <button onClick={() => fileInputRef.current.click()}
              style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #2a2a2a", background: "transparent", color: "#a8ff3e", cursor: "pointer", fontSize: "10px", fontFamily: "'Share Tech Mono', monospace" }}>
              ↑ LOAD
            </button>
          </div>

          <button onClick={clearAll}
            style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #2a2a2a", background: "transparent", color: "#555", cursor: "pointer", fontSize: "10px" }}>
            CLEAR
          </button>
        </div>

        {/* Main */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* Voice panel */}
          <div style={{ width: "110px", flexShrink: 0, background: "#0a0a0a", borderRight: "1px solid #1a1a1a", display: "flex", flexDirection: "column", padding: "8px 6px", gap: "5px", overflowY: "auto" }}>
            <div style={{ fontSize: "8px", color: "#333", letterSpacing: "2px", fontFamily: "'Share Tech Mono', monospace", marginBottom: "2px" }}>VOICES</div>

            {layers.map(layer => {
              const isActive = layer.id === activeLayerId;
              const lfoInd = lfoIndicators[layer.id] || 0;
              return (
                <div key={layer.id} onClick={() => setActiveLayerId(layer.id)}
                  style={{ borderRadius: "7px", border: `1px solid ${isActive ? layer.color + "88" : "#1a1a1a"}`, background: isActive ? layer.color + "12" : "transparent", padding: "6px 7px", cursor: "pointer", transition: "all 0.15s" }}>

                  <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "5px" }}>
                    <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: layer.muted ? "#333" : layer.color, flexShrink: 0,
                      boxShadow: lfoInd !== 0 ? `0 0 ${Math.abs(lfoInd) * 8}px ${layer.color}` : "none", transition: "box-shadow 0.05s" }} />
                    <span style={{ fontSize: "10px", color: isActive ? "#fff" : "#555", fontWeight: isActive ? "600" : "400", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{layer.label}</span>
                  </div>

                  {/* LFOインジケーターバー */}
                  {lfoSens > 0 && (
                    <div style={{ height: "2px", background: "#1a1a1a", borderRadius: "1px", marginBottom: "5px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.abs(lfoInd) * 100}%`, background: layer.color, marginLeft: lfoInd < 0 ? `${(1 + lfoInd) * 100}%` : "50%", transition: "all 0.05s", opacity: 0.8 }} />
                    </div>
                  )}

                  {isActive && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px", marginBottom: "6px" }}>
                        {WAVEFORMS.map(wf => (
                          <button key={wf.type} onClick={e => { e.stopPropagation(); setWaveform(layer.id, wf.type); }}
                            style={{ padding: "3px 0", fontSize: "11px", border: "1px solid", borderColor: layer.waveform === wf.type ? layer.color : "#222", borderRadius: "4px", background: layer.waveform === wf.type ? layer.color + "22" : "transparent", color: layer.waveform === wf.type ? layer.color : "#444", cursor: "pointer" }}>
                            {wf.symbol}
                          </button>
                        ))}
                      </div>

                      <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px" }} onClick={e => e.stopPropagation()}>
                        <PanKnob value={layer.pan || 0} onChange={v => setPan(layer.id, v)} color={layer.color} />
                      </div>
                    </>
                  )}

                  <div style={{ display: "flex", gap: "3px" }}>
                    <button onClick={e => { e.stopPropagation(); toggleMute(layer.id); }}
                      style={{ flex: 1, padding: "2px 0", fontSize: "8px", border: "1px solid #222", borderRadius: "3px", background: layer.muted ? "#333" : "transparent", color: layer.muted ? "#fff" : "#444", cursor: "pointer", fontFamily: "inherit" }}>
                      {layer.muted ? "UN" : "M"}
                    </button>
                    <button onClick={e => { e.stopPropagation(); clearLayer(layer.id); }}
                      style={{ flex: 1, padding: "2px 0", fontSize: "8px", border: "1px solid #222", borderRadius: "3px", background: "transparent", color: "#444", cursor: "pointer" }}>
                      CLR
                    </button>
                    {layers.length > 1 && (
                      <button onClick={e => { e.stopPropagation(); removeLayer(layer.id); }}
                        style={{ padding: "2px 4px", fontSize: "8px", border: "1px solid #222", borderRadius: "3px", background: "transparent", color: "#444", cursor: "pointer" }}>
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {layers.length < VOICE_COLORS.length && (
              <button onClick={addLayer}
                style={{ padding: "5px", borderRadius: "7px", border: "1px dashed #222", background: "transparent", color: "#333", cursor: "pointer", fontSize: "10px", fontFamily: "inherit" }}>
                + ADD
              </button>
            )}
          </div>

          {/* Hz axis */}
          <div style={{ width: "36px", flexShrink: 0, position: "relative", borderRight: "1px solid #1a1a1a" }}>
            {[100, 200, 400, 800, 1600, 3200].map(f => (
              <div key={f} style={{ position: "absolute", right: "3px", top: `${(freqToY(f, size.h) / size.h) * 100}%`, transform: "translateY(-50%)", fontSize: "7px", color: "#333", fontFamily: "'Share Tech Mono', monospace", whiteSpace: "nowrap" }}>
                {f >= 1000 ? `${f / 1000}k` : f}
              </div>
            ))}
          </div>

          {/* Canvas */}
          <div ref={containerRef} style={{ flex: 1, position: "relative", cursor: tool === "eraser" ? "cell" : "crosshair" }}>
            <canvas ref={canvasRef}
              width={size.w} height={size.h}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", touchAction: "none" }}
              onMouseDown={e => { onPointerDown(e); onErase(e); }}
              onMouseMove={e => { onPointerMove(e); if (e.buttons === 1) onErase(e); }}
              onMouseUp={onPointerUp}
              onMouseLeave={onPointerUp}
              onTouchStart={e => { e.preventDefault(); onPointerDown(e); onErase(e); }}
              onTouchMove={e => { e.preventDefault(); onPointerMove(e); }}
              onTouchEnd={onPointerUp}
            />

            {playing && (
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${playhead * 100}%`, width: "2px", background: "#fff", boxShadow: "0 0 10px #ffffff88", pointerEvents: "none" }} />
            )}

            {layers.every(l => l.strokes.length === 0) && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <div style={{ textAlign: "center", color: "#2a2a2a" }}>
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>✏</div>
                  <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: "11px", letterSpacing: "2px" }}>DRAW TO COMPOSE</div>
                  <div style={{ fontSize: "9px", marginTop: "6px", color: "#222" }}>左のパネルで声部を選んで描く</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Time axis */}
        <div style={{ height: "20px", borderTop: "1px solid #1a1a1a", background: "#0c0c0c", position: "relative", paddingLeft: "146px" }}>
          {Array.from({ length: duration + 1 }).map((_, i) => (
            <div key={i} style={{ position: "absolute", left: `calc(146px + ${(i / duration) * 100}%)`, fontSize: "7px", color: "#333", fontFamily: "'Share Tech Mono', monospace", transform: "translateX(-50%)", top: "4px" }}>
              {i}s
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
