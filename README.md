# MIDI-Sentry — for Deckard's Dream

A MIDI chord player app built with Electron. Click any key on the 88-key display, with a chord type selected, and the app sends the full chord to your Deckard's Dream via MIDI.

## Setup

### Requirements
- Node.js (v18+)
- npm

### Install & Run

```bash
npm install
npm start
```

## Usage

1. **Select a chord type** from the panel at the bottom (Major, Minor, Dom 7th, etc.)
2. **Select your MIDI output device** from the dropdown (top right) — the app will auto-detect "Deckard's Dream" if found
3. **Click any key** on the piano display
4. The chord plays on the DD for **5 seconds**, with keys glowing cyan and fading back

## MIDI Routing

```
Electron App → MIDI Out → Deckard's Dream MIDI In
```

## Chord Types Included

- **Triads**: Major, Minor, Augmented, Diminished
- **Suspended**: Sus2, Sus4
- **Sevenths**: Dom7, Maj7, Min7, Dim7, Half-Dim, MinMaj7, AugMaj7
- **Extended**: 9th, Maj9, Min9, Add9, 11th, Maj11, 13th
- **Other**: Power (5th), Octave

## Notes

- Uses the **Web MIDI API** built into Electron's Chromium — no extra audio libraries needed
- Velocity is adjustable via the slider (top right)
- Chords are voiced stacking **upward** from the clicked root note
- Extended chords (9th, 11th, 13th) use all 8 voices the Deckard's Dream supports
