(function () {
  "use strict";


  function hasThreeStarsOnAllLevels(progress) {
    for (let level = 1; level <= RhythmCommon.LEVEL_COUNT; level += 1) {
      if ((progress.levels[level]?.bestStars || 0) < 3) return false;
    }
    return true;
  }

  function renderDownloadButtons(progress) {
    const songsButton = document.getElementById("songsDownloadButton");
    if (!songsButton) return;

    const unlocked = hasThreeStarsOnAllLevels(progress);
    songsButton.classList.toggle("is-disabled", !unlocked);
    songsButton.setAttribute("aria-disabled", unlocked ? "false" : "true");
    songsButton.tabIndex = unlocked ? 0 : -1;
    songsButton.textContent = unlocked ? "Songs" : "Songs 🔒";
    songsButton.title = unlocked ? "Download the songs" : "Three-star every level to unlock Songs";
  }

  const LEVEL_NAMES = {
    1: "Makin' Meatballs",
    2: "Fluid MeCATnics",
    3: "RoboSubbing",
    4: "Mayflower Memories"
  };

  function renderMenu() {
    const progress = RhythmCommon.loadProgress();
    renderDownloadButtons(progress);
    const container = document.getElementById("levelButtons");
    container.innerHTML = "";

    for (let level = 1; level <= RhythmCommon.LEVEL_COUNT; level += 1) {
      const best = progress.levels[level];
      const unlocked = level <= progress.unlocked;
      const button = document.createElement("button");
      button.className = "level-button";
      button.disabled = !unlocked;
      button.type = "button";
      button.innerHTML = `
        <span class="level-button-title">Level ${level}<br>${LEVEL_NAMES[level]}</span>
        <span class="level-button-stars" aria-label="${best.bestStars} out of 3 stars">${RhythmCommon.starsText(best.bestStars)}</span>
        <span class="level-button-lock">${unlocked ? `${Math.round(best.bestPercent * 100)}% best` : "Locked"}</span>
      `;
      if (unlocked) {
        button.addEventListener("click", () => RhythmCommon.goWithWhiteFade(`level${level}.html`));
      }
      container.appendChild(button);
    }
  }


  document.getElementById("songsDownloadButton")?.addEventListener("click", event => {
    const progress = RhythmCommon.loadProgress();
    if (!hasThreeStarsOnAllLevels(progress)) {
      event.preventDefault();
      window.alert("Songs unlock after you get 3 stars on all four levels.");
    }
  });

  document.getElementById("resetProgress")?.addEventListener("click", () => {
    const ok = window.confirm("Reset all saved stars and unlocked levels on this browser?");
    if (!ok) return;
    RhythmCommon.resetProgress();
    renderMenu();
  });

  renderMenu();
})();
