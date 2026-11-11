// State of the frame itself: which parts are open.

import { signal } from '@preact/signals';

/** The scenario and results panel. */
export const panelOpen = signal(true);

/** Width in pixels from which the panel sits beside the map instead of over its lower half. */
export const WIDE_LAYOUT = 900;
