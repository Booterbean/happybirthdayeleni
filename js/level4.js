(function () {
  "use strict";

  const photo = document.getElementById("photoFrame");
  const flash = document.getElementById("cameraFlash");
  let currentPhoto = 0;

  function srcForPhoto(index) {
    return `song4/p${index}.png`;
  }

  async function riseIntroPhoto() {
    currentPhoto = 0;
    photo.src = srcForPhoto(0);
    photo.classList.remove("ready", "rising", "shaking", "bobbing");
    void photo.offsetWidth;
    photo.classList.add("rising");
    await RhythmCommon.wait(860);
    photo.classList.remove("rising");
    photo.classList.add("ready");
  }

  function nextPhoto() {
    if (currentPhoto === 0) currentPhoto = 1;
    else currentPhoto = currentPhoto >= 15 ? 1 : currentPhoto + 1;
    photo.src = srcForPhoto(currentPhoto);
    photo.classList.add("ready");
  }

  function cameraFlicker() {
    RhythmCommon.restartAnimation(flash, "active");
  }

  function shakePhoto() {
    photo.classList.remove("bobbing");
    RhythmCommon.restartAnimation(photo, "shaking");
  }

  function bobPhoto() {
    photo.classList.remove("shaking", "rising");
    RhythmCommon.restartAnimation(photo, "bobbing");
  }

  function resetLevel() {
    currentPhoto = 0;
    photo.src = srcForPhoto(0);
    photo.classList.remove("ready", "rising", "shaking", "bobbing");
  }

  const level = new RhythmLevel({
    levelNumber: 4,
    title: "Mayflower Memories",
    audioUrls: ["song4/song.mp3", "song4/song.wav"],
    noteMidiUrls: ["song4/song.mid", "song4/song.midi"],
    tempo: { bpm: 130 },
    triggers: [
      {
        name: "photo-bob",
        midiUrls: ["song4/bob.mid", "song4/bob.midi"],
        callback: () => bobPhoto()
      }
    ],
    onSongStart: () => {
      // p0 rises and then stays on screen until the player's first accepted
      // spacebar press. It no longer auto-advances to p1.
      riseIntroPhoto();
    },
    onReset: resetLevel,
    onPress: judgement => {
      if (judgement.accepted) {
        cameraFlicker();
        nextPhoto();
      } else {
        shakePhoto();
      }
    }
  });

  level.boot();
})();
