import { Game } from './Game.js'
import { world } from '../data/world.js'
import { projects } from '../data/projects.js'
import { boats } from '../data/boats.js'

// Raw content from src/data/. During development, saving one of those files
// swaps it here and triggers 'content:change' (the world rebuilds without
// reloading the page). Wrong values only produce warnings (see Diagnostics),
// but a syntax error (missing comma, bracket...) can't be read at all: Vite
// shows its error screen with the file and line, and the game comes back by
// itself as soon as the file is fixed and saved.
export class Content {
    constructor() {
        this.game = Game.getInstance()
        this.world = world
        this.projects = projects
        this.boats = boats

        if (import.meta.hot) {
            import.meta.hot.accept(['../data/world.js', '../data/projects.js', '../data/boats.js'], ([worldModule, projectsModule, boatsModule]) => {
                if (worldModule) this.world = worldModule.world
                if (projectsModule) this.projects = projectsModule.projects
                if (boatsModule) this.boats = boatsModule.boats
                this.game.events.trigger('content:change')
            })
        }
    }

    // Used by the editor to try changes before copying them to the file
    setWorld(data) {
        this.world = data
        this.game.events.trigger('content:change')
    }
}
