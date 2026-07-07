/**
 * Native File System Integration for Smooth Playback
 * 
 * Bypasses the Node.js server for local video streaming by using 
 * the browser's File System Access API (URL.createObjectURL).
 */

const DB_NAME = 'upsc-pro-native-fs';
const STORE_NAME = 'handles';

export async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getRootHandle() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get('root');
        req.onsuccess = async () => {
            if (req.result) {
                try {
                    // Verify permission
                    if ((await req.result.queryPermission({ mode: 'read' })) === 'granted') {
                        resolve(req.result);
                    } else {
                        resolve(null);
                    }
                } catch {
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        };
        req.onerror = () => reject(req.error);
    });
}

export async function requestRootHandle() {
    try {
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        const db = await initDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(handle, 'root');
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
        return handle;
    } catch (e) {
        console.warn('User cancelled directory picker or it failed', e);
        return null;
    }
}

/**
 * Resolves an absolute file path from the server into a File object 
 * using the stored root directory handle.
 */
export async function getNativeFile(absolutePath) {
    const root = await getRootHandle();
    if (!root) return null;

    // We need to find the relative path from the root handle.
    // E.g., D:/UPSC study site data/GS1/... and rootName = "UPSC study site data"
    const normalizedPath = absolutePath.replace(/\\/g, '/');
    const rootName = root.name;
    
    // Look for the rootName in the path (either preceded by a slash, or right after the drive letter like D:/)
    const escapedRootName = rootName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|/)${escapedRootName}(/|$)`, 'i');
    const match = normalizedPath.match(regex);
    
    if (!match) {
        console.warn(`Root handle name "${rootName}" not found in path "${normalizedPath}"`);
        return null;
    }

    // Extract the relative path parts
    const matchIndex = match.index;
    const matchLength = match[0].length;
    let relativePath;
    
    if (match[0].endsWith('/')) {
        relativePath = normalizedPath.substring(matchIndex + matchLength);
    } else {
        relativePath = ''; // It was exactly the root folder itself
    }

    const parts = relativePath.split('/').filter(p => p.trim() !== '');
    
    try {
        let currentHandle = root;
        // Traverse directories
        for (let i = 0; i < parts.length - 1; i++) {
            currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
        }
        // Get file handle
        const fileName = parts[parts.length - 1];
        const fileHandle = await currentHandle.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        return file;
    } catch (e) {
        console.warn(`Could not resolve native file for ${relativePath}`, e);
        return null;
    }
}
