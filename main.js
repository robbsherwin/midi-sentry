const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const midi = require('@julusian/midi');

const TICKS_PER_QUARTER = 480;
const VELOCITY = 100;

function vlqEncode(n) {
  if (n < 0) n = 0;
  const bytes = [];
  let v = n;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (bytes.length) b |= 0x80;
    bytes.unshift(b);
  } while (v > 0);
  return Buffer.from(bytes);
}

function buildMidiFile(chordHistory) {
  const chunks = [];
  chunks.push(Buffer.from('MThd', 'ascii'));
  chunks.push(Buffer.from([0, 0, 0, 6]));
  chunks.push(Buffer.from([0, 0, 0, 1, (TICKS_PER_QUARTER >> 8) & 0xff, TICKS_PER_QUARTER & 0xff]));
  const trackBuf = buildTrackChunk(chordHistory);
  chunks.push(Buffer.from('MTrk', 'ascii'));
  chunks.push(Buffer.from([
    (trackBuf.length >> 24) & 0xff, (trackBuf.length >> 16) & 0xff,
    (trackBuf.length >> 8) & 0xff, trackBuf.length & 0xff
  ]));
  chunks.push(trackBuf);
  return Buffer.concat(chunks);
}

function buildTrackChunk(chordHistory) {
  const events = [];
  let tick = 0;
  events.push({ delta: 0, data: Buffer.from([0xff, 0x51, 0x03, 0x07, 0xa1, 0x20]) });
  for (let i = 0; i < chordHistory.length; i++) {
    const entry = chordHistory[i];
    const notes = entry && entry.notes && Array.isArray(entry.notes) ? entry.notes : [];
    const deltaToChord = tick === 0 ? 0 : TICKS_PER_QUARTER;
    tick = 0;
    for (let j = 0; j < notes.length; j++) {
      const n = Math.max(0, Math.min(127, Math.round(Number(notes[j]))));
      events.push({ delta: j === 0 ? deltaToChord : 0, data: Buffer.from([0x90, n, VELOCITY]) });
    }
    tick = TICKS_PER_QUARTER;
    for (let j = 0; j < notes.length; j++) {
      const n = Math.max(0, Math.min(127, Math.round(Number(notes[j]))));
      events.push({ delta: j === 0 ? TICKS_PER_QUARTER : 0, data: Buffer.from([0x80, n, 0]) });
    }
  }
  events.push({ delta: 0, data: Buffer.from([0xff, 0x2f, 0x00]) });
  const parts = [];
  for (const ev of events) {
    parts.push(vlqEncode(ev.delta));
    parts.push(ev.data);
  }
  return Buffer.concat(parts);
}

function getDefaultMidiFilename() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}${m}${day}_${h}${min}${s}_midi_sentry.mid`;
}

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

ipcMain.handle('save-midi-file', async (_e, chordHistory) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win || !chordHistory || chordHistory.length === 0) {
    return { ok: false, error: 'No chords to save' };
  }
  const defaultPath = path.join(app.getPath('documents'), getDefaultMidiFilename());
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath,
    filters: [{ name: 'MIDI', extensions: ['mid'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try {
    const buf = buildMidiFile(chordHistory);
    fs.writeFileSync(filePath, buf);
    return { ok: true, path: filePath };
  } catch (err) {
    console.error('save-midi-file error:', err);
    return { ok: false, error: err.message };
  }
});

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
