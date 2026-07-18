/**
 * Animation primitives — pure functions, zero allocations beyond return values.
 *
 * All animations are character substitutions driven by integer frame counters.
 * No DOM, no canvas, no GPU. Cheap enough to call on every render().
 *
 * ─═══[ USAGE ]═══─
 *
 *   Render function gets a frame counter (from setInterval ticking).
 *   Call scannerBar(), pulseRail(), cornerGlow() with that frame.
 *   Each frame produces a different visual — that's the animation.
 */

/** Ping-pong between 0 and max-1 — bounces off both edges like a scanner */
export function pingPong(t: number, max: number): number {
	if (max <= 1) return 0;
	const range = max * 2 - 2;
	const x = t % range;
	return x < max ? x : range - x;
}

/** Dither chars from empty to full brightness */
export const DITHER = [" ", "░", "▒", "▓", "█"] as const;

/**
 * Scanning bar — bright head on dim track, bouncing LTR.
 *
 *   ▓▓▓▓▓▓▓█▓▓▓▓▓▓    head past center going right
 *   ▓▓▓▓▓▓▓▓▓▓▓▓▓█    head near end
 *   ▓▓▓▓▓▓▓█▓▓▓▓▓▓    head bouncing back left
 *
 * @param width  total width of the bar
 * @param frame  frame counter (increments each tick)
 * @param head   character for the bright head (default █)
 * @param track  character for the dim track (default ▓)
 */
export function scannerBar(width: number, frame: number, head = "█", track = "▓"): string {
	if (width <= 0) return "";
	const pos = pingPong(frame, width);
	return track.repeat(pos) + head + track.repeat(Math.max(0, width - pos - 1));
}

/**
 * Corner glow — four chars that pulse through ░▒▓█ in a staggered cycle.
 * Returns [topLeft, topRight, bottomLeft, bottomRight].
 */
export function cornerGlow(frame: number): [string, string, string, string] {
	return [
		DITHER[(frame + 0) % DITHER.length],
		DITHER[(frame + 2) % DITHER.length],
		DITHER[(frame + 4) % DITHER.length],
		DITHER[(frame + 6) % DITHER.length],
	];
}

/**
 * Animated rail with pulsing nodes at regular intervals.
 *
 *   ═[▓]═══[▓]═══[▓]═══[▓]═    nodes pulse through ░▒▓█
 *
 * @param width     total width
 * @param frame     frame counter
 * @param railChar  base rail character (default ═)
 * @param spacing   distance between nodes (default 6; 0 = no nodes)
 */
export function pulseRail(width: number, frame: number, railChar = "═", spacing = 6): string {
	if (width <= 0) return "";
	let result = "";
	for (let i = 0; i < width; i++) {
		if (spacing > 0 && i % spacing === 0) {
			const phase = Math.floor((i / spacing + frame / 3) % DITHER.length);
			result += DITHER[phase];
		} else {
			result += railChar;
		}
	}
	return result;
}

/**
 * CRT noise line — deterministic per frame (seeded hash, no randomness).
 * Each position has `density` chance of a lit char.
 */
export function noiseLine(width: number, frame: number, density = 0.03, char = "▓", seed = 0): string {
	if (width <= 0) return "";
	let result = "";
	for (let i = 0; i < width; i++) {
		const h = ((i * 7 + frame * 13 + seed * 31) & 0x7F);
		result += h < density * 100 ? char : " ";
	}
	return result;
}

/**
 * Create a managed animation timer bound to a TUI instance.
 * Clean pattern for overlay animations.
 *
 * Usage:
 *   const anim = createAnimator(tui, 80);
 *   // use anim.frame in render
 *   dispose: () => anim.dispose()
 */
export function createAnimator(
	tui: { requestRender: () => void },
	rate = 100,
): { readonly frame: number; dispose: () => void } {
	let frame = 0;
	const timer = setInterval(() => {
		frame++;
		tui.requestRender();
	}, rate);
	return {
		get frame() { return frame; },
		dispose: () => clearInterval(timer),
	};
}
