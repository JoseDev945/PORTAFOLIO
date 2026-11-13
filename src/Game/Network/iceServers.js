// Servers that help two browsers find each other (WebRTC ICE).
//
// STUN is enough on most home WiFi. A phone on mobile data (or strict NATs)
// also needs a TURN relay. PeerJS's default TURN servers no longer exist, so
// the game uses your own, from environment variables (.env.local and the
// Vercel project's settings). Either:
//   VITE_METERED_APP=myapp  VITE_METERED_KEY=...      free account at metered.ca
// or fixed credentials (any TURN provider, e.g. ExpressTURN):
//   VITE_TURN_URLS=turn:host:3478,turns:host:443  VITE_TURN_USERNAME=...  VITE_TURN_CREDENTIAL=...
const STUN = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' }
]

let cached = null

export async function iceServers() {
    if (cached) return cached
    const env = import.meta.env
    const servers = [...STUN]
    if (env.VITE_TURN_URLS && env.VITE_TURN_USERNAME) {
        servers.push({
            urls: env.VITE_TURN_URLS.split(',').map((url) => url.trim()).filter(Boolean),
            username: env.VITE_TURN_USERNAME,
            credential: env.VITE_TURN_CREDENTIAL ?? ''
        })
    }
    if (env.VITE_METERED_APP && env.VITE_METERED_KEY) {
        try {
            const url = `https://${env.VITE_METERED_APP}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(env.VITE_METERED_KEY)}`
            const response = await fetch(url)
            if (response.ok) {
                const list = await response.json()
                if (Array.isArray(list)) servers.push(...list.filter((server) => server?.urls))
            }
        } catch {
            // No relay this time: STUN still works on most networks
        }
    }
    cached = servers
    return servers
}

// True when a TURN relay is configured (phones on mobile data need one)
export const hasRelay = () => Boolean((import.meta.env.VITE_TURN_URLS && import.meta.env.VITE_TURN_USERNAME) || (import.meta.env.VITE_METERED_APP && import.meta.env.VITE_METERED_KEY))
