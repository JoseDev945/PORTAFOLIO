// Collects problems found while building content (bad values, unknown
// objects, a prop that crashed...). They go to the console and, during
// development only, to a small panel on screen so they're hard to miss.
// Visitors of the published site never see the panel.
export class Diagnostics {
    constructor() {
        this.messages = []
        if (import.meta.env.DEV) this.createPanel()
    }

    createPanel() {
        this.panel = document.createElement('details')
        this.panel.className = 'diagnostics'
        this.summary = document.createElement('summary')
        this.list = document.createElement('ul')
        this.panel.append(this.summary, this.list)
        document.body.appendChild(this.panel)
        this.render()
    }

    warn(message) {
        console.warn(`[contenido] ${message}`)
        this.messages.push({ level: 'warn', message })
        this.render()
    }

    error(message, error) {
        console.error(`[contenido] ${message}`, error ?? '')
        this.messages.push({ level: 'error', message: error?.message ? `${message}: ${error.message}` : message })
        this.render()
    }

    clear() {
        this.messages = []
        this.render()
    }

    render() {
        if (!this.panel) return
        this.panel.hidden = this.messages.length === 0
        const errors = this.messages.filter((entry) => entry.level === 'error').length
        this.summary.textContent = `⚠ ${this.messages.length} aviso${this.messages.length === 1 ? '' : 's'} en los datos${errors ? ` (${errors} error${errors === 1 ? '' : 'es'})` : ''}`
        this.list.replaceChildren(...this.messages.map(({ level, message }) => {
            const item = document.createElement('li')
            item.className = level
            item.textContent = message
            return item
        }))
    }
}
