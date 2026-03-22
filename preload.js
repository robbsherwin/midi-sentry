const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDevTools: () => ipcRenderer.invoke('open-devtools'),
  getMidiOutputs: (opts) => ipcRenderer.invoke('get-midi-outputs', opts || undefined),
  selectMidiOutput: (index) => ipcRenderer.invoke('select-midi-output', index),
  sendNoteOn: (note, velocity) => ipcRenderer.invoke('midi-note-on', note, velocity),
  sendNoteOff: (note) => ipcRenderer.invoke('midi-note-off', note),
  saveMidiFile: (chordHistory) => ipcRenderer.invoke('save-midi-file', chordHistory)
});
