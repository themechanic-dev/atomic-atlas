// Preload: the only bridge between the web UI and the desktop shell.
// Keep it tiny. Anything that can run in the web UI should live there.

import { contextBridge, ipcRenderer } from 'electron';

const api = {
  kind: 'desktop' as const,
  info: (): Promise<unknown> => ipcRenderer.invoke('app:info'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:open-external', url),
  setTheme: (theme: 'dark' | 'light' | 'system'): Promise<void> => ipcRenderer.invoke('app:set-theme', theme),
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
  assistant: {
    status: (): Promise<unknown> => ipcRenderer.invoke('assistant:status'),
    install: (size: 'small' | 'large'): Promise<unknown> => ipcRenderer.invoke('assistant:install', size),
    remove: (): Promise<unknown> => ipcRenderer.invoke('assistant:remove'),
    start: (): Promise<unknown> => ipcRenderer.invoke('assistant:start'),
    chat: (body: unknown): Promise<unknown> => ipcRenderer.invoke('assistant:chat', body),
    onDelta: (listener: (text: string) => void): (() => void) => {
      const handler = (_event: unknown, text: string): void => listener(text);
      ipcRenderer.on('assistant:delta', handler);
      return () => ipcRenderer.removeListener('assistant:delta', handler);
    },
    onProgress: (listener: (share: number) => void): (() => void) => {
      const handler = (_event: unknown, share: number): void => listener(share);
      ipcRenderer.on('assistant:progress', handler);
      return () => ipcRenderer.removeListener('assistant:progress', handler);
    },
  },
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
