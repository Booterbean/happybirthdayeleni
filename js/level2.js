(function () {
  "use strict";

  const frame = document.getElementById("catFrame");
  const FRAME = name => `song2/${name}.png`;

  const LEVEL_TEMPO = {
    beatsPerMeasure: 4,
    segments: [
      { type: "constant", startMeasure: 1, endMeasure: 25, bpm: 130 },
      { type: "linear", startMeasure: 25, endMeasure: 33, startBpm: 130, endBpm: 180 },
      { type: "constant", startMeasure: 33, endMeasure: 49, bpm: 180 },
      { type: "linear", startMeasure: 49, endMeasure: 57, startBpm: 180, endBpm: 230 },
      { type: "constant", startMeasure: 57, endMeasure: 89, bpm: 230 },
      { type: "constant", startMeasure: 89, bpm: 230 }
    ]
  };

  const baseSequence = ["f1", "f2", "f5", "f6", "f5", "f6"];
  const IDEA_MAX_SECONDS = 0.300;
  const SWITCH_PRIORITY_PAD_SECONDS = 0.010;

  let switchStep = 0;
  let baseFrame = "f1";
  let tempToken = 0;
  let ideaStage = 0;
  let ideaWindowUntil = 0;

  function setFrame(name) {
    frame.src = FRAME(name);
  }

  function clearIdeaState() {
    ideaStage = 0;
    ideaWindowUntil = 0;
  }

  function switchBaseFrame() {
    switchStep = (switchStep + 1) % baseSequence.length;
    baseFrame = baseSequence[switchStep];

    // The normal switch.mid cycle always has priority over f3/f4. Incrementing
    // tempToken cancels any pending temporary idea-frame timer.
    tempToken += 1;
    clearIdeaState();
    setFrame(baseFrame);
  }

  function getNextBaseSwitchTime(level, time) {
    const trigger = level.triggers.find(item => item.name === "cat-switch");
    if (!trigger || !trigger.times || trigger.times.length === 0) return Infinity;

    let i = trigger.nextIndex;
    while (i < trigger.times.length && trigger.times[i] <= time + SWITCH_PRIORITY_PAD_SECONDS) i += 1;
    return i < trigger.times.length ? trigger.times[i] : Infinity;
  }

  function ideaDurationMs(level, time) {
    const nextSwitch = getNextBaseSwitchTime(level, time);
    const available = Number.isFinite(nextSwitch)
      ? Math.max(0, nextSwitch - time - SWITCH_PRIORITY_PAD_SECONDS)
      : IDEA_MAX_SECONDS;
    return Math.max(0, Math.min(IDEA_MAX_SECONDS, available)) * 1000;
  }

  function showTemporaryIdeaFrame(name, durationMs) {
    if (durationMs <= 12) return;

    const token = ++tempToken;
    setFrame(name);
    window.setTimeout(() => {
      if (token === tempToken) {
        clearIdeaState();
        setFrame(baseFrame);
      }
    }, durationMs);
  }

  function handleIdeaPress(judgement, level) {
    // Frame toggles are intentionally allowed on every spacebar press, even Bad
    // presses. Scoring still uses song.mid; this only controls the little f3/f4
    // visual reaction.
    const time = judgement.time;
    const stillInsideIdeaWindow = ideaStage === 1 && time <= ideaWindowUntil;
    const durationMs = ideaDurationMs(level, time);
    const durationSeconds = durationMs / 1000;

    if (stillInsideIdeaWindow) {
      ideaStage = 2;
      ideaWindowUntil = time + durationSeconds;
      showTemporaryIdeaFrame("f4", durationMs);
      return;
    }

    ideaStage = 1;
    ideaWindowUntil = time + durationSeconds;
    showTemporaryIdeaFrame("f3", durationMs);
  }

  function resetLevel() {
    switchStep = 0;
    baseFrame = "f1";
    tempToken = 0;
    clearIdeaState();
    setFrame("f1");
  }

  const level = new RhythmLevel({
    levelNumber: 2,
    title: "Flud MeCATnics",
    audioUrls: ["song2/song.mp3", "song2/song.wav"],
    noteMidiUrls: ["song2/song.mid", "song2/song.midi"],
    tempo: LEVEL_TEMPO,
    triggers: [
      {
        name: "cat-switch",
        midiUrls: ["song2/switch.mid", "song2/switch.midi"],
        callback: () => switchBaseFrame()
      }
    ],
    onReset: resetLevel,
    onPress: handleIdeaPress
  });

  level.boot();
})();
