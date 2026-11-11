// State of the frame itself: which parts are open.

import { signal } from '@preact/signals';

/** The scenario and results panel. */
export const panelOpen = signal(true);

/** Width in pixels from which the panel sits beside the map instead of over its lower half. */
export const WIDE_LAYOUT = 900;

/** Which simulator is on screen. */
export type Mode = 'detonation' | 'missiles' | 'accident';
export const mode = signal<Mode>('detonation');

/** Ground range of the point shown in the close view, metres; null while it is closed. */
export const closeupRange = signal<number | null>(null);
