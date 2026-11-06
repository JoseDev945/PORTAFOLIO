import { StartScreen } from './StartScreen.js'
import { ProjectCard } from './ProjectCard.js'
import { BoatCard } from './BoatCard.js'
import { PauseMenu } from './PauseMenu.js'
import { WorldMap } from './WorldMap.js'
import { CameraToast } from './CameraToast.js'
import { ControlsPanel } from './ControlsPanel.js'
import { KeyHints } from './KeyHints.js'
import { CharacterPrompt } from './CharacterPrompt.js'
import { FishingHud } from './FishingHud.js'
import { Crosshair } from './Crosshair.js'
import { FullscreenButton } from './FullscreenButton.js'
import { AimLabel } from './AimLabel.js'

// HTML interface on top of the canvas. Each piece is its own component that
// listens to game events; add new panels here.
export class UI {
    constructor() {
        this.startScreen = new StartScreen()
        this.projectCard = new ProjectCard()
        this.boatCard = new BoatCard()
        this.pauseMenu = new PauseMenu()
        this.map = new WorldMap()
        this.cameraToast = new CameraToast()
        this.controls = new ControlsPanel()
        this.keyHints = new KeyHints()
        this.characterPrompt = new CharacterPrompt()
        this.fishingHud = new FishingHud()
        this.crosshair = new Crosshair()
        this.fullscreen = new FullscreenButton()
        this.aimLabel = new AimLabel()
    }
}
