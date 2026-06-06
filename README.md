# Rhythm Heaveleni

Static rhythm game site built from the provided specification.

## Folder layout

Put these files at the same root level as your existing asset folders:

```text
index.html
level1.html
level2.html
level3.html
level4.html
css/
js/
song1/
song2/
song3/
song4/
```

Each `songX` folder should contain the images, MIDI files, and audio files used by that level. Keep both `.mp3` and `.wav` if you want, but this online-ready build tries `.mp3` first and uses `.wav` only as a fallback. This makes hosting faster and avoids transferring very large WAV files whenever possible.

## Local testing

Run this from the root folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

Do not open the HTML files directly through `file://`; browsers often block MIDI/audio loading through `fetch` when opened that way.

## About the `BrokenPipeError` in Python's local server

A log like this is usually harmless:

```text
BrokenPipeError: [Errno 32] Broken pipe
```

It means the browser stopped downloading a file before Python finished sending it. This often happens with large audio files, page refreshes, navigation, or the browser deciding it has enough streamed audio. It is not a JavaScript crash and it is not something players see online.

This build reduces the chance of that local-server warning by loading `.mp3` before `.wav` and by loading only audio metadata before the player presses Start.


## Download buttons

The main menu has two top-corner download buttons:

```text
Rhythm Demos -> downloads demos.zip
Songs        -> downloads songs.zip after all 4 levels have 3 stars
```

Browsers cannot download a raw folder directly from a static site, so the downloadable folders need to be zipped before deployment. Put these two archives next to `index.html`:

```text
demos.zip
songs.zip
```

Each archive should contain a top-level folder with the matching name:

```text
demos.zip
└── demos/
    ├── level1-demo.mp3
    ├── level1-demo.wav
    └── ...

songs.zip
└── songs/
    ├── song1.mp3
    ├── song1.wav
    └── ...
```

From the project root, you can create them with:

```bash
zip -r demos.zip demos
zip -r songs.zip songs
```

The `Songs` button is locked by browser-saved progress until the player has earned 3 stars on all four levels.

## Progress saving

Progress is saved automatically in the player's own browser. The game writes to `localStorage` and also mirrors the same progress to a cookie as a fallback. This means anyone who plays the hosted site can keep their unlocked levels and high scores on the same browser/device.

This is still a static site. Cross-device accounts, shared leaderboards, or progress that follows a player between phones/computers requires a backend such as Firebase, Supabase, or your own server.

## Deploying online

The easiest options are Netlify, Vercel, or GitHub Pages.

For Netlify: drag the whole project folder into Netlify Drop, including `index.html`, `css`, `js`, and the `song1`–`song4` folders.

For Vercel: create a new project and choose this folder as a static site. No build command is needed.

For GitHub Pages: push this folder to a GitHub repository, enable Pages, and serve from the repository root. The included `.nojekyll` file prevents GitHub Pages from processing the folder as a Jekyll site.

## Scoring windows

The timing windows are in `js/level-core.js`:

```js
perfect: 0.085 seconds
great:   0.155 seconds
ok:      0.255 seconds
bad:     0.360 seconds
```

A press within the bad window gives visible Bad feedback but gives 0 points. Okay-or-better presses score and claim the note.

Stars are level-independent ratios:

```text
3 stars: at least 82%
2 stars: at least 62%
1 star:  at least 35%
0 stars: below 35%
```

Getting 2 or 3 stars unlocks the next level.

## Easy tuning spots

Level 1 meatball coordinates are at the top of `js/level1.js` inside `TUNING`. CSS sprite positions are in `css/styles.css` under the `:root` variables beginning with `--l1-`.

Level 3 sprite positions are in `css/styles.css` under the `--l3-` variables.

Level 4 photo size is in `css/styles.css` under `--l4-photo-width`, though the current build makes the photo frame full-screen with `width: 100vw; height: 100vh; object-fit: cover;`.

## MIDI expectations

The MIDI parser reads note-on events and deduplicates chords/tightly stacked notes into one target press. It supports normal PPQ/tick-based MIDI files. If a MIDI file exported with SMPTE timing fails, re-export it using PPQ/ticks.

Each level first tries `.mid`, then `.midi` for safety.

## Timing notes

The shared rhythm engine uses one song clock for both judging player input and firing MIDI-triggered animations. That clock is anchored to the audio element's `currentTime`, so gameplay MIDI and trigger MIDI are measured from the same start point as the song.

Configured tempos:

- Level 1: 105 BPM.
- Level 2: 130 BPM until measure 25; linear ramp from 130 to 180 from measures 25 to 33; 180 BPM until measure 49; linear ramp from 180 to 230 from measures 49 to 57; 230 BPM through the end around measure 89.
- Level 3: 100 BPM.
- Level 4: 130 BPM.

The tempo map is in `js/level2.js`. Constant-BPM levels set `tempo: { bpm: ... }` in their level files. MIDI scheduling is still locked to `audio.currentTime`; the tempo data is only used to translate MIDI note positions into seconds.
