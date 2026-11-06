import { Game } from '../../Game.js'
import { TickOrder } from '../../Ticker.js'
import { random } from '../../utils/random.js'
import { Fish } from './Fish.js'
import { Turtles } from './Turtles.js'
import { Dolphins } from './Dolphins.js'
import { Reef } from './Reef.js'
import { Creatures } from './Creatures.js'
import { Serpent } from './Serpent.js'

// Validation rules for the `fauna` section of data/world.js
export const FAUNA_SCHEMA = {
    fishSchools: { type: 'number', default: 12, min: 0, max: 40, integer: true },
    turtles: { type: 'number', default: 5, min: 0, max: 20, integer: true },
    dolphins: { type: 'number', default: 3, min: 0, max: 8, integer: true },
    // Patch of open sea where the pod lives when it isn't following you
    dolphinHome: {
        type: 'object',
        default: { x: 70, z: 75 },
        schema: { x: { type: 'number', default: 70 }, z: { type: 'number', default: 75 } }
    },
    // Chance (0 to 1) that the pod comes to swim with you, and seconds they rest after a visit
    dolphinChance: { type: 'number', default: 0.35, min: 0, max: 1 },
    dolphinRest: { type: 'number', default: 180, min: 0, max: 3600 },
    reef: { type: 'boolean', default: true },
    // Whales, manta rays and sharks now and then (average seconds between sightings), jellyfish
    creatures: { type: 'boolean', default: true },
    creatureEvery: { type: 'number', default: 75, min: 10, max: 1800 },
    // Shadow of a giant sea serpent, sometimes, in the overview camera
    serpent: { type: 'boolean', default: true },
    fireflies: { type: 'boolean', default: true }
}

// All the sea life. Rebuilt with the world (it lives around the islands),
// animated with game time so everything freezes in pause.
export class Fauna {
    // Receives the world directly: its first build happens before game.world exists
    constructor(world) {
        this.game = Game.getInstance()
        this.world = world
        const scene = this.game.rendering.scene
        // Seeded: the reef looks the same on every visit
        const rand = random(2024)
        this.fish = new Fish({ scene, rand })
        this.turtles = new Turtles({ scene, rand })
        this.dolphins = new Dolphins({ scene, rand, splash: (...args) => this.game.spray?.splash(...args) })
        this.reef = new Reef({ scene, rand })
        const splash = (...args) => this.game.spray?.splash(...args)
        this.creatures = new Creatures({ scene, splash })
        this.serpent = new Serpent({ scene, sound: (name) => this.game.events.trigger('sfx', name) })

        this.game.events.on('world:build', () => this.setup())
        this.game.ticker.on(() => this.update(), TickOrder.WORLD + 2)
    }

    setup() {
        const { islands, faunaConfig: config } = this.world
        this.fish.setup(config.fishSchools, islands)
        this.turtles.setup(config.turtles, islands)
        this.dolphins.setup(config.dolphins, islands, config.dolphinHome, { chance: config.dolphinChance, rest: config.dolphinRest })
        this.reef.setup(config.reef, islands)
        this.creatures.setup(config.creatures, islands, config.creatureEvery)
        this.serpent.setup(config.serpent, islands)
    }

    update() {
        const { gameDelta, elapsed } = this.game.ticker
        if (gameDelta === 0 || !this.game.boat) return
        this.fish.update(gameDelta, elapsed, this.game.boat.mesh.position)
        this.turtles.update(gameDelta, elapsed)
        this.dolphins.update(gameDelta, elapsed, this.game.boat)
        this.creatures.update(gameDelta, elapsed, this.game.boat)
        this.serpent.update(gameDelta, this.game.view)
    }
}
