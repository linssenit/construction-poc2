export const PIXELS_PER_METER = 40

export const POLE_SIZE_METERS = 0.17
export const POLE_HEIGHT_METERS = 2.4

export const SOKKEL_SIZE_METERS = 0.17
export const SOKKEL_HEIGHT_METERS = 0.15

// Edge beam ("Randbalk") — square section resting on top of the poles.
export const EDGE_BEAM_WIDTH_METERS = 0.17
export const EDGE_BEAM_HEIGHT_METERS = 0.17

// Top of a pole = sokkel height + pole height; the edge beam sits on this plane.
export const POLE_TOP_METERS = SOKKEL_HEIGHT_METERS + POLE_HEIGHT_METERS

export const WALL_HEIGHT_METERS = 2.7

// 3D render surface colours (RGB, 0..1).
export const SOKKEL_COLOR = [0.678, 0.847, 0.902] as const // light blue
export const POLE_COLOR = [0.824, 0.706, 0.549] as const // light brown
export const EDGE_BEAM_COLOR = POLE_COLOR // light brown

export const POLE_SIZE_PIXELS = POLE_SIZE_METERS * PIXELS_PER_METER
