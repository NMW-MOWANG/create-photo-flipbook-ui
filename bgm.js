// Background music for every page of the shelf and the books. The track keeps
// its place across page loads, so browsing never restarts it.
const SRC = new URL("assets/audio/gareth-t-colour.mp3", import.meta.url).href;
const POS_KEY = "bgm:position";
const OFF_KEY = "bgm:off";
const VOLUME = 0.45;

if (!window.__bgm) window.__bgm = start();

function start() {
  const resumeAt = Number(sessionStorage.getItem(POS_KEY) || 0);
  const audio = new Audio();
  audio.src = SRC;
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = VOLUME;

  const button = buildToggle();
  let enabled = localStorage.getItem(OFF_KEY) !== "1";
  let primed = false; // running silently, waiting for an interaction to unmute

  const paint = () => {
    button.setAttribute("aria-pressed", String(enabled));
    button.title = enabled ? "关闭背景音乐" : "播放背景音乐";
    button.querySelector(".bgm-off").style.display = enabled ? "none" : "";
    button.querySelector(".bgm-wave").style.display = enabled ? "" : "none";
    button.classList.toggle("is-idle", enabled && (audio.paused || primed));
  };

  const play = (muted) => {
    audio.muted = muted;
    audio.volume = VOLUME;
    const started = audio.play();
    if (!started) return;
    started
      .then(() => {
        primed = muted;
        paint();
      })
      .catch(() => {
        // Blocked: fall back to silent playback so the unmute can happen on the
        // next interaction without losing the spot in the song.
        if (!muted) play(true);
      });
  };

  const audible = () => {
    if (!enabled) return;
    if (audio.paused) {
      play(false);
      return;
    }
    if (primed) {
      audio.muted = false;
      primed = false;
      paint();
      // Some browsers pause a muted element the moment it is unmuted.
      setTimeout(() => {
        if (enabled && audio.paused) play(false);
      }, 150);
    }
  };

  const unlock = () => audible();
  for (const type of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"]) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }

  button.addEventListener("click", () => {
    enabled = !enabled;
    localStorage.setItem(OFF_KEY, enabled ? "0" : "1");
    if (enabled) {
      primed = false;
      audible();
    } else {
      audio.pause();
      audio.muted = false;
    }
    paint();
  });

  audio.addEventListener("play", paint);
  audio.addEventListener("pause", paint);

  if (resumeAt > 0) {
    audio.addEventListener(
      "loadedmetadata",
      () => {
        if (Number.isFinite(audio.duration) && resumeAt < audio.duration - 1) {
          audio.currentTime = resumeAt;
        }
      },
      { once: true }
    );
  }

  paint();
  if (enabled) play(false);

  const save = () => {
    if (audio.currentTime > 0) {
      sessionStorage.setItem(POS_KEY, String(audio.currentTime));
    }
  };
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
  });

  return { audio, button };
}

function buildToggle() {
  const style = document.createElement("style");
  style.textContent = `
    #bgm-toggle {
      position: fixed;
      right: max(16px, env(safe-area-inset-right, 0px));
      bottom: max(16px, env(safe-area-inset-bottom, 0px));
      z-index: 6;
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      padding: 0;
      border-radius: 999px;
      border: 1px solid rgba(198, 154, 92, 0.45);
      background: rgba(255, 250, 246, 0.85);
      color: #8c7568;
      cursor: pointer;
      backdrop-filter: blur(6px);
      transition: color 0.2s, border-color 0.2s, opacity 0.2s;
    }
    #bgm-toggle:hover { color: #4a3a33; border-color: rgba(198, 154, 92, 0.8); }
    #bgm-toggle:focus-visible { outline: 2px solid #c69a5c; outline-offset: 2px; }
    #bgm-toggle.is-idle { opacity: 0.6; }
    #bgm-toggle svg { width: 18px; height: 18px; }
    @media (prefers-reduced-motion: reduce) { #bgm-toggle { transition: none; } }
  `;
  document.head.append(style);

  const button = document.createElement("button");
  button.id = "bgm-toggle";
  button.type = "button";
  button.setAttribute("aria-pressed", "false");
  button.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
      <path class="bgm-wave" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
      <path class="bgm-off" d="M16 9.5l5 5M21 9.5l-5 5" style="display:none" />
    </svg>`;
  document.body.append(button);
  return button;
}
