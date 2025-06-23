const STRING_TUNING = {
  6: "E2",
  5: "A2",
  4: "D3",
  3: "G3",
  2: "B3",
  1: "E4"
};

const NOTE_ORDER = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NATURAL_NOTES = new Set(["C", "D", "E", "F", "G", "A", "B"]);

const promptEl = document.getElementById("prompt");
const resultEl = document.getElementById("result");
const thresholdSlider = document.getElementById("threshold");
const showDetected = document.getElementById("show-detected");
const includeIncidentals = document.getElementById("include-incidentals");
const stringChecks = document.querySelectorAll(".string-check");
const fretStartInput = document.getElementById("fret-start");
const fretEndInput = document.getElementById("fret-end");

let lastTarget = null;
let awaitingSilence = false;
let targetNote = null;
let audioContext;
let pitchProcessor;
let stream;

function noteName(baseNote, semitones) {
  const [note, octaveStr] = [baseNote.slice(0, -1), baseNote.slice(-1)];
  let index = NOTE_ORDER.indexOf(note) + semitones;
  let octave = parseInt(octaveStr) + Math.floor(index / 12);
  let name = NOTE_ORDER[index % 12];
  return `${name}${octave}`;
}

function getFrettedNotes() {
  const strings = Array.from(stringChecks)
    .filter(cb => cb.checked)
    .map(cb => parseInt(cb.value));
  const fretStart = parseInt(fretStartInput.value);
  const fretEnd = parseInt(fretEndInput.value);
  const incidentals = includeIncidentals.checked;

  const notes = [];
  for (let string of strings) {
    const base = STRING_TUNING[string];
    for (let fret = fretStart; fret <= fretEnd; fret++) {
      const note = noteName(base, fret);
      if (!incidentals && !NATURAL_NOTES.has(note.slice(0, -1))) continue;
      notes.push({ string, fret, note });
    }
  }
  return notes;
}

function freqToNote(freq) {
  if (freq <= 0) return null;
  const A4 = 440;
  const noteNum = 12 * (Math.log2(freq / A4));
  const rounded = Math.round(noteNum) + 69;
  const name = NOTE_ORDER[rounded % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

function pickNewNote(notes) {
  let choice;
  do {
    choice = notes[Math.floor(Math.random() * notes.length)];
  } while (choice.note === lastTarget?.note);
  lastTarget = choice;
  targetNote = choice.note;
  promptEl.innerHTML = `String ${choice.string}<br>Play ${choice.note}`;
  resultEl.textContent = "";
  resultEl.className = "result";
  awaitingSilence = false;
}

async function startAudio() {
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new AudioContext();
  const input = audioContext.createMediaStreamSource(stream);

  const processor = audioContext.createScriptProcessor(2048, 1, 1);
  const threshold = () => parseFloat(thresholdSlider.value);

  processor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    const vol = Math.sqrt(inputData.reduce((sum, x) => sum + x * x, 0) / inputData.length);

    if (awaitingSilence) {
      if (vol < threshold()) {
        pickNewNote(getFrettedNotes());
      }
      return;
    }

    const detectedFreq = autoCorrelate(inputData, audioContext.sampleRate);
    const detectedNote = freqToNote(detectedFreq);

    if (detectedNote) {
      if (showDetected.checked) {
        resultEl.textContent = `🎵 Detected: ${detectedNote}`;
        resultEl.className = "result orange";
      }

      if (detectedNote === targetNote) {
        resultEl.textContent = `✅ Correct! You played ${detectedNote}`;
        resultEl.className = "result green";
        awaitingSilence = true;
      }
    }
  };

  input.connect(processor);
  processor.connect(audioContext.destination);
}



// Basic autocorrelation pitch detection
function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    const val = buf[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < parseFloat(thresholdSlider.value)) return -1;

  let r1 = 0, r2 = SIZE - 1, thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  }

  buf = buf.slice(r1, r2);
  const c = new Array(buf.length).fill(0);
  for (let i = 0; i < buf.length; i++) {
    for (let j = 0; j < buf.length - i; j++) {
      c[i] += buf[j] * buf[j + i];
    }
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < buf.length; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }

  return sampleRate / maxpos;
}

window.addEventListener("load", async () => {
  pickNewNote(getFrettedNotes());
  await startAudio();
});

const refreshOnChange = () => pickNewNote(getFrettedNotes());

// thresholdSlider.addEventListener("input", refreshOnChange);
includeIncidentals.addEventListener("change", refreshOnChange);
// showDetected.addEventListener("change", refreshOnChange);
fretStartInput.addEventListener("change", refreshOnChange);
fretEndInput.addEventListener("change", refreshOnChange);

stringChecks.forEach(cb => cb.addEventListener("change", refreshOnChange));
