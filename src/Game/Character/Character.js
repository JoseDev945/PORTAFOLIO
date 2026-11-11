import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'
import { TickOrder } from '../Ticker.js'
import { createAvatar } from './Avatar.js'
import { isTouch } from '../Inputs.js'
import { lookOptions } from '../Fishing/catalog.js'

const RADIUS = 0.22
const WALK_SPEED = 1.7
const RUN_SPEED = 3
// On land there's more room: a bit faster
const SHORE_SPEED = { walk: 2.3, run: 4.8 }
// How close you must be to a seat or the helm to use it
const REACH = 1.1
const EYE = { stand: 1.62, sit: 1.25 }
// Seat height the sitting pose is made for (ferry seats); higher seats lift the body
const SEAT_HEIGHT = 0.4
// Stepping off: the boat must be this slow (m/s) and the floor this close to its side (m)
const LAND_SPEED = 2.5
const LAND_STEPS = [0.3, 0.7, 1.2, 1.8, 2.5, 3.2]
// Getting back on board: this close to the hull (m)
const BOARD_REACH = 2.2
// Highest step up or down on land (sand → grass is 0.6 m)
const MAX_STEP = 0.7
// Body used for the collision checks on land (a Rapier capsule)
const BODY = { radius: 0.25, halfHeight: 0.5 }
// The third person camera sits closer to a person than to a boat
const PERSON_CAMERA_OFFSET = -3.5

const _direction = new THREE.Vector3()
const _toWheel = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _euler = new THREE.Euler()
const _up = new THREE.Vector3(0, 1, 0)
const _bodyPosition = { x: 0, y: 0, z: 0 }
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }

// Shortest way between two angles
const lerpAngle = (from, to, t) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle))
const yawOf = (quaternion) => _euler.setFromQuaternion(quaternion, 'YXZ').y

// The person. States:
//   driving  at the helm: the controls drive the boat (the default)
//   walking  on foot on the deck (boats with a walkable deck: ferry, Corvina)
//   seated   in a passenger seat
//   shore    on land: docks, the marina, island beaches and grass
// The character action (F) uses whatever is at hand: what the crosshair is on,
// the project or showroom ring the boat is in, stepping off onto a dock or a
// beach, getting back on board, sitting down or taking the helm.
// On deck everything happens in the boat's local space (the avatar is a child
// of the boat mesh, so it rides the waves with it); on land, in world space.
export class Character {
    constructor() {
        this.game = Game.getInstance()
        // Dressed with the skin and hat from the inventory (bought at the port)
        this.applyLook()
        this.position = new THREE.Vector2()
        this.heading = 0
        this.state = 'driving'
        this.speed = 0
        this.pose = 'drive'
        this.prompt = null
        this.canopyOpacity = 1
        // Smoothed controls, so the wheel and the lever move gently
        this.helmControls = { steer: 0, throttle: 0 }

        // On land: feet position, smoothed floor height, velocity (for the camera)
        this.shorePosition = new THREE.Vector3()
        this.floorY = 0
        this.shoreVelocity = { x: 0, z: 0 }
        this.shoreYaw = 0
        this.shape = new this.game.physics.RAPIER.Capsule(BODY.halfHeight, BODY.radius)
        // Where F would step off right now (refreshed a few times per second)
        this.landing = null
        this.landingClock = 0

        // What the camera follows (see rig())
        this.boatRig = { position: null, quaternion: null, velocity: null, half: 0, eye: null, eyeYaw: 0 }
        this.shoreRig = {
            position: this.avatar.object.position,
            quaternion: new THREE.Quaternion(),
            velocity: this.shoreVelocity,
            half: PERSON_CAMERA_OFFSET,
            eye: [0, EYE.stand, 0],
            eyeYaw: 0
        }

        // Real lights under the canopy, created once the boat has a deck. They
        // stay in the scene (intensity 0 when off): adding or removing lights
        // would recompile every material
        this.lamps = []
        this.lightsOn = false

        this.attach()
        this.game.events.on('inventory:change', () => this.applyLook())
        this.game.events.on('boat:change', () => this.attach())
        // Respawn, map teleport, joining a room: back on board
        this.game.events.on('boat:place', () => this.board())
        this.game.inputs.on('character', () => this.game.playing && this.act())
        this.game.inputs.on('lights', () => this.game.playing && this.canUseHelm() && this.setLights(!this.lightsOn))
        this.game.ticker.on(() => this.update(), TickOrder.CHARACTER)
    }

    // New clothes: a new avatar takes the old one's place (same parent and pose spot)
    applyLook() {
        const { skin, hat } = this.game.inventory
        const key = `${skin}|${hat}`
        if (key === this.lookKey) return
        this.lookKey = key
        const avatar = createAvatar(lookOptions(skin, hat))
        const old = this.avatar
        if (old) {
            avatar.object.position.copy(old.object.position)
            avatar.object.rotation.copy(old.object.rotation)
            avatar.object.visible = old.object.visible
            old.object.parent?.add(avatar.object)
            old.object.removeFromParent()
            old.object.traverse((child) => child.geometry?.dispose())
        }
        this.avatar = avatar
        if (this.shoreRig) this.shoreRig.position = avatar.object.position
        this.game.events.trigger('character:look')
    }

    // How much higher than a ferry seat the current seat is
    get seatLift() {
        if (this.state !== 'seated' || this.seat?.y == null) return 0
        return Math.max(0, this.seat.y - this.deck.y - SEAT_HEIGHT)
    }

    // True when the controls drive the boat
    get driving() {
        return this.state === 'driving'
    }

    get ashore() {
        return this.state === 'shore'
    }

    // Puts the avatar on the current boat, at the helm
    attach() {
        const { boat } = this.game
        this.deck = boat.mesh.userData.deck ?? null
        this.avatar.object.removeFromParent()
        this.state = 'driving'
        boat.setParked(false)
        document.documentElement.classList.toggle('has-deck', Boolean(this.deck))
        if (!this.deck) {
            this.setPrompt(null)
            return
        }
        boat.mesh.add(this.avatar.object)
        this.winding = this.computeWinding()
        this.takeHelm()

        const { lamps } = this.deck.lights
        while (this.lamps.length < lamps.length) this.lamps.push(new THREE.PointLight('#ffe2a8', 0, 7, 1.4))
        this.lamps.forEach((light, i) => {
            light.removeFromParent()
            if (lamps[i]) {
                light.position.set(...lamps[i])
                boat.mesh.add(light)
            }
        })
        this.setLights(this.lightsOn)
    }

    // The lights switch is on the console: reachable at the helm or next to it
    canUseHelm() {
        if (!this.deck) return false
        if (this.state === 'driving') return true
        const { helm } = this.deck
        return this.state === 'walking' && Math.hypot(helm.x - this.position.x, helm.z - this.position.y) < REACH
    }

    // From anywhere on board
    toggleLights() {
        if (!this.deck || this.ashore) return
        this.setLights(!this.lightsOn)
        this.game.events.trigger('ui:click')
    }

    setLights(on) {
        this.lightsOn = on
        if (!this.deck) return
        const { glowing, on: lit, off } = this.deck.lights
        for (const mesh of glowing) mesh.material = on ? lit : off
        for (const light of this.lamps) light.intensity = on ? 3.5 : 0
    }

    takeHelm() {
        const { helm } = this.deck
        this.state = 'driving'
        this.position.set(helm.x, helm.z)
        this.setHeading(helm.angle)
    }

    // Turns the body without turning the first person view (it keeps looking
    // at the same spot, so taking a seat doesn't jerk the camera)
    setHeading(heading) {
        const { chase, mode } = this.game.view
        if (mode === 'first') {
            chase.orbitYaw += this.heading - heading
            chase.orbitYawTarget += this.heading - heading
        }
        this.heading = heading
    }

    act() {
        // First person: F uses what the crosshair is on (a rod, the helm)
        const aimed = this.aimedTarget()
        if (aimed?.kind === 'rod') {
            this.game.fishing.use()
            return
        }
        if (aimed?.kind === 'helm') {
            this.takeHelm()
            return
        }
        if (aimed?.kind === 'tub') {
            this.game.ui.inventory.open()
            return
        }
        if (this.ashore) {
            // A shop counter at hand (the port's vendors), otherwise the boat
            const station = this.nearestStation()
            if (station) this.game.events.trigger('station', station.payload)
            else if (this.nearBoat()) this.board()
            return
        }
        // At the helm inside a project or showroom ring: open it / take that boat
        const zone = this.game.world.zones.active
        if (this.state === 'driving' && zone) {
            this.game.events.trigger('interact', zone)
            return
        }
        // Next to a dock or a beach: step off (a seat or the helm within reach comes first)
        if (this.state !== 'seated' && !(this.state === 'walking' && this.nearest())) {
            const landing = this.findLanding()
            if (landing) {
                this.disembark(landing)
                return
            }
        }
        if (!this.deck) return
        if (this.state === 'driving') {
            // Step back from the console, out of the way of the wheel
            this.state = 'walking'
            return
        }
        if (this.state === 'seated') {
            this.state = 'walking'
            this.position.copy(this.standing)
            return
        }
        const target = this.nearest()
        if (!target) return
        if (target.helm) {
            this.takeHelm()
            return
        }
        this.standing = this.position.clone()
        this.state = 'seated'
        this.seat = target
        this.position.set(target.x, target.z)
        this.setHeading(target.angle)
    }

    // Closest seat or the helm within reach, or null
    nearest() {
        if (!this.deck) return null
        let best = null
        let bestDistance = REACH
        const candidates = [{ ...this.deck.helm, helm: true }, ...this.deck.seats]
        for (const candidate of candidates) {
            const distance = Math.hypot(candidate.x - this.position.x, candidate.z - this.position.y)
            if (distance < bestDistance) {
                bestDistance = distance
                best = candidate
            }
        }
        return best
    }

    // ── Stepping off and on ────────────────────────────────────────────────

    // A free spot on a dock or a beach right next to the (slow) boat, or null.
    // Rays go out from both sides, the bow and the stern; the first floor on
    // each one counts, and the closest one to where you stand wins.
    findLanding() {
        const { boat, world } = this.game
        if (!world.walkables.length) return null
        const velocity = boat.body.linvel()
        if (Math.hypot(velocity.x, velocity.z) > LAND_SPEED) return null

        const center = boat.mesh.position
        _forward.set(0, 0, 1).applyQuaternion(boat.mesh.quaternion).setY(0).normalize()
        const fx = _forward.x
        const fz = _forward.z
        // Sideways (both sides are tried, so its sign doesn't matter)
        const rx = fz
        const rz = -fx
        const { half } = boat
        // From where the person stands on deck (the helm when driving)
        let fromX = center.x
        let fromZ = center.z
        if (this.deck) {
            const yaw = yawOf(boat.mesh.quaternion)
            const cos = Math.cos(yaw)
            const sin = Math.sin(yaw)
            fromX += this.position.x * cos + this.position.y * sin
            fromZ += -this.position.x * sin + this.position.y * cos
        }

        let best = null
        let bestScore = Infinity
        const ray = (startX, startZ, dirX, dirZ) => {
            for (const step of LAND_STEPS) {
                const x = startX + dirX * step
                const z = startZ + dirZ * step
                const floor = world.surfaceAt(x, z, RADIUS)
                if (!floor) continue
                if (!this.isFree(x, floor.y, z)) continue
                const score = step + Math.hypot(x - fromX, z - fromZ) * 0.35
                if (score < bestScore) {
                    bestScore = score
                    best = { x, y: floor.y, z, dock: floor.shape === 'box' }
                }
                return
            }
        }
        for (const side of [-1, 1]) {
            for (let along = -1; along <= 1.001; along += 0.25) {
                const a = along * half.z * 0.85
                ray(center.x + fx * a + rx * side * half.x, center.z + fz * a + rz * side * half.x, rx * side, rz * side)
            }
        }
        for (const end of [-1, 1]) {
            for (const lateral of [-0.5, 0, 0.5]) {
                const l = lateral * half.x
                ray(center.x + fx * end * half.z + rx * l, center.z + fz * end * half.z + rz * l, fx * end, fz * end)
            }
        }
        return best
    }

    // Nothing solid (palm, rock, wall, a boat…) where a person would stand.
    // Floors (island ground, docks) and our own boat don't count.
    isFree(x, floorY, z) {
        const { physics, boat } = this.game
        const ground = physics.groundColliders
        _bodyPosition.x = x
        _bodyPosition.y = floorY + 0.12 + BODY.radius + BODY.halfHeight
        _bodyPosition.z = z
        let hit = false
        physics.world.intersectionsWithShape(_bodyPosition, IDENTITY, this.shape, () => {
            hit = true
            return false
        }, undefined, undefined, undefined, boat.body, (collider) => !ground.has(collider.handle))
        return !hit
    }

    // A shop counter within reach while on land (see 'stations' in World/walkable.js)
    nearestStation() {
        let best = null
        let bestDistance = Infinity
        for (const station of this.game.world.stations) {
            const distance = Math.hypot(station.x - this.shorePosition.x, station.z - this.shorePosition.z)
            if (distance < station.radius && distance < bestDistance) {
                best = station
                bestDistance = distance
            }
        }
        return best
    }

    // Close enough to the boat's hull to climb aboard
    nearBoat() {
        const { boat } = this.game
        const center = boat.mesh.position
        _forward.set(0, 0, 1).applyQuaternion(boat.mesh.quaternion).setY(0).normalize()
        const dx = this.shorePosition.x - center.x
        const dz = this.shorePosition.z - center.z
        const along = Math.abs(dx * _forward.x + dz * _forward.z) - boat.half.z
        const lateral = Math.abs(dx * _forward.z - dz * _forward.x) - boat.half.x
        return Math.hypot(Math.max(0, along), Math.max(0, lateral)) < BOARD_REACH
    }

    disembark(landing) {
        const { boat, view, rendering } = this.game
        this.game.fishing?.stow()
        // First person keeps looking the same way; otherwise face away from the boat
        const chaseYaw = view.chase.initialized ? view.chase.yaw : yawOf(boat.mesh.quaternion)
        if (view.mode === 'first') this.heading = chaseYaw + (this.deck ? this.heading : 0)
        else this.heading = Math.atan2(landing.x - boat.mesh.position.x, landing.z - boat.mesh.position.z)
        // The camera keeps its angle around you
        this.shoreYaw = chaseYaw
        this.shoreRig.quaternion.setFromAxisAngle(_up, chaseYaw)

        this.state = 'shore'
        this.avatar.object.removeFromParent()
        rendering.scene.add(this.avatar.object)
        this.shorePosition.set(landing.x, landing.y, landing.z)
        this.floorY = landing.y
        this.avatar.object.position.copy(this.shorePosition)
        this.shoreVelocity.x = this.shoreVelocity.z = 0
        this.landing = null
        // Moored: the boat waits where you left it
        boat.setParked(true)
        this.game.events.trigger('ui:click')
        this.game.events.trigger('character:shore', true)
    }

    // Back on board, at the helm
    board() {
        if (!this.ashore) return
        const { boat, view } = this.game
        const worldHeading = this.heading
        boat.setParked(false)
        this.avatar.object.removeFromParent()
        this.state = 'driving'
        let eyeYaw = 0
        if (this.deck) {
            boat.mesh.add(this.avatar.object)
            const { helm } = this.deck
            this.position.set(helm.x, helm.z)
            this.heading = helm.angle
            eyeYaw = helm.angle
        } else {
            this.heading = 0
        }
        // First person: keep looking where you were looking
        if (view.mode === 'first') {
            const boatYaw = yawOf(boat.mesh.quaternion)
            const look = wrapAngle(worldHeading - boatYaw - eyeYaw)
            view.chase.yaw = boatYaw
            view.chase.orbitYaw += look
            view.chase.orbitYawTarget += look
        }
        this.game.events.trigger('ui:click')
        this.game.events.trigger('character:shore', false)
    }

    // What the camera follows: the boat, or the person on land
    rig() {
        if (this.ashore) {
            this.shoreRig.eyeYaw = this.heading - this.shoreYaw
            return this.shoreRig
        }
        const { boat } = this.game
        const rig = this.boatRig
        rig.position = boat.mesh.position
        rig.quaternion = boat.mesh.quaternion
        rig.velocity = boat.body.linvel()
        rig.half = boat.half.z
        rig.eye = boat.eye
        rig.eyeYaw = boat.eyeYaw ?? 0
        return rig
    }

    // Where emotes float: over the head on land, over the boat otherwise
    emoteAnchor(target) {
        const { boat } = this.game
        if (this.ashore) return target.copy(this.avatar.object.position).setY(this.avatar.object.position.y + 2.7)
        return target.copy(boat.mesh.position).setY(boat.mesh.position.y + boat.half.y * 2 + 3.4)
    }

    // ── Per frame ──────────────────────────────────────────────────────────

    update() {
        const delta = this.game.ticker.gameDelta
        const { inputs, view, boat } = this.game

        // Is there somewhere to step off? (for the prompt; F checks again)
        this.landingClock -= this.game.ticker.delta
        if (this.landingClock <= 0) {
            this.landingClock = 0.2
            const looking = this.game.playing && (this.state === 'driving' || this.state === 'walking')
            this.landing = looking ? this.findLanding() : null
        }

        if (this.ashore) {
            if (this.game.playing) this.walkShore(delta, inputs, view)
            else this.speed = 0
            this.placeShore(delta)
        } else if (this.deck) {
            if (this.state === 'walking' && this.game.playing) this.walk(delta, inputs, view, boat)
            else this.speed = 0
            // Pose and placement on the deck
            const object = this.avatar.object
            object.position.set(this.position.x, this.deck.y + this.seatLift, this.position.y)
            object.rotation.y = this.heading
        }

        this.pose = this.state === 'seated' ? 'sit' : this.state === 'driving' ? 'drive' : this.speed > 0.1 ? 'walk' : 'stand'
        if (this.deck || this.ashore) {
            // In first person the camera is inside the head
            this.avatar.object.visible = view.mode !== 'first'
            this.avatar.pose(this.pose, this.speed, delta, this.game.ticker.elapsed)
        }

        if (this.deck) {
            this.updateHelm(delta, inputs)
            if (!this.ashore) this.updateCamera()
            this.updateCanopy(delta, view)
        }
        this.updatePrompt()
    }

    // Movement asked by the controls: first person walks where you look (like
    // Minecraft), third person moves relative to the camera. Returns world
    // (or deck) x/z, already limited to length 1, or null when standing still.
    moveInput(inputs, view, delta) {
        const forward = inputs.throttle
        const turn = inputs.steer
        let moveX
        let moveZ
        if (view.mode === 'first') {
            // The body turns with the mouse look, left/right step sideways
            const look = view.chase.orbitYaw
            this.heading += look
            view.chase.orbitYaw -= look
            view.chase.orbitYawTarget -= look
            const sin = Math.sin(this.heading)
            const cos = Math.cos(this.heading)
            // The body's right is -x, so its right is (-cos, sin)
            moveX = sin * forward + cos * turn
            moveZ = cos * forward - sin * turn
        } else {
            view.camera.getWorldDirection(_direction)
            _direction.y = 0
            _direction.normalize()
            const rightX = -_direction.z
            const rightZ = _direction.x
            moveX = _direction.x * forward - rightX * turn
            moveZ = _direction.z * forward - rightZ * turn
        }
        const length = Math.hypot(moveX, moveZ)
        if (length < 0.05) return null
        const scale = Math.min(1, length) / length
        return { x: moveX * scale, z: moveZ * scale }
    }

    // Third person: the body turns toward where it walks (x, z in its own space)
    faceMove(x, z, delta) {
        this.heading = lerpAngle(this.heading, Math.atan2(x, z), 1 - Math.exp(-delta * 12))
    }

    walk(delta, inputs, view, boat) {
        const move = this.moveInput(inputs, view, delta)
        if (!move) {
            this.speed = 0
            return
        }
        let moveX = move.x
        let moveZ = move.z
        if (view.mode !== 'first') {
            // World direction -> boat local (yaw only)
            const yaw = yawOf(boat.mesh.quaternion)
            const cos = Math.cos(-yaw)
            const sin = Math.sin(-yaw)
            moveX = move.x * cos + move.z * sin
            moveZ = -move.x * sin + move.z * cos
            this.faceMove(moveX, moveZ, delta)
        }
        const speed = inputs.boost ? RUN_SPEED : WALK_SPEED

        // Slide along walls and seats: try the full step, then each axis alone
        const step = speed * delta
        const x = this.position.x + moveX * step
        const z = this.position.y + moveZ * step
        const before = this.position.clone()
        if (this.free(x, z)) this.position.set(x, z)
        else if (this.free(x, this.position.y)) this.position.x = x
        else if (this.free(this.position.x, z)) this.position.y = z
        this.speed = before.distanceTo(this.position) / Math.max(delta, 1e-4)
    }

    walkShore(delta, inputs, view) {
        const move = this.moveInput(inputs, view, delta)
        const position = this.shorePosition
        const beforeX = position.x
        const beforeZ = position.z
        if (move) {
            if (view.mode !== 'first') this.faceMove(move.x, move.z, delta)
            const step = (inputs.boost ? SHORE_SPEED.run : SHORE_SPEED.walk) * delta
            const x = position.x + move.x * step
            const z = position.z + move.z * step
            // Stuck inside something (a barrel rolled onto you): any step out is fine
            const stuck = !this.isFree(position.x, this.floorY, position.z)
            const canStand = (px, pz) => {
                const floor = this.game.world.surfaceAt(px, pz, RADIUS)
                if (!floor || Math.abs(floor.y - this.floorY) > MAX_STEP) return false
                return stuck || this.isFree(px, floor.y, pz)
            }
            if (canStand(x, z)) position.set(x, position.y, z)
            else if (canStand(x, position.z)) position.x = x
            else if (canStand(position.x, z)) position.z = z
        }
        const moved = Math.hypot(position.x - beforeX, position.z - beforeZ)
        this.speed = moved / Math.max(delta, 1e-4)
        const ease = 1 - Math.exp(-delta * 10)
        this.shoreVelocity.x += ((position.x - beforeX) / Math.max(delta, 1e-4) - this.shoreVelocity.x) * ease
        this.shoreVelocity.z += ((position.z - beforeZ) / Math.max(delta, 1e-4) - this.shoreVelocity.z) * ease
    }

    // Feet on the floor (stepping up and down smoothly) and facing the heading
    placeShore(delta) {
        const floor = this.game.world.surfaceAt(this.shorePosition.x, this.shorePosition.z, 0)
        if (floor) this.floorY += (floor.y - this.floorY) * (1 - Math.exp(-delta * 14))
        this.shorePosition.y = this.floorY
        const object = this.avatar.object
        object.position.copy(this.shorePosition)
        object.rotation.y = this.heading
    }

    // Inside the bulwarks and not in a seat or the console
    free(x, z) {
        const { outline, obstacles } = this.deck
        // Convex outline: stay at least RADIUS inside every edge
        for (let i = 0; i < outline.length; i++) {
            const [ax, az] = outline[i]
            const [bx, bz] = outline[(i + 1) % outline.length]
            const ex = bx - ax
            const ez = bz - az
            const inside = (ex * (z - az) - ez * (x - ax)) / Math.hypot(ex, ez)
            if (inside * this.winding < RADIUS) return false
        }
        for (const box of obstacles) {
            if (x > box.minX - RADIUS && x < box.maxX + RADIUS && z > box.minZ - RADIUS && z < box.maxZ + RADIUS) return false
        }
        return true
    }

    // +1 when the outline goes counterclockwise (in x, z), -1 otherwise
    computeWinding() {
        const { outline } = this.deck
        let area = 0
        for (let i = 0; i < outline.length; i++) {
            const [ax, az] = outline[i]
            const [bx, bz] = outline[(i + 1) % outline.length]
            area += ax * bz - bx * az
        }
        return Math.sign(area) || 1
    }

    // The wheel turns and the throttle lever moves with the controls while driving
    updateHelm(delta, inputs) {
        const { wheel, lever } = this.deck.helm
        const active = this.state === 'driving' && this.game.playing
        const ease = 1 - Math.exp(-delta * 6)
        this.helmControls.steer += ((active ? inputs.steer : 0) - this.helmControls.steer) * ease
        this.helmControls.throttle += ((active ? inputs.throttle : 0) - this.helmControls.throttle) * ease
        // Seen from the pilot, left = counterclockwise
        wheel.rotation.z = -this.helmControls.steer * 1.6
        lever.rotation.x = this.helmControls.throttle * 0.6
    }

    // First person camera: the eyes follow the person
    updateCamera() {
        const { boat } = this.game
        const height = this.state === 'seated' ? EYE.sit + this.seatLift : EYE.stand
        boat.eye = [this.position.x, this.deck.y + height, this.position.y]
        boat.eyeYaw = this.heading
    }

    // The canopy fades while you're on foot or seated on deck, so the camera
    // sees you under it (not in first person, where it's your roof)
    updateCanopy(delta, view) {
        const onDeck = this.state === 'walking' || this.state === 'seated'
        const target = onDeck && view.mode !== 'first' ? 0.2 : 1
        this.canopyOpacity += (target - this.canopyOpacity) * (1 - Math.exp(-delta * 6))
        const material = this.deck.canopyMaterial
        material.opacity = this.canopyOpacity
        material.depthWrite = this.canopyOpacity > 0.95
    }

    // First person: is the crosshair on the console (the wheel, close enough)?
    aimingAtHelm() {
        const camera = this.game.view.camera
        this.deck.helm.wheel.getWorldPosition(_toWheel).sub(camera.position)
        const distance = _toWheel.length()
        if (distance > 2.5) return false
        _forward.set(0, 0, -1).applyQuaternion(camera.quaternion)
        return _toWheel.dot(_forward) / distance > Math.cos(0.45)
    }

    // What the crosshair is on in first person, if F can use it:
    // { kind: 'rod' | 'helm', object, prompt: [{ action, label }, …] } or null
    aimedTarget() {
        if (this.game.view.mode !== 'first' || !this.game.playing || this.ashore) return null
        const fishing = this.game.fishing
        if (fishing?.aimed) {
            return { kind: 'rod', object: fishing.aimed.aim, prompt: [{ action: 'character', label: fishing.equipped ? 'Guardar caña' : 'Tomar caña' }] }
        }
        if (fishing?.aimedTub) {
            return { kind: 'tub', object: fishing.gear.tub.aim, prompt: [{ action: 'character', label: 'Ver tus pescados' }] }
        }
        if (this.deck && this.state === 'walking' && this.canUseHelm() && this.aimingAtHelm()) {
            return {
                kind: 'helm',
                object: this.deck.helm.wheel,
                prompt: [
                    { action: 'character', label: 'Tomar el timón' },
                    { action: 'lights', label: this.lightsOn ? 'Apagar luces' : 'Encender luces' }
                ]
            }
        }
        return null
    }

    // What the keys do right now: [{ action, label }, …]
    updatePrompt() {
        const touch = isTouch()
        // What the crosshair is on: its own label next to it on desktop
        // (UI/AimLabel.js); touch screens get the helm's buttons here
        const aimed = this.aimedTarget()
        if (aimed) {
            this.setPrompt(touch && aimed.kind !== 'rod' ? aimed.prompt : null)
            return
        }
        const prompt = []
        if (this.ashore) {
            const station = this.nearestStation()
            if (station) prompt.push({ action: 'character', label: station.payload.label })
            else if (this.nearBoat()) prompt.push({ action: 'character', label: 'Subir al bote' })
        } else {
            // In a project / showroom ring F opens it: the card shows the key
            const inZone = this.state === 'driving' && this.game.world.zones.active
            const seatClose = this.state === 'walking' && this.nearest()
            if (!inZone && this.landing && this.state !== 'seated' && !seatClose) {
                prompt.push({ action: 'character', label: this.landing.dock ? 'Bajar al muelle' : 'Bajar a tierra' })
            } else if (this.deck && !touch && !inZone) {
                // Touch screens get up and sit down with the 🚶 button
                if (this.state === 'driving') prompt.push({ action: 'character', label: 'Levantarte y caminar' })
                else if (this.state === 'seated') prompt.push({ action: 'character', label: 'Levantarte' })
                else if (seatClose) prompt.push({ action: 'character', label: seatClose.helm ? 'Tomar el timón' : 'Sentarte' })
            }
            if (!touch && this.canUseHelm()) prompt.push({ action: 'lights', label: this.lightsOn ? 'Apagar luces' : 'Encender luces' })
        }
        this.setPrompt(prompt.length ? prompt : null)
    }

    setPrompt(prompt) {
        const key = JSON.stringify(prompt)
        if (key === this.promptKey) return
        this.promptKey = key
        this.prompt = prompt
        this.game.events.trigger('character:prompt', prompt)
    }

    // Compact state for the other players: null (only the boat is seen), or
    // [where, x, y, z, heading, pose, speed] with where 'd' = on deck (boat
    // local space) or 's' = on land (world space)
    netState() {
        const round = (value) => Math.round(value * 100) / 100
        if (this.ashore) {
            const p = this.avatar.object.position
            return ['s', round(p.x), round(p.y), round(p.z), round(this.heading), this.pose, round(this.speed)]
        }
        if (!this.deck) return null
        const p = this.avatar.object.position
        return ['d', round(p.x), round(p.y), round(p.z), round(this.heading), this.pose, round(this.speed)]
    }
}
