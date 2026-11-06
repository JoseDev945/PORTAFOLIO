// Tiny publish/subscribe bus. Systems talk through events instead of calling
// each other directly, so adding a feature rarely means editing another one.
// Callbacks can have an order: lower runs first (used by the 'tick' loop).
export class Events {
    constructor() {
        this.callbacks = new Map()
    }

    on(name, callback, order = 1) {
        if (!this.callbacks.has(name)) this.callbacks.set(name, [])
        const list = this.callbacks.get(name)
        list.push({ callback, order })
        list.sort((a, b) => a.order - b.order)
        return () => this.off(name, callback)
    }

    off(name, callback) {
        const list = this.callbacks.get(name)
        if (!list) return
        const index = list.findIndex((entry) => entry.callback === callback)
        if (index !== -1) list.splice(index, 1)
    }

    trigger(name, ...args) {
        // Copy so a callback can unsubscribe itself while the event runs
        for (const { callback } of [...(this.callbacks.get(name) ?? [])]) callback(...args)
    }
}
