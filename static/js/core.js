// Shared state, storage, and small UI helpers
let autocompleteIndex = -1;
let autocompleteTimeout = null;
let currentAudioUrl = null;
let currentSearchWord = "";
let currentSearchDraft = "";
let isProgrammaticFocus = false;
let mobileDictionaryIndex = 0;
let currentDictionaryId = "longman";
let mobileSearchFabMoved = false;

const mobileDictionaryIds = ["longman", "cambridge", "oxford"];
const SEARCH_HISTORY_KEY = "searchHistory";
const CURRENT_DICTIONARY_KEY = "currentDictionaryId";
const AUTO_PLAY_KEY = "autoPlay";
const CALIBRATION_MODE_KEY = "dictionaryCalibrationMode";
const DICTIONARY_SCALE_KEY = "dictionaryScale";

window.isMobileLayout = function () {
    return window.matchMedia("(max-width: 900px)").matches;
};

window.isSearchOverlayOpen = function () {
    return document.body.classList.contains("search-overlay-open");
};

window.getQueryParam = function (param) {
    return new URLSearchParams(window.location.search).get(param);
};

window.getOriginalUrlFromProxy = function (proxyUrl, fallbackUrl) {
    try {
        const parsed = new URL(proxyUrl, window.location.origin);
        if (parsed.pathname !== "/proxy") return fallbackUrl || proxyUrl;
        const original = parsed.searchParams.get("url");
        return original ? decodeURIComponent(original) : (fallbackUrl || proxyUrl);
    } catch (_) {
        return fallbackUrl || proxyUrl;
    }
};

window.buildSearchUrl = function (word) {
    return `?word=${encodeURIComponent(word)}&dict=${encodeURIComponent(currentDictionaryId)}`;
};

window.isAutoPlayEnabled = function () {
    return localStorage.getItem(AUTO_PLAY_KEY) === "true";
};

window.isCalibrationModeEnabled = function () {
    return localStorage.getItem(CALIBRATION_MODE_KEY) === "true";
};

window.getDictionaryScaleMap = function () {
    try {
        const value = JSON.parse(localStorage.getItem(DICTIONARY_SCALE_KEY) || "{}");
        return value && typeof value === "object" ? value : {};
    } catch (_) {
        return {};
    }
};

window.getDictionaryScale = function (dictId) {
    const stored = parseFloat(window.getDictionaryScaleMap()[dictId] || "");
    if (Number.isFinite(stored)) return stored;
    return 1;
};

window.setDictionaryScale = function (dictId, value) {
    const safeValue = Math.min(1.25, Math.max(0.85, value));
    const scales = window.getDictionaryScaleMap();
    scales[dictId] = Number(safeValue.toFixed(2));
    localStorage.setItem(DICTIONARY_SCALE_KEY, JSON.stringify(scales));
    return scales[dictId];
};

window.extractHistoryWordFromUrl = function (url) {
    try {
        const parsed = new URL(url, window.location.origin);
        const q = (parsed.searchParams.get("q") || "").trim();
        if (q) return q;

        const segments = parsed.pathname.split("/").filter(Boolean);
        const lastSegment = segments[segments.length - 1] || "";
        if (!lastSegment) return "";

        return decodeURIComponent(lastSegment).replace(/-/g, " ").trim();
    } catch (_) {
        return "";
    }
};

window.loadSearchHistory = function () {
    try {
        const items = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]");
        if (!Array.isArray(items)) return [];
        return items
            .map((word) => (word || "").trim())
            .filter((word) => word.length > 0)
            .slice(0, 10);
    } catch (_) {
        return [];
    }
};

window.saveSearchHistory = function (word) {
    const normalizedWord = (word || "").trim();
    if (!normalizedWord) return;
    const history = window.loadSearchHistory().filter(
        (item) => item.toLowerCase() !== normalizedWord.toLowerCase()
    );
    history.unshift(normalizedWord);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
};

window.updateSearchClearButton = function () {
    const wordInput = document.getElementById("word-input");
    const clearButton = document.getElementById("search-clear-btn");
    if (!wordInput || !clearButton) return;
    const shouldShow = window.isMobileLayout() && wordInput.value.trim().length > 0;
    clearButton.classList.toggle("visible", shouldShow);
};

window.restoreAutocompleteForInput = function (query) {
    const normalizedQuery = (query || "").trim();
    if (autocompleteTimeout) {
        clearTimeout(autocompleteTimeout);
    }
    if (normalizedQuery.length >= 2) {
        window.fetchAutocomplete(normalizedQuery);
        return;
    }
    window.showAutocomplete([]);
};

window.hideSearchHelper = function () {
    const btn = document.getElementById("search-helper");
    if (btn) btn.style.display = "none";
};

window.closeDropdown = function () {
    window.hideSearchHelper();
};
