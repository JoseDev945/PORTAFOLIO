import * as THREE from 'three/webgpu'
import {
    color, mix, normalize, positionLocal, smoothstep, uniform, vec2, vec3, float, dot, max, abs, pow, sin, floor,
    fract, hash, step, atan, clamp, cos
} from 'three/tsl'
import { shared } from './shared.js'

const SUN_SIZE = 0.07
const MOON_SIZE = 0.055

// Sky in the spirit of Minecraft shader packs, all in one cheap fragment
// shader on the dome (no textures, no extra passes):
//   - day gradient (zenith / horizon colors come from the day cycle)
//   - square sun and moon (the moon pixelated, with craters) with soft halos;
//     both write to the emissive channel, so the bloom makes them shine
//   - sunrise / sunset: an orange glow on the sun's side of the horizon and a
//     pink "belt of Venus" on the opposite side
//   - high cirrus clouds lit by the sun (golden at sunset, dark at night)
//   - twinkling square stars that turn with the night, and a faint aurora to the north
export class Sky {
    constructor({ scene, horizonColor, zenithColor }) {
        this.horizon = uniform(color(horizonColor))
        this.zenith = uniform(color(zenithColor))
        this.sunDirection = uniform(new THREE.Vector3(0, 1, 0))
        this.sunU = uniform(new THREE.Vector3(1, 0, 0))
        this.sunV = uniform(new THREE.Vector3(0, 0, 1))
        this.sunColor = uniform(color('#fff4d6'))
        this.glowColor = uniform(color('#ff7a3d'))
        // 1 when the sun is near the horizon (sunrise and sunset)
        this.twilight = uniform(0)
        // 0 at night, 1 at noon: how lit the clouds are
        this.light = uniform(1)
        this.starsOpacity = uniform(0)
        // Rotation of the starry sky
        this.starAngle = uniform(0)

        const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false })
        const dir = normalize(positionLocal)
        const height = dir.y
        const sun = this.sunDirection
        const moon = sun.negate()

        // Base gradient
        let sky = mix(this.horizon, this.zenith, smoothstep(-0.02, 0.45, height))

        // Sunrise / sunset glow toward the sun, pink belt on the other side
        const flat = normalize(vec2(dir.x, dir.z))
        const sunFlat = normalize(vec2(sun.x, sun.z))
        const facing = dot(flat, sunFlat)
        const low = float(1).sub(smoothstep(-0.05, 0.4, height))
        const sunset = pow(max(facing, 0), 2.5).mul(low).mul(this.twilight).mul(0.85)
            .add(this.twilight.mul(0.25).mul(float(1).sub(smoothstep(0, 0.22, height))))
        sky = mix(sky, this.glowColor, clamp(sunset, 0, 1))
        const belt = pow(max(facing.negate(), 0), 2).mul(float(1).sub(smoothstep(0, 0.18, height))).mul(smoothstep(-0.03, 0.02, height))
        sky = mix(sky, color('#d98fb5'), belt.mul(this.twilight).mul(0.35))

        // Halos: bright around the sun, cool and soft around the moon
        const toSun = max(dot(dir, sun), 0)
        const toMoon = max(dot(dir, moon), 0)
        const aboveHorizon = smoothstep(-0.04, 0.02, height)
        const sunUp = smoothstep(-0.12, 0.05, sun.y)
        sky = sky.add(this.sunColor.mul(pow(toSun, 8).mul(0.18).add(pow(toSun, 90).mul(0.5))).mul(sunUp))
        sky = sky.add(color('#9fb4ff').mul(pow(toMoon, 30).mul(0.12)).mul(smoothstep(-0.1, 0.05, moon.y)))

        // High cirrus: stretched sine noise on a plane above, fading at the horizon
        const plane = vec2(dir.x, dir.z).div(max(height, 0.08)).mul(0.9).add(vec2(shared.time.mul(0.004), shared.time.mul(0.002)))
        const wisps = sin(plane.x.mul(1.1).add(sin(plane.y.mul(2.3)).mul(1.4)))
            .mul(sin(plane.y.mul(3.1).add(sin(plane.x.mul(0.7).add(shared.time.mul(0.01))).mul(2))))
        const cirrus = smoothstep(0.3, 0.95, wisps).mul(smoothstep(0.04, 0.25, height)).mul(float(1).sub(smoothstep(0.65, 1, height))).mul(0.55)
        const cloudLight = mix(color('#ffffff'), this.glowColor, this.twilight.mul(0.85)).mul(this.light.mul(0.8).add(0.12))
        sky = mix(sky, cloudLight, cirrus)

        // Square sun (Minecraft): core plus a warm rim
        const square = (center, u, v, size) => {
            const facingDisc = max(dot(dir, center), 0.0001)
            const p = vec2(dot(dir, u), dot(dir, v)).div(facingDisc)
            const edge = max(abs(p.x), abs(p.y))
            const inside = float(1).sub(smoothstep(size.mul(0.94), size, edge)).mul(step(0, dot(dir, center)))
            return { p, edge, inside }
        }
        const sunDisc = square(sun, this.sunU, this.sunV, float(SUN_SIZE))
        const sunCore = float(1).sub(smoothstep(SUN_SIZE * 0.55, SUN_SIZE * 0.7, sunDisc.edge))
        const sunLight = sunDisc.inside.mul(aboveHorizon).mul(sunUp)
        const sunEmissive = mix(this.glowColor, this.sunColor, sunCore.mul(0.7).add(0.3)).mul(sunLight).mul(2.2)

        // Square pixel moon with craters, on the opposite side of the sky
        const moonDisc = square(moon, this.sunU, this.sunV.negate(), float(MOON_SIZE))
        const pixel = floor(moonDisc.p.div(MOON_SIZE * 2).add(0.5).mul(8))
        const crater = step(0.72, hash(pixel.x.add(pixel.y.mul(9)).add(31)))
        const moonColor = mix(color('#eef2fb'), color('#aab3c6'), crater)
        const moonLight = moonDisc.inside.mul(aboveHorizon).mul(smoothstep(-0.1, 0.05, moon.y))
        const moonEmissive = moonColor.mul(moonLight).mul(0.9)

        // Stars: a few lit cells of a 3D grid, small squares that twinkle and
        // turn slowly with the night. Hidden behind the cirrus.
        const c = sin(this.starAngle)
        const k = cos(this.starAngle)
        const starDir = vec3(dir.x.mul(k).sub(dir.y.mul(c)), dir.x.mul(c).add(dir.y.mul(k)), dir.z).mul(150)
        const cell = floor(starDir).add(400)
        const seed = hash(cell.x.add(hash(cell.y.add(hash(cell.z).mul(997))).mul(997)))
        const local = fract(starDir).sub(0.5)
        const dot2 = float(1).sub(step(0.17, max(abs(local.x), max(abs(local.y), abs(local.z)))))
        const twinkle = sin(shared.time.mul(seed.mul(3).add(1.5)).add(seed.mul(80))).mul(0.4).add(0.6)
        const star = step(0.9955, seed).mul(dot2).mul(twinkle).mul(this.starsOpacity)
            .mul(smoothstep(0.03, 0.2, height)).mul(max(float(1).sub(cirrus.mul(1.6)), 0))
        const stars = vec3(star, star, star.mul(1.1))

        // Aurora: green-violet curtains low in the north, deep in the night
        const azimuth = atan(dir.x, dir.z.negate())
        const center = sin(azimuth.mul(4).add(shared.time.mul(0.05))).mul(0.05).add(0.26)
        const curtains = pow(sin(azimuth.mul(11).add(sin(azimuth.mul(3).add(shared.time.mul(0.12))).mul(2.6)).add(shared.time.mul(0.08))).mul(0.5).add(0.5), 3)
        const profile = smoothstep(center.sub(0.1), center, height).mul(float(1).sub(smoothstep(center, center.add(0.28), height)))
        const north = smoothstep(-0.1, 0.6, dir.z.negate())
        const aurora = mix(color('#3dffb0'), color('#8a5cff'), smoothstep(center, center.add(0.22), height))
            .mul(curtains.mul(profile).mul(north).mul(shared.night).mul(0.45))

        material.colorNode = sky.add(aurora.mul(0.6))
        // Emissive: added on top and picked up by the bloom
        material.emissiveNode = sunEmissive.add(moonEmissive).add(stars).add(aurora.mul(0.4))

        this.mesh = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), material)
        this.mesh.renderOrder = -1
        this.mesh.frustumCulled = false
        scene.add(this.mesh)
    }

    // Called by the day cycle. time: 0 = midnight, 0.5 = noon
    setTime(time, intensity) {
        const angle = (time - 0.25) * Math.PI * 2
        const sun = this.sunDirection.value.set(Math.cos(angle) * -0.8, Math.sin(angle), 0.35).normalize()
        // Axes on the sky around the sun, for the square discs
        this.sunU.value.set(-sun.z, 0, sun.x).normalize()
        this.sunV.value.crossVectors(this.sunU.value, sun).normalize()
        const elevation = sun.y
        this.twilight.value = THREE.MathUtils.smoothstep(elevation, -0.3, -0.04) * (1 - THREE.MathUtils.smoothstep(elevation, 0.06, 0.42))
        this.sunColor.value.lerpColors(_low, _high, THREE.MathUtils.smoothstep(elevation, 0, 0.5))
        this.glowColor.value.lerpColors(_deep, _orange, THREE.MathUtils.smoothstep(elevation, -0.2, 0.12))
        this.light.value = THREE.MathUtils.clamp(intensity / 2.6, 0, 1)
        this.starAngle.value = angle
    }

    setOpacity(opacity) {
        this.starsOpacity.value = opacity
    }

    update(camera) {
        this.mesh.position.copy(camera.position)
    }
}

const _low = new THREE.Color('#ffb36b')
const _high = new THREE.Color('#fff4d6')
const _deep = new THREE.Color('#c7405a')
const _orange = new THREE.Color('#ff7a3d')
