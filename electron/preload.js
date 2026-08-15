const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  getMediaFiles: (folder) => ipcRenderer.invoke('media:getFiles', folder),
  moveFile: (args) => ipcRenderer.invoke('media:move', args),
  deleteFile: (filePath) => ipcRenderer.invoke('media:delete', filePath),
  splitVideo: (args) => ipcRenderer.invoke('video:split', args),
  cropVideo: (args) => ipcRenderer.invoke('video:crop', args),
  cropImage: (args) => ipcRenderer.invoke('image:crop', args),
  removeAudio: (args) => ipcRenderer.invoke('video:removeAudio', args),
  rotateMedia: (args) => ipcRenderer.invoke('media:rotate', args),
  isAnimatedGif: (filePath) => ipcRenderer.invoke('media:isAnimatedGif', filePath),
  revealInFolder: (filePath) => ipcRenderer.invoke('media:revealInFolder', filePath),
  heicPreview: (filePath) => ipcRenderer.invoke('image:heicPreview', filePath),
  convertHeic: (filePath) => ipcRenderer.invoke('image:convertHeic', filePath),
  // Encode progress for any long-running ffmpeg operation (crop, rotate)
  onProgress: (callback) => {
    const listener = (_event, percent) => callback(percent)
    ipcRenderer.on('media:progress', listener)
    return () => ipcRenderer.removeListener('media:progress', listener)
  },
  getHotkeys: () => ipcRenderer.invoke('config:getHotkeys'),
  setHotkeys: (hotkeys) => ipcRenderer.invoke('config:setHotkeys', hotkeys),
  getSourceFolder: () => ipcRenderer.invoke('config:getSourceFolder'),
  setSourceFolder: (folder) => ipcRenderer.invoke('config:setSourceFolder', folder),
  saveFrame: (filePath, dataUrl) => ipcRenderer.invoke('media:saveFrame', { filePath, dataUrl }),
  setRating: (filePath, rating) => ipcRenderer.invoke('meta:setRating', { filePath, rating }),
  getAllRatings: (filePaths) => ipcRenderer.invoke('meta:getAllRatings', filePaths),
})
