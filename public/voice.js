// ГРЯЗЬ — голосовой чат за столом.
// Звук идёт напрямую между браузерами (WebRTC, «каждый с каждым»), сервер только знакомит их.
// Если напрямую связаться не вышло (мобильный интернет, строгий роутер), включается ретранслятор:
// голос режется на кусочки по 40 мс, сжимается (16 кГц, μ-закон) и идёт через сервер игры
// тем же соединением, что и сама игра. Если на сервере настроен TURN — прямая связь находится чаще.

const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
const SPEAK_LEVEL = 0.03;
const GATE_LEVEL = 0.012; // тише этого через ретранслятор не шлём (с «хвостом» 0,5 с)
const RELAY_RATE = 16000;
const CONNECT_WAIT_MS = 9000; // столько ждём прямую связь, потом — ретранслятор
const forceRelay = () => {
  try {
    return localStorage.getItem('gr.voiceRelay') === 'always';
  } catch {
    return false;
  }
};

// обработчики звука: сбор кусочков с микрофона и проигрывание с запасом против рывков сети
const WORKLET = `
class GrCap extends AudioWorkletProcessor {
  constructor() { super(); this.size = Math.round(sampleRate * 0.04); this.buf = new Float32Array(this.size); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) { this.buf[this.n++] = ch[i]; if (this.n === this.size) { this.port.postMessage(this.buf.slice(0)); this.n = 0; } }
    return true;
  }
}
registerProcessor('gr-cap', GrCap);
class GrPlay extends AudioWorkletProcessor {
  constructor() {
    super(); this.q = new Float32Array(32000); this.r = 0; this.w = 0; this.len = 0; this.pos = 0; this.on = false; this.step = ${RELAY_RATE} / sampleRate;
    this.port.onmessage = e => {
      const d = e.data, Q = this.q.length;
      for (let i = 0; i < d.length; i++) { this.q[this.w] = d[i]; this.w = (this.w + 1) % Q; if (this.len < Q) this.len++; else this.r = (this.r + 1) % Q; }
      if (this.len > 12000) { const drop = this.len - 4000; this.r = (this.r + drop) % Q; this.len -= drop; }
    };
  }
  process(_, outputs) {
    const out = outputs[0][0], Q = this.q.length;
    if (!this.on && this.len >= 2400) this.on = true;
    for (let i = 0; i < out.length; i++) {
      if (!this.on || this.len < 2) { out[i] = 0; this.on = false; continue; }
      const a = this.q[this.r], b = this.q[(this.r + 1) % Q];
      out[i] = a + (b - a) * this.pos;
      this.pos += this.step;
      while (this.pos >= 1) { this.pos -= 1; this.r = (this.r + 1) % Q; this.len--; }
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('gr-play', GrPlay);`;

// μ-закон (G.711): 8 бит на отсчёт вместо 16
function muEnc(x) {
  let s = Math.max(-1, Math.min(1, x)) * 32767;
  const sign = s < 0 ? 0x80 : 0;
  if (sign) s = -s;
  s = Math.min(32635, s + 132);
  let exp = 7;
  for (let m = 0x4000; (s & m) === 0 && exp > 0; m >>= 1) exp--;
  return ~(sign | (exp << 4) | ((s >> (exp + 3)) & 0x0f)) & 0xff;
}
const MU = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  const t = (((u & 0x0f) << 3) + 132) << ((u & 0x70) >> 4);
  MU[i] = ((u & 0x80) ? 132 - t : t - 132) / 32768;
}
// кусок с микрофона → 16 кГц, μ-закон (усреднение по окну заодно срезает высокие частоты)
function pack(buf, rate) {
  const k = rate / RELAY_RATE;
  const n = Math.floor(buf.length / k);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * k);
    const b = Math.max(a + 1, Math.min(buf.length, Math.floor((i + 1) * k)));
    let s = 0;
    for (let j = a; j < b; j++) s += buf[j];
    out[i] = muEnc(s / (b - a));
  }
  return out;
}

const hexToBytes = (hex, out, at) => {
  for (let i = 0; i < 6; i++) out[at + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
};
const bytesToHex = (u8, at) => Array.from(u8.subarray(at, at + 6), (b) => b.toString(16).padStart(2, '0')).join('');

// bus: { send(obj), sendBinary(Uint8Array), request(obj, replyType) }
export function createVoice(bus, { onChange = () => {}, onError = () => {} } = {}) {
  const V = { joined: false, joining: false, me: null, muted: false, stream: null, peers: new Map(), speaking: new Set(), selfSpeaking: false, levels: new Map(), selfLevel: 0 };
  let ac = null;
  let selfAnalyser = null;
  let meterTimer = null;
  let ice = STUN;
  const relayTo = new Set();
  let workletReady = null;
  let cap = null;
  let loudAt = 0;

  const signal = (to, data) => bus.send({ t: 'voice', a: 'signal', to, data });
  const audioCtx = () => (ac ||= new (window.AudioContext || window.webkitAudioContext)());

  function meter(stream) {
    try {
      const a = audioCtx().createAnalyser();
      a.fftSize = 512;
      audioCtx().createMediaStreamSource(stream).connect(a);
      return a;
    } catch {
      return null;
    }
  }
  const buf = new Float32Array(512);
  const levelOf = (a) => {
    if (!a) return 0;
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    return Math.sqrt(sum / buf.length);
  };

  // каждые 80 мс считаем, кто говорит и насколько громко, — для анимации вокруг аватарок
  function tickMeters() {
    let changed = false;
    const lvl = V.muted ? 0 : levelOf(selfAnalyser);
    V.selfLevel = lvl;
    const was = V.selfSpeaking;
    V.selfSpeaking = lvl > SPEAK_LEVEL;
    if (was !== V.selfSpeaking) changed = true;
    const t = performance.now();
    for (const [id, p] of V.peers) {
      let l;
      if (p.relay) l = t - (p.heardAt || 0) < 250 ? p.relayLevel || 0.05 : 0;
      else l = levelOf(p.analyser);
      V.levels.set(id, l);
      const on = l > SPEAK_LEVEL;
      if (on !== V.speaking.has(id)) {
        on ? V.speaking.add(id) : V.speaking.delete(id);
        changed = true;
      }
    }
    if (changed) onChange('speaking');
  }

  function peer(id) {
    let p = V.peers.get(id);
    if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: ice });
    p = { pc, audio: null, analyser: null, pending: [], relay: false, state: 'connecting' };
    V.peers.set(id, p);
    p.waitTimer = setTimeout(() => {
      if (forceRelay() || pc.connectionState !== 'connected') useRelay(id);
    }, forceRelay() ? 300 : CONNECT_WAIT_MS);
    V.stream?.getTracks().forEach((t) => pc.addTrack(t, V.stream));
    pc.onicecandidate = (e) => {
      if (e.candidate) signal(id, { candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      const s = e.streams[0] || new MediaStream([e.track]);
      if (!p.audio) {
        p.audio = new Audio();
        p.audio.autoplay = true;
        p.audio.setAttribute('playsinline', '');
        document.body.append(p.audio);
      }
      p.audio.srcObject = s;
      p.audio.muted = p.relay;
      p.audio.play().catch(() => {});
      p.analyser = meter(s);
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (!p.relay) p.state = st;
      if (st === 'connected' && !forceRelay()) clearTimeout(p.waitTimer);
      if (st === 'failed') useRelay(id);
      if (st === 'disconnected') {
        clearTimeout(p.waitTimer);
        p.waitTimer = setTimeout(() => {
          if (pc.connectionState !== 'connected') useRelay(id);
        }, 5000);
      }
      onChange('state');
    };
    return p;
  }

  function dropPeer(id) {
    const p = V.peers.get(id);
    if (!p) return;
    clearTimeout(p.waitTimer);
    try {
      p.pc.close();
    } catch {}
    p.audio?.remove();
    try {
      p.player?.disconnect();
      p.gain?.disconnect();
    } catch {}
    V.peers.delete(id);
    V.speaking.delete(id);
    V.levels.delete(id);
    relayTo.delete(id);
    if (!relayTo.size) stopCapture();
  }

  // ───── ретранслятор через сервер игры ─────
  function loadWorklet() {
    if (workletReady) return workletReady;
    const ctx = audioCtx();
    if (!ctx.audioWorklet) return (workletReady = Promise.resolve(false));
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    workletReady = ctx.audioWorklet.addModule(url).then(
      () => true,
      () => false
    );
    return workletReady;
  }
  async function useRelay(id, notify = true) {
    const p = V.peers.get(id);
    if (!p || p.relay || !V.joined) return;
    p.relay = true;
    p.state = 'relay';
    clearTimeout(p.waitTimer);
    if (p.audio) p.audio.muted = true;
    relayTo.add(id);
    if (notify) signal(id, { relay: true });
    if (!(await loadWorklet())) {
      p.state = 'failed';
      onError('Этот браузер не умеет передавать голос через сервер. Попробуйте Chrome, Edge, Firefox или свежий Safari.');
    } else startCapture();
    onChange('state');
  }
  function startCapture() {
    if (cap || !V.stream || !relayTo.size) return;
    try {
      const ctx = audioCtx();
      const src = ctx.createMediaStreamSource(V.stream);
      const node = new AudioWorkletNode(ctx, 'gr-cap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
      const sink = ctx.createGain();
      sink.gain.value = 0; // узел должен быть подключён к выходу, иначе браузер его не крутит
      src.connect(node);
      node.connect(sink);
      sink.connect(ctx.destination);
      node.port.onmessage = (e) => sendChunk(e.data, ctx.sampleRate);
      cap = { src, node, sink };
    } catch {}
  }
  function stopCapture() {
    if (!cap) return;
    try {
      cap.src.disconnect();
      cap.node.disconnect();
      cap.sink.disconnect();
      cap.node.port.onmessage = null;
    } catch {}
    cap = null;
  }
  function sendChunk(chunk, rate) {
    if (!relayTo.size || !V.joined || V.muted) return;
    let sum = 0;
    for (let i = 0; i < chunk.length; i += 4) sum += chunk[i] * chunk[i];
    const t = performance.now();
    if (Math.sqrt(sum / (chunk.length / 4)) > GATE_LEVEL) loudAt = t;
    if (t - loudAt > 500) return; // тишину не гоняем по сети
    const audio = pack(chunk, rate);
    const targets = [...relayTo];
    const frame = new Uint8Array(1 + targets.length * 6 + audio.length);
    frame[0] = targets.length;
    targets.forEach((id, i) => hexToBytes(id, frame, 1 + i * 6));
    frame.set(audio, 1 + targets.length * 6);
    bus.sendBinary(frame);
  }
  async function playChunk(from, data) {
    const p = V.peers.get(from);
    if (!p || !V.joined) return;
    if (!p.relay) useRelay(from, false); // собеседник уже говорит через сервер — отвечаем тем же
    if (!(await loadWorklet())) return;
    const ctx = audioCtx();
    if (!p.player) {
      try {
        p.player = new AudioWorkletNode(ctx, 'gr-play', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
        p.gain = ctx.createGain();
        p.player.connect(p.gain);
        p.gain.connect(ctx.destination);
      } catch {
        return;
      }
    }
    if (ctx.state !== 'running') ctx.resume?.().catch(() => {});
    const f = new Float32Array(data.length);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = MU[data[i]];
      f[i] = v;
      sum += v * v;
    }
    const lvl = Math.sqrt(sum / Math.max(1, data.length));
    if (lvl > SPEAK_LEVEL) {
      p.heardAt = performance.now();
      p.relayLevel = lvl;
    }
    p.player.port.postMessage(f, [f.buffer]);
  }

  // кадр от сервера: [6 байт — кто говорит][звук]
  function onBinary(u8) {
    if (u8.length < 7) return;
    playChunk(bytesToHex(u8, 0), u8.subarray(6));
  }

  async function onSignal({ from, data }) {
    if (!V.joined || !data) return;
    const p = peer(from);
    try {
      if (data.relay) {
        useRelay(from, false);
        return;
      }
      if (data.sdp) {
        await p.pc.setRemoteDescription(data.sdp);
        for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
        if (data.sdp.type === 'offer') {
          const ans = await p.pc.createAnswer();
          await p.pc.setLocalDescription(ans);
          signal(from, { sdp: p.pc.localDescription.toJSON() });
        }
      } else if (data.candidate) {
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.candidate).catch(() => {});
        else p.pending.push(data.candidate);
      }
    } catch {}
  }

  async function join(existing = null) {
    if (V.joined || V.joining) return { ok: true };
    V.joining = true;
    onChange('state');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Браузер не даёт доступ к микрофону. Откройте игру по https в Chrome, Safari или Firefox.');
      V.stream = existing || (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }));
      audioCtx().resume?.();
      selfAnalyser = meter(V.stream);
      const r = await bus.request({ t: 'voice', a: 'join', muted: V.muted }, 'voice:joined');
      if (!r || !r.ok) {
        stopStream();
        throw new Error((r && r.error) || 'Сервер не пустил в голосовой чат');
      }
      if (Array.isArray(r.ice) && r.ice.length) ice = r.ice;
      V.joined = true;
      V.me = r.me;
      loadWorklet();
      V.stream.getAudioTracks().forEach((t) => (t.enabled = !V.muted));
      for (const id of r.peers) {
        const p = peer(id);
        const offer = await p.pc.createOffer();
        await p.pc.setLocalDescription(offer);
        signal(id, { sdp: p.pc.localDescription.toJSON() });
      }
      meterTimer ||= setInterval(tickMeters, 80);
      return { ok: true };
    } catch (e) {
      const msg = e?.name === 'NotAllowedError' ? 'Без разрешения на микрофон голосовой чат не включится. Разрешите микрофон в настройках браузера.' : e?.message || 'Не удалось включить голосовой чат';
      onError(msg);
      return { ok: false, error: msg };
    } finally {
      V.joining = false;
      onChange('state');
    }
  }
  function stopStream() {
    stopCapture();
    V.stream?.getTracks().forEach((t) => t.stop());
    V.stream = null;
    selfAnalyser = null;
  }
  function cleanup() {
    for (const id of [...V.peers.keys()]) dropPeer(id);
    relayTo.clear();
    stopCapture();
    stopStream();
    clearInterval(meterTimer);
    meterTimer = null;
    V.joined = false;
    V.me = null;
    V.selfSpeaking = false;
    V.selfLevel = 0;
  }
  function leave() {
    if (!V.joined) return;
    bus.send({ t: 'voice', a: 'leave' });
    cleanup();
    onChange('left');
  }
  function setMuted(m) {
    V.muted = !!m;
    V.stream?.getAudioTracks().forEach((t) => (t.enabled = !V.muted));
    if (V.joined) bus.send({ t: 'voice', a: 'mute', muted: V.muted });
    onChange('mute');
  }
  // соединение с сервером восстановилось — сервер нас забыл, заходим заново с тем же микрофоном
  function rejoin() {
    if (!V.joined) return;
    const s = V.stream;
    for (const id of [...V.peers.keys()]) dropPeer(id);
    V.joined = false;
    join(s);
  }
  // кто сейчас в голосовом чате — приходит вместе с состоянием комнаты
  function sync(players) {
    if (!V.joined) return;
    const live = new Set(players.filter((p) => p.voice && p.voice !== 'off').map((p) => p.id));
    for (const id of [...V.peers.keys()]) if (!live.has(id)) dropPeer(id);
    if (!live.has(V.me) && !V.joining) rejoin();
  }

  return {
    state: V,
    join,
    leave,
    setMuted,
    sync,
    rejoin,
    cleanup,
    onSignal,
    onBinary,
    isSpeaking: (id) => (id === V.me ? V.selfSpeaking : V.speaking.has(id)),
    level: (id) => (id === V.me ? V.selfLevel : V.levels.get(id) || 0),
    viaRelay: (id) => !!V.peers.get(id)?.relay
  };
}
