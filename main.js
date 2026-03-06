const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const midi = require('@julusian/midi');

let mainWindow = null;
let midiOutput = null;
let midiPortIndex = null;

function getMidiOutputs() {
  try {
    const output = new midi.Output();
    const count = output.getPortCount();
    const ports = [];
    for (let i = 0; i < count; i++) {
      ports.push({ index: i, name: output.getPortName(i) });
    }
    try { output.closePort(); } catch (_) {}
    return ports;
  } catch (err) {
    console.error('getMidiOutputs error:', err);
    return [];
  }
}

function openMidiPort(index) {
  if (midiOutput) {
    try { midiOutput.closePort(); } catch (_) {}
    midiOutput = null;
    midiPortIndex = null;
  }
  if (index == null || index < 0) return true; // "no device" is valid
  try {
    midiOutput = new midi.Output();
    midiOutput.openPort(Number(index));
    midiPortIndex = index;
    return true;
  } catch (err) {
    console.error('MIDI openPort error:', err);
    return false;
  }
}

function sendMidiNoteOn(note, velocity) {
  if (!midiOutput) return;
  try {
    const n = Math.max(0, Math.min(127, Math.round(Number(note))));
    const v = Math.max(0, Math.min(127, Math.round(Number(velocity))));
    midiOutput.sendMessage([0x90, n, v]);
  } catch (err) {
    console.warn('MIDI send error', err);
  }
}

function sendMidiNoteOff(note) {
  if (!midiOutput) return;
  try {
    const n = Math.max(0, Math.min(127, Math.round(Number(note))));
    midiOutput.sendMessage([0x80, n, 0]);
  } catch (err) {
    console.warn('MIDI send error', err);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 780,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#e5e5ea',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  mainWindow = win;
  win.on('closed', () => {
    mainWindow = null;
    if (midiOutput) {
      try { midiOutput.closePort(); } catch (_) {}
      midiOutput = null;
    }
  });

  win.loadFile('index.html');
}

ipcMain.handle('open-devtools', () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (win && !win.isDestroyed()) win.webContents.openDevTools();
});

ipcMain.handle('get-midi-outputs', () => getMidiOutputs());
ipcMain.handle('select-midi-output', (_e, index) => openMidiPort(index));
ipcMain.handle('midi-note-on', (_e, note, velocity) => sendMidiNoteOn(note, velocity));
ipcMain.handle('midi-note-off', (_e, note) => sendMidiNoteOff(note));

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (midiOutput) {
    try { midiOutput.closePort(); } catch (_) {}
    midiOutput = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
