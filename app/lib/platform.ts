// The only place that knows which shell the web UI runs in.
// Desktop: Electron exposes `atomicAtlasShell` from desktop/preload.ts.
// Android: Capacitor exposes `Capacitor`. A plain browser has neither.

import type { Theme } from '../state/settings';

interface DesktopShell {
  kind: 'desktop';
  info(): Promise<unknown>;
  openExternal(url: string): Promise<void>;
  setTheme(theme: 'dark' | 'light' | 'system'): Promise<void>;
  quit(): Promise<void>;
}

declare global {
  interface Window {
    atomicAtlasShell?: DesktopShell;
    Capacitor?: {
      getPlatform?: () => string;
      isNativePlatform?: () => boolean;
      /** Calls a method of a native plugin; part of Capacitor's bridge. */
      nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
    };
  }
  const __APP_VERSION__: string;
}

export type Platform = 'desktop' | 'android' | 'web';

export function platform(): Platform {
  if (typeof window === 'undefined') return 'web';
  if (window.atomicAtlasShell?.kind === 'desktop') return 'desktop';
  if (window.Capacitor?.isNativePlatform?.()) return 'android';
  return 'web';
}

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** Opens a link to a source or reference in the system browser. */
export function openExternal(url: string): void {
  if (!/^https?:\/\//i.test(url)) return;
  const shell = window.atomicAtlasShell;
  if (shell) void shell.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

/** Lets native window parts follow the UI theme where the shell supports it. */
export function syncNativeTheme(theme: Theme): void {
  void window.atomicAtlasShell?.setTheme(theme);
  if (platform() === 'android') {
    // The clock and icons of the phone's own bars: light on the dark theme, dark on the light one.
    const style = theme === 'dark' ? 'DARK' : 'LIGHT';
    void window.Capacitor?.nativePromise?.('SystemBars', 'setStyle', { style })?.catch(() => undefined);
  }
}
