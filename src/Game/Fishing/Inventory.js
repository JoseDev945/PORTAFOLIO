import { Game } from '../Game.js'
import { SPECIES, RODS, SKINS, speciesById, rodById, skinById, hatById, fishValue, sizeFromLength } from './catalog.js'

const STORAGE_KEY = 'portafolio-inventario'
// Before the inventory, the tub saved its last catches here
const OLD_TUB_KEY = 'portafolio-pesca'
// Minecraft stack size: a slot holds up to this many of one species
export const STACK = 64

// Your catch, your coins and your rods, remembered in this browser.
//   fish   [{ id, kg, length, size }] every catch not sold yet
//   coins  earned at the fish market, spent at the rod shop
//   rods   ids you own, rod = the one you fish with
// Triggers 'inventory:change' whenever something changes.
export class Inventory {
    constructor() {
        this.game = Game.getInstance()
        this.coins = 0
        this.fish = []
        this.rods = [RODS[0].id]
        this.rod = RODS[0].id
        // Clothes (data/cosmetics.js): owned and worn (hat null = none)
        this.skins = [SKINS[0].id]
        this.skin = SKINS[0].id
        this.hats = []
        this.hat = null
        this.stats = { caught: 0, best: null }
        this.load()
    }

    load() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
            if (saved && typeof saved === 'object') {
                if (Number.isFinite(saved.coins)) this.coins = Math.max(0, Math.round(saved.coins))
                if (Array.isArray(saved.fish)) this.fish = saved.fish.filter((entry) => this.validFish(entry))
                if (Array.isArray(saved.rods)) this.rods = [...new Set([RODS[0].id, ...saved.rods.filter((id) => rodById(id))])]
                if (this.rods.includes(saved.rod)) this.rod = saved.rod
                if (Array.isArray(saved.skins)) this.skins = [...new Set([SKINS[0].id, ...saved.skins.filter((id) => skinById(id))])]
                if (this.skins.includes(saved.skin)) this.skin = saved.skin
                if (Array.isArray(saved.hats)) this.hats = [...new Set(saved.hats.filter((id) => hatById(id)))]
                if (this.hats.includes(saved.hat)) this.hat = saved.hat
                if (Number.isFinite(saved.stats?.caught)) this.stats.caught = saved.stats.caught
                if (speciesById(saved.stats?.best?.id) && Number.isFinite(saved.stats.best.kg)) this.stats.best = saved.stats.best
                return
            }
            // First time with the inventory: what was in the old tub comes along
            const old = JSON.parse(localStorage.getItem(OLD_TUB_KEY))
            if (old && Array.isArray(old.log)) {
                this.fish = old.log
                    .map((entry) => ({ ...entry, size: sizeFromLength(speciesById(entry?.id), entry?.length) }))
                    .filter((entry) => this.validFish(entry))
                if (Number.isFinite(old.count)) this.stats.caught = old.count
                if (speciesById(old.best?.id) && Number.isFinite(old.best.kg)) this.stats.best = old.best
                this.save()
            }
        } catch {
            // Nothing saved or storage blocked: start fresh
        }
    }

    validFish(entry) {
        const species = speciesById(entry?.id)
        return Boolean(species && !species.junk && Number.isFinite(entry.kg) && Number.isFinite(entry.length) && Number.isFinite(entry.size))
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ coins: this.coins, fish: this.fish, rods: this.rods, rod: this.rod, skins: this.skins, skin: this.skin, hats: this.hats, hat: this.hat, stats: this.stats }))
        } catch {
            // It still counts for this visit
        }
    }

    changed() {
        this.save()
        this.game.events.trigger('inventory:change', this)
    }

    // The rod you fish with (its luck, speed and window change the fishing)
    get rodData() {
        return rodById(this.rod) ?? RODS[0]
    }

    // A catch goes in. Returns true if it's a new record
    add(species, { kg, length, size }) {
        this.fish.push({ id: species.id, kg, length: Math.round(length * 100) / 100, size: Math.round(size * 1000) / 1000 })
        this.stats.caught++
        const record = !this.stats.best || kg > this.stats.best.kg
        if (record) this.stats.best = { id: species.id, kg }
        this.changed()
        return record
    }

    value(entry) {
        return fishValue(speciesById(entry.id), entry.size)
    }

    get totalValue() {
        return this.fish.reduce((sum, entry) => sum + this.value(entry), 0)
    }

    // Grouped like Minecraft: one stack per species (split every STACK),
    // in the order of data/fish.js. [{ species, count, kg, value }]
    stacks() {
        const stacks = []
        for (const species of SPECIES) {
            const entries = this.fish.filter((entry) => entry.id === species.id)
            for (let start = 0; start < entries.length; start += STACK) {
                const part = entries.slice(start, start + STACK)
                stacks.push({
                    species,
                    count: part.length,
                    kg: part.reduce((sum, entry) => sum + entry.kg, 0),
                    value: part.reduce((sum, entry) => sum + this.value(entry), 0),
                    biggest: Math.max(...part.map((entry) => entry.kg))
                })
            }
        }
        return stacks
    }

    // Sells every fish of a species (or all of them): { count, coins }
    sell(id = null) {
        const sold = this.fish.filter((entry) => id === null || entry.id === id)
        if (!sold.length) return { count: 0, coins: 0 }
        const coins = sold.reduce((sum, entry) => sum + this.value(entry), 0)
        this.fish = this.fish.filter((entry) => !(id === null || entry.id === id))
        this.coins += coins
        this.changed()
        return { count: sold.length, coins }
    }

    // Buys a rod (and equips it). 'bought' | 'equipped' | 'poor' | null
    buy(id) {
        const rod = rodById(id)
        if (!rod) return null
        if (this.rods.includes(id)) {
            this.equip(id)
            return 'equipped'
        }
        if (this.coins < rod.price) return 'poor'
        this.coins -= rod.price
        this.rods.push(id)
        this.rod = id
        this.changed()
        return 'bought'
    }

    // Clothes: kind 'skin' | 'hat'. 'bought' | 'worn' | 'poor' | null
    buyClothes(kind, id) {
        const item = kind === 'skin' ? skinById(id) : hatById(id)
        if (!item) return null
        const owned = kind === 'skin' ? this.skins : this.hats
        if (!owned.includes(id)) {
            if (this.coins < item.price) return 'poor'
            this.coins -= item.price
            owned.push(id)
            this[kind] = id
            this.changed()
            return 'bought'
        }
        this.wear(kind, id)
        return 'worn'
    }

    // Puts it on; the one already worn comes off (a hat → none, a skin → the default)
    wear(kind, id) {
        if (kind === 'skin') {
            if (!this.skins.includes(id)) return
            this.skin = this.skin === id ? SKINS[0].id : id
        } else {
            if (id !== null && !this.hats.includes(id)) return
            this.hat = this.hat === id ? null : id
        }
        this.changed()
    }

    equip(id) {
        if (!this.rods.includes(id) || this.rod === id) return
        this.rod = id
        this.changed()
    }
}
