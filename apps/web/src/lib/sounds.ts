/**
 * Game sounds (DESIGN.md "Pohyb a zvuk"), synthesized with WebAudio – no
 * external audio assets: optional lobby loop, tick in the last 5 s, gong at
 * the end of a question, fanfare on the podium. The host screen plays them
 * always; a player only after turning sound on for their own device, who also
 * plays the question's audio clip through `decode()` + `playBuffer()`.
 *
 * Browsers block audio until a user gesture (autoplay policy); `unlock()` is
 * called from the „Spustiť“ button and the music toggle on the host, from the
 * sound switch and any tap on the player.
 */

/** Master volume of all effects. */
const MASTER_GAIN = 0.5;
/** Background loop volume (relative to the master). */
const LOOP_GAIN = 0.12;
/** Lobby loop: tempo and a calm I–vi–IV–V arpeggio (frequencies in Hz). */
const LOOP_STEP_S = 0.25;
const LOOP_CHORDS: readonly (readonly number[])[] = [
  [261.63, 329.63, 392.0, 523.25],
  [220.0, 261.63, 329.63, 440.0],
  [174.61, 220.0, 261.63, 349.23],
  [196.0, 246.94, 293.66, 392.0],
];
/** How far ahead the loop scheduler queues notes. */
const LOOKAHEAD_S = 0.6;
const SCHEDULER_MS = 200;

type Wave = OscillatorType;

/** `navigator.audioSession` (Safari 16.4+), not in the TypeScript DOM types yet. */
interface AudioSessionNavigator {
  audioSession?: { type: string };
}

export class StageAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private loopTimer: number | null = null;
  private loopNextAt = 0;
  private loopStep = 0;
  private stateListener: ((unlocked: boolean) => void) | null = null;

  /** True once the audio context runs (after a user gesture). */
  get unlocked(): boolean {
    return this.ctx?.state === "running";
  }

  /** Called whenever the context starts or stops running (e.g. unlocked by a tap, suspended by the OS). */
  onStateChange(listener: ((unlocked: boolean) => void) | null): void {
    this.stateListener = listener;
  }

  /** Creates / resumes the audio context; must be called from a user gesture. */
  unlock(): void {
    const ctx = this.context();
    if (ctx && ctx.state !== "running") void ctx.resume().catch(() => undefined);
  }

  /** `unlock()` that waits until the context runs; true when it does (call from a user gesture). */
  async resume(): Promise<boolean> {
    const ctx = this.context();
    if (!ctx) return false;
    if (ctx.state !== "running") await ctx.resume().catch(() => undefined);
    return this.unlocked;
  }

  /** Decodes an audio file (a player's clip); works before the unlock too. Null when it cannot be decoded. */
  async decode(data: ArrayBuffer): Promise<AudioBuffer | null> {
    const ctx = this.context();
    if (!ctx) return null;
    try {
      return await ctx.decodeAudioData(data);
    } catch {
      return null;
    }
  }

  /** Seconds on the audio clock (positions of `playBuffer`). */
  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /**
   * Plays `buffer` from `offset` seconds at full volume (not through the
   * effects' master gain). Returns a stop function, or null while locked;
   * `onEnded` runs when the buffer ends or is stopped.
   */
  playBuffer(buffer: AudioBuffer, offset: number, onEnded: () => void): (() => void) | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return null;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      source.disconnect();
      onEnded();
    };
    source.start(0, Math.min(Math.max(0, offset), buffer.duration));
    return () => {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    };
  }

  /** Short wood-block tick (last 5 seconds). */
  tick(): void {
    this.tone({ freq: 1250, duration: 0.06, wave: "square", gain: 0.25 });
  }

  /** Gong at the end of a question: low partials with a long decay. */
  gong(): void {
    for (const [freq, gain] of [
      [110, 0.6],
      [220, 0.3],
      [331, 0.18],
      [497, 0.1],
    ] as const) {
      this.tone({ freq, duration: 2.2, wave: "sine", gain, attack: 0.005 });
    }
  }

  /** Fanfare when the winner is revealed on the podium. */
  fanfare(): void {
    const notes: readonly [number, number, number][] = [
      // [frequency, start offset s, duration s]
      [392.0, 0, 0.16],
      [392.0, 0.18, 0.16],
      [392.0, 0.36, 0.16],
      [523.25, 0.54, 0.7],
      [659.25, 0.54, 0.7],
      [783.99, 0.54, 0.9],
    ];
    for (const [freq, at, duration] of notes) {
      this.tone({ freq, duration, wave: "sawtooth", gain: 0.12, at, attack: 0.02 });
      this.tone({ freq: freq / 2, duration, wave: "triangle", gain: 0.18, at, attack: 0.02 });
    }
  }

  get looping(): boolean {
    return this.loopTimer !== null;
  }

  /** Starts the background loop (no-op while locked or already playing). */
  startLoop(): void {
    if (!this.ctx || this.loopTimer !== null) return;
    this.loopNextAt = this.ctx.currentTime + 0.05;
    this.loopStep = 0;
    this.scheduleLoop();
    this.loopTimer = window.setInterval(() => this.scheduleLoop(), SCHEDULER_MS);
  }

  stopLoop(): void {
    if (this.loopTimer !== null) window.clearInterval(this.loopTimer);
    this.loopTimer = null;
  }

  dispose(): void {
    this.stopLoop();
    this.stateListener = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
  }

  /** The audio context, created on first use (suspended until `unlock()`); null without WebAudio. */
  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      // iPhone: play even with the ringer switch on silent (like a video would).
      const session = (navigator as Navigator & AudioSessionNavigator).audioSession;
      if (session) session.type = "playback";
      const ctx = new AudioContext();
      this.master = ctx.createGain();
      this.master.gain.value = MASTER_GAIN;
      this.master.connect(ctx.destination);
      ctx.onstatechange = () => this.stateListener?.(ctx.state === "running");
      this.ctx = ctx;
    } catch {
      // WebAudio unavailable – the game works without sounds.
      this.ctx = null;
      this.master = null;
    }
    return this.ctx;
  }

  private scheduleLoop(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.loopNextAt < ctx.currentTime + LOOKAHEAD_S) {
      const stepsPerChord = 8;
      const chord = LOOP_CHORDS[Math.floor(this.loopStep / stepsPerChord) % LOOP_CHORDS.length] ?? [];
      const note = chord[this.loopStep % chord.length];
      if (note !== undefined) {
        const at = this.loopNextAt - ctx.currentTime;
        this.tone({ freq: note, duration: LOOP_STEP_S * 1.6, wave: "triangle", gain: LOOP_GAIN, at, attack: 0.01 });
        if (this.loopStep % stepsPerChord === 0) {
          this.tone({ freq: (chord[0] ?? note) / 2, duration: LOOP_STEP_S * 7, wave: "sine", gain: LOOP_GAIN, at });
        }
      }
      this.loopStep += 1;
      this.loopNextAt += LOOP_STEP_S;
    }
  }

  private tone(opts: { freq: number; duration: number; wave: Wave; gain: number; at?: number; attack?: number }): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== "running") return;
    const start = ctx.currentTime + (opts.at ?? 0);
    const attack = opts.attack ?? 0.003;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = opts.wave;
    osc.frequency.value = opts.freq;
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(opts.gain, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);
    osc.connect(env);
    env.connect(master);
    osc.start(start);
    osc.stop(start + opts.duration + 0.05);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }
}
