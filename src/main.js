import { Game } from './Game/Game.js'

const canvas = document.querySelector('canvas.webgl')
const game = await Game.create(canvas)
// Handy for inspecting the game from the console while developing
if (import.meta.env.DEV) window.game = game

game.ui.startScreen.ready()
