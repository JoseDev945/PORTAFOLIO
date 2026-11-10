import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'
import { TickOrder } from '../Ticker.js'
import { waveHeight } from '../World/Waves.js'
import { shoreDistanceAt } from '../World/Water.js'
import { colorMaterial, mistMaterial } from '../World/materials.js'
import { createRod, createCatchMesh } from '../Boat/FishingGear.js'
import { fish as SPECIES } from '../../data/fish.js'
import { isTouch } from '../Inputs.js'
import { keyLabel } from '../utils/keys.js'

const GRAVITY = 9.8
// Longer than this and the line snaps
const MAX_LINE = 32
// Seconds until a fish notices the bobber (Minecraft: 5 to 30)
const WAIT = [5, 18]
// Seconds the bobber stays under: reel in during this window to catch it
const BITE_WINDOW = 0.95
// Faster than this (m/s) the bobber can't be cast and an out line snaps
const MAX_SPEED = { cast: 2.5, line: 3.2 }
const TUB_VISIBLE = 14
const STORAGE_KEY = 'portafolio-pesca'
// Where the rod is held, in camera space (the camera looks along -z)
const HAND = { x: 0.34, y: -0.4, z: -0.5, pitch: -1.2, roll: 0.18, scale: 0.8 }
const BUBBLES = 28

const _tip = new THREE.Vector3()
const _target = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _point = new THREE.Vector3()
const _raycaster = new THREE.Raycaster()
_raycaster.far = 3.2
const _center = new THREE.Vector2(0, 0)

const randomIn = ([min, max]) => min + Math.random() * (max - min)
// Repeatable random numbers for laying the fish in the tub
const hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
}

function createBobber() {
    const bobber = new THREE.Group()
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), colorMaterial('#e63946'))
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), colorMaterial('#f4f1ea'))
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 5), colorMaterial('#1d1f26'))
    stick.position.y = 0.12
    bobber.add(top, bottom, stick)
    return bobber
}

// Fishing like in Minecraft, from the first person view of a boat with rod
// holders (the Corvina 250). The fish action (G / right click / 🎣):
//   1. takes a rod from its holder and casts the bobber
//   2. you wait; bubbles move along the surface toward the bobber
//   3. the bobber is pulled under with a splash: reel in right then to catch it
// Reeling in at any other time just brings the bobber back. Every catch flies
// into the boat's tub, which keeps your catch between visits.
export class Fishing {
    constructor() {
        this.game = Game.getInstance()
        const scene = this.game.rendering.scene
        this.gear = null
        this.equipped = false
        this.state = 'idle'
        this.timer = 0
        this.swing = { kind: null, t: 0 }
        this.bobberVelocity = new THREE.Vector3()
        this.anchor = new THREE.Vector2()
        this.flights = []
        this.aimed = null
        this.load()

        // The rod in your hand, glued to the camera every frame
        this.hand = new THREE.Group()
        this.hand.visible = false
        this.pivot = new THREE.Group()
        this.pivot.position.set(HAND.x, HAND.y, HAND.z)
        this.pivot.scale.setScalar(HAND.scale)
        this.hand.add(this.pivot)
        this.rod = createRod('#f2c14e')
        this.pivot.add(this.rod)
        scene.add(this.hand)

        this.bobber = createBobber()
        this.bobber.visible = false
        scene.add(this.bobber)

        // Line from the tip to the bobber, with some slack
        this.linePoints = 20
        const lineGeometry = new THREE.BufferGeometry()
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.linePoints * 3), 3))
        this.line = new THREE.Line(lineGeometry, new THREE.LineBasicNodeMaterial({ color: '#f2f2f2', transparent: true, opacity: 0.85 }))
        this.line.frustumCulled = false
        this.line.visible = false
        scene.add(this.line)

        // Minecraft style bubbles that run toward the bobber before a bite
        this.bubbles = Array.from({ length: BUBBLES }, () => {
            const sprite = new THREE.Sprite(mistMaterial)
            sprite.visible = false
            scene.add(sprite)
            return { sprite, age: 0, life: 0 }
        })
        this.bubbleCursor = 0
        this.bubbleClock = 0

        const { events, inputs, canvas } = this.game
        inputs.on('fish', () => this.game.playing && this.use())
        // Right click: in first person it fishes while you hold a rod or aim at
        // one, otherwise it switches the boat lights. In the other cameras it fishes.
        canvas.addEventListener('mousedown', (event) => {
            if (event.button !== 2 || !this.game.playing) return
            const fishing = this.gear && (this.equipped || this.aimed)
            if (this.game.view.mode === 'first' && !fishing) this.game.character.toggleLights()
            else if (this.gear) this.use()
        })
        canvas.addEventListener('contextmenu', (event) => event.preventDefault())
        events.on('boat:change', () => this.attach())
        events.on('camera:change', (mode) => mode !== 'first' && this.stow())
        this.game.ticker.on(() => this.update(), TickOrder.VIEW + 5)
        this.attach()
    }

    load() {
        this.tub = { count: 0, log: [], best: null }
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
            if (saved && Number.isFinite(saved.count) && Array.isArray(saved.log)) {
                this.tub.count = saved.count
                // Only entries of species that still exist
                this.tub.log = saved.log.filter((entry) => SPECIES.some((species) => species.id === entry?.id) && Number.isFinite(entry.kg) && Number.isFinite(entry.length))
                if (saved.best && SPECIES.some((species) => species.id === saved.best.id)) this.tub.best = saved.best
            }
        } catch {
            // Nothing saved or storage blocked: an empty tub
        }
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tub))
        } catch {
            // The catch still counts for this visit
        }
    }

    // The boat changed (or was rebuilt): find its rods and tub
    attach() {
        this.reset()
        const boat = this.game.boat
        this.gear = boat?.mesh.userData.fishing ?? null
        document.documentElement.classList.toggle('has-fishing', Boolean(this.gear))
        this.fillTub()
        this.emitTub()
    }

    reset() {
        this.state = 'idle'
        this.setEquipped(false)
        this.hand.visible = false
        this.bobber.visible = false
        this.line.visible = false
        for (const flight of this.flights) flight.mesh.removeFromParent()
        this.flights = []
        this.holderRod = null
    }

    // What the fish action does now
    use() {
        if (!this.gear) {
            this.toast('Este bote no tiene equipo de pesca: elige la Corvina 250 en el astillero')
            return
        }
        const { view } = this.game
        if (view.mode !== 'first') {
            // Fishing is done in first person: aim at a rod with the crosshair
            this.game.settings.set('camera', 'first')
            this.toast(isTouch() ? 'Apunta a una caña del porta cañas y toca «Tomar caña» arriba' : `Apunta a una caña del porta cañas y pulsa ${keyLabel(this.game.inputs.keysFor('fish')[0])}`)
            return
        }
        if (!this.equipped) {
            if (this.aimed?.rod.visible) this.equip(this.aimed)
            else this.toast('Apunta a una caña con la mira para tomarla')
            return
        }
        if (this.state !== 'idle') this.reel()
        // Aiming at the empty holder of this rod puts it back
        else if (this.aimed && this.aimed.rod === this.holderRod) this.stow()
        else this.cast()
    }

    // On touch screens the TURBO button turns into cast / reel while a rod is in hand
    setEquipped(equipped) {
        this.equipped = equipped
        document.documentElement.classList.toggle('has-rod', equipped)
    }

    // Takes the rod of a holder
    equip(slot) {
        if (this.equipped || !this.gear) return
        this.holderRod = slot.rod
        this.holderRod.visible = false
        this.setEquipped(true)
        this.hand.visible = true
        this.animate('equip')
    }

    // Puts the rod back (driving away, another camera…)
    stow() {
        if (!this.equipped) return
        this.retrieve()
        this.setEquipped(false)
        this.hand.visible = false
        if (this.holderRod) this.holderRod.visible = true
        this.holderRod = null
    }

    cast() {
        const { boat, view } = this.game
        if (Math.abs(boat.state.speed) > MAX_SPEED.cast) {
            this.toast('Detén el bote para lanzar')
            return
        }
        this.updateHand()
        view.camera.getWorldDirection(_forward)
        const velocity = boat.body.linvel()
        this.bobber.position.copy(_tip)
        this.bobberVelocity.copy(_forward).multiplyScalar(10).add(new THREE.Vector3(velocity.x, 3.2, velocity.z))
        this.bobber.visible = true
        this.line.visible = true
        this.state = 'flying'
        this.animate('cast')
        this.sound('cast')
    }

    // Reel in: a catch if a fish is biting, otherwise just the bobber back
    reel() {
        if (this.state === 'bite') this.catchFish()
        this.retrieve()
        this.animate('reel')
        this.sound('reel')
    }

    retrieve() {
        this.state = 'idle'
        this.bobber.visible = false
        this.line.visible = false
    }

    animate(kind) {
        this.swing = { kind, t: 0 }
    }

    update() {
        const delta = this.game.ticker.gameDelta
        this.updateHand(delta)
        // The crosshair raycast 15 times per second is plenty (it's not free on phones)
        this.aimClock = (this.aimClock ?? 0) + this.game.ticker.delta
        if (this.aimClock >= 1 / 15) {
            this.aimClock = 0
            this.updateAim()
        }
        if (delta === 0 || !this.gear) {
            this.updatePrompt()
            return
        }
        const { boat, inputs, ticker } = this.game
        const time = ticker.elapsed
        const speed = Math.abs(boat.state.speed)

        if (this.equipped) {
            // Driving off with the line in: the rod goes back to its holder
            if (this.state === 'idle' && this.game.playing && this.game.character.driving && inputs.throttle !== 0) this.stow()
            else if (this.state !== 'idle' && speed > MAX_SPEED.line) {
                this.retrieve()
                this.toast('Se soltó el sedal: detén el bote para pescar')
            }
        }

        if (this.state === 'flying') this.updateFlight(delta, time)
        else if (this.state !== 'idle') this.updateFloat(delta, time)
        if (this.line.visible) this.updateLine()
        this.updateCatches(delta)
        this.updateBubbles(delta, time)
        this.updatePrompt()
    }

    // What the crosshair points at: a rod (or the holder of the rod in hand) within reach
    updateAim() {
        let aimed = null
        if (this.gear && this.game.playing && this.game.view.mode === 'first') {
            _raycaster.setFromCamera(_center, this.game.view.camera)
            const slots = this.gear.slots.filter((slot) => (this.equipped ? slot.rod === this.holderRod : slot.rod.visible))
            const hit = _raycaster.intersectObjects(slots.map((slot) => slot.aim), false)[0]
            aimed = hit ? slots.find((slot) => slot.aim === hit.object) : null
        }
        if (aimed !== this.aimed) {
            this.aimed = aimed
            this.game.events.trigger('fishing:aim', Boolean(aimed))
        }
    }

    // The rod follows the camera; casting and reeling swing it
    updateHand(delta = 0) {
        const camera = this.game.view.camera
        this.hand.position.copy(camera.position)
        this.hand.quaternion.copy(camera.quaternion)
        const swing = this.swing
        swing.t += delta
        let lift = 0
        if (swing.kind === 'cast') {
            const u = swing.t / 0.55
            if (u < 0.35) lift = THREE.MathUtils.lerp(0, 0.9, u / 0.35)
            else if (u < 0.6) lift = THREE.MathUtils.lerp(0.9, -0.35, (u - 0.35) / 0.25)
            else if (u < 1) lift = THREE.MathUtils.lerp(-0.35, 0, (u - 0.6) / 0.4)
            else swing.kind = null
        } else if (swing.kind === 'reel') {
            const u = swing.t / 0.4
            if (u < 1) lift = Math.sin(u * Math.PI) * 0.6
            else swing.kind = null
        } else if (swing.kind === 'equip') {
            const u = swing.t / 0.3
            if (u < 1) lift = -(1 - u) * 1.2
            else swing.kind = null
        }
        // A fish tugging the line pulls the tip down
        if (this.state === 'bite') lift -= 0.12 + Math.sin(swing.t * 40) * 0.03
        else if (this.state === 'nibble') lift -= Math.sin(this.game.ticker.elapsed * 30) * 0.015
        this.pivot.rotation.set(HAND.pitch + lift, 0, HAND.roll)
        this.hand.updateMatrixWorld(true)
        this.rod.userData.tip.getWorldPosition(_tip)
    }

    updateFlight(delta, time) {
        const bobber = this.bobber.position
        this.bobberVelocity.y -= GRAVITY * delta
        bobber.addScaledVector(this.bobberVelocity, delta)
        const islands = this.game.world.islands
        const water = waveHeight(bobber.x, bobber.z, time)
        const shore = shoreDistanceAt(bobber.x, bobber.z, islands)
        // Fell on an island: no fish there
        if (shore < 0.3 && bobber.y < 1.3) {
            this.retrieve()
            this.toast('Lánzalo al agua, no a la isla')
            return
        }
        if (bobber.y > water) return
        bobber.y = water
        this.anchor.set(bobber.x, bobber.z)
        this.state = 'waiting'
        // Fish gather near the reefs: they bite sooner there
        this.timer = randomIn(WAIT) * (shore < 12 ? 0.7 : 1)
        this.game.spray?.splash(bobber.x, water, bobber.z, 6, 0.35)
        this.sound('plop')
    }

    // Bobbing on the waves, the fish coming, the bite
    updateFloat(delta, time) {
        const bobber = this.bobber.position
        const water = waveHeight(this.anchor.x, this.anchor.y, time)
        this.timer -= delta
        let dip = Math.sin(time * 2.4) * 0.025

        if (this.state === 'waiting' && this.timer <= 0) {
            // A fish noticed it: a trail of bubbles comes from some meters away
            this.state = 'nibble'
            this.approach = { angle: Math.random() * Math.PI * 2, distance: randomIn([2.5, 4.5]), duration: randomIn([1.2, 2.6]), t: 0 }
        }
        if (this.state === 'nibble') {
            const approach = this.approach
            approach.t += delta
            const left = Math.max(0, 1 - approach.t / approach.duration)
            dip += (Math.random() - 0.5) * 0.02
            this.bubbleClock -= delta
            if (this.bubbleClock <= 0) {
                this.bubbleClock = 0.05
                const x = this.anchor.x + Math.cos(approach.angle) * approach.distance * left
                const z = this.anchor.y + Math.sin(approach.angle) * approach.distance * left
                this.spawnBubble(x, waveHeight(x, z, time), z)
            }
            if (left === 0) {
                this.state = 'bite'
                this.timer = BITE_WINDOW
                this.game.spray?.splash(this.anchor.x, water, this.anchor.y, 10, 0.5)
                this.sound('bite')
            }
        } else if (this.state === 'bite') {
            // Pulled under
            dip = -0.28
            if (this.timer <= 0) {
                // Too late: it got away, wait for another one
                this.state = 'waiting'
                this.timer = randomIn([3, 10])
            }
        }
        bobber.set(this.anchor.x, water + 0.02 + dip, this.anchor.y)
        this.bobber.rotation.z = Math.sin(time * 1.7) * 0.15

        // The boat drifted too far
        if (_point.copy(bobber).distanceTo(_tip) > MAX_LINE) {
            this.retrieve()
            this.toast('Se rompió el sedal: estabas muy lejos')
        }
    }

    updateLine() {
        const positions = this.line.geometry.attributes.position
        const bobber = this.bobber.position
        const distance = _tip.distanceTo(bobber)
        // Taut when a fish pulls, slack while waiting
        const slack = this.state === 'bite' ? 0.03 : this.state === 'flying' ? 0.15 : Math.min(1.4, distance * 0.07)
        for (let i = 0; i < this.linePoints; i++) {
            const s = i / (this.linePoints - 1)
            _point.lerpVectors(_tip, bobber, s)
            _point.y -= slack * 4 * s * (1 - s)
            positions.setXYZ(i, _point.x, _point.y, _point.z)
        }
        positions.needsUpdate = true
    }

    spawnBubble(x, y, z) {
        const bubble = this.bubbles[this.bubbleCursor]
        this.bubbleCursor = (this.bubbleCursor + 1) % BUBBLES
        bubble.sprite.position.set(x, y + 0.05, z)
        bubble.sprite.visible = true
        bubble.age = 0
        bubble.life = 0.7
    }

    updateBubbles(delta, time) {
        for (const bubble of this.bubbles) {
            if (!bubble.sprite.visible) continue
            bubble.age += delta
            if (bubble.age >= bubble.life) {
                bubble.sprite.visible = false
                continue
            }
            const position = bubble.sprite.position
            position.y = waveHeight(position.x, position.z, time) + 0.05 + bubble.age * 0.15
            bubble.sprite.scale.setScalar(0.35 * (1 - bubble.age / bubble.life) + 0.05)
        }
    }

    // Picks what was caught: rarer things are rarer, the place matters
    pickSpecies(x, z) {
        const shore = shoreDistanceAt(x, z, this.game.world.islands)
        const weights = SPECIES.map((species) => {
            let weight = species.chance
            if (species.habitat === 'reef') weight *= shore < 14 ? 2 : 0.4
            if (species.habitat === 'open') weight *= shore > 25 ? 2.2 : 0.5
            return weight
        })
        let roll = Math.random() * weights.reduce((a, b) => a + b, 0)
        for (let i = 0; i < SPECIES.length; i++) {
            roll -= weights[i]
            if (roll <= 0) return SPECIES[i]
        }
        return SPECIES[0]
    }

    catchFish() {
        const species = this.pickSpecies(this.anchor.x, this.anchor.y)
        const size = species.junk ? 0 : Math.random()
        const length = species.junk ? 0.3 : THREE.MathUtils.lerp(species.length[0], species.length[1], size)
        const kg = species.junk ? 0 : Math.round(THREE.MathUtils.lerp(species.kg[0], species.kg[1], size * size) * 10) / 10
        const mesh = createCatchMesh(species, length)
        mesh.position.copy(this.bobber.position)
        this.game.rendering.scene.add(mesh)
        this.game.spray?.splash(this.bobber.position.x, this.bobber.position.y, this.bobber.position.z, 14, 0.7)
        this.flights.push({ mesh, from: this.bobber.position.clone(), t: 0, duration: 0.9, species, length, kg })
    }

    // Catches fly in an arc from the water into the tub
    updateCatches(delta) {
        const boat = this.game.boat
        for (const flight of [...this.flights]) {
            flight.t += delta
            const u = Math.min(1, flight.t / flight.duration)
            _target.copy(this.gear.tub.mouth)
            boat.mesh.localToWorld(_target)
            flight.mesh.position.lerpVectors(flight.from, _target, u)
            flight.mesh.position.y += 4 * 2.2 * u * (1 - u)
            flight.mesh.rotation.set(u * 9, u * 4, Math.sin(u * 20) * 0.5)
            if (u < 1) continue
            flight.mesh.removeFromParent()
            this.flights.splice(this.flights.indexOf(flight), 1)
            this.land(flight)
        }
    }

    land({ species, length, kg }) {
        if (species.junk) {
            this.toast(species.junk === 'bottle' ? `🍾 ${species.name}: “sigue navegando, hay más islas”` : `🥾 Sacaste una ${species.name.toLowerCase()}… la devuelves al mar`)
            this.sound('junk')
            return
        }
        const tub = this.tub
        tub.count++
        tub.log.push({ id: species.id, kg, length: Math.round(length * 100) / 100 })
        if (tub.log.length > TUB_VISIBLE) tub.log.shift()
        const record = !tub.best || kg > tub.best.kg
        if (record) tub.best = { id: species.id, kg }
        this.save()
        this.fillTub()
        this.emitTub()
        this.toast(`🎣 ¡${species.name} de ${kg.toLocaleString('es')} kg!${record && tub.count > 1 ? ' Nuevo récord' : ''}`)
        this.sound('catch')
    }

    // Lays the last catches inside the tub
    fillTub() {
        if (!this.gear) return
        const { contents, half } = this.gear.tub
        contents.traverse((child) => child.geometry?.dispose())
        contents.clear()
        this.tub.log.forEach((entry, index) => {
            const species = SPECIES.find((item) => item.id === entry.id)
            const length = Math.min(entry.length, half.x * 1.7)
            const mesh = createCatchMesh(species, length)
            const n = this.tub.count - this.tub.log.length + index
            mesh.position.set((hash(n) - 0.5) * half.x * 0.6, index * 0.02, (hash(n + 7) - 0.5) * half.z * 0.8)
            // Lying on its side, across the tub
            mesh.rotation.set(0, Math.PI / 2 + (hash(n + 3) - 0.5) * 0.8, Math.PI / 2)
            contents.add(mesh)
        })
    }

    emitTub() {
        const best = this.tub.best ? { name: SPECIES.find((species) => species.id === this.tub.best.id)?.name, kg: this.tub.best.kg } : null
        this.game.events.trigger('fishing:tub', this.gear ? { count: this.tub.count, best } : null)
    }

    toast(text) {
        this.game.events.trigger('fishing:toast', text)
    }

    sound(name) {
        this.game.events.trigger('sfx', name)
    }

    // "G Lanzar", "G ¡Recoger ya!"…
    updatePrompt() {
        let label = null
        if (this.gear && this.game.playing) {
            const stopped = Math.abs(this.game.boat.state.speed) < MAX_SPEED.cast
            const first = this.game.view.mode === 'first'
            if (this.state === 'bite') label = '¡Recoger ya!'
            else if (this.state !== 'idle') label = 'Recoger'
            else if (this.equipped) label = this.aimed ? 'Guardar caña' : 'Lanzar'
            else if (this.aimed) label = 'Tomar caña'
            else if (stopped && !first) label = 'Pescar (primera persona)'
            // Touch screens: only the rod the crosshair is on in first person, or
            // the line while it's out (TURBO is 🎣 with a rod in hand)
            if (isTouch() && this.state === 'idle' && !(first && this.aimed)) label = null
            // Desktop: the aimed rod gets its label next to it (F takes it, UI/AimLabel.js)
            if (first && !isTouch() && this.aimed && this.state === 'idle') label = null
        }
        const prompt = label ? [{ action: 'fish', label }] : null
        const key = label ?? ''
        if (key === this.promptKey) return
        this.promptKey = key
        this.game.events.trigger('fishing:prompt', prompt)
    }
}
