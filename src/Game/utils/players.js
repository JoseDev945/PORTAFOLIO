// Multiplayer rooms: up to MAX_PLAYERS, each one in a slot (0 = who created
// the room). The slot picks the player's color and their berth at the marina.
export const MAX_PLAYERS = 5

export const PLAYER_COLORS = ['#ffb347', '#4fc3f7', '#ef5d8e', '#8bd450', '#b39ddb']

export const playerColor = (slot) => PLAYER_COLORS[((slot % MAX_PLAYERS) + MAX_PLAYERS) % MAX_PLAYERS]
