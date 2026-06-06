(function () {
  "use strict";

  // Timing windows, in seconds. These are intentionally forgiving because
  // this is a birthday game, not an arcade cabinet. Tune here if needed.
  const WINDOWS = {
    perfect: 0.085,
    great: 0.155,
    ok: 0.255,
    bad: 0.360
  };

  // Global calibration, in seconds. Keep at 0 unless your exported audio itself
  // contains a consistent offset relative to the MIDI. Positive values make notes
  // happen later; negative values make notes happen earlier.
  const DEFAULT_TIMING_OFFSET_SECONDS = 0;

  const POINTS = {
    perfect: 3,
    great: 2,
    ok: 1,
    bad: 0
  };

  const LABELS = {
    perfect: "Perfect",
    great: "Good",
    ok: "Okay",
    bad: "Bad"
  };

  function makeAudio(candidates) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = "metadata";
      audio.playsInline = true;
      let index = 0;
      const errors = [];

      function cleanup() {
        audio.removeEventListener("loadedmetadata", onLoaded);
        audio.removeEventListener("error", onError);
      }

      function onLoaded() {
        cleanup();
        resolve(audio);
      }

      function onError() {
        errors.push(candidates[index]);
        index += 1;
        if (index >= candidates.length) {
          cleanup();
          reject(new Error(`Could not load any audio file: ${errors.join(", ")}`));
          return;
        }
        audio.src = candidates[index];
        audio.load();
      }

      audio.addEventListener("loadedmetadata", onLoaded);
      audio.addEventListener("error", onError);
      audio.src = candidates[index];
      audio.load();
    });
  }

  class RhythmLevel {
    constructor(config) {
      this.config = config;
      this.levelNumber = config.levelNumber;
      this.title = config.title;
      this.hitTimes = [];
      this.hitStates = [];
      this.triggers = [];
      this.audio = null;
      this.running = false;
      this.finished = false;
      this.loading = false;
      this.loadPromise = null;
      this.points = 0;
      this.pressCount = 0;
      this.claimedCount = 0;
      this.lastRaf = 0;
      this.songStartPerfSeconds = null;
      this.timingOffsetSeconds = config.timingOffsetSeconds ?? DEFAULT_TIMING_OFFSET_SECONDS;
      // Shifts only the scoring notes loaded from song.mid/song.midi.
      // This is intentionally separate from timingOffsetSeconds, which affects
      // the shared audio clock used by visual triggers. Use this when one
      // scoring MIDI export is offset but the visual MIDI files are correct.
      this.noteOffsetSeconds = config.noteOffsetSeconds ?? 0;

      this.elements = {
        startOverlay: document.getElementById("startOverlay"),
        startButton: document.getElementById("startButton"),
        whiteFade: document.getElementById("whiteFade"),
        countdown: document.getElementById("countdown"),
        judgement: document.getElementById("judgement"),
        liveScore: document.getElementById("liveScore"),
        resultsOverlay: document.getElementById("resultsOverlay")
      };
    }

    boot() {
      // Level pages intentionally load with a white cover so the transition from
      // the menu feels smooth. Remove it after the browser paints once; otherwise
      // the start screen is hidden behind a permanent white page.
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          this.elements.whiteFade?.classList.remove("visible");
        }, 80);
      });

      this.elements.startButton?.addEventListener("click", () => this.start());
      window.addEventListener("keydown", event => {
        if (event.code !== "Space" || event.repeat) return;
        event.preventDefault();
        this.handleSpacePress(event);
      });

      // Start loading immediately so the Start button can become the actual sync
      // point rather than also being a loading button.
      this.loadAssets().catch(error => {
        console.error(error);
        this.setStartButton("Could not load files. See console.");
        const p = this.elements.startOverlay?.querySelector("p");
        if (p) p.textContent = error.message;
      });
    }

    async loadAssets() {
      if (this.audio && this.hitTimes.length > 0) return;
      if (this.loadPromise) return this.loadPromise;

      this.loading = true;
      this.setStartButton("Loading...");

      this.loadPromise = (async () => {
        const midiOptions = { tempo: this.config.tempo };
        const notesPromise = RhythmMidi.loadMidiTimesFromCandidates(this.config.noteMidiUrls, midiOptions);
        const audioPromise = makeAudio(this.config.audioUrls);
        const triggerPromises = (this.config.triggers || []).map(async trigger => {
          const triggerMidiOptions = { tempo: trigger.tempo || this.config.tempo };
          const rawTimes = await RhythmMidi.loadMidiTimesFromCandidates(trigger.midiUrls, triggerMidiOptions);
          const offset = trigger.offsetSeconds ?? 0;
          return {
            name: trigger.name,
            times: rawTimes.map(time => time + offset),
            rawTimes,
            offsetSeconds: offset,
            nextIndex: 0,
            callback: trigger.callback
          };
        });

        const [hitTimes, audio, triggers] = await Promise.all([notesPromise, audioPromise, Promise.all(triggerPromises)]);
        this.hitTimes = hitTimes
          .map(time => time + this.noteOffsetSeconds)
          .filter(time => time >= -0.001)
          .map(time => Math.max(0, time));
        this.hitStates = this.hitTimes.map(() => ({ claimed: false, judgement: null }));
        this.audio = audio;
        this.triggers = triggers;
        this.audio.addEventListener("ended", () => this.finish());
        this.updateLiveScore();
        this.setStartButton("Start level");
      })();

      try {
        await this.loadPromise;
      } finally {
        this.loading = false;
      }
    }

    setStartButton(text) {
      if (this.elements.startButton) this.elements.startButton.textContent = text;
    }

    async start() {
      if (this.running) return;
      try {
        await this.loadAssets();
      } catch (error) {
        console.error(error);
        this.setStartButton("Could not load files. See console.");
        const p = this.elements.startOverlay?.querySelector("p");
        if (p) p.textContent = error.message;
        return;
      }

      this.resetRunState();
      this.elements.startOverlay?.classList.add("hidden");
      this.elements.whiteFade?.classList.remove("visible");

      if (typeof this.config.beforeSongStart === "function") {
        await this.config.beforeSongStart(this);
      }

      try {
        await this.playAudio();
      } catch (error) {
        this.running = false;
        this.finished = false;
        return;
      }

      // From this point on, audio.currentTime is the source of truth. Every MIDI
      // hit and visual trigger is compared against the same audio clock, so there
      // is no countdown/page-load delay involved in synchronization.
      this.songStartPerfSeconds = performance.now() / 1000 - this.audio.currentTime;
      this.running = true;
      this.finished = false;
      this.lastRaf = performance.now();

      if (typeof this.config.onSongStart === "function") this.config.onSongStart(this);
      requestAnimationFrame(now => this.loop(now));
    }

    resetRunState() {
      this.points = 0;
      this.pressCount = 0;
      this.claimedCount = 0;
      this.finished = false;
      this.running = false;
      this.hitStates = this.hitTimes.map(() => ({ claimed: false, judgement: null }));
      for (const trigger of this.triggers) trigger.nextIndex = 0;
      this.songStartPerfSeconds = null;
      if (this.audio) this.audio.currentTime = 0;
      this.updateLiveScore();
      if (typeof this.config.onReset === "function") this.config.onReset(this);
    }

    async showCountdown() {
      for (const text of ["3", "2", "1"]) {
        RhythmCommon.flashText(this.elements.countdown, text, "show");
        await RhythmCommon.wait(700);
      }
      RhythmCommon.flashText(this.elements.countdown, "Go", "show");
      await RhythmCommon.wait(520);
    }

    async playAudio() {
      try {
        await this.audio.play();
      } catch (error) {
        console.warn("Audio play was blocked until another click/keypress.", error);
        this.elements.startOverlay?.classList.remove("hidden");
        const p = this.elements.startOverlay?.querySelector("p");
        if (p) p.textContent = "Your browser blocked autoplay. Click Start once more.";
        throw error;
      }
    }

    songTimeFromNow() {
      if (!this.audio) return 0;
      return this.audio.currentTime + this.timingOffsetSeconds;
    }

    songTimeFromEvent(event) {
      if (!this.audio) return 0;
      const nowSeconds = performance.now() / 1000;
      let stampSeconds = event && typeof event.timeStamp === "number" ? event.timeStamp / 1000 : nowSeconds;
      // Some browsers/extensions expose epoch-based event timestamps. In that
      // case, fall back to the current handler time.
      if (Math.abs(stampSeconds - nowSeconds) > 60 * 60) stampSeconds = nowSeconds;
      const eventDelaySeconds = Math.max(0, nowSeconds - stampSeconds);
      return Math.max(0, this.audio.currentTime - eventDelaySeconds) + this.timingOffsetSeconds;
    }

    loop(now) {
      if (!this.running || this.finished) return;
      const dt = (now - this.lastRaf) / 1000;
      this.lastRaf = now;
      const time = this.songTimeFromNow();

      for (const trigger of this.triggers) {
        while (trigger.nextIndex < trigger.times.length && time >= trigger.times[trigger.nextIndex] - 0.006) {
          trigger.callback(trigger.times[trigger.nextIndex], trigger.nextIndex, this);
          trigger.nextIndex += 1;
        }
      }

      this.markLateMisses(time);
      if (typeof this.config.onUpdate === "function") this.config.onUpdate(time, dt, this);
      requestAnimationFrame(next => this.loop(next));
    }

    markLateMisses(time) {
      for (let i = 0; i < this.hitTimes.length; i += 1) {
        if (!this.hitStates[i].claimed && time > this.hitTimes[i] + WINDOWS.bad) {
          this.hitStates[i].claimed = true;
          this.hitStates[i].judgement = "miss";
        }
      }
    }

    handleSpacePress(event) {
      if (!this.running || this.finished || !this.audio) return;
      const time = this.songTimeFromEvent(event);
      const judgement = this.judgePress(time);
      this.pressCount += 1;
      this.points += judgement.points;
      this.claimedCount += judgement.claimed ? 1 : 0;
      this.updateLiveScore();
      const judgementEl = this.elements.judgement;
      if (judgementEl) {
        judgementEl.classList.remove("judgement-perfect", "judgement-great", "judgement-ok", "judgement-bad");
        judgementEl.classList.add(`judgement-${judgement.name}`);
      }
      RhythmCommon.flashText(judgementEl, LABELS[judgement.name], "show");
      if (typeof this.config.onPress === "function") this.config.onPress(judgement, this);
    }

    nearestHitIndex(time) {
      const times = this.hitTimes;
      if (times.length === 0) return -1;

      let lo = 0;
      let hi = times.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] < time) lo = mid + 1;
        else hi = mid;
      }

      if (lo === 0) return 0;
      if (lo >= times.length) return times.length - 1;

      const before = lo - 1;
      const after = lo;
      return Math.abs(time - times[before]) <= Math.abs(time - times[after]) ? before : after;
    }

    judgePress(time) {
      // Critical rule: every spacebar press is judged against the nearest
      // timestamp in song.mid after MIDI ticks have been converted through the
      // level's BPM/tempo map. We do not skip over already-missed or already-hit
      // notes when deciding the judgement label; this makes the feedback a pure
      // distance-to-nearest-note calculation.
      const bestIndex = this.nearestHitIndex(time);
      const noteTime = bestIndex >= 0 ? this.hitTimes[bestIndex] : null;
      const bestDiff = noteTime === null ? Infinity : Math.abs(time - noteTime);

      if (bestIndex === -1 || bestDiff > WINDOWS.bad) {
        return {
          name: "bad",
          points: 0,
          diff: bestDiff,
          noteIndex: bestIndex,
          noteTime,
          claimed: false,
          accepted: false,
          duplicate: false,
          time
        };
      }

      let name = "bad";
      if (bestDiff <= WINDOWS.perfect) name = "perfect";
      else if (bestDiff <= WINDOWS.great) name = "great";
      else if (bestDiff <= WINDOWS.ok) name = "ok";

      const acceptedByTiming = name !== "bad";
      const state = this.hitStates[bestIndex];
      const alreadyScored = state.claimed && state.judgement !== "miss";
      const shouldClaim = acceptedByTiming && !alreadyScored;

      // Bad presses do not consume the note. This prevents an early accidental
      // tap from blocking a later Ok/Great/Perfect hit on the same cue.
      if (shouldClaim) {
        state.claimed = true;
        state.judgement = name;
      }

      return {
        name,
        points: shouldClaim ? POINTS[name] : 0,
        diff: bestDiff,
        noteIndex: bestIndex,
        noteTime,
        claimed: shouldClaim,
        accepted: shouldClaim,
        duplicate: acceptedByTiming && alreadyScored,
        time
      };
    }

    updateLiveScore() {
      const total = Math.max(1, this.hitTimes.length * 3);
      const percent = Math.round((this.points / total) * 100);
      if (this.elements.liveScore) this.elements.liveScore.textContent = `${percent}%`;
    }

    finish() {
      if (this.finished) return;
      this.finished = true;
      this.running = false;
      this.elements.whiteFade?.classList.add("visible");
      if (typeof this.config.onFinish === "function") this.config.onFinish(this);
      window.setTimeout(() => this.showResults(), 560);
    }

    showResults() {
      const totalPossible = Math.max(1, this.hitTimes.length * 3);
      const percent = Math.max(0, Math.min(1, this.points / totalPossible));
      const stars = RhythmCommon.computeStars(percent);
      const stored = RhythmCommon.recordLevelResult(this.levelNumber, {
        percent,
        stars,
        points: this.points
      });
      const missed = this.hitTimes.filter((_, i) => !this.hitStates[i].claimed || this.hitStates[i].judgement === "miss").length;

      const messages = {
        0: "Yikes... better luck next time...",
        1: "Not bad. The rhythm goblin is waking up.",
        2: "You crushed it! The next level is yours.",
        3: "Perfectly Heaveleni. No crumbs left."
      };

      this.elements.resultsOverlay.innerHTML = `
        <article class="results-card">
          <h1 class="results-title">${this.title}</h1>
          <div class="results-stars" aria-label="${stars} out of 3 stars">${RhythmCommon.starsText(stars)}</div>
          <p class="results-message">${messages[stars]}</p>
          <p class="results-detail">Score: ${Math.round(percent * 100)}% · Points: ${this.points}/${totalPossible} · Missed notes: ${missed}</p>
          ${stored.isHighScore ? `<p class="results-highscore">New high score saved on this browser.</p>` : ""}
          <a class="results-button" href="index.html">Back to main menu</a>
        </article>
      `;
      this.elements.resultsOverlay.classList.add("active");
    }
  }

  window.RhythmLevel = RhythmLevel;
  window.RhythmWindows = WINDOWS;
})();
