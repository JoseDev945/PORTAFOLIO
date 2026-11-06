import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'
import { TickOrder } from '../Ticker.js'
import { createAvatar } from './Avatar.js'
import { isTouch } from '../Inputs.js'

const RADIUS = 0.22
const WALK_SPEED = 1.7
const RUN_SPEED = 3
// How close you must be to a seat or the helm to use it
const REACH = 1.1
const EYE = { stand: 1.62, sit: 1.25 }
// Seat height the sitting pose is made for (ferry seats); higher seats lift the body
const SEAT_HEIGHT = 0.4

const _direction = new THREE.Vector3()
const _toWheel = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _euler = new THREE.Euler()

// Shortest way between two angles
const lerpAngle = (from, to, t) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t

// The person on board. It exists on boats with a walkable deck (layout
// 'ferry'). States:
//   driving  at the helm: the controls drive the boat (the default)
//   walking  on foot on the deck: the controls move the person, the boat drifts
//   seated   in a passenger seat
// The character action (F) gets up, sits down or takes the helm.
// Everything happens in the boat's local space: the avatar is a child of the
// boat mesh, so it rides the waves with it.
export class Character {
    constructor() {
        this.game = Game.getInstance()
        this.avatar = createAvatar()
        this.position = new THREE.Vector2()
        this.heading = 0
        this.state = 'driving'
        this.speed = 0
        this.prompt = null
        this.canopyOpacity = 1
        // Smoothed controls, so the wheel and the lever move gently
        this.helmControls = { steer: 0, throttle: 0 }

        // Real lights under the canopy, created once the boat has a deck. They
        // stay in the scene (intensity 0 when off): adding or removing lights
        // would recompile every material
        this.lamps = []
        this.lightsOn = false

        this.attach()
        this.game.events.on('boat:change', () => this.attach())
        this.game.inputs.on('character', () => this.game.playing && this.act())
        this.game.inputs.on('lights', () => this.game.playing && this.canUseHelm() && this.setLights(!this.lightsOn))
        this.game.ticker.on(() => this.update(), TickOrder.CHARACTER)
    }

    // How much higher than a ferry seat the current seat is
    get seatLift() {
        if (this.state !== 'seated' || this.seat?.y == null) return 0
        return Math.max(0, this.seat.y - this.deck.y - SEAT_HEIGHT)
    }

    // True when the controls drive the boat
    get driving() {
        return !this.deck || this.state === 'driving'
    }

    // Puts the avatar on the current boat, at the helm
    attach() {
        const { boat } = this.game
        this.deck = boat.mesh.userData.deck ?? null
        this.avatar.object.removeFromParent()
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

    // From anywhere on board (right click in first person)
    toggleLights() {
        if (!this.deck) return
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

    update() {
        if (!this.deck) return
        const delta = this.game.ticker.gameDelta
        const { inputs, view, boat } = this.game

        if (this.state === 'walking' && this.game.playing) this.walk(delta, inputs, view, boat)
        else this.speed = 0

        // Pose and placement on the deck
        const object = this.avatar.object
        object.position.set(this.position.x, this.deck.y + this.seatLift, this.position.y)
        object.rotation.y = this.heading
        // In first person the camera is inside the head
        object.visible = view.mode !== 'first'
        const pose = this.state === 'seated' ? 'sit' : this.state === 'driving' ? 'drive' : this.speed > 0.1 ? 'walk' : 'stand'
        this.avatar.pose(pose, this.speed, delta, this.game.ticker.elapsed)

        this.updateHelm(delta, inputs)
        this.updateCamera()
        this.updateCanopy(delta, view)
        this.updatePrompt()
    }

    walk(delta, inputs, view, boat) {
        const forward = inputs.throttle
        const turn = inputs.steer
        const speed = inputs.boost ? RUN_SPEED : WALK_SPEED
        let moveX = 0
        let moveZ = 0

        if (view.mode === 'first') {
            // First person, like Minecraft: the body turns with the mouse look,
            // forward/back walk where you look and left/right step sideways
            const look = view.chase.orbitYaw
            this.heading += look
            view.chase.orbitYaw -= look
            view.chase.orbitYawTarget -= look
            const sin = Math.sin(this.heading)
            const cos = Math.cos(this.heading)
            // The boat's right is -x, so the person's right is (-cos, sin)
            moveX = sin * forward + cos * turn
            moveZ = cos * forward - sin * turn
        } else {
            // Third person: move relative to the camera, turning toward the movement
            view.camera.getWorldDirection(_direction)
            _direction.y = 0
            _direction.normalize()
            const rightX = -_direction.z
            const rightZ = _direction.x
            const worldX = _direction.x * forward - rightX * turn
            const worldZ = _direction.z * forward - rightZ * turn
            // World direction -> boat local (yaw only)
            _euler.setFromQuaternion(boat.mesh.quaternion, 'YXZ')
            const cos = Math.cos(-_euler.y)
            const sin = Math.sin(-_euler.y)
            moveX = worldX * cos + worldZ * sin
            moveZ = -worldX * sin + worldZ * cos
        }

        const length = Math.hypot(moveX, moveZ)
        if (length < 0.05) {
            this.speed = 0
            return
        }
        const scale = Math.min(1, length) / length
        moveX *= scale
        moveZ *= scale
        if (view.mode !== 'first') this.heading = lerpAngle(this.heading, Math.atan2(moveX, moveZ), 1 - Math.exp(-delta * 12))

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

    // The canopy fades while you're on foot or seated, so the camera sees you
    // under it (not in first person, where it's your roof)
    updateCanopy(delta, view) {
        const target = this.state !== 'driving' && view.mode !== 'first' ? 0.2 : 1
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
        if (this.game.view.mode !== 'first' || !this.game.playing) return null
        const fishing = this.game.fishing
        if (fishing?.aimed) {
            return { kind: 'rod', object: fishing.aimed.aim, prompt: [{ action: 'character', label: fishing.equipped ? 'Guardar caña' : 'Tomar caña' }] }
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
        const prompt = []
        // Touch screen in first person: only what the crosshair is on (🚶 has its own button)
        if (isTouch() && this.game.view.mode === 'first') {
            if (this.canUseHelm() && this.aimingAtHelm()) prompt.push({ action: 'lights', label: this.lightsOn ? 'Apagar luces' : 'Encender luces' })
            this.setPrompt(prompt.length ? prompt : null)
            return
        }
        // On desktop what the crosshair is on gets its own label next to it (UI/AimLabel.js)
        if (this.aimedTarget()) {
            this.setPrompt(null)
            return
        }
        if (this.state === 'driving') prompt.push({ action: 'character', label: 'Levantarte y caminar' })
        else if (this.state === 'seated') prompt.push({ action: 'character', label: 'Levantarte' })
        else {
            const target = this.nearest()
            if (target) prompt.push({ action: 'character', label: target.helm ? 'Tomar el timón' : 'Sentarte' })
        }
        if (this.canUseHelm()) prompt.push({ action: 'lights', label: this.lightsOn ? 'Apagar luces' : 'Encender luces' })
        this.setPrompt(prompt.length ? prompt : null)
    }

    setPrompt(prompt) {
        const key = JSON.stringify(prompt)
        if (key === this.promptKey) return
        this.promptKey = key
        this.prompt = prompt
        this.game.events.trigger('character:prompt', prompt)
    }
}
