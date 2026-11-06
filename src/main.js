// Tiny entry: the start screen is plain HTML, so let the browser show it
// before anything heavy runs. The game (three, Rapier, the world…) is a
// separate chunk that downloads meanwhile and boots once the start screen
// is on screen. PageSpeed (no GPU) reported "no content rendered" (NO_FCP)
// when WebGL started before that first paint.
const afterFirstPaint = () => new Promise((resolve) => {
    if (performance.getEntriesByName('first-contentful-paint').length) return resolve()
    try {
        const observer = new PerformanceObserver((list) => {
            if (!list.getEntriesByName('first-contentful-paint').length) return
            observer.disconnect()
            resolve()
        })
        observer.observe({ type: 'paint' })
    } catch {
        // Browsers without paint timing just use the timeout below
    }
    // Safety net: hidden tabs or browsers that never report it
    setTimeout(resolve, 1000)
})

const [{ Game }] = await Promise.all([
    import('./Game/Game.js'),
    afterFirstPaint()
])

const canvas = document.querySelector('canvas.webgl')
const game = await Game.create(canvas)
// Handy for inspecting the game from the console while developing
if (import.meta.env.DEV) window.game = game

game.ui.startScreen.ready()
