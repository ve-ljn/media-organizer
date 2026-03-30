const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  getMediaFiles: (folder) => ipcRenderer.invoke('media:getFiles', folder),
  moveFile: (args) => ipcRenderer.invoke('media:move', args),
  deleteFile: (filePath) => ipcRenderer.invoke('media:delete', filePath),
  splitVideo: (args) => ipcRenderer.invoke('video:split', args),
  getHotkeys: () => ipcRenderer.invoke('config:getHotkeys'),
  setHotkeys: (hotkeys) => ipcRenderer.invoke('config:setHotkeys', hotkeys),
  getSourceFolder: () => ipcRenderer.invoke('config:getSourceFolder'),
  setSourceFolder: (folder) => ipcRenderer.invoke('config:setSourceFolder', folder),
  saveFrame: (filePath, dataUrl) => ipcRenderer.invoke('media:saveFrame', { filePath, dataUrl }),
  setRating: (filePath, rating) => ipcRenderer.invoke('meta:setRating', { filePath, rating }),
  getAllRatings: (filePaths) => ipcRenderer.invoke('meta:getAllRatings', filePaths),
})
