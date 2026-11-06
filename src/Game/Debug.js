// Live tweaking panel, only with #debug in the URL. Tweakpane is loaded on
// demand so regular visitors never download it. Any system can add its own
// controls without touching this file:
//
//   this.game.debug.add((pane) => {
//       const folder = pane.addFolder({ title: 'Water' })
//       folder.addBinding(params, 'amplitude', { min: 0, max: 3 })
//   })
export class Debug {
    constructor() {
        this.active = window.location.hash === '#debug'
        this.ready = this.active
            ? import('tweakpane').then(({ Pane }) => new Pane({ title: 'Debug' }))
            : null
    }

    add(setup) {
        this.ready?.then(setup)
    }
}
