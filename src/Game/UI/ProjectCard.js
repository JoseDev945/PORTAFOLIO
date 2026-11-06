import { Game } from '../Game.js'

// Card with the project of the zone the boat is in
export class ProjectCard {
    constructor() {
        this.game = Game.getInstance()
        this.element = document.getElementById('project-card')
        this.year = document.getElementById('project-year')
        this.title = document.getElementById('project-title')
        this.description = document.getElementById('project-description')
        this.tags = document.getElementById('project-tags')
        this.link = document.getElementById('project-link')
        this.image = document.getElementById('project-image')
        this.current = null
        // The screenshot opens the project too
        this.image.addEventListener('click', () => this.open())
        // ✕ hides the card until the boat leaves the zone
        document.getElementById('project-close').addEventListener('click', () => {
            this.element.classList.remove('visible')
            this.game.events.trigger('ui:click')
        })

        const projectOf = (zone) => (zone?.type === 'project' ? zone.project : null)
        this.game.events.on('zone:change', (active) => {
            if (this.game.state.started) this.show(projectOf(active))
        })
        // The boat may already be inside a zone when the player starts
        this.game.events.on('start', () => this.show(projectOf(this.game.world.zones.active)))
        this.game.events.on('interact', (zone) => zone?.type === 'project' && this.open())
    }

    show(project) {
        if (project === this.current) return
        this.current = project
        if (!project) {
            this.element.classList.remove('visible')
            return
        }
        this.year.textContent = project.year ?? ''
        this.image.hidden = !project.image
        if (project.image) {
            this.image.src = project.image
            this.image.alt = `Captura de ${project.title}`
        }
        this.title.textContent = project.title
        this.description.textContent = project.description
        this.tags.replaceChildren(...(project.tags ?? []).map((tag) => {
            const span = document.createElement('span')
            span.textContent = tag
            return span
        }))
        this.link.style.display = project.url ? '' : 'none'
        if (project.url) this.link.href = project.url
        this.element.style.borderColor = project.color ?? ''
        this.element.classList.add('visible')
    }

    open() {
        if (this.current?.url) window.open(this.current.url, '_blank', 'noopener')
    }
}
