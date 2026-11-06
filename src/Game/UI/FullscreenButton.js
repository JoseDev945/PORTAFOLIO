// Fullscreen toggle next to the ⚙ button, on desktop and mobile. Hidden where
// the browser can't do it (iPhone Safari only allows fullscreen videos).
export class FullscreenButton {
    constructor() {
        this.button = document.getElementById('fullscreen-button')
        const root = document.documentElement
        this.request = root.requestFullscreen ?? root.webkitRequestFullscreen
        if (!this.request || !(document.fullscreenEnabled ?? document.webkitFullscreenEnabled)) return
        this.button.hidden = false
        this.button.addEventListener('click', () => this.toggle())
        const update = () => {
            const active = Boolean(this.element)
            root.classList.toggle('fullscreen', active)
            this.button.setAttribute('aria-label', active ? 'Salir de pantalla completa' : 'Pantalla completa')
        }
        document.addEventListener('fullscreenchange', update)
        document.addEventListener('webkitfullscreenchange', update)
    }

    get element() {
        return document.fullscreenElement ?? document.webkitFullscreenElement
    }

    toggle() {
        try {
            if (this.element) (document.exitFullscreen ?? document.webkitExitFullscreen).call(document)?.catch?.(() => {})
            else this.request.call(document.documentElement, { navigationUI: 'hide' })?.catch?.(() => {})
        } catch {
            // Refused by the browser: nothing to do
        }
    }
}
