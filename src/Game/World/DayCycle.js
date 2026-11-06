import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'
import { shared } from './shared.js'
import { glowMaterial } from './materials.js'

// Time of day: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
// Every look of the world at a given hour is one keyframe below; colors in
// between are interpolated. Add or tweak a keyframe to change the mood.
const KEYFRAMES = [
    {
        at: 0, name: 'noche',
        zenith: '#0b1736', horizon: '#24345e', light: '#9fb4ff', intensity: 0.55,
        hemiSky: '#3a4f86', hemiGround: '#101a2a', hemi: 0.65,
        deep: '#06213f', surface: '#0d3b66', shallow: '#1b6f7a', sand: '#2f6f6a', foam: '#a9c4e0',
        glow: 2.6, stars: 1
    },
    {
        at: 0.23, name: 'amanecer',
        zenith: '#3a5ba0', horizon: '#f2a46b', light: '#ffb37a', intensity: 1.4,
        hemiSky: '#b9b4d6', hemiGround: '#4a4a5a', hemi: 0.9,
        deep: '#1a4f86', surface: '#3f7fb8', shallow: '#57c3c0', sand: '#c9d9c4', foam: '#fff1e0',
        glow: 1.4, stars: 0.15
    },
    {
        at: 0.33, name: 'mañana',
        zenith: '#3d8fd9', horizon: '#bfe9ff', light: '#fff1d6', intensity: 2.6,
        hemiSky: '#d6f1ff', hemiGround: '#3a6b4a', hemi: 1.4,
        deep: '#0a5b9c', surface: '#1c9ad6', shallow: '#3ee6d2', sand: '#b8efdc', foam: '#f4fdff',
        glow: 0.6, stars: 0
    },
    {
        at: 0.67, name: 'tarde',
        zenith: '#3d8fd9', horizon: '#bfe9ff', light: '#fff1d6', intensity: 2.6,
        hemiSky: '#d6f1ff', hemiGround: '#3a6b4a', hemi: 1.4,
        deep: '#0a5b9c', surface: '#1c9ad6', shallow: '#3ee6d2', sand: '#b8efdc', foam: '#f4fdff',
        glow: 0.6, stars: 0
    },
    {
        at: 0.77, name: 'atardecer',
        zenith: '#4b4f9e', horizon: '#ff9a62', light: '#ff8a4a', intensity: 1.6,
        hemiSky: '#e7b6c4', hemiGround: '#5a3f4a', hemi: 0.9,
        deep: '#24457a', surface: '#5a6fb0', shallow: '#5fb5b5', sand: '#e0c9b0', foam: '#fff0e6',
        glow: 1.6, stars: 0.1
    },
    {
        at: 0.86, name: 'anochecer',
        zenith: '#1c2452', horizon: '#6a4c7d', light: '#a9b8ff', intensity: 0.6,
        hemiSky: '#4a4f86', hemiGround: '#1a1a2a', hemi: 0.7,
        deep: '#0b2a4f', surface: '#1d4677', shallow: '#2a7f86', sand: '#557f7a', foam: '#c9d6ec',
        glow: 2.4, stars: 0.7
    }
]
const COLOR_KEYS = ['zenith', 'horizon', 'light', 'hemiSky', 'hemiGround', 'deep', 'surface', 'shallow', 'sand', 'foam']
const NUMBER_KEYS = ['intensity', 'hemi', 'glow', 'stars']

// Pre-parse colors once
const frames = [...KEYFRAMES, { ...KEYFRAMES[0], at: 1 }].map((frame) => ({
    ...frame,
    ...Object.fromEntries(COLOR_KEYS.map((key) => [key, new THREE.Color(frame[key])]))
}))

export class DayCycle {
    constructor({ lighting, sky, water, stars, fog }) {
        this.game = Game.getInstance()
        Object.assign(this, { lighting, sky, water, stars, fog })

        const params = new URLSearchParams(window.location.search)
        const presets = { noche: 0.02, amanecer: 0.25, dia: 0.4, atardecer: 0.77 }
        this.params = {
            // Start in the morning so the first view is bright (?hora=noche to try)
            time: presets[params.get('hora')] ?? 0.32,
            // Minutes for a full day
            duration: 8,
            running: true
        }
        this.current = Object.fromEntries([...COLOR_KEYS.map((key) => [key, new THREE.Color()]), ...NUMBER_KEYS.map((key) => [key, 0])])
        this.apply()

        this.game.debug.add((pane) => {
            const folder = pane.addFolder({ title: '🌅 Día y noche' })
            folder.addBinding(this.params, 'time', { label: 'hora', min: 0, max: 1, step: 0.001 })
            folder.addBinding(this.params, 'duration', { label: 'minutos por día', min: 0.5, max: 60 })
            folder.addBinding(this.params, 'running', { label: 'avanzar' })
        })
    }

    update(delta) {
        if (this.params.running) this.params.time = (this.params.time + delta / (this.params.duration * 60)) % 1
        this.apply()
    }

    apply() {
        const time = this.params.time
        const next = frames.findIndex((frame) => frame.at > time)
        const a = frames[next - 1]
        const b = frames[next]
        const t = THREE.MathUtils.smoothstep(time, a.at, b.at)
        const c = this.current
        for (const key of COLOR_KEYS) c[key].lerpColors(a[key], b[key], t)
        for (const key of NUMBER_KEYS) c[key] = THREE.MathUtils.lerp(a[key], b[key], t)

        // Sun arc during the day, moon arc at night, both kept above the horizon
        const angle = (time - 0.25) * Math.PI * 2
        const elevation = Math.sin(angle)
        const direction = this.lighting.sunDirection
        direction.set(Math.cos(angle) * -0.8, Math.max(Math.abs(elevation), 0.25), 0.35).normalize()

        const { lighting, sky, water, stars, fog } = this
        lighting.sun.color.copy(c.light)
        lighting.sun.intensity = c.intensity
        lighting.hemisphere.color.copy(c.hemiSky)
        lighting.hemisphere.groundColor.copy(c.hemiGround)
        lighting.hemisphere.intensity = c.hemi

        sky.setTime(time, c.intensity)
        sky.horizon.value.copy(c.horizon)
        sky.zenith.value.copy(c.zenith)
        fog.color.copy(c.horizon)

        const u = water.uniforms
        u.deepColor.value.copy(c.deep)
        u.surfaceColor.value.copy(c.surface)
        u.shallowColor.value.copy(c.shallow)
        u.sandColor.value.copy(c.sand)
        u.foamColor.value.copy(c.foam)
        u.skyColor.value.copy(c.horizon)
        u.sunDirection.value.copy(direction)
        u.daylight.value = THREE.MathUtils.clamp(c.intensity / 2.6, 0.2, 1)

        shared.glow.value = c.glow
        // Follows the stars: 1 deep in the night, 0 from sunrise to sunset
        shared.night.value = THREE.MathUtils.smoothstep(c.stars, 0.12, 0.75)
        glowMaterial.opacity = Math.min(1, 0.35 + c.glow * 0.3)
        stars.setOpacity(c.stars)
    }
}
