/**
 * Reusable LoaderComponent overlay for long-running operations.
 *
 * The pattern (ui.custom + LoaderComponent + done callback + escape-to-abort)
 * was duplicated in spec-decompose.ts and start.ts. This extracts the
 * common lifecycle so both commands share one implementation.
 */

import { LoaderComponent } from "../components/loader.ts";

export interface LoaderOverlay {
	/** Close/dismiss the overlay. Safe to call multiple times. */
	close: () => void;
	/** The promise returned by ui.custom — resolves when the overlay is dismissed externally. */
	promise: Promise<void>;
}

/**
 * Show an animated loader overlay anchored at bottom-center.
 *
 * @param ui         Command UI instance (cmdCtx.ui)
 * @param getMsg     Getter for the current loader message (re-evaluated on each render)
 * @param onAbort    Optional callback when user presses escape/q
 * @param onHandle   Optional callback with the handle after registration (for wiring closeLoader, etc.)
 */
export function showLoaderOverlay(
	ui: any,
	getMsg: () => string,
	onAbort?: () => void,
	onHandle?: (handle: any) => void,
): LoaderOverlay {
	let done: (() => void) | null = null;

	const promise = ui.custom(
		(tui: any, theme: any, _kb: any, doneFn: (value?: any) => void) => {
			done = () => {
				try {
					doneFn(undefined);
				} catch {
					/* already closed */
				}
			};
			const comp = new LoaderComponent(
				tui,
				theme.fg.bind(theme),
				theme.bg.bind(theme),
				getMsg,
			);

			return {
				render: (w: number) => comp.render(w),
				invalidate: () => {},
				handleInput: (data: string) => {
					if (data === "escape" || data === "q") {
						onAbort?.();
					}
				},
				dispose: () => {
					comp.dispose();
				},
			};
		},
		{
			overlay: true,
			overlayOptions: {
				anchor: "bottom-center",
				margin: 1,
			},
			onHandle: onHandle
				? (handle: any) => onHandle(handle)
				: undefined,
		},
	);

	return {
		close: () => {
			if (done) {
				done();
				done = null;
			}
			promise.catch(() => {});
		},
		promise,
	};
}
