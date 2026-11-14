// The only place that knows which shell the web UI runs in.
// Desktop: Electron exposes `atomicAtlasShell` from desktop/preload.ts.
// Android: Capacitor exposes `Capacitor`. A plain browser has neither.

import type { Theme } from '../state/settings';

export interface VoiceStatus {
  supported: boolean;
  installed: boolean;
  /** The male English voices that are there: downloaded (desktop) or found on the phone (Android, only 'male'). */
  maleVoices: ('male' | 'male2')[];
  installing: boolean;
  error: string | null;
}

export interface AssistantStatus {
  supported: boolean;
  installed: boolean;
  size: 'small' | 'large' | null;
  installing: boolean;
  running: boolean;
  device: 'gpu' | 'cpu' | null;
  needsRuntime: boolean;
  error: string | null;
}

export interface PopulationTileResult {
  ok: boolean;
  /** The tile does not exist: open sea. */
  missing?: boolean;
  error?: string;
}

export interface PopulationShell {
  fetchTile(name: string): Promise<PopulationTileResult>;
  readTile(name: string): Promise<Uint8Array | null>;
  removeTile(name: string): Promise<void>;
  onProgress(listener: (share: number) => void): () => void;
}

interface DesktopShell {
  kind: 'desktop';
  info(): Promise<unknown>;
  openExternal(url: string): Promise<void>;
  setTheme(theme: 'dark' | 'light' | 'system'): Promise<void>;
  quit(): Promise<void>;
  /** Present from version 0.7: the local assistant (llama.cpp). */
  assistant?: {
    status(): Promise<AssistantStatus>;
    install(size: 'small' | 'large'): Promise<AssistantStatus>;
    remove(): Promise<AssistantStatus>;
    start(): Promise<AssistantStatus>;
    chat(body: unknown): Promise<unknown>;
    /** Pieces of the answer as they are written (desktop only). */
    onDelta?(listener: (text: string) => void): () => void;
    onProgress(listener: (share: number) => void): () => void;
  };
  /** Present from version 1.1: tiles of the 100 m population grid, fetched for the page (the server allows no CORS). */
  population?: PopulationShell;
  /** Present from version 0.7: the offline voice (Piper). */
  voice?: {
    status(): Promise<VoiceStatus>;
    /** 'base': the engine with the Greek and English voices; 'male', 'male2': a male English voice (from 1.7). */
    install(part?: 'base' | 'male' | 'male2'): Promise<VoiceStatus>;
    remove(): Promise<VoiceStatus>;
    speak(text: string, language: 'el' | 'en', rate: number, male?: 'male' | 'male2' | null): Promise<Uint8Array | null>;
    stop(): Promise<void>;
    onProgress(listener: (share: number) => void): () => void;
  };
}

declare global {
  interface Window {
    atomicAtlasShell?: DesktopShell;
    Capacitor?: {
      getPlatform?: () => string;
      isNativePlatform?: () => boolean;
      /** Calls a method of a native plugin; part of Capacitor's bridge. */
      nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
      /** A web address the WebView can load for a file of the app's own storage. */
      convertFileSrc?: (path: string) => string;
      /** Registered native plugins, for listeners. */
      Plugins?: Record<string, { addListener?: (event: string, listener: () => void) => Promise<{ remove: () => void }> | { remove: () => void } }>;
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

/**
 * True on a phone or small tablet: Android, or a browser with a touch screen whose shorter
 * side is under 820 px. Such a device gets the lighter limits the Android app has (fewer
 * buildings, a coarser cloud): a phone's browser runs out of memory like its WebView does.
 */
export function smallDevice(): boolean {
  if (platform() === 'android') return true;
  if (platform() !== 'web' || typeof matchMedia !== 'function' || typeof screen === 'undefined') return false;
  return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
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
