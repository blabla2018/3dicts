const AUTO_PLAY_KEY = "autoPlay";
const CALIBRATION_MODE_KEY = "dictionaryCalibrationMode";
const DICTIONARY_SCALE_KEY = "dictionaryScale";
const DICTIONARY_IDS = ["longman", "cambridge", "oxford"];

function loadDictionaryScaleMap() {
    try {
        const value = JSON.parse(localStorage.getItem(DICTIONARY_SCALE_KEY) || "{}");
        return value && typeof value === "object" ? value : {};
    } catch (_) {
        return {};
    }
}

function loadDictionaryScale(dictId) {
    const stored = parseFloat(loadDictionaryScaleMap()[dictId] || "");
    if (Number.isFinite(stored)) return stored;
    return 1;
}

function saveDictionaryScale(dictId, value) {
    const safeValue = Math.min(1.25, Math.max(0.85, value));
    const scales = loadDictionaryScaleMap();
    scales[dictId] = Number(safeValue.toFixed(2));
    localStorage.setItem(DICTIONARY_SCALE_KEY, JSON.stringify(scales));
    return scales[dictId];
}

function renderDictionaryScale(dictId) {
    const target = document.getElementById(`${dictId}-scale-value`);
    if (target) {
        target.textContent = `${Math.round(loadDictionaryScale(dictId) * 100)}%`;
    }
}

function renderAutoplay() {
    const enabled = localStorage.getItem(AUTO_PLAY_KEY) === "true";
    const toggle = document.getElementById("autoplay-toggle");
    if (toggle) {
        toggle.classList.toggle("active", enabled);
    }
}

function renderCalibrationMode() {
    const enabled = localStorage.getItem(CALIBRATION_MODE_KEY) === "true";
    const toggle = document.getElementById("calibration-toggle");
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

const calibrationToggle = document.getElementById("calibration-toggle");
if (calibrationToggle) {
    calibrationToggle.addEventListener("click", function () {
        const next = !(localStorage.getItem(CALIBRATION_MODE_KEY) === "true");
        localStorage.setItem(CALIBRATION_MODE_KEY, next ? "true" : "false");
        renderCalibrationMode();
    });
}

DICTIONARY_IDS.forEach((dictId) => {
    const minus = document.getElementById(`${dictId}-scale-minus`);
    const plus = document.getElementById(`${dictId}-scale-plus`);

    if (minus) {
        minus.addEventListener("click", function () {
            saveDictionaryScale(dictId, loadDictionaryScale(dictId) - 0.01);
            renderDictionaryScale(dictId);
        });
    }

    if (plus) {
        plus.addEventListener("click", function () {
            saveDictionaryScale(dictId, loadDictionaryScale(dictId) + 0.01);
            renderDictionaryScale(dictId);
        });
    }

    renderDictionaryScale(dictId);
});

renderAutoplay();
renderCalibrationMode();
