import * as THREE from 'three/webgpu'
import { Game } from '../Game.js'
import { TickOrder } from '../Ticker.js'
import { EMOTES } from './emoteList.js'

const SIZE = 3.6
const LIFE = 3.2
const _anchor = new THREE.Vector3()

// Big emoji floating over a player's boat (or head, on land) for a few
// seconds. One sprite per player, reused: its canvas is redrawn with the new
// emoji, so showing an emote never creates a material (no shader compile).
export class Emotes {
    constructor() {
        this.game = Game.getInstance()
        // slot → { sprite, canvas, texture, age, me }
        this.bubbles = new Map()
        this.game.events.on('emote', ({ slot, index, me }) => this.show(slot, index, Boolean(me)))
        this.game.ticker.on(() => this.update(), TickOrder.UI - 1)
    }

    bubble(slot) {
        if (this.bubbles.has(slot)) return this.bubbles.get(slot)
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 256
        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        // Always on top: an emote is meant to be seen
        const material = new THREE.SpriteNodeMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, fog: false })
        const sprite = new THREE.Sprite(material)
        sprite.renderOrder = 20
        sprite.visible = false
        this.game.rendering.scene.add(sprite)
        const bubble = { sprite, canvas, texture, age: LIFE, me: false }
        this.bubbles.set(slot, bubble)
        return bubble
    }

    show(slot, index, me) {
        const emote = EMOTES[index]
        if (!emote) return
        const bubble = this.bubble(slot)
        const context = bubble.canvas.getContext('2d')
        context.clearRect(0, 0, 256, 256)
        // Soft white disc behind, so it reads over water and sky
        context.fillStyle = 'rgba(255, 255, 255, 0.85)'
        context.beginPath()
        context.arc(128, 128, 116, 0, Math.PI * 2)
        context.fill()
        context.font = '170px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(emote.emoji, 128, 138)
        bubble.texture.needsUpdate = true
        bubble.age = 0
        bubble.me = me
        bubble.sprite.visible = true
        if (me) this.game.events.trigger('ui:click')
    }

    // Over whoever sent it; null when that player isn't around anymore
    anchor(slot, bubble) {
        if (bubble.me) return this.game.character.emoteAnchor(_anchor)
        return this.game.remotePlayers.emoteAnchor(slot, _anchor)
    }

    update() {
        const delta = this.game.ticker.delta
        const time = this.game.ticker.elapsed
        for (const [slot, bubble] of this.bubbles) {
            if (!bubble.sprite.visible) continue
            bubble.age += delta
            const anchor = this.anchor(slot, bubble)
            if (bubble.age >= LIFE || !anchor) {
                bubble.sprite.visible = false
                continue
            }
            // Pop in with a little overshoot, bob, shrink away at the end
            const age = bubble.age
            const pop = age < 0.35 ? Math.sin((age / 0.35) * Math.PI * 0.75) / Math.sin(Math.PI * 0.75) : 1
            const fade = Math.min(1, (LIFE - age) / 0.4)
            const scale = SIZE * Math.max(0.01, Math.min(pop, 1.25)) * (0.6 + 0.4 * fade)
            bubble.sprite.scale.set(scale, scale, 1)
            bubble.sprite.material.opacity = fade
            bubble.sprite.position.copy(anchor)
            bubble.sprite.position.y += age * 0.25 + Math.sin(time * 3) * 0.12
        }
    }
}
