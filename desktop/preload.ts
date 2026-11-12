// Preload: the only bridge between the web UI and the desktop shell.
// Keep it tiny. Anything that can run in the web UI should live there.

import { contextBridge, ipcRenderer } from 'electron';

const api = {
  kind: 'desktop' as const,
  info: (): Promise<unknown> => ipcRenderer.invoke('app:info'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:open-external', url),
  setTheme: (theme: 'dark' | 'light' | 'system'): Promise<void> => ipcRenderer.invoke('app:set-theme', theme),
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
  voice: {
    status: (): Promise<unknown> => ipcRenderer.invoke('voice:status'),
    install: (): Promise<unknown> => ipcRenderer.invoke('voice:install'),
    remove: (): Promise<unknown> => ipcRenderer.invoke('voice:remove'),
    speak: (text: string, language: 'el' | 'en', rate: number): Promise<Uint8Array | null> => ipcRenderer.invoke('voice:speak', text, language, rate),
    stop: (): Promise<void> => ipcRenderer.invoke('voice:stop'),
    onProgress: (listener: (share: number) => void): (() => void) => {
      const handler = (_event: unknown, share: number): void => listener(share);
      ipcRenderer.on('voice:progress', handler);
      return () => ipcRenderer.removeListener('voice:progress', handler);
    },
  },
};

contextBridge.exposeInMainWorld('atomicAtlasShell', api);
