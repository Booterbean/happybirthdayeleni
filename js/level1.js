(function () {
  "use strict";

  /*
    Level 1 coordinate tuning.
    These are deliberately explicit. Change these ratios first if your art lands slightly off.
    x/y ratios are measured from the top-left of the browser window.
  */
  const TUNING = {
    girlIdle: "song1/e1.png",
    girlFlip: "song1/e2.png",
    catcherIdle: "song1/c1.png",
    catcherCatch: "song1/c2.png",
    meatballImage: "song1/mb.png",
    meatballSizePx: 64,
    meatballStartXRatio: 0.40,
meatballStartYRatio: 0.55,
meatballCatchXRatio: 0.56,
meatballCatchYRatio: 0.61,
    meatballTravelSeconds: 0.7,
    gravityPxPerSecondSquared: 1180,
    catchSpriteMs: 200,
    girlFlipMs: 200,

    // Positive delays make Level 1's visual cue MIDI happen later, without
    // changing the player's scoring MIDI. Keep at 0 now that the true BPM is set.
    level1VisualDelaySeconds: 0.00,

    // This shifts ONLY song1/song.mid scoring. The girl/meatball MIDI files keep
    // their own timing. Use this because Level 1's visual MIDI appears correct
    // while song.mid is the only timing source that seems offset.
    // Positive values make the spacebar target notes later; negative values make
    // them earlier. Example: 0.18 means target every song.mid note 180ms later.
    song1ScoringOffsetSeconds: -4.5715
  };

  const girl = document.getElementById("girl");
  const catcher = document.getElementById("catcher");
  const meatballLayer = document.getElementById("meatballLayer");
  const meatballs = [];

  let nextMeatballId = 1;
  let catcherTimer = null;
  let girlTimer = null;

  function setTemporaryFrame(img, nextSrc, originalSrc, className, ms, timerSetter) {
    img.src = nextSrc;
    RhythmCommon.restartAnimation(img, className);
    const timer = window.setTimeout(() => {
      img.src = originalSrc;
      img.classList.remove(className);
    }, ms);
    timerSetter(timer);
  }

  function flipGirl() {
    if (girlTimer) clearTimeout(girlTimer);
    setTemporaryFrame(girl, TUNING.girlFlip, TUNING.girlIdle, "flipping", TUNING.girlFlipMs, timer => {
      girlTimer = timer;
    });
  }

  function catchPose() {
    if (catcherTimer) clearTimeout(catcherTimer);
    setTemporaryFrame(catcher, TUNING.catcherCatch, TUNING.catcherIdle, "catching", TUNING.catchSpriteMs, timer => {
      catcherTimer = timer;
    });
  }

  function spawnMeatball(triggerTime) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const startX = width * TUNING.meatballStartXRatio;
    const startY = height * TUNING.meatballStartYRatio;
    const targetX = width * TUNING.meatballCatchXRatio;
    const targetY = height * TUNING.meatballCatchYRatio;
    const travel = TUNING.meatballTravelSeconds;
    const gravity = TUNING.gravityPxPerSecondSquared;
    const vx = (targetX - startX) / travel;
    const vy = (targetY - startY - 0.5 * gravity * travel * travel) / travel;

    const img = document.createElement("img");
    img.className = "meatball";
    img.src = TUNING.meatballImage;
    img.alt = "";
    img.style.setProperty("--meatball-size", `${TUNING.meatballSizePx}px`);
    meatballLayer.appendChild(img);

    meatballs.push({
      id: nextMeatballId++,
      element: img,
      startTime: triggerTime,
      startX,
      startY,
      vx,
      vy,
      gravity,
      caught: false
    });
  }

  function updateMeatballs(time) {
    for (let i = meatballs.length - 1; i >= 0; i -= 1) {
      const meatball = meatballs[i];
      if (meatball.caught) continue;
      const age = Math.max(0, time - meatball.startTime);
      const x = meatball.startX + meatball.vx * age;
      const y = meatball.startY + meatball.vy * age + 0.5 * meatball.gravity * age * age;
      meatball.element.style.left = `${x}px`;
      meatball.element.style.top = `${y}px`;
      meatball.element.style.transform = `translate(-50%, -50%) rotate(${age * 520}deg)`;

      if (y > window.innerHeight + 140 || age > 3.4) {
        meatball.element.remove();
        meatballs.splice(i, 1);
      }
    }
  }

  function catchNearestMeatball() {
    if (meatballs.length === 0) return;
    const catchX = window.innerWidth * TUNING.meatballCatchXRatio;
    let best = null;
    let bestScore = Infinity;

    for (const meatball of meatballs) {
      if (meatball.caught) continue;
      const currentLeft = parseFloat(meatball.element.style.left || meatball.startX);
      const score = Math.abs(currentLeft - catchX);
      if (score < bestScore) {
        bestScore = score;
        best = meatball;
      }
    }

    if (!best) return;
    best.caught = true;
    best.element.classList.add("caught");
    window.setTimeout(() => {
      best.element.remove();
      const index = meatballs.findIndex(item => item.id === best.id);
      if (index >= 0) meatballs.splice(index, 1);
    }, 170);
  }

  function resetLevel() {
    girl.src = TUNING.girlIdle;
    catcher.src = TUNING.catcherIdle;
    meatballs.splice(0).forEach(meatball => meatball.element.remove());
    nextMeatballId = 1;
  }

  const level = new RhythmLevel({
    levelNumber: 1,
    title: "Flipping Meatballs",
    audioUrls: ["song1/song.mp3", "song1/song.wav"],
    noteMidiUrls: ["song1/song.mid", "song1/song.midi"],
    tempo: { bpm: 105 },
    noteOffsetSeconds: TUNING.song1ScoringOffsetSeconds,
    triggers: [
      {
        name: "girl-flip",
        midiUrls: ["song1/flip.mid", "song1/flip.midi"],
        offsetSeconds: TUNING.level1VisualDelaySeconds,
        callback: () => flipGirl()
      },
      {
        name: "meatball-spawn",
        midiUrls: ["song1/meat.mid", "song1/meat.midi"],
        offsetSeconds: TUNING.level1VisualDelaySeconds,
        callback: time => spawnMeatball(time)
      }
    ],
    onReset: resetLevel,
    onUpdate: time => updateMeatballs(time),
    onPress: judgement => {
      catchPose();
      if (judgement.accepted) catchNearestMeatball();
    }
  });

  level.boot();
})();
