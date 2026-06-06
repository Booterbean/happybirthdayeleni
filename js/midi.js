(function () {
  "use strict";

  const DEFAULT_BPM = 120;

  function readString(bytes, state, length) {
    let value = "";
    for (let i = 0; i < length; i += 1) value += String.fromCharCode(bytes[state.pos++]);
    return value;
  }

  function readUint16(bytes, state) {
    const value = (bytes[state.pos] << 8) | bytes[state.pos + 1];
    state.pos += 2;
    return value;
  }

  function readUint32(bytes, state) {
    const value = ((bytes[state.pos] << 24) >>> 0) | (bytes[state.pos + 1] << 16) | (bytes[state.pos + 2] << 8) | bytes[state.pos + 3];
    state.pos += 4;
    return value >>> 0;
  }

  function readVarLength(bytes, state) {
    let value = 0;
    while (true) {
      const byte = bytes[state.pos++];
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) break;
    }
    return value;
  }

  function channelDataLength(status) {
    const high = status & 0xf0;
    if (high === 0xc0 || high === 0xd0) return 1;
    return 2;
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function measureToBeat(measure, beat, beatsPerMeasure) {
    const safeBeat = beat ?? 1;
    return (measure - 1) * beatsPerMeasure + (safeBeat - 1);
  }

  function valueToBeat(value, beatsPerMeasure) {
    if (isFiniteNumber(value.beatPosition)) return value.beatPosition;
    if (isFiniteNumber(value.beat)) return value.beat;
    if (isFiniteNumber(value.startBeat)) return value.startBeat;
    if (isFiniteNumber(value.measure)) return measureToBeat(value.measure, value.measureBeat, beatsPerMeasure);
    if (isFiniteNumber(value.startMeasure)) return measureToBeat(value.startMeasure, value.startMeasureBeat, beatsPerMeasure);
    return 0;
  }

  function valueToEndBeat(value, beatsPerMeasure) {
    if (isFiniteNumber(value.endBeat)) return value.endBeat;
    if (isFiniteNumber(value.endMeasure)) return measureToBeat(value.endMeasure, value.endMeasureBeat, beatsPerMeasure);
    return Infinity;
  }

  function normalizeManualTempo(tempo) {
    if (!tempo || !Array.isArray(tempo.segments)) return null;
    const beatsPerMeasure = tempo.beatsPerMeasure || 4;
    const segments = tempo.segments.map(segment => {
      const type = segment.type || (isFiniteNumber(segment.startBpm) || isFiniteNumber(segment.endBpm) ? "linear" : "constant");
      const startBeat = valueToBeat(segment, beatsPerMeasure);
      const endBeat = valueToEndBeat(segment, beatsPerMeasure);
      if (type === "linear") {
        const startBpm = segment.startBpm ?? segment.bpm;
        const endBpm = segment.endBpm;
        if (!isFiniteNumber(startBpm) || !isFiniteNumber(endBpm) || !Number.isFinite(endBeat)) {
          throw new Error("Linear tempo segments need finite start BPM, end BPM, and end measure/beat.");
        }
        return { type, startBeat, endBeat, startBpm, endBpm };
      }
      const bpm = segment.bpm ?? segment.startBpm ?? segment.endBpm;
      if (!isFiniteNumber(bpm)) throw new Error("Constant tempo segments need a BPM.");
      return { type: "constant", startBeat, endBeat, bpm };
    }).sort((a, b) => a.startBeat - b.startBeat);

    return {
      beatsPerMeasure,
      initialBpm: tempo.initialBpm || (segments[0] ? (segments[0].bpm || segments[0].startBpm) : DEFAULT_BPM),
      segments
    };
  }

  function secondsForConstantTempo(fromBeat, toBeat, bpm) {
    return (toBeat - fromBeat) * 60 / bpm;
  }

  function bpmAtBeat(segment, beat) {
    if (segment.type === "constant") return segment.bpm;
    const span = segment.endBeat - segment.startBeat;
    if (span <= 0) return segment.endBpm;
    const t = Math.max(0, Math.min(1, (beat - segment.startBeat) / span));
    return segment.startBpm + (segment.endBpm - segment.startBpm) * t;
  }

  function secondsForLinearTempo(fromBeat, toBeat, segment) {
    const span = segment.endBeat - segment.startBeat;
    if (span <= 0) return 0;
    const slope = (segment.endBpm - segment.startBpm) / span;
    if (Math.abs(slope) < 1e-9) return secondsForConstantTempo(fromBeat, toBeat, segment.startBpm);

    const bpmFrom = segment.startBpm + slope * (fromBeat - segment.startBeat);
    const bpmTo = segment.startBpm + slope * (toBeat - segment.startBeat);
    return (60 / slope) * Math.log(bpmTo / bpmFrom);
  }

  function secondsForSegment(fromBeat, toBeat, segment) {
    if (toBeat <= fromBeat) return 0;
    if (segment.type === "linear") return secondsForLinearTempo(fromBeat, toBeat, segment);
    return secondsForConstantTempo(fromBeat, toBeat, segment.bpm);
  }

  function beatToSecondsWithManualTempo(beat, manualTempo) {
    const segments = manualTempo.segments;
    let seconds = 0;
    let cursor = 0;
    let currentBpm = manualTempo.initialBpm;

    for (const segment of segments) {
      if (beat <= cursor) break;

      if (segment.startBeat > cursor) {
        const gapEnd = Math.min(beat, segment.startBeat);
        seconds += secondsForConstantTempo(cursor, gapEnd, currentBpm);
        cursor = gapEnd;
        if (beat <= cursor) return seconds;
      }

      if (beat < segment.startBeat) break;

      const segmentStart = Math.max(cursor, segment.startBeat);
      const segmentEnd = Math.min(beat, segment.endBeat);
      if (segmentEnd > segmentStart) {
        seconds += secondsForSegment(segmentStart, segmentEnd, segment);
        cursor = segmentEnd;
      }

      if (Number.isFinite(segment.endBeat) && cursor >= segment.endBeat) {
        currentBpm = bpmAtBeat(segment, segment.endBeat);
      } else if (!Number.isFinite(segment.endBeat) && cursor >= beat) {
        currentBpm = bpmAtBeat(segment, cursor);
      }
    }

    if (beat > cursor) {
      seconds += secondsForConstantTempo(cursor, beat, currentBpm);
    }

    return seconds;
  }

  function ticksToSecondsWithMidiTempoEvents(tick, division, tempoEvents) {
    let seconds = 0;
    let lastTick = 0;
    let tempo = 500000; // 120 BPM fallback when the MIDI file has no tempo event.

    for (const event of tempoEvents) {
      if (event.tick > tick) break;
      seconds += ((event.tick - lastTick) * tempo) / division / 1000000;
      tempo = event.tempo;
      lastTick = event.tick;
    }

    seconds += ((tick - lastTick) * tempo) / division / 1000000;
    return seconds;
  }

  function ticksToSeconds(tick, division, tempoEvents, options) {
    const tempo = options && options.tempo;

    if (tempo && Array.isArray(tempo.segments)) {
      const manualTempo = normalizeManualTempo(tempo);
      return beatToSecondsWithManualTempo(tick / division, manualTempo);
    }

    if (tempo && isFiniteNumber(tempo.bpm)) {
      return (tick / division) * 60 / tempo.bpm;
    }

    if (options && isFiniteNumber(options.bpm)) {
      return (tick / division) * 60 / options.bpm;
    }

    return ticksToSecondsWithMidiTempoEvents(tick, division, tempoEvents);
  }

  function dedupeTimes(times) {
    const sorted = times.slice().sort((a, b) => a - b);
    const unique = [];
    for (const time of sorted) {
      if (unique.length === 0 || Math.abs(time - unique[unique.length - 1]) > 0.012) {
        unique.push(time);
      }
    }
    return unique;
  }

  function parseMidi(arrayBuffer, options = {}) {
    const bytes = new Uint8Array(arrayBuffer);
    const state = { pos: 0 };

    if (readString(bytes, state, 4) !== "MThd") throw new Error("Not a valid MIDI file: missing MThd header.");
    const headerLength = readUint32(bytes, state);
    const headerEnd = state.pos + headerLength;
    const format = readUint16(bytes, state);
    const trackCount = readUint16(bytes, state);
    const division = readUint16(bytes, state);
    state.pos = headerEnd;

    if ((division & 0x8000) !== 0) {
      throw new Error("SMPTE-time MIDI files are not supported. Export the MIDI using ticks/PPQ timing.");
    }

    const tempoEvents = [];
    const timeSignatureEvents = [];
    const noteTicks = [];

    for (let track = 0; track < trackCount; track += 1) {
      const chunkType = readString(bytes, state, 4);
      const chunkLength = readUint32(bytes, state);
      const trackEnd = state.pos + chunkLength;
      if (chunkType !== "MTrk") {
        state.pos = trackEnd;
        continue;
      }

      let absoluteTick = 0;
      let runningStatus = null;

      while (state.pos < trackEnd) {
        absoluteTick += readVarLength(bytes, state);
        let status = bytes[state.pos];
        let firstData = null;

        if (status >= 0x80) {
          state.pos += 1;
          if (status < 0xf0) runningStatus = status;
        } else {
          if (runningStatus === null) throw new Error("MIDI running status found before a channel status byte.");
          status = runningStatus;
          firstData = bytes[state.pos++];
        }

        if (status === 0xff) {
          const metaType = bytes[state.pos++];
          const length = readVarLength(bytes, state);
          if (metaType === 0x51 && length === 3) {
            const tempo = (bytes[state.pos] << 16) | (bytes[state.pos + 1] << 8) | bytes[state.pos + 2];
            tempoEvents.push({ tick: absoluteTick, tempo });
          } else if (metaType === 0x58 && length >= 2) {
            const numerator = bytes[state.pos];
            const denominator = 2 ** bytes[state.pos + 1];
            timeSignatureEvents.push({ tick: absoluteTick, numerator, denominator });
          }
          state.pos += length;
          runningStatus = null;
          continue;
        }

        if (status === 0xf0 || status === 0xf7) {
          const length = readVarLength(bytes, state);
          state.pos += length;
          runningStatus = null;
          continue;
        }

        const length = channelDataLength(status);
        const data1 = firstData !== null ? firstData : bytes[state.pos++];
        const data2 = length === 2 ? bytes[state.pos++] : 0;
        const high = status & 0xf0;

        if (high === 0x90 && data2 > 0) {
          noteTicks.push(absoluteTick);
        }
      }

      state.pos = trackEnd;
    }

    tempoEvents.sort((a, b) => a.tick - b.tick);
    timeSignatureEvents.sort((a, b) => a.tick - b.tick);
    const noteTimes = noteTicks.map(tick => ticksToSeconds(tick, division, tempoEvents, options));

    return {
      format,
      division,
      tempoEvents,
      timeSignatureEvents,
      noteTicks: noteTicks.slice().sort((a, b) => a - b),
      noteTimes: dedupeTimes(noteTimes)
    };
  }

  async function loadMidiTimes(url, options = {}) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
    const buffer = await response.arrayBuffer();
    return parseMidi(buffer, options).noteTimes;
  }

  async function loadMidiTimesFromCandidates(urls, options = {}) {
    const errors = [];
    for (const url of urls) {
      try {
        return await loadMidiTimes(url, options);
      } catch (error) {
        errors.push(`${url}: ${error.message}`);
      }
    }
    throw new Error(`No MIDI candidate could be loaded. ${errors.join(" | ")}`);
  }

  window.RhythmMidi = {
    parseMidi,
    loadMidiTimes,
    loadMidiTimesFromCandidates,
    beatToSecondsWithManualTempo,
    normalizeManualTempo
  };
})();
