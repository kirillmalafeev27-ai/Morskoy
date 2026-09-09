// Advanced procedural audio system using Web Audio API
// Two atmosphere modes: creepy and calm
// All sounds generated programmatically - no external files needed

class AudioManager {
  constructor() {
    this.ctx = null;
    this.isCreepy = true;
    this.masterGain = null;
    this.ambienceGain = null;
    this.monsterGain = null;
    this.initialized = false;
    this.monsterProximity = 0;
    this.nodes = []; // track all nodes for cleanup
    this.intervals = [];
    this._resumeGuard = null;
  }

  init(isCreepy) {
    if (this.initialized) this.dispose();

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.isCreepy = isCreepy;
    this.initialized = true;

    // iOS Safari requires resume after user gesture
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this._installResumeGuard();

    // Master
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.35;
    this.masterGain.connect(this.ctx.destination);

    // Ambience bus
    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = 0.2;
    this.ambienceGain.connect(this.masterGain);

    // Monster bus
    this.monsterGain = this.ctx.createGain();
    this.monsterGain.gain.value = 0;
    this.monsterGain.connect(this.masterGain);

    if (isCreepy) {
      this._startCreepyAmbience();
    } else {
      this._startCalmAmbience();
    }
    this._startMonsterSound();
    this._startRandomEffects();
  }

  // ===== CREEPY AMBIENCE =====
  _startCreepyAmbience() {
    // Deep sub-bass drone
    const drone = this._createOsc('sawtooth', 38);
    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 70;
    droneFilter.Q.value = 2;
    drone.connect(droneFilter);
    droneFilter.connect(this.ambienceGain);

    // Dissonant minor second drone
    const drone2 = this._createOsc('sine', 41);
    const drone2Gain = this.ctx.createGain();
    drone2Gain.gain.value = 0.3;
    drone2.connect(drone2Gain);
    drone2Gain.connect(this.ambienceGain);

    // High eerie whine with slow vibrato
    const eerie = this._createOsc('sine', 880);
    const eerieGain = this.ctx.createGain();
    eerieGain.gain.value = 0.015;
    const lfo = this._createOsc('sine', 0.2);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 30;
    lfo.connect(lfoGain);
    lfoGain.connect(eerie.frequency);
    eerie.connect(eerieGain);
    eerieGain.connect(this.ambienceGain);

    // Filtered noise for "wind in corridors"
    this._createFilteredNoise(0.06, 200, 800, this.ambienceGain);

    // Occasional low rumble
    const rumbleLfo = this._createOsc('sine', 0.08);
    const rumbleGain = this.ctx.createGain();
    rumbleGain.gain.value = 0.1;
    rumbleLfo.connect(rumbleGain);
    rumbleGain.connect(this.ambienceGain);
  }

  // ===== CALM AMBIENCE =====
  _startCalmAmbience() {
    // Warm pad: root + fifth + octave
    const notes = [110, 165, 220];
    notes.forEach((freq, i) => {
      const osc = this._createOsc('sine', freq);
      const gain = this.ctx.createGain();
      gain.gain.value = 0.06 - i * 0.015;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ambienceGain);
    });

    // Gentle shimmer
    const shimmer = this._createOsc('sine', 660);
    const shimmerGain = this.ctx.createGain();
    shimmerGain.gain.value = 0.008;
    const shimmerLfo = this._createOsc('sine', 0.15);
    const shimmerLfoGain = this.ctx.createGain();
    shimmerLfoGain.gain.value = 15;
    shimmerLfo.connect(shimmerLfoGain);
    shimmerLfoGain.connect(shimmer.frequency);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(this.ambienceGain);

    // Soft noise (like distant water)
    this._createFilteredNoise(0.02, 600, 2000, this.ambienceGain);
  }

  // ===== MONSTER SOUND =====
  _startMonsterSound() {
    // Growl: low sawtooth with bandpass
    const growl = this._createOsc('sawtooth', this.isCreepy ? 50 : 70);
    const growlFilter = this.ctx.createBiquadFilter();
    growlFilter.type = 'bandpass';
    growlFilter.frequency.value = 90;
    growlFilter.Q.value = 4;

    // Breathing tremolo
    const tremolo = this._createOsc('sine', this.isCreepy ? 2.5 : 1.8);
    const tremoloGain = this.ctx.createGain();
    tremoloGain.gain.value = 0.6;
    const monsterVol = this.ctx.createGain();
    monsterVol.gain.value = 1;
    tremolo.connect(tremoloGain);
    tremoloGain.connect(monsterVol.gain);
    growl.connect(growlFilter);
    growlFilter.connect(monsterVol);
    monsterVol.connect(this.monsterGain);

    // Additional raspy texture
    if (this.isCreepy) {
      const rasp = this._createOsc('square', 55);
      const raspFilter = this.ctx.createBiquadFilter();
      raspFilter.type = 'bandpass';
      raspFilter.frequency.value = 120;
      raspFilter.Q.value = 8;
      const raspGain = this.ctx.createGain();
      raspGain.gain.value = 0.3;
      rasp.connect(raspFilter);
      raspFilter.connect(raspGain);
      raspGain.connect(this.monsterGain);

      // Monster noise (hissing)
      this._createFilteredNoise(0.15, 80, 300, this.monsterGain);
    }
  }

  // ===== RANDOM ATMOSPHERIC EFFECTS =====
  _startRandomEffects() {
    if (!this.isCreepy) return;

    // Occasional distant metallic clang or drip
    const interval = setInterval(() => {
      if (!this.initialized) return;
      if (Math.random() < 0.3) {
        this._playDrip();
      } else if (Math.random() < 0.2) {
        this._playDistantClang();
      }
    }, 4000 + Math.random() * 6000);
    this.intervals.push(interval);
  }

  _playDrip() {
    if (!this.initialized) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const freq = 1200 + Math.random() * 800;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.3, this.ctx.currentTime + 0.08);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.03, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq * 0.5;
    filter.Q.value = 3;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambienceGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  _playDistantClang() {
    if (!this.initialized) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 200 + Math.random() * 400;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(this.ambienceGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
  }

  // ===== PROXIMITY =====
  updateMonsterProximity(proximity) {
    if (!this.initialized || !this.monsterGain) return;
    this.monsterProximity = Math.max(0, Math.min(1, proximity));
    const targetGain = this.monsterProximity * (this.isCreepy ? 0.5 : 0.2);
    this.monsterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.3);
  }

  // ===== GAME SFX =====
  playCorrectAnswer() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    // Bright ascending arpeggio
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, t + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.12, t + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.25);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.3);
    });
  }

  playWrongAnswer() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    // Descending dissonant buzz
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(220, t);
    osc1.frequency.linearRampToValueAtTime(150, t + 0.3);
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(223, t); // slight detune for beating
    osc2.frequency.linearRampToValueAtTime(148, t + 0.3);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.4);
    osc2.stop(t + 0.4);
  }

  playTreasureCollect() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    // Sparkling ascending notes with harmonics
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2; // octave harmonic

      const gain = this.ctx.createGain();
      const delay = i * 0.1;
      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(0.1, t + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.4);

      const gain2 = this.ctx.createGain();
      gain2.gain.setValueAtTime(0, t + delay);
      gain2.gain.linearRampToValueAtTime(0.04, t + delay + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.3);

      osc.connect(gain);
      osc2.connect(gain2);
      gain.connect(this.masterGain);
      gain2.connect(this.masterGain);
      osc.start(t + delay);
      osc2.start(t + delay);
      osc.stop(t + delay + 0.5);
      osc2.stop(t + delay + 0.4);
    });
  }

  playMonsterCatch() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;

    // Heavy impact
    const impact = this.ctx.createOscillator();
    impact.type = 'sawtooth';
    impact.frequency.setValueAtTime(200, t);
    impact.frequency.exponentialRampToValueAtTime(20, t + 0.8);
    const impactGain = this.ctx.createGain();
    impactGain.gain.setValueAtTime(0.3, t);
    impactGain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    const impactFilter = this.ctx.createBiquadFilter();
    impactFilter.type = 'lowpass';
    impactFilter.frequency.setValueAtTime(500, t);
    impactFilter.frequency.exponentialRampToValueAtTime(50, t + 0.8);
    impact.connect(impactFilter);
    impactFilter.connect(impactGain);
    impactGain.connect(this.masterGain);
    impact.start(t);
    impact.stop(t + 1.2);

    // Scream/screech
    const screech = this.ctx.createOscillator();
    screech.type = 'sawtooth';
    screech.frequency.setValueAtTime(800, t);
    screech.frequency.exponentialRampToValueAtTime(100, t + 1.5);
    const screechGain = this.ctx.createGain();
    screechGain.gain.setValueAtTime(0.15, t);
    screechGain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    const screechFilter = this.ctx.createBiquadFilter();
    screechFilter.type = 'bandpass';
    screechFilter.frequency.value = 400;
    screechFilter.Q.value = 3;
    screech.connect(screechFilter);
    screechFilter.connect(screechGain);
    screechGain.connect(this.masterGain);
    screech.start(t);
    screech.stop(t + 1.6);

    // Noise burst
    this._playNoiseBurst(0.2, 0.8);
  }

  playStep() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    // Stone footstep: short noise burst with lowpass
    const bufferSize = this.ctx.sampleRate * 0.06;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.1;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400 + Math.random() * 200;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(t);

    // Subtle stone resonance
    const res = this.ctx.createOscillator();
    res.type = 'sine';
    res.frequency.value = 80 + Math.random() * 40;
    const resGain = this.ctx.createGain();
    resGain.gain.setValueAtTime(0.04, t);
    resGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    res.connect(resGain);
    resGain.connect(this.masterGain);
    res.start(t);
    res.stop(t + 0.12);
  }

  // ===== HELPERS =====
  _createOsc(type, freq) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.start();
    this.nodes.push(osc);
    return osc;
  }

  _createFilteredNoise(volume, lowFreq, highFreq, destination) {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = (lowFreq + highFreq) / 2;
    bandpass.Q.value = 0.5;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(destination);
    source.start();
    this.nodes.push(source);
  }

  _playNoiseBurst(volume, duration) {
    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(t);
  }

  // iOS suspends the AudioContext when the tab goes to the background or the
  // phone locks, and never resumes it on its own — the game came back silent.
  // Nudge it on every return, and on the next touch in case the return alone
  // does not count as the user gesture Safari wants.
  _installResumeGuard() {
    if (this._resumeGuard) return;
    const resume = () => {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    };
    this._resumeGuard = resume;
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('focus', resume);
    document.addEventListener('touchend', resume, { passive: true });
    document.addEventListener('pointerdown', resume, { passive: true });
  }

  _removeResumeGuard() {
    if (!this._resumeGuard) return;
    const resume = this._resumeGuard;
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('pageshow', resume);
    window.removeEventListener('focus', resume);
    document.removeEventListener('touchend', resume);
    document.removeEventListener('pointerdown', resume);
    this._resumeGuard = null;
  }

  dispose() {
    this._removeResumeGuard();
    this.intervals.forEach(id => clearInterval(id));
    this.intervals = [];
    this.nodes.forEach(n => { try { n.stop(); } catch(e) {} });
    this.nodes = [];
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.initialized = false;
  }
}
