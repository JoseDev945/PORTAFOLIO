import * as THREE from 'three/webgpu'
import {
    attribute, uniform, varying, vec2, vec3, float, color, normalize, cameraPosition, cameraNear, cameraFar,
    max, min, mix, smoothstep, sin, fract, clamp, exp, step, pow, screenUV, positionView,
    viewportSharedTexture, viewportDepthTexture, perspectiveDepthToViewZ, reflector
} from 'three/tsl'
import { waveNodes, waveParams } from './Waves.js'

const SIZE = 420
const SEGMENTS = 150
const CELL = SIZE / SEGMENTS

// Same seabed shape as the shader below, on the CPU: fauna and reefs use it
// to stay between the bottom and the surface
export function shoreDistanceAt(x, z, islands) {
    let shore = 1000
    for (const island of islands) shore = Math.min(shore, Math.hypot(x - island.x, z - island.z) - island.radius)
    return shore
}

export function seabedDepth(x, z, islands) {
    const t = THREE.MathUtils.smoothstep(shoreDistanceAt(x, z, islands), 0, 40)
    return 1 + 15 * t + Math.sin(x * 0.3) * Math.sin(z * 0.27) * 0.4
}

// Distance to the nearest shoreline (islands are baked in as circles)
function shoreDistance(xz, islands) {
    let shore = float(1000)
    for (const island of islands) shore = min(shore, xz.sub(vec2(island.x, island.z)).length().sub(island.radius))
    return shore
}

// Cheap pseudo-noise from two crossed sines (3D Perlin per pixel was too expensive)
function sineNoise(xz, time) {
    return sin(xz.x.mul(0.43).add(time.mul(0.5)).add(sin(xz.y.mul(0.31))))
        .mul(sin(xz.y.mul(0.37).sub(time.mul(0.4)).add(sin(xz.x.mul(0.27)))))
}

// "Shader pack" water, like Minecraft's BSL / Complementary:
//   - transparent: you see the sandy seabed, more blue and opaque the deeper it gets
//     (light absorbed along the way, red first)
//   - refraction: what's under the surface wobbles with the waves
//   - reflections of the world (islands, boats, sky), stronger at grazing angles
//   - foam on crests and beaches, sun glints that feed the bloom
// Under it, a seabed mesh follows the camera like the water grid does.
export class Water {
    constructor({ scene, islands, sunDirection, skyColor, reflections = { enabled: true, resolution: 0.4 } }) {
        this.scene = scene
        this.uniforms = {
            time: uniform(0),
            offset: uniform(new THREE.Vector2()),
            amplitude: uniform(waveParams.amplitude),
            deepColor: uniform(color('#0a5b9c')),
            surfaceColor: uniform(color('#1c9ad6')),
            shallowColor: uniform(color('#3ee6d2')),
            sandColor: uniform(color('#b8efdc')),
            foamColor: uniform(color('#f4fdff')),
            skyColor: uniform(color(skyColor)),
            sunDirection: uniform(sunDirection.clone().normalize()),
            // 1 at noon, ~0.2 at night: dims caustics and glints in the dark
            daylight: uniform(1),
            // How much light the water absorbs per meter (red, green, blue): clarity
            absorption: uniform(new THREE.Vector3(0.42, 0.14, 0.09)),
            // How much the waves bend what's under / reflected in the water
            refraction: uniform(0.035),
            reflectionStrength: uniform(1)
        }
        this.islands = islands
        // Reflections render the world a second time: resolution is a fraction of the screen's
        this.reflections = { ...reflections }

        const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS)
        geometry.rotateX(-Math.PI / 2)
        this.mesh = new THREE.Mesh(geometry, this.createMaterial(islands))
        this.mesh.frustumCulled = false
        // Transparent: drawn after every opaque object, so it can see them through itself
        this.mesh.renderOrder = 1
        scene.add(this.mesh)

        const bedGeometry = new THREE.PlaneGeometry(SIZE, SIZE, 90, 90)
        bedGeometry.rotateX(-Math.PI / 2)
        this.seabed = new THREE.Mesh(bedGeometry, this.createSeabedMaterial(islands))
        this.seabed.frustumCulled = false
        this.seabed.receiveShadow = true
        scene.add(this.seabed)
    }

    // Islands are baked into the shaders (depth, shore foam), so a new list
    // means new materials. Only happens when the world is rebuilt.
    setIslands(islands) {
        this.islands = islands
        this.rebuild()
    }

    // The reflection's size follows the screen, not the render resolution: at a
    // high pixel ratio it would cost a lot and nobody sees the extra detail
    setPixelRatio(pixelRatio) {
        this.pixelRatio = pixelRatio
        if (this.reflection) this.reflection.reflector.resolutionScale = this.reflections.resolution / Math.max(1, pixelRatio)
    }

    setReflections({ enabled, resolution }) {
        if (enabled !== undefined) this.reflections.enabled = enabled
        if (resolution !== undefined) this.reflections.resolution = resolution
        this.rebuild()
    }

    rebuild() {
        const previous = [this.mesh.material, this.seabed.material]
        this.mesh.material = this.createMaterial(this.islands)
        this.seabed.material = this.createSeabedMaterial(this.islands)
        for (const material of previous) material.dispose()
    }

    createMaterial(islands) {
        const u = this.uniforms
        const material = new THREE.MeshBasicNodeMaterial({ transparent: true })

        // Vertex: displace the grid with the wave sum in world space
        const base = attribute('position', 'vec3')
        const worldXZ = base.xz.add(u.offset)
        const vertexWaves = waveNodes(worldXZ, u.time, u.amplitude)
        material.positionNode = vec3(base.x, vertexWaves.height, base.z)
        const vWorld = varying(vec3(worldXZ.x, vertexWaves.height, worldXZ.y))

        // Fragment: per-pixel normal from analytic derivatives
        const fragmentWaves = waveNodes(vWorld.xz, u.time, u.amplitude)
        const normal = normalize(vec3(fragmentWaves.dx.negate(), 1, fragmentWaves.dz.negate()))
        const viewDirection = normalize(cameraPosition.sub(vWorld))
        const noise = sineNoise(vWorld.xz, u.time)
        const shore = shoreDistance(vWorld.xz, islands)

        // --- What's under the surface (refraction + absorption) ---
        const sceneViewZ = (uv) => perspectiveDepthToViewZ(viewportDepthTexture(uv), cameraNear, cameraFar)
        const bentUV = screenUV.add(normal.xz.mul(u.refraction))
        // Don't bend in things that are in front of the water (a hull above it)
        const bentIsBehind = step(sceneViewZ(bentUV), positionView.z)
        const refractUV = mix(screenUV, bentUV, bentIsBehind)
        // Meters of water the light crossed between the bottom and the surface
        const thickness = max(positionView.z.sub(sceneViewZ(refractUV)), 0)
        const transmittance = exp(u.absorption.negate().mul(thickness))
        const below = viewportSharedTexture(refractUV).rgb

        const heightFactor = smoothstep(-0.5, 0.6, vWorld.y)
        const diffuse = max(normal.dot(u.sunDirection), 0).mul(0.35).add(0.75)
        // Color of the water itself (light scattered inside it), turquoise in the shallows
        const scatter = mix(mix(u.deepColor, u.surfaceColor, heightFactor), u.shallowColor, smoothstep(7, 1, shore).mul(0.5)).mul(diffuse)
        const underwater = below.mul(transmittance).add(scatter.mul(float(1).sub(transmittance)))

        // --- Reflection (Schlick fresnel: little from above, a mirror at grazing angles) ---
        const facing = max(normal.dot(viewDirection), 0)
        const fresnel = float(0.04).add(float(0.96).mul(pow(float(1).sub(facing), 5))).mul(u.reflectionStrength)
        let reflected = u.skyColor
        if (this.reflections.enabled) {
            // bounces: false = rendered once per frame, not once per render call
            const reflection = reflector({ resolutionScale: this.reflections.resolution, bounces: false })
            this.reflection = reflection
            this.setPixelRatio(this.pixelRatio ?? 1)
            reflection.target.rotateX(-Math.PI / 2)
            this.reflectionTarget?.removeFromParent()
            this.reflectionTarget = reflection.target
            this.scene.add(reflection.target)
            reflection.uvNode = reflection.uvNode.add(normal.xz.mul(u.refraction.mul(1.6)))
            reflected = reflection.rgb
        } else {
            this.reflection = null
            this.reflectionTarget?.removeFromParent()
            this.reflectionTarget = null
        }
        let surface = mix(underwater, reflected, clamp(fresnel, 0, 1))

        // --- Foam ---
        const wobble = noise.mul(0.9).add(shore.mul(2).sub(u.time.mul(1.6)).sin().mul(0.3))
        const shoreFoam = smoothstep(2.4, 1.2, shore.add(wobble))
        const rolling = fract(shore.mul(0.55).add(u.time.mul(0.35)).add(noise.mul(0.25)))
        const foamLines = smoothstep(0.86, 0.96, rolling).mul(smoothstep(6.5, 2.5, shore)).mul(0.65)
        const crestFoam = smoothstep(0.5, 0.7, vWorld.y.add(noise.mul(0.12)))
        const foam = max(max(crestFoam.mul(0.45), shoreFoam), foamLines)
        surface = mix(surface, u.foamColor.mul(diffuse), foam)

        material.colorNode = surface
        // Sun glints go to the emissive channel so the bloom makes them sparkle
        const halfVector = normalize(u.sunDirection.add(viewDirection))
        const specular = max(normal.dot(halfVector), 0).pow(180).mul(1.4)
        material.emissiveNode = vec3(specular.mul(0.55).mul(u.daylight))
        return material
    }

    createSeabedMaterial(islands) {
        const u = this.uniforms
        const material = new THREE.MeshLambertNodeMaterial({ color: '#e3cf96' })

        // Depth from the distance to the shore: 1 m by the beach, 16 m in open sea
        const base = attribute('position', 'vec3')
        const worldXZ = base.xz.add(u.offset)
        const shore = shoreDistance(worldXZ, islands)
        const depth = mix(float(1), float(16), smoothstep(0, 40, shore)).add(sin(worldXZ.x.mul(0.3)).mul(sin(worldXZ.y.mul(0.27))).mul(0.4))
        material.positionNode = vec3(base.x, depth.negate(), base.z)
        const vWorld = varying(vec3(worldXZ.x, depth.negate(), worldXZ.y))

        // Sand ripples
        const ripples = sin(vWorld.x.mul(2.1).add(sin(vWorld.z.mul(0.7)).mul(2))).mul(0.06)

        // Caustics: moving veins of light focused by the waves, strongest in the
        // shallows. Part of the sand color, so the sun lights them (gone at night)
        const causticUV = vWorld.xz.mul(0.85)
        const causticWave = sin(causticUV.x.mul(1.7).add(sin(causticUV.y.mul(1.3).add(u.time))))
            .add(sin(causticUV.y.mul(1.9).add(sin(causticUV.x.mul(1.1).sub(u.time.mul(0.9))))))
        const caustics = clamp(float(1).sub(causticWave.abs().mul(0.9)), 0, 1).pow(6)
            .mul(smoothstep(-12, -1.5, vWorld.y)).mul(0.8)
        material.colorNode = color('#e3cf96').mul(float(1).add(ripples)).add(caustics)
        return material
    }

    update(time, focus) {
        // Keep the grids under the camera target, snapped to cells to avoid swimming vertices
        const x = Math.round(focus.x / CELL) * CELL
        const z = Math.round(focus.z / CELL) * CELL
        this.mesh.position.set(x, 0, z)
        this.seabed.position.set(x, 0, z)
        this.uniforms.offset.value.set(x, z)
        this.uniforms.time.value = time
        this.uniforms.amplitude.value = waveParams.amplitude
    }
}
