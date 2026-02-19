

import type {
  ElectronMessageBoxOptions,
  ElectronMessageBoxReturnValue,
  ElectronOpenDialogOptions,
  ElectronOpenDialogReturnValue,
  ElectronSaveDialogOptions,
  ElectronSaveDialogReturnValue,
} from './types';

declare global {
  interface Window {
    electron?: {
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      showMessageBox: (options: ElectronMessageBoxOptions) => Promise<ElectronMessageBoxReturnValue>;
      showOpenDialog: (options: ElectronOpenDialogOptions) => Promise<ElectronOpenDialogReturnValue>;
      showSaveDialog: (options: ElectronSaveDialogOptions) => Promise<ElectronSaveDialogReturnValue>;
      readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
      writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
      readDir: (dirPath: string) => Promise<{ success: boolean; files?: Array<{ name: string; isDirectory: boolean; isFile: boolean }>; error?: string }>;
      getPath: (name: 'home' | 'appData' | 'userData' | 'cache' | 'temp' | 'exe' | 'module' | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | 'recent' | 'logs' | 'crashDumps') => Promise<string | null>;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      close: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
      openReaderWindow: (options: { bookId: number; page?: number }) => Promise<{ success: boolean; windowId?: number }>;
      onWindowMaximizeChanged: (callback: (maximized: boolean) => void) => (() => void) | undefined;
      on: (channel: string, callback: (...args: any[]) => void) => void;
      off: (channel: string, callback: (...args: any[]) => void) => void;
    };
  }
}


export function isElectron(): boolean {
  return typeof window !== 'undefined' && typeof window.electron !== 'undefined';
}


export async function getElectronVersion(): Promise<string | null> {
  if (!isElectron()) return null;
  try {
    return await window.electron!.getVersion();
  } catch (error) {
    console.error('[Electron Bridge] Error getting version:', error);
    return null;
  }
}


export async function getElectronPlatform(): Promise<string | null> {
  if (!isElectron()) return null;
  try {
    return await window.electron!.getPlatform();
  } catch (error) {
    console.error('[Electron Bridge] Error getting platform:', error);
    return null;
  }
}


export async function showMessageBox(options: ElectronMessageBoxOptions): Promise<ElectronMessageBoxReturnValue | null> {
  if (!isElectron()) return null;
  try {
    return await window.electron!.showMessageBox(options);
  } catch (error) {
    console.error('[Electron Bridge] Error showing message box:', error);
    return null;
  }
}


export async function showOpenDialog(options: ElectronOpenDialogOptions): Promise<ElectronOpenDialogReturnValue | null> {
  if (!isElectron()) return null;
  try {
    return await window.electron!.showOpenDialog(options);
  } catch (error) {
    console.error('[Electron Bridge] Error showing open dialog:', error);
    return null;
  }
}


export async function showSaveDialog(options: ElectronSaveDialogOptions): Promise<ElectronSaveDialogReturnValue | null> {
  if (!isElectron()) return null;
  try {
    return await window.electron!.showSaveDialog(options);
  } catch (error) {
    console.error('[Electron Bridge] Error showing save dialog:', error);
    return null;
  }
}


export async function readFile(filePath: string): Promise<string | null> {
  if (!isElectron()) return null;
  try {
    const result = await window.electron!.readFile(filePath);
    if (result.success && result.content) {
      return result.content;
    }
    return null;
  } catch (error) {
    console.error('[Electron Bridge] Error reading file:', error);
    return null;
  }
}


export async function writeFile(filePath: string, content: string): Promise<boolean> {
  if (!isElectron()) return false;
  try {
    const result = await window.electron!.writeFile(filePath, content);
    return result.success;
  } catch (error) {
    console.error('[Electron Bridge] Error writing file:', error);
    return false;
  }
}


export async function readDir(dirPath: string): Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean }> | null> {
  if (!isElectron()) return null;
  try {
    const result = await window.electron!.readDir(dirPath);
    if (result.success && result.files) {
      return result.files;
    }
    return null;
  } catch (error) {
    console.error('[Electron Bridge] Error reading directory:', error);
    return null;
  }
}


export async function getPath(name: 'home' | 'appData' | 'userData' | 'cache' | 'temp' | 'exe' | 'module' | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | 'recent' | 'logs' | 'crashDumps'): Promise<string | null> {
  if (!isElectron()) return null;
  try {
    return await window.electron!.getPath(name);
  } catch (error) {
    console.error('[Electron Bridge] Error getting path:', error);
    return null;
  }
}


export async function openExternal(url: string): Promise<boolean> {
  if (!isElectron()) {
    window.open(url, '_blank');
    return true;
  }
  try {
    const result = await window.electron!.openExternal(url);
    return result.success;
  } catch (error) {
    console.error('[Electron Bridge] Error opening external:', error);
    return false;
  }
}


export const windowControls = {
  minimize: async () => {
    if (!isElectron()) return;
    try {
      await window.electron!.minimize();
    } catch (error) {
      console.error('[Electron Bridge] Error minimizing:', error);
    }
  },
  maximize: async () => {
    if (!isElectron()) return;
    try {
      await window.electron!.maximize();
    } catch (error) {
      console.error('[Electron Bridge] Error maximizing:', error);
    }
  },
  close: async () => {
    if (!isElectron()) return;
    try {
      await window.electron!.close();
    } catch (error) {
      console.error('[Electron Bridge] Error closing:', error);
    }
  },
  isMaximized: async (): Promise<boolean> => {
    if (!isElectron()) return false;
    try {
      return await window.electron!.isMaximized();
    } catch (error) {
      console.error('[Electron Bridge] Error checking maximize state:', error);
      return false;
    }
  },
};


export async function openReaderWindow(bookId: number, page?: number): Promise<boolean> {
  if (!isElectron()) return false;
  try {
    const result = await window.electron!.openReaderWindow({ bookId, page });
    return result.success;
  } catch (error) {
    console.error('[Electron Bridge] Error opening reader window:', error);
    return false;
  }
}
