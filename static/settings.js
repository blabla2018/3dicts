const AUTO_PLAY_KEY = "autoPlay";
const FONT_SCALE_KEY = "dictionaryFontScale";
const FONT_SCALE_PRESETS = [0.9, 0.95, 1, 1.05, 1.1];

function loadScale() {
    const value = parseFloat(localStorage.getItem(FONT_SCALE_KEY) || "1");
    if (!Number.isFinite(value)) return 1;
    return FONT_SCALE_PRESETS.reduce((best, current) => {
        return Math.abs(current - value) < Math.abs(best - value) ? current : best;
    }, FONT_SCALE_PRESETS[2]);
}

function saveScale(value) {
    localStorage.setItem(FONT_SCALE_KEY, String(value));
}

function renderScale(value) {
    const target = document.getElementById("font-scale-value");
    if (target) {
        target.textContent = `${Math.round(value * 100)}%`;
    }
}

function renderAutoplay() {
    const enabled = localStorage.getItem(AUTO_PLAY_KEY) === "true";
    const toggle = document.getElementById("autoplay-toggle");
    if (toggle) {
        toggle.classList.toggle("active", enabled);
    }
}

const autoplayToggle = document.getElementById("autoplay-toggle");
if (autoplayToggle) {
    autoplayToggle.addEventListener("click", function () {
        const next = !(localStorage.getItem(AUTO_PLAY_KEY) === "true");
        localStorage.setItem(AUTO_PLAY_KEY, next ? "true" : "false");
        renderAutoplay();
    });
}

const fontMinus = document.getElementById("font-minus");
if (fontMinus) {
    fontMinus.addEventListener("click", function () {
        const currentIndex = FONT_SCALE_PRESETS.indexOf(loadScale());
        const next = FONT_SCALE_PRESETS[Math.max(0, currentIndex - 1)];
        saveScale(next);
        renderScale(next);
    });
}

const fontPlus = document.getElementById("font-plus");
if (fontPlus) {
    fontPlus.addEventListener("click", function () {
        const currentIndex = FONT_SCALE_PRESETS.indexOf(loadScale());
        const next = FONT_SCALE_PRESETS[Math.min(FONT_SCALE_PRESETS.length - 1, currentIndex + 1)];
        saveScale(next);
        renderScale(next);
    });
}

renderAutoplay();
renderScale(loadScale());
