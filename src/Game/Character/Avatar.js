import * as THREE from 'three/webgpu'
import { materials, colorMaterial } from '../World/materials.js'

// Low poly person in white coveralls, like the Botes Galileo shipyard workers.
// Feet at y = 0, facing +z. Jointed (hips, knees, shoulders) so it can walk,
// sit and hold the wheel: avatar.pose(name, amount, delta).
const HIP_HEIGHT = 0.84
const THIGH = 0.42

// Hats (data/cosmetics.js), on the head (center y 0.78, radius 0.16, in hips space)
function addHat(hips, add, { style, color }) {
    const main = colorMaterial(color)
    const band = colorMaterial(style === 'crown' ? '#e63946' : '#8a2b2b')
    const gold = colorMaterial('#f2c14e')
    if (style === 'cap' || style === 'captain') {
        if (style === 'captain') {
            add(hips, new THREE.CylinderGeometry(0.2, 0.17, 0.13, 12), main, 0, 0.95, 0)
            add(hips, new THREE.CylinderGeometry(0.172, 0.172, 0.04, 12), colorMaterial('#1d1f26'), 0, 0.9, 0)
            add(hips, new THREE.BoxGeometry(0.06, 0.05, 0.02), gold, 0, 0.94, 0.19)
        } else {
            add(hips, new THREE.SphereGeometry(0.175, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), main, 0, 0.84, 0)
        }
        // Visor
        const visor = add(hips, new THREE.BoxGeometry(0.26, 0.02, 0.16), style === 'captain' ? colorMaterial('#1d1f26') : main, 0, 0.87, 0.2)
        visor.rotation.x = 0.15
    } else if (style === 'beanie') {
        add(hips, new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), main, 0, 0.8, 0)
        add(hips, new THREE.CylinderGeometry(0.185, 0.185, 0.06, 10), colorMaterial('#f4f1ea'), 0, 0.82, 0)
        add(hips, new THREE.SphereGeometry(0.06, 6, 4), colorMaterial('#f4f1ea'), 0, 1.0, 0)
    } else if (style === 'pirate') {
        // Three-cornered hat with a gold trim and a skull dot
        add(hips, new THREE.CylinderGeometry(0.34, 0.34, 0.05, 3), main, 0, 0.9, 0).rotation.y = Math.PI
        add(hips, new THREE.CylinderGeometry(0.36, 0.36, 0.02, 3), gold, 0, 0.88, 0).rotation.y = Math.PI
        add(hips, new THREE.CylinderGeometry(0.15, 0.17, 0.14, 10), main, 0, 0.98, 0)
        add(hips, new THREE.BoxGeometry(0.05, 0.05, 0.02), colorMaterial('#f4f1ea'), 0, 0.98, 0.16)
    } else if (style === 'crown') {
        add(hips, new THREE.CylinderGeometry(0.17, 0.16, 0.1, 10, 1, true), main, 0, 0.94, 0)
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2
            add(hips, new THREE.ConeGeometry(0.04, 0.09, 4), main, Math.sin(angle) * 0.15, 1.03, Math.cos(angle) * 0.15)
        }
        add(hips, new THREE.OctahedronGeometry(0.03, 0), band, 0, 0.95, 0.17)
    } else {
        // Straw hat: wide brim and a low crown
        add(hips, new THREE.CylinderGeometry(0.34, 0.34, 0.03, 12), main, 0, 0.9, 0)
        add(hips, new THREE.CylinderGeometry(0.15, 0.17, 0.14, 10), main, 0, 0.98, 0)
        add(hips, new THREE.CylinderGeometry(0.172, 0.172, 0.04, 10), band, 0, 0.93, 0)
    }
}

// Options: mask = the shipyard respirator, hat = straw hat color or
// { style, color } (data/cosmetics.js), apron = apron color, skin = skin color.
export function createAvatar({ suitColor = '#f2f2f2', mask = true, hat = null, apron = null, skin = null, gloves = '#2e7d32' } = {}) {
    const root = new THREE.Group()
    const suit = colorMaterial(suitColor)
    const glove = colorMaterial(gloves)
    const add = (parent, geometry, material, x, y, z) => {
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(x, y, z)
        mesh.castShadow = true
        mesh.receiveShadow = true
        parent.add(mesh)
        return mesh
    }

    // Upper body, pivoting at the hips
    const hips = new THREE.Group()
    hips.position.y = HIP_HEIGHT
    root.add(hips)
    add(hips, new THREE.BoxGeometry(0.46, 0.65, 0.28), suit, 0, 0.3, 0)
    add(hips, new THREE.SphereGeometry(0.16, 8, 6), skin ? colorMaterial(skin) : materials.skin, 0, 0.78, 0)
    if (hat) addHat(hips, add, typeof hat === 'string' ? { style: 'straw', color: hat } : hat)
    else {
        add(hips, new THREE.SphereGeometry(0.175, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), suit, 0, 0.8, 0)
    }
    if (mask) add(hips, new THREE.BoxGeometry(0.16, 0.1, 0.1), materials.mask, 0, 0.72, 0.15)
    else {
        // Eyes, so a face looks at you
        const eye = colorMaterial('#1d1f26')
        add(hips, new THREE.BoxGeometry(0.035, 0.035, 0.02), eye, -0.055, 0.8, 0.152)
        add(hips, new THREE.BoxGeometry(0.035, 0.035, 0.02), eye, 0.055, 0.8, 0.152)
    }
    if (apron) add(hips, new THREE.BoxGeometry(0.4, 0.6, 0.02), colorMaterial(apron), 0, 0.26, 0.15)

    const arms = []
    for (const x of [-0.29, 0.29]) {
        const shoulder = new THREE.Group()
        shoulder.position.set(x, 0.54, 0)
        hips.add(shoulder)
        add(shoulder, new THREE.BoxGeometry(0.12, 0.56, 0.12), suit, 0, -0.27, 0)
        add(shoulder, new THREE.BoxGeometry(0.13, 0.13, 0.14), glove, 0, -0.6, 0)
        arms.push(shoulder)
    }

    const legs = []
    for (const x of [-0.12, 0.12]) {
        const hip = new THREE.Group()
        hip.position.set(x, HIP_HEIGHT, 0)
        root.add(hip)
        add(hip, new THREE.BoxGeometry(0.18, THIGH, 0.2), suit, 0, -THIGH / 2, 0)
        const knee = new THREE.Group()
        knee.position.y = -THIGH
        hip.add(knee)
        add(knee, new THREE.BoxGeometry(0.18, 0.32, 0.2), suit, 0, -0.16, 0)
        // Dark rubber boots
        add(knee, new THREE.BoxGeometry(0.2, 0.12, 0.28), materials.rubber, 0, -0.36, 0.03)
        legs.push({ hip, knee })
    }

    // Joint angles, eased toward each pose
    const joints = { hipsY: HIP_HEIGHT, lean: 0, thigh: [0, 0], knee: [0, 0], arm: [0, 0] }
    const target = { hipsY: HIP_HEIGHT, lean: 0, thigh: [0, 0], knee: [0, 0], arm: [0, 0] }
    let walkPhase = 0

    return {
        object: root,
        // name: 'stand' | 'walk' | 'sit' | 'drive'; amount = walking speed (m/s)
        pose(name, amount, delta, time) {
            target.hipsY = HIP_HEIGHT
            target.lean = 0
            if (name === 'walk') {
                walkPhase += delta * (4 + amount * 2.2)
                const swing = Math.min(1, amount / 1.8) * 0.55
                const s = Math.sin(walkPhase)
                target.thigh = [s * swing, -s * swing]
                target.knee = [Math.max(0, -s) * swing * 1.6, Math.max(0, s) * swing * 1.6]
                target.arm = [-s * swing * 0.8, s * swing * 0.8]
                target.lean = 0.05 * Math.min(1, amount / 1.8)
                target.hipsY = HIP_HEIGHT + Math.abs(Math.cos(walkPhase)) * 0.03 * Math.min(1, amount)
            } else if (name === 'sit') {
                // Hips on the cushion, thighs forward, shins down, hands on the lap
                target.hipsY = 0.47
                target.thigh = [-Math.PI / 2, -Math.PI / 2]
                target.knee = [Math.PI / 2, Math.PI / 2]
                target.arm = [-0.45, -0.45]
            } else if (name === 'drive') {
                // Both hands on the wheel, slight sway with the boat
                target.thigh = [0, 0]
                target.knee = [0, 0]
                target.arm = [-0.85, -0.85]
                target.lean = 0.04
            } else {
                // Standing: breathing
                target.thigh = [0, 0]
                target.knee = [0, 0]
                const breath = Math.sin(time * 1.6) * 0.03
                target.arm = [breath, breath]
            }

            const ease = 1 - Math.exp(-delta * (name === 'walk' ? 18 : 9))
            joints.hipsY += (target.hipsY - joints.hipsY) * ease
            joints.lean += (target.lean - joints.lean) * ease
            for (const key of ['thigh', 'knee', 'arm']) {
                for (let i = 0; i < 2; i++) joints[key][i] += (target[key][i] - joints[key][i]) * ease
            }

            hips.position.y = joints.hipsY
            hips.rotation.x = joints.lean
            legs.forEach(({ hip, knee }, i) => {
                hip.position.y = joints.hipsY
                hip.rotation.x = joints.thigh[i]
                knee.rotation.x = joints.knee[i]
            })
            arms.forEach((arm, i) => (arm.rotation.x = joints.arm[i]))
        }
    }
}
