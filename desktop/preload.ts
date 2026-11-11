// Preload: the only bridge between the web UI and the desktop shell.
// Keep it tiny. Anything that can run in the web UI should live there.

import { contextBridge, ipcRenderer } from 'electron';

const api = {
  kind: 'desktop' as const,
  info: (): Promise<unknown> => ipcRenderer.invoke('app:info'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:open-external', url),
  setTheme: (theme: 'dark' | 'light' | 'system'): Promise<void> => ipcRenderer.invoke('app:set-theme', theme),
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
};

contextBridge.exposeInMainWorld('atomicAtlasShell', api);
