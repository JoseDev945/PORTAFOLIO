import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'
import { TickOrder } from '../Ticker.js'
import { createBoatMesh, boatHalfExtents, resolveBoat } from '../Boat/BoatMesh.js'
import { createAvatar } from '../Character/Avatar.js'
import { mergeByMaterial } from '../utils/merge.js'
import { waveHeight } from '../World/Waves.js'
import { playerColor } from '../utils/players.js'
import { lookOptions } from '../Fishing/catalog.js'

// Remote players are drawn this far in the past (ms), between two received
// states (12 per second), so they glide instead of jumping
const DELAY = 170
const POSES = ['drive', 'sit', 'walk', 'stand']
// Farther than this between two states (m): a respawn or a map trip, no glide
const JUMP = 15

const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()
const _mine = new THREE.Quaternion()
const _forward = new THREE.Vector3()
const _theirs = new THREE.Vector3()

// Closest points between segments a + s·ad and b + t·bd in x/z → [s, t] (0 to 1)
function closestOnSegments(ax, az, adx, adz, bx, bz, bdx, bdz) {
    const a = adx * adx + adz * adz
    const e = bdx * bdx + bdz * bdz
    const rx = ax - bx
    const rz = az - bz
    const f = bdx * rx + bdz * rz
    if (a < 1e-6 && e < 1e-6) return [0, 0]
    if (a < 1e-6) return [0, Math.min(1, Math.max(0, f / e))]
    const c = adx * rx + adz * rz
    if (e < 1e-6) return [Math.min(1, Math.max(0, -c / a)), 0]
    const b = adx * bdx + adz * bdz
    const denominator = a * e - b * b
    let s = denominator > 1e-6 ? Math.min(1, Math.max(0, (b * f - c * e) / denominator)) : 0
    let t = (b * s + f) / e
    if (t < 0) {
        t = 0
        s = Math.min(1, Math.max(0, -c / a))
    } else if (t > 1) {
        t = 1
        s = Math.min(1, Math.max(0, (b - c) / a))
    }
    return [s, t]
}
const lerp = (a, b, t) => a + (b - a) * t
const lerpAngle = (from, to, t) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t

// Floating name over a player, in their color
function createTag(name, color) {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const context = canvas.getContext('2d')
    context.font = '700 56px system-ui, sans-serif'
    const width = Math.min(context.measureText(name).width + 70, 500)
    const x = (canvas.width - width) / 2
    context.fillStyle = 'rgba(8, 30, 60, 0.82)'
    context.beginPath()
    context.roundRect(x, 18, width, 92, 46)
    context.fill()
    context.lineWidth = 7
    context.strokeStyle = color
    context.stroke()
    context.fillStyle = '#ffffff'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(name, canvas.width / 2, 66)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    // Seen through islands and other boats, so friends are easy to find
    const material = new THREE.SpriteNodeMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, fog: false })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(4, 1, 1)
    sprite.renderOrder = 15
    return sprite
}

function disposeTag(tag) {
    tag.removeFromParent()
    tag.material.map?.dispose()
    tag.material.dispose()
}

// The other players in the room: their boat (one mesh per material, no deck
// logic, but their cabin lights), their person on deck or on land and their
// name. Fed by Network.push().
// Bumping boats: each player pushes only their own boat (collide(), every
// physics step) using both masses and both speeds, so a boat that gets hit
// moves on its owner's screen and nobody is launched. The remote boat also
// has a sensor collider: someone on foot can't walk through it.
export class RemotePlayers {
    constructor() {
        this.game = Game.getInstance()
        // slot → player
        this.players = new Map()
        this.game.ticker.on(() => this.update(), TickOrder.BOAT + 1)
    }

    add(slot, name) {
        if (this.players.has(slot)) {
            this.setName(slot, name)
            return
        }
        const color = playerColor(slot)
        const avatar = createAvatar({ suitColor: color })
        const tag = createTag(name, color)
        tag.visible = false
        this.game.rendering.scene.add(tag)
        this.players.set(slot, { slot, name, color, avatar, tag, mesh: null, boatId: null, body: null, half: null, mass: 6, velocity: { x: 0, z: 0 }, lights: null, lightsOn: false, snapshots: [], offset: null, teleport: true })
    }

    setName(slot, name) {
        const player = this.players.get(slot)
        if (!player || player.name === name) return
        player.name = name
        const tag = createTag(name, player.color)
        tag.visible = player.tag.visible
        tag.position.copy(player.tag.position)
        disposeTag(player.tag)
        player.tag = tag
        this.game.rendering.scene.add(tag)
    }

    remove(slot) {
        const player = this.players.get(slot)
        if (!player) return
        this.removeBoat(player)
        player.avatar.object.removeFromParent()
        disposeTag(player.tag)
        this.players.delete(slot)
    }

    clear() {
        for (const slot of [...this.players.keys()]) this.remove(slot)
    }

    removeBoat(player) {
        if (player.mesh) {
            player.mesh.removeFromParent()
            player.mesh.traverse((child) => child.geometry?.dispose())
        }
        if (player.body) this.game.physics.world.removeRigidBody(player.body)
        player.mesh = null
        player.body = null
    }

    // A new state from the network (already validated)
    push(slot, state) {
        const player = this.players.get(slot)
        if (!player) return
        const last = player.snapshots.at(-1)
        if (last && state.t <= last.sent) return
        // Their clock → ours: the smallest delay seen so far (it drifts up slowly)
        const now = performance.now()
        const sample = now - state.t
        player.offset = player.offset === null || sample < player.offset ? sample : player.offset + (sample - player.offset) * 0.02
        player.snapshots.push({ time: state.t + player.offset, sent: state.t, p: state.p, q: state.q, c: state.c })
        if (player.snapshots.length > 30) player.snapshots.shift()
        if (state.b !== player.boatId) this.setBoat(player, state.b)
        if (Boolean(state.l) !== player.lightsOn) this.setLights(player, Boolean(state.l))
        if (state.a && state.a.join('|') !== player.look) this.setLook(player, state.a)
    }

    setBoat(player, id) {
        const { content, physics, rendering } = this.game
        player.boatId = id
        // Unknown type (another version of the game): the first one
        const definition = resolveBoat(content.boats, content.boats?.[id] ? id : Object.keys(content.boats ?? {})[0], 'jugador', () => {})
        this.removeBoat(player)
        const mesh = createBoatMesh(definition)
        // Their cabin lights (those meshes are kept apart by the merge)
        player.lights = mesh.userData.deck?.lights ?? null
        // Nobody walks or fishes on it here: one mesh per material is enough
        mergeByMaterial(mesh)
        rendering.scene.add(mesh)
        player.mesh = mesh
        player.half = boatHalfExtents(definition.size)
        player.mass = definition.physics.mass

        const { RAPIER, world } = physics
        player.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased())
        // Sensor: no contact forces (collide() does the bumping), but it blocks someone on foot
        world.createCollider(RAPIER.ColliderDesc.cuboid(player.half.x, player.half.y, player.half.z).setSensor(true), player.body)
        player.teleport = true
        this.setLights(player, player.lightsOn)
        // The person was on the old deck
        player.avatar.object.removeFromParent()
    }

    // Their clothes: the avatar is rebuilt in the same place
    setLook(player, [skin, hat]) {
        player.look = `${skin}|${hat}`
        const avatar = createAvatar(lookOptions(skin, hat || null))
        const old = player.avatar.object
        avatar.object.position.copy(old.position)
        avatar.object.rotation.copy(old.rotation)
        old.parent?.add(avatar.object)
        old.removeFromParent()
        old.traverse((child) => child.geometry?.dispose())
        player.avatar = avatar
    }

    setLights(player, on) {
        player.lightsOn = on
        if (!player.lights) return
        const { glowing, on: lit, off } = player.lights
        for (const mesh of glowing) mesh.material = on ? lit : off
    }

    // Where the other boats are (to find an empty berth)
    boatPositions() {
        return [...this.players.values()].filter((player) => player.mesh).map((player) => player.mesh.position)
    }

    // Every physics step: my boat against each other boat, both as capsules
    // (a segment along the hull, as wide as the beam). Only my boat gets an
    // impulse, my share by mass; the other player's game moves theirs.
    collide(boat) {
        if (!this.players.size) return
        const body = boat.body
        const position = body.translation()
        const velocity = body.linvel()
        const rotation = body.rotation()
        _mine.set(rotation.x, rotation.y, rotation.z, rotation.w)
        _forward.set(0, 0, 1).applyQuaternion(_mine).setY(0).normalize()
        const myRadius = boat.half.x
        const myHalf = Math.max(0, boat.half.z - myRadius)
        for (const player of this.players.values()) {
            if (!player.mesh) continue
            const other = player.mesh.position
            // Far apart: nothing to do
            if (Math.hypot(other.x - position.x, other.z - position.z) > boat.half.z + player.half.z + 2) continue
            _theirs.set(0, 0, 1).applyQuaternion(player.mesh.quaternion).setY(0).normalize()
            const radius = player.half.x
            const half = Math.max(0, player.half.z - radius)
            const ax = position.x - _forward.x * myHalf
            const az = position.z - _forward.z * myHalf
            const bx = other.x - _theirs.x * half
            const bz = other.z - _theirs.z * half
            const [s, t] = closestOnSegments(ax, az, _forward.x * myHalf * 2, _forward.z * myHalf * 2, bx, bz, _theirs.x * half * 2, _theirs.z * half * 2)
            const px = ax + _forward.x * myHalf * 2 * s
            const pz = az + _forward.z * myHalf * 2 * s
            let nx = px - (bx + _theirs.x * half * 2 * t)
            let nz = pz - (bz + _theirs.z * half * 2 * t)
            const distance = Math.hypot(nx, nz)
            const reach = myRadius + radius
            if (distance >= reach) continue
            if (distance > 1e-4) {
                nx /= distance
                nz /= distance
            } else {
                nx = 1
                nz = 0
            }
            const penetration = reach - distance
            // Closing speed along the normal (negative = coming together)
            const closing = (velocity.x - player.velocity.x) * nx + (velocity.z - player.velocity.z) * nz
            // Bounce a little, and separate gently while overlapping (never a launch)
            const wanted = Math.max(closing < 0 ? -closing * 0.35 : 0, Math.min(2.5, penetration * 4))
            const share = player.mass / (boat.mass + player.mass)
            const change = Math.min(6, Math.max(0, wanted - closing) * share)
            if (change <= 0) continue
            // Halfway between the center and the contact: a bit of spin, not a spin-out
            const impulse = change * boat.mass
            body.applyImpulseAtPoint(
                { x: nx * impulse, y: 0, z: nz * impulse },
                { x: (position.x + px - nx * myRadius) / 2, y: position.y, z: (position.z + pz - nz * myRadius) / 2 },
                true
            )
        }
    }

    update() {
        const renderTime = performance.now() - DELAY
        const elapsed = this.game.ticker.elapsed
        const delta = this.game.ticker.delta
        const scene = this.game.rendering.scene
        for (const player of this.players.values()) {
            const snapshots = player.snapshots
            if (!snapshots.length || !player.mesh) continue
            // Keep the last state before renderTime and everything after it
            while (snapshots.length > 2 && snapshots[1].time <= renderTime) snapshots.shift()
            const a = snapshots[0]
            const b = snapshots[1] ?? a
            let alpha = b === a || renderTime <= a.time ? 0 : Math.min(1, (renderTime - a.time) / Math.max(1, b.time - a.time))
            const jump = Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]) > JUMP
            if (jump) alpha = alpha >= 0.5 ? 1 : 0

            // Boat: on our waves, with their tilt
            const x = lerp(a.p[0], b.p[0], alpha)
            const z = lerp(a.p[2], b.p[2], alpha)
            const mesh = player.mesh
            mesh.position.set(x, waveHeight(x, z, elapsed) + lerp(a.p[1], b.p[1], alpha), z)
            _qa.fromArray(a.q).normalize()
            _qb.fromArray(b.q).normalize()
            mesh.quaternion.slerpQuaternions(_qa, _qb, alpha)
            // Their speed (for bumping), from the two states around now
            const span = (b.time - a.time) / 1000
            if (span > 0.01 && !jump) {
                const ease = Math.min(1, delta * 10)
                player.velocity.x += ((b.p[0] - a.p[0]) / span - player.velocity.x) * ease
                player.velocity.z += ((b.p[2] - a.p[2]) / span - player.velocity.z) * ease
            } else {
                player.velocity.x *= 0.9
                player.velocity.z *= 0.9
            }

            if (player.teleport || jump) {
                player.body.setTranslation(mesh.position, true)
                player.body.setRotation(mesh.quaternion, true)
                player.teleport = false
            } else {
                player.body.setNextKinematicTranslation(mesh.position)
                player.body.setNextKinematicRotation(mesh.quaternion)
            }

            this.updatePerson(player, a.c, b.c, alpha, delta, elapsed, scene)

            // Name over the head on land, over the boat otherwise
            const avatar = player.avatar.object
            player.tag.visible = true
            if (player.ashore) player.tag.position.set(avatar.position.x, avatar.position.y + 2.3, avatar.position.z)
            else player.tag.position.set(x, mesh.position.y + player.half.y * 2 + 2, z)
        }
    }

    updatePerson(player, from, to, alpha, delta, elapsed, scene) {
        const avatar = player.avatar.object
        const state = alpha < 0.5 ? from : to
        player.ashore = state?.[0] === 's'
        if (!state) {
            avatar.removeFromParent()
            return
        }
        const parent = state[0] === 'd' ? player.mesh : scene
        if (avatar.parent !== parent) parent.add(avatar)
        // Glide only between two states of the same kind (deck→deck, land→land)
        const same = from && to && from[0] === to[0]
        const a = same ? from : state
        const b = same ? to : state
        avatar.position.set(lerp(a[1], b[1], alpha), lerp(a[2], b[2], alpha), lerp(a[3], b[3], alpha))
        avatar.rotation.y = lerpAngle(a[4], b[4], alpha)
        player.avatar.pose(POSES.includes(state[5]) ? state[5] : 'stand', state[6], delta, elapsed)
    }

    // Where a player's emote floats (null if they're gone)
    emoteAnchor(slot, target) {
        const player = this.players.get(slot)
        if (!player?.mesh) return null
        if (player.ashore) {
            const position = player.avatar.object.position
            return target.set(position.x, position.y + 3.4, position.z)
        }
        const position = player.mesh.position
        return target.set(position.x, position.y + player.half.y * 2 + 4.2, position.z)
    }

    // For the map: [{ slot, name, color, x, z }]
    list() {
        const list = []
        for (const player of this.players.values()) {
            if (!player.mesh) continue
            const source = player.ashore ? player.avatar.object.position : player.mesh.position
            list.push({ slot: player.slot, name: player.name, color: player.color, x: source.x, z: source.z })
        }
        return list
    }
}
