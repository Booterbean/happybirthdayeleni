(function () {
  "use strict";

  const STORAGE_KEY = "rhythm-heaveleni-progress-v1";
  const LEVEL_COUNT = 4;
  const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

  const DEFAULT_PROGRESS = {
    unlocked: 1,
    levels: {
      1: { bestStars: 0, bestPercent: 0, bestPoints: 0 },
      2: { bestStars: 0, bestPercent: 0, bestPoints: 0 },
      3: { bestStars: 0, bestPercent: 0, bestPoints: 0 },
      4: { bestStars: 0, bestPercent: 0, bestPoints: 0 }
    }
  };

  function cloneDefaultProgress() {
    return JSON.parse(JSON.stringify(DEFAULT_PROGRESS));
  }

  function readCookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const parts = document.cookie ? document.cookie.split("; ") : [];
    for (const part of parts) {
      if (part.startsWith(prefix)) {
        return decodeURIComponent(part.slice(prefix.length));
      }
    }
    return null;
  }

  function writeCookie(name, value) {
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; max-age=${COOKIE_MAX_AGE_SECONDS}; path=/; SameSite=Lax`;
  }

  function readStoredProgressRaw() {
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (raw) return raw;
    } catch (error) {
      console.warn("localStorage could not be read; trying cookie progress instead.", error);
    }
    return readCookie(STORAGE_KEY);
  }

  function writeStoredProgressRaw(raw) {
    let savedSomewhere = false;

    try {
      window.localStorage?.setItem(STORAGE_KEY, raw);
      savedSomewhere = true;
    } catch (error) {
      console.warn("localStorage could not be written; trying cookie progress instead.", error);
    }

    try {
      writeCookie(STORAGE_KEY, raw);
      savedSomewhere = true;
    } catch (error) {
      console.warn("Cookie progress could not be written.", error);
    }

    if (!savedSomewhere) {
      console.warn("Progress could not be saved in this browser.");
    }
  }

  function normalizeProgress(parsed) {
    const merged = cloneDefaultProgress();
    merged.unlocked = Math.max(1, Math.min(LEVEL_COUNT, Number(parsed?.unlocked) || 1));
    for (let i = 1; i <= LEVEL_COUNT; i += 1) {
      merged.levels[i] = Object.assign(merged.levels[i], parsed?.levels?.[i] || {});
      merged.levels[i].bestStars = Math.max(0, Math.min(3, Number(merged.levels[i].bestStars) || 0));
      merged.levels[i].bestPercent = Math.max(0, Math.min(1, Number(merged.levels[i].bestPercent) || 0));
      merged.levels[i].bestPoints = Math.max(0, Number(merged.levels[i].bestPoints) || 0);
    }
    return merged;
  }

  function loadProgress() {
    try {
      const raw = readStoredProgressRaw();
      return normalizeProgress(raw ? JSON.parse(raw) : cloneDefaultProgress());
    } catch (error) {
      console.warn("Progress could not be loaded. Resetting progress.", error);
      return cloneDefaultProgress();
    }
  }

  function saveProgress(progress) {
    writeStoredProgressRaw(JSON.stringify(normalizeProgress(progress)));
  }

  function resetProgress() {
    saveProgress(cloneDefaultProgress());
  }

  function starsText(stars) {
    const full = "★".repeat(stars);
    const empty = "☆".repeat(3 - stars);
    return full + empty;
  }

  function computeStars(percent) {
    if (percent >= 0.82) return 3;
    if (percent >= 0.62) return 2;
    if (percent >= 0.35) return 1;
    return 0;
  }

  function recordLevelResult(levelNumber, result) {
    const progress = loadProgress();
    const current = progress.levels[levelNumber] || { bestStars: 0, bestPercent: 0, bestPoints: 0 };
    const isHighScore = result.percent > current.bestPercent || result.stars > current.bestStars;

    if (isHighScore) {
      progress.levels[levelNumber] = {
        bestStars: result.stars,
        bestPercent: result.percent,
        bestPoints: result.points
      };
    }

    if (result.stars >= 2 && levelNumber < LEVEL_COUNT) {
      progress.unlocked = Math.max(progress.unlocked, levelNumber + 1);
    }

    saveProgress(progress);
    return { progress, isHighScore };
  }

  function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  function restartAnimation(element, className) {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  function flashText(element, text, className = "show") {
    if (!element) return;
    element.textContent = text;
    restartAnimation(element, className);
  }

  function goWithWhiteFade(url) {
    const transition = document.getElementById("pageTransition");
    if (transition) transition.classList.add("active");
    window.setTimeout(() => {
      window.location.href = url;
    }, 520);
  }

  window.RhythmCommon = {
    LEVEL_COUNT,
    STORAGE_KEY,
    loadProgress,
    saveProgress,
    resetProgress,
    recordLevelResult,
    computeStars,
    starsText,
    wait,
    restartAnimation,
    flashText,
    goWithWhiteFade
  };
})();
