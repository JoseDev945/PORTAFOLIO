import { Game } from './Game.js'
import { TickOrder } from './Ticker.js'

// Everything is synthesized with the Web Audio API so the project needs no
// sound files yet. Music and effects go through separate buses so each can be
// muted from the settings menu. Real tracks can later replace `Music` (Howler).
// Reacts to game events only, nothing calls it directly: 'start', 'pause',
// 'settings:change', 'zone:change' and 'ui:click'.

const SCALE = [0, 2, 4, 7, 9] // major pentatonic
const CHORDS = [
    [57, 60, 64], // A minor
    [53, 57, 60], // F
    [48, 52, 55], // C
    [55, 59, 62] // G
]

const midiToFrequency = (note) => 440 * 2 ** ((note - 69) / 12)

export class Audio {
    constructor() {
        this.game = Game.getInstance()
        this.settings = this.game.settings
        this.context = null

        const { events } = this.game
        events.on('start', () => this.init())
        events.on('pause', (paused) => {
            this.setPaused(paused)
            this.playClick()
        })
        events.on('settings:change', (key, value) => {
            this.applySettings()
            // Click for toggles and choices, not for every step of a slider
            if (typeof value !== 'number') this.playClick()
        })
        events.on('zone:change', (active) => {
            if (active && this.game.state.started) this.playZone()
        })
        events.on('ui:click', () => this.playClick())
        // Named one-shot effects from any system: events.trigger('sfx', 'catch')
        events.on('sfx', (name) => this.playEffect(name))
        this.game.ticker.on(() => {
            if (this.game.playing) this.update(this.game.boat)
        }, TickOrder.AUDIO)
    }

    // Browsers only allow audio after a user gesture
    init() {
        if (this.context) return
        const context = new AudioContext()
        this.context = context

        // Compressor on the output so overlapping sounds never clip (clipping crackles)
        const compressor = context.createDynamicsCompressor()
        compressor.threshold.value = -12
        compressor.ratio.value = 4
        compressor.connect(context.destination)

        this.master = context.createGain()
        this.master.gain.value = 0.8
        this.master.connect(compressor)

        this.musicBus = context.createGain()
        this.effectsBus = context.createGain()
        this.musicBus.connect(this.master)
        this.effectsBus.connect(this.master)
        this.musicBus.gain.value = 0
        this.effectsBus.gain.value = 0

        this.noiseBuffer = this.createNoiseBuffer()
        this.setEngine()
        this.setWaves()
        this.setMusic()
        this.applySettings()
    }

    applySettings() {
        if (!this.context) return
        const now = this.context.currentTime
        // Effects stay audible while paused (only the engine stops) so the
        // toggles in the pause menu give immediate feedback
        this.musicBus.gain.setTargetAtTime(this.settings.get('music') ? (this.paused ? 0.6 : 0.8) : 0, now, 0.1)
        this.effectsBus.gain.setTargetAtTime(this.settings.get('effects') ? 1 : 0, now, 0.1)
    }

    setPaused(paused) {
        this.paused = paused
        if (this.context && paused) {
            const now = this.context.currentTime
            this.engine.output.gain.setTargetAtTime(0, now, 0.1)
            this.engine.noiseGain.gain.setTargetAtTime(0, now, 0.1)
        }
        this.applySettings()
    }

    // Brown noise (deep rumble, like surf) instead of white noise (TV static hiss).
    // The ends are crossfaded so the loop has no click.
    createNoiseBuffer() {
        const sampleRate = this.context.sampleRate
        const length = sampleRate * 6
        const fade = Math.floor(sampleRate * 0.5)
        const raw = new Float32Array(length + fade)
        let last = 0
        for (let i = 0; i < raw.length; i++) {
            last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
            raw[i] = last * 3.5
        }

        const buffer = this.context.createBuffer(1, length, sampleRate)
        const data = buffer.getChannelData(0)
        data.set(raw.subarray(0, length))
        for (let i = 0; i < fade; i++) {
            const t = i / fade
            data[i] = raw[i] * t + raw[length + i] * (1 - t)
        }
        return buffer
    }

    setEngine() {
        const context = this.context
        this.engine = {}
        const output = context.createGain()
        output.gain.value = 0
        output.connect(this.effectsBus)
        this.engine.output = output

        const filter = context.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 220
        filter.connect(output)
        this.engine.filter = filter

        // Soft hum: triangle waves instead of a buzzy sawtooth
        const oscillator = context.createOscillator()
        oscillator.type = 'triangle'
        oscillator.frequency.value = 50
        oscillator.connect(filter)
        oscillator.start()
        this.engine.oscillator = oscillator

        // Water churned by the propeller
        const noise = context.createBufferSource()
        noise.buffer = this.noiseBuffer
        noise.loop = true
        noise.playbackRate.value = 1.3
        const noiseFilter = context.createBiquadFilter()
        noiseFilter.type = 'lowpass'
        noiseFilter.frequency.value = 700
        const noiseGain = context.createGain()
        noiseGain.gain.value = 0
        noise.connect(noiseFilter).connect(noiseGain).connect(this.effectsBus)
        noise.start()
        this.engine.noiseGain = noiseGain
    }

    setWaves() {
        const context = this.context
        const source = context.createBufferSource()
        source.buffer = this.noiseBuffer
        source.loop = true
        const filter = context.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 380
        const gain = context.createGain()
        gain.gain.value = 0.16
        // Two slow, out of sync swells so the surf rises and falls irregularly
        for (const [frequency, depth] of [[0.11, 0.1], [0.047, 0.05]]) {
            const lfo = context.createOscillator()
            lfo.frequency.value = frequency
            const lfoGain = context.createGain()
            lfoGain.gain.value = depth
            lfo.connect(lfoGain).connect(gain.gain)
            lfo.start()
        }
        source.connect(filter).connect(gain).connect(this.effectsBus)
        // Offset start so the surf doesn't line up with the engine noise (same buffer)
        source.start(0, 3)
    }

    setMusic() {
        this.music = { nextTime: this.context.currentTime + 0.5, step: 0 }
        // Look-ahead scheduler: queue notes a little in advance
        setInterval(() => this.scheduleMusic(), 200)
    }

    scheduleMusic() {
        const context = this.context
        const beat = 0.6
        while (this.music.nextTime < context.currentTime + 1) {
            const time = this.music.nextTime
            const step = this.music.step
            const chord = CHORDS[Math.floor(step / 8) % CHORDS.length]

            if (step % 8 === 0) {
                for (const note of chord) this.playPad(midiToFrequency(note - 12), time, beat * 8)
            }
            // Sparse pentatonic melody
            if (Math.random() < 0.45) {
                const note = 69 + SCALE[Math.floor(Math.random() * SCALE.length)] + (Math.random() < 0.3 ? 12 : 0)
                this.playPluck(midiToFrequency(note), time)
            }

            this.music.step++
            this.music.nextTime += beat
        }
    }

    playPad(frequency, time, duration) {
        const context = this.context
        const gain = context.createGain()
        gain.gain.setValueAtTime(0, time)
        gain.gain.linearRampToValueAtTime(0.08, time + 1.2)
        gain.gain.linearRampToValueAtTime(0, time + duration)
        const filter = context.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 900
        filter.connect(gain).connect(this.musicBus)
        for (const detune of [-6, 6]) {
            const oscillator = context.createOscillator()
            oscillator.type = 'triangle'
            oscillator.frequency.value = frequency
            oscillator.detune.value = detune
            oscillator.connect(filter)
            oscillator.start(time)
            oscillator.stop(time + duration)
        }
    }

    playPluck(frequency, time, bus = this.musicBus, volume = 0.12) {
        const context = this.context
        const oscillator = context.createOscillator()
        oscillator.type = 'sine'
        oscillator.frequency.value = frequency
        const gain = context.createGain()
        gain.gain.setValueAtTime(0, time)
        gain.gain.linearRampToValueAtTime(volume, time + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.2)
        oscillator.connect(gain).connect(bus)
        oscillator.start(time)
        oscillator.stop(time + 1.3)
    }

    // Short sound effects
    playClick() {
        if (!this.context) return
        this.playPluck(880, this.context.currentTime, this.effectsBus, 0.06)
    }

    playZone() {
        if (!this.context) return
        const now = this.context.currentTime
        this.playPluck(midiToFrequency(76), now, this.effectsBus, 0.1)
        this.playPluck(midiToFrequency(81), now + 0.12, this.effectsBus, 0.1)
    }

    // Fishing sounds, all synthesized
    playEffect(name) {
        if (!this.context) return
        const now = this.context.currentTime
        if (name === 'cast') this.playNoise(now, 0.35, 700, 2400, 0.5)
        else if (name === 'reel') {
            // Ratchet clicks of the reel
            for (let i = 0; i < 7; i++) this.playNoise(now + i * 0.045, 0.025, 2500, 2500, 0.35)
        } else if (name === 'plop') this.playDrop(now, 520, 180, 0.18)
        else if (name === 'bite') {
            this.playDrop(now, 380, 120, 0.25)
            this.playNoise(now, 0.25, 500, 1200, 0.4)
        } else if (name === 'catch') {
            this.playPluck(midiToFrequency(72), now, this.effectsBus, 0.12)
            this.playPluck(midiToFrequency(76), now + 0.09, this.effectsBus, 0.12)
            this.playPluck(midiToFrequency(79), now + 0.18, this.effectsBus, 0.12)
        } else if (name === 'junk') this.playPluck(midiToFrequency(55), now, this.effectsBus, 0.1)
        // Deep rumble when the sea serpent passes
        else if (name === 'rumble') this.playNoise(now, 4, 90, 50, 0.6)
    }

    // A short burst of filtered noise (whoosh, splash, clicks)
    playNoise(time, duration, fromFrequency, toFrequency, volume) {
        const context = this.context
        const source = context.createBufferSource()
        source.buffer = this.noiseBuffer
        const filter = context.createBiquadFilter()
        filter.type = 'bandpass'
        filter.Q.value = 1.2
        filter.frequency.setValueAtTime(fromFrequency, time)
        filter.frequency.exponentialRampToValueAtTime(toFrequency, time + duration)
        const gain = context.createGain()
        gain.gain.setValueAtTime(0, time)
        gain.gain.linearRampToValueAtTime(volume, time + Math.min(0.02, duration / 3))
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration)
        source.connect(filter).connect(gain).connect(this.effectsBus)
        source.start(time, Math.random())
        source.stop(time + duration + 0.05)
    }

    // Water drop: a sine that falls quickly in pitch
    playDrop(time, fromFrequency, toFrequency, volume) {
        const context = this.context
        const oscillator = context.createOscillator()
        oscillator.frequency.setValueAtTime(fromFrequency, time)
        oscillator.frequency.exponentialRampToValueAtTime(toFrequency, time + 0.12)
        const gain = context.createGain()
        gain.gain.setValueAtTime(volume, time)
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18)
        oscillator.connect(gain).connect(this.effectsBus)
        oscillator.start(time)
        oscillator.stop(time + 0.2)
    }

    update(boat) {
        if (!this.context) return
        const now = this.context.currentTime
        const speed = Math.abs(boat.state.speed)
        const throttle = Math.abs(boat.state.throttle)
        this.engine.oscillator.frequency.setTargetAtTime(48 + speed * 3 + throttle * 10, now, 0.15)
        this.engine.filter.frequency.setTargetAtTime(180 + throttle * 250 + speed * 10, now, 0.15)
        this.engine.output.gain.setTargetAtTime(0.04 + throttle * 0.12, now, 0.15)
        this.engine.noiseGain.gain.setTargetAtTime(Math.min(speed / 20, 1) * 0.3 * boat.state.submerged, now, 0.1)
    }
}
