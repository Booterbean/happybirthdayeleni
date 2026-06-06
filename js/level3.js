(function () {
  "use strict";

  const engineer = document.getElementById("engineer");
  const robot = document.getElementById("robot");

  function bobEngineer() {
    RhythmCommon.restartAnimation(engineer, "bobbing");
  }

  function flipRobot() {
    RhythmCommon.restartAnimation(robot, "flipping");
  }

  const level = new RhythmLevel({
    levelNumber: 3,
    title: "RoboSubbing",
    audioUrls: ["song3/song.mp3", "song3/song.wav"],
    noteMidiUrls: ["song3/song.mid", "song3/song.midi"],
    tempo: { bpm: 100 },
    triggers: [
      {
        name: "engineer-bob",
        midiUrls: ["song3/bob.mid", "song3/bob.midi"],
        callback: () => bobEngineer()
      }
    ],
    onPress: () => flipRobot()
  });

  level.boot();
})();
