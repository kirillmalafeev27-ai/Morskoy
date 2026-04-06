// Audio system using Web Audio API
// Two atmosphere modes: creepy and calm

class AudioManager {
  constructor() {
    this.ctx = null;
    this.isCreepy = true;
    this.masterGain = null;
    this.ambienceGain = null;
    this.monsterGain = null;
    this.initialized = false;
    this.monsterProximity = 0; // 0 = far, 1 = close
    this.ambienceOscillators = [];
    this.monsterOscillators = [];
  }

  init(isCreepy) {
    if (this.initialized) this.dispose();

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.isCreepy = isCreepy;
    this.initialized = true;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.ctx.destination);

    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = 0.15;
    this.ambienceGain.connect(this.masterGain);

    this.monsterGain = this.ctx.createGain();
    this.monsterGain.gain.value = 0;
    this.monsterGain.connect(this.masterGain);

    if (isCreepy) {
      this._startCreepyAmbience();
    } else {
      this._startCalmAmbience();
    }

    this._startMonsterSound();
  }

  _startCreepyAmbience() {
    // Low droning bass
    const drone = this.ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 40;
    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 80;
    drone.connect(droneFilter);
    droneFilter.connect(this.ambienceGain);
    drone.start();
    this.ambienceOscillators.push(drone);

    // Eerie high tone
    const eerie = this.ctx.createOscillator();
    eerie.type = 'sine';
    eerie.frequency.value = 440;
    const eerieGain = this.ctx.createGain();
    eerieGain.gain.value = 0.03;
    // Slow vibrato
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.3;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 20;
    lfo.connect(lfoGain);
    lfoGain.connect(eerie.frequency);
    lfo.start();
    eerie.connect(eerieGain);
    eerieGain.connect(this.ambienceGain);
    eerie.start();
    this.ambienceOscillators.push(drone, eerie, lfo);
  }

  _startCalmAmbience() {
    // Gentle pad-like sound
    const pad = this.ctx.createOscillator();
    pad.type = 'sine';
    pad.frequency.value = 220;
    const padGain = this.ctx.createGain();
    padGain.gain.value = 0.08;
    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 300;
    pad.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(this.ambienceGain);
    pad.start();

    // Soft fifth
    const fifth = this.ctx.createOscillator();
    fifth.type = 'sine';
    fifth.frequency.value = 330;
    const fifthGain = this.ctx.createGain();
    fifthGain.gain.value = 0.04;
    fifth.connect(fifthGain);
    fifthGain.connect(this.ambienceGain);
    fifth.start();

    this.ambienceOscillators.push(pad, fifth);
  }

  _startMonsterSound() {
    // Growling low frequency noise
    const growl = this.ctx.createOscillator();
    growl.type = 'sawtooth';
    growl.frequency.value = this.isCreepy ? 55 : 80;

    const growlFilter = this.ctx.createBiquadFilter();
    growlFilter.type = 'bandpass';
    growlFilter.frequency.value = 100;
    growlFilter.Q.value = 5;

    // Tremolo
    const tremolo = this.ctx.createOscillator();
    tremolo.frequency.value = this.isCreepy ? 3 : 2;
    const tremoloGain = this.ctx.createGain();
    tremoloGain.gain.value = 0.5;

    const monsterVol = this.ctx.createGain();
    monsterVol.gain.value = 1;

    tremolo.connect(tremoloGain);
    tremoloGain.connect(monsterVol.gain);

    growl.connect(growlFilter);
    growlFilter.connect(monsterVol);
    monsterVol.connect(this.monsterGain);

    growl.start();
    tremolo.start();

    this.monsterOscillators.push(growl, tremolo);
  }

  // Update monster proximity: 0 (far) to 1 (very close)
  updateMonsterProximity(proximity) {
    if (!this.initialized || !this.monsterGain) return;
    this.monsterProximity = Math.max(0, Math.min(1, proximity));
    // Subtle increase in volume as monster approaches
    const targetGain = this.monsterProximity * (this.isCreepy ? 0.4 : 0.15);
    this.monsterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.5);
  }

  playCorrectAnswer() {
    if (!this.initialized) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523, this.ctx.currentTime);
    osc.frequency.setValueAtTime(659, this.ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(784, this.ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  }

  playWrongAnswer() {
    if (!this.initialized) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.setValueAtTime(150, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  playTreasureCollect() {
    if (!this.initialized) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + i * 0.12 + 0.3);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(this.ctx.currentTime + i * 0.12);
      osc.stop(this.ctx.currentTime + i * 0.12 + 0.3);
    });
  }

  playMonsterCatch() {
    if (!this.initialized) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 1.0);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.0);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 1.0);
  }

  playStep() {
    if (!this.initialized) return;
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.08;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  dispose() {
    this.ambienceOscillators.forEach(o => { try { o.stop(); } catch(e) {} });
    this.monsterOscillators.forEach(o => { try { o.stop(); } catch(e) {} });
    this.ambienceOscillators = [];
    this.monsterOscillators = [];
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
  }
}
