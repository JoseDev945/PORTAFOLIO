import * as THREE from 'three/webgpu'
import { color as colorNode, positionLocal, positionWorld, modelWorldMatrix, vec3, vec4, sin, max, float } from 'three/tsl'
import { shared } from './shared.js'

// Palms sway in the wind: a vertex shader bends everything above the
// ground, more the higher it is (the trunk bends, the leaves swing and
// flutter). `ground` is the height of the base in the mesh's local space
// (palms on islands stand on the grass at y = 1).
function windMaterial(color, { ground = 1, flutter = 0, ...extra } = {}) {
    const material = new THREE.MeshLambertNodeMaterial({ color, flatShading: true, ...extra })
    material.positionNode = windPosition(ground, flutter)
    return material
}

// Vertex position bent by the wind (see windMaterial)
function windPosition(ground, flutter) {
    const world = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz
    const height = max(positionLocal.y.sub(ground), 0)
    const bend = height.pow(1.5).mul(0.035).mul(shared.wind)
    const phase = shared.time.mul(1.4).add(world.x.mul(0.25)).add(world.z.mul(0.18))
    let offsetX = sin(phase).mul(bend)
    let offsetZ = sin(phase.mul(0.8).add(1.3)).mul(bend.mul(0.6))
    if (flutter) {
        const shake = sin(shared.time.mul(6).add(world.x.mul(3)).add(world.z.mul(2))).mul(height).mul(flutter).mul(shared.wind)
        offsetX = offsetX.add(shake)
        offsetZ = offsetZ.add(shake.mul(0.7))
    }
    return positionLocal.add(vec3(offsetX, float(0), offsetZ))
}

// Something that emits light: it writes to the emissive channel, which the
// bloom post-process turns into a halo, and gets brighter at night.
function emissiveMaterial(color, strength) {
    const material = new THREE.MeshBasicNodeMaterial({ color })
    material.emissiveNode = colorNode(color).mul(shared.glow).mul(strength)
    return material
}

// Shared low poly palette. Reusing the same material objects lets
// mergeByMaterial() bake a whole island into a handful of draw calls.
// Lambert is much cheaper than Standard (PBR) and looks the same on flat low poly.
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra })

export const materials = {
    sand: lambert('#f1d39a'),
    grass: lambert('#5cb84a'),
    rock: lambert('#7b8091'),
    trunk: windMaterial('#8b5e3c'),
    leaf: windMaterial('#3f9c3a', { side: THREE.DoubleSide, flutter: 0.008 }),
    wood: lambert('#9a6a44'),
    darkWood: lambert('#5e3d27'),
    white: lambert('#f4f1ea'),
    red: lambert('#d94b3d'),
    lamp: emissiveMaterial('#ffc46b', 1.2),

    // Shipyard
    concrete: lambert('#c9c4b8'),
    steel: lambert('#7d8a96'),
    liftBlue: lambert('#2f6db5'),
    rubber: lambert('#26282d'),
    // Tooling gelcoat: fiberglass molds are usually orange or black
    mold: lambert('#d0662a'),
    gelcoat: lambert('#f7f5ef'),
    // Wet fiberglass mat: translucent green-white
    fiberglass: lambert('#cfe6c4', { transparent: true, opacity: 0.85 }),
    // Corrugated fiberglass roof panels, see-through so the work inside is visible
    roofPanel: lambert('#d6ecd8', { transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    suit: lambert('#f2f2f2'),
    skin: lambert('#c8916b'),
    mask: lambert('#3a3d44')
}

// One material per color, cached, for props with a configurable color.
// glow = true for lights (buoy and zone lamps): unlit and emissive.
const colorCache = new Map()
export function colorMaterial(color, glow = false) {
    const key = `${color}-${glow}`
    if (!colorCache.has(key)) colorCache.set(key, glow ? emissiveMaterial(color, 0.8) : lambert(color))
    return colorCache.get(key)
}

// Bioluminescent plants, Pandora style: their own color by day, at night they
// glow in `glow` and slowly pulse (shared.night). sway = bends in the wind
// like the palms (for plants standing on the island grass).
const bioCache = new Map()
export function bioMaterial(color, glow, strength = 1.5, { sway = false, doubleSide = false } = {}) {
    const key = `${color}-${glow}-${strength}-${sway}-${doubleSide}`
    if (bioCache.has(key)) return bioCache.get(key)
    const material = new THREE.MeshLambertNodeMaterial({ color, flatShading: true, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide })
    if (sway) material.positionNode = windPosition(1, 0.004)
    const pulse = sin(shared.time.mul(1.1).add(positionWorld.x.mul(0.8)).add(positionWorld.z.mul(0.6))).mul(0.3).add(0.7)
    material.emissiveNode = colorNode(glow).mul(pulse).mul(shared.night).mul(strength)
    bioCache.set(key, material)
    return material
}

// Fake light: additive glow sprite instead of a real PointLight (lights cost on every pixel)
export const glowMaterial = (() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const context = canvas.getContext('2d')
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255, 190, 100, 1)')
    gradient.addColorStop(0.25, 'rgba(255, 150, 60, 0.35)')
    gradient.addColorStop(1, 'rgba(255, 120, 40, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return new THREE.SpriteNodeMaterial({ map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
})()

// Soft white puff for spray mist and dust
export const mistMaterial = (() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const context = canvas.getContext('2d')
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)')
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return new THREE.SpriteNodeMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.7 })
})()

export function shadow(mesh) {
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
}
