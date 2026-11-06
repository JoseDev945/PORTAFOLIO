import { uniform } from 'three/tsl'

// Values read by many shaders, updated once per frame (World / DayCycle).
// Changing one here changes every material that uses it, with no rebuild.
export const shared = {
    // Game time in seconds (freezes in pause)
    time: uniform(0),
    // Strength of everything that glows: lamps, buoy lights… higher at night
    glow: uniform(1),
    // 0 by day, 1 at night: bioluminescent plants, corals and fireflies
    night: uniform(0),
    // Wind for vegetation, 0 = calm
    wind: uniform(1)
}
