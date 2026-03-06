let isAutoPlayEnabled = localStorage.getItem("autoPlay") !== "false";
let autocompleteIndex = -1;
let autocompleteTimeout = null;
let currentAudioUrl = null;
let currentSearchWord = "";
let isProgrammaticFocus = false;
let mobileDictionaryIndex = 0;
let currentDictionaryId = "longman";

const mobileDictionaryIds = ["longman", "cambridge", "oxford"];
const searchHistory = Array.isArray(window.SEARCH_HISTORY) ? window.SEARCH_HISTORY : [];

const ICON_ON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
const ICON_OFF = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-3.04-7.86-7.11-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;

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

window.updateAutoPlayIcon = function () {
    const btn = document.getElementById("audio-toggle-btn");
    if (!btn) return;
    btn.style.opacity = isAutoPlayEnabled ? "1" : "0.7";
    btn.innerHTML = isAutoPlayEnabled ? ICON_ON : ICON_OFF;
    btn.title = isAutoPlayEnabled ? "Auto-Play: ON (Click to mute)" : "Auto-Play: OFF (Click to enable)";
};

window.toggleAutoPlay = function () {
    isAutoPlayEnabled = !isAutoPlayEnabled;
    localStorage.setItem("autoPlay", isAutoPlayEnabled);
    window.updateAutoPlayIcon();
};

window.hideSearchHelper = function () {
    const btn = document.getElementById("search-helper");
    if (btn) btn.style.display = "none";
};

window.closeDropdown = function () {
    window.hideSearchHelper();
};

window.openSearchOverlay = function (options = {}) {
    if (!window.isMobileLayout()) return;

    const wordInput = document.getElementById("word-input");
    if (!wordInput) return;

    const clear = options.clear !== false;
    document.body.classList.add("search-overlay-open");

    if (clear) {
        wordInput.value = "";
    } else {
        wordInput.value = currentSearchWord;
    }

    isProgrammaticFocus = true;
    setTimeout(() => {
        try {
            wordInput.focus({ preventScroll: true });
        } catch (_) {
            wordInput.focus();
        }
        isProgrammaticFocus = false;
        window.showAutocomplete([], wordInput.value.trim());
    }, 0);
};

window.closeSearchOverlay = function () {
    if (!window.isMobileLayout()) return;

    const wordInput = document.getElementById("word-input");
    document.body.classList.remove("search-overlay-open");
    window.hideAutocomplete();
    if (wordInput) {
        wordInput.value = currentSearchWord;
        wordInput.blur();
    }
};

window.setupSearchOverlayGestures = function () {
    const searchContainer = document.querySelector(".search-container");
    if (!searchContainer || searchContainer.dataset.touchBound === "1") return;
    searchContainer.dataset.touchBound = "1";

    let startX = 0;
    let startY = 0;

    searchContainer.addEventListener("touchstart", function (event) {
        if (!window.isMobileLayout() || !window.isSearchOverlayOpen()) return;
        if (!event.touches || event.touches.length !== 1) return;
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
    }, { passive: true });

    searchContainer.addEventListener("touchend", function (event) {
        if (!window.isMobileLayout() || !window.isSearchOverlayOpen()) return;
        if (!event.changedTouches || event.changedTouches.length !== 1) return;
        const endX = event.changedTouches[0].clientX;
        const endY = event.changedTouches[0].clientY;
        const dx = endX - startX;
        const dy = endY - startY;
        if (dy < -50 && Math.abs(dy) > Math.abs(dx) * 1.2) {
            window.closeSearchOverlay();
        }
    }, { passive: true });
};

window.fetchAutocomplete = async function (query) {
    if (!query || query.length < 2) {
        window.showAutocomplete([], query);
        return;
    }

    try {
        const response = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            window.showAutocomplete([], query);
            return;
        }
        const suggestions = await response.json();
        window.showAutocomplete(suggestions, query);
    } catch (error) {
        console.error("Autocomplete error:", error);
        window.showAutocomplete([], query);
    }
};

window.showAutocomplete = function (suggestions, query = "") {
    const dropdown = document.getElementById("autocomplete-dropdown");
    if (!dropdown) return;

    dropdown.innerHTML = "";
    autocompleteIndex = -1;

    const normalizedSuggestions = suggestions
        .map((word) => (word || "").trim())
        .filter((word) => word.length > 0);

    const seen = new Set();
    const uniqueSuggestions = normalizedSuggestions.filter((word) => {
        const key = word.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const historyItems = searchHistory
        .map((word) => (word || "").trim())
        .filter((word) => word.length > 0)
        .filter((word) => !seen.has(word.toLowerCase()))
        .slice(0, 10);

    const addSection = (title) => {
        const section = document.createElement("div");
        section.className = "autocomplete-section";
        section.textContent = title;
        dropdown.appendChild(section);
    };

    const addItem = (word) => {
        const item = document.createElement("div");
        item.className = "autocomplete-item";
        item.textContent = word;
        item.dataset.index = String(dropdown.querySelectorAll(".autocomplete-item").length);
        item.addEventListener("click", () => window.selectAutocomplete(word));
        dropdown.appendChild(item);
    };

    if (uniqueSuggestions.length > 0) {
        addSection("Suggestions");
        uniqueSuggestions.forEach(addItem);
    }

    if (historyItems.length > 0) {
        addSection("Recent");
        historyItems.forEach(addItem);
    }

    if (dropdown.querySelectorAll(".autocomplete-item").length === 0) {
        dropdown.classList.remove("show");
        return;
    }

    dropdown.classList.add("show");
};

window.hideAutocomplete = function () {
    const dropdown = document.getElementById("autocomplete-dropdown");
    if (!dropdown) return;
    dropdown.classList.remove("show");
    dropdown.innerHTML = "";
    autocompleteIndex = -1;
};

window.navigateAutocomplete = function (direction) {
    const dropdown = document.getElementById("autocomplete-dropdown");
    if (!dropdown || !dropdown.classList.contains("show")) return;

    const items = dropdown.querySelectorAll(".autocomplete-item");
    if (items.length === 0) return;

    if (autocompleteIndex >= 0 && autocompleteIndex < items.length) {
        items[autocompleteIndex].classList.remove("selected");
    }

    autocompleteIndex += direction;
    if (autocompleteIndex < 0) autocompleteIndex = items.length - 1;
    if (autocompleteIndex >= items.length) autocompleteIndex = 0;

    items[autocompleteIndex].classList.add("selected");
    items[autocompleteIndex].scrollIntoView({ block: "nearest" });

    const input = document.getElementById("word-input");
    if (input) {
        input.value = items[autocompleteIndex].textContent;
    }
};

window.selectAutocomplete = function (word) {
    const input = document.getElementById("word-input");
    const form = document.querySelector(".search-form");
    if (!input || !form) return;

    input.value = word;
    currentSearchWord = word;
    window.hideAutocomplete();
    form.submit();
};

window.handleAutocompleteKeydown = function (event) {
    const dropdown = document.getElementById("autocomplete-dropdown");
    const isAutocompleteOpen = dropdown && dropdown.classList.contains("show");
    if (!isAutocompleteOpen) return false;

    if (event.key === "ArrowDown") {
        event.preventDefault();
        window.navigateAutocomplete(1);
        return true;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        window.navigateAutocomplete(-1);
        return true;
    }

    if (event.key === "Enter" && autocompleteIndex >= 0) {
        event.preventDefault();
        const items = dropdown.querySelectorAll(".autocomplete-item");
        if (items[autocompleteIndex]) {
            window.selectAutocomplete(items[autocompleteIndex].textContent);
        }
        return true;
    }

    if (event.key === "Escape") {
        event.preventDefault();
        window.hideAutocomplete();
        return true;
    }

    return false;
};

window.handleGlobalKeydown = function (event) {
    const activeElement = document.activeElement;
    const activeTag = activeElement && activeElement.tagName ? activeElement.tagName : "";

    if (activeTag === "INPUT" || activeTag === "TEXTAREA") {
        if (window.handleAutocompleteKeydown(event)) return;

        if (event.key === "Escape") {
            window.hideAutocomplete();
            activeElement.blur();
            if (window.isSearchOverlayOpen()) {
                window.closeSearchOverlay();
            } else {
                window.closeDropdown();
            }
            window.closeHelpModal();
        }
        return;
    }

    if (event.key === "/") {
        event.preventDefault();
        if (window.isMobileLayout()) {
            window.openSearchOverlay({ clear: true });
            return;
        }
        const input = document.getElementById("word-input");
        if (input) {
            input.focus();
            input.select();
        }
        return;
    }

    if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        window.playAudio();
        return;
    }

    if (event.key === "ArrowLeft" && window.isMobileLayout()) {
        event.preventDefault();
        window.swipeMobileDictionary("right");
        return;
    }

    if (event.key === "ArrowRight" && window.isMobileLayout()) {
        event.preventDefault();
        window.swipeMobileDictionary("left");
        return;
    }

    if (event.key === "Escape") {
        if (window.isSearchOverlayOpen()) {
            window.closeSearchOverlay();
        } else {
            window.closeDropdown();
        }
        window.closeHelpModal();
    }
};

let selectedWord = "";

window.showSearchHelper = function (word, x, y) {
    const btn = document.getElementById("search-helper");
    if (!btn) return;
    btn.style.top = `${y + 20}px`;
    btn.style.left = `${x}px`;
    btn.style.display = "flex";
    selectedWord = word;
};

window.executeSearch = function () {
    if (!selectedWord) return;
    currentSearchWord = selectedWord;
    window.location.search = `?word=${encodeURIComponent(selectedWord)}&dict=${encodeURIComponent(currentDictionaryId)}`;
};

window.updateAudioFromCambridgeDoc = function (doc) {
    const source = doc.querySelector('span.us source[type="audio/mpeg"]');
    if (!source) return;

    const src = source.getAttribute("src");
    if (!src) return;

    currentAudioUrl = src;
    if (isAutoPlayEnabled && !window.isMobileLayout()) {
        window.playAudio();
    }
};

window.playAudio = function () {
    if (currentAudioUrl) {
        new Audio(currentAudioUrl).play();
    }
};

window.toggleHelpModal = function () {
    const modal = document.getElementById("help-modal");
    if (modal) modal.style.display = "flex";
};

window.closeHelpModal = function () {
    const modal = document.getElementById("help-modal");
    if (modal) modal.style.display = "none";
};

window.syncCurrentDictionary = function () {
    currentDictionaryId = mobileDictionaryIds[mobileDictionaryIndex] || "longman";
    const dictInput = document.getElementById("dict-input");
    if (dictInput) {
        dictInput.value = currentDictionaryId;
    }
};

window.setMobileDictionary = function (index) {
    if (!window.isMobileLayout()) return;

    const size = mobileDictionaryIds.length;
    mobileDictionaryIndex = ((index % size) + size) % size;

    mobileDictionaryIds.forEach((id, currentIndex) => {
        const panel = document.getElementById(id)?.closest(".dict-panel");
        if (!panel) return;
        panel.classList.toggle("active", currentIndex === mobileDictionaryIndex);
    });

    window.syncCurrentDictionary();
};

window.swipeMobileDictionary = function (direction) {
    if (!window.isMobileLayout()) return;
    if (direction === "left") window.setMobileDictionary(mobileDictionaryIndex + 1);
    if (direction === "right") window.setMobileDictionary(mobileDictionaryIndex - 1);
};

window.setupMobileSwipe = function () {
    const container = document.querySelector(".container");
    if (!container || container.dataset.swipeBound === "1") return;
    container.dataset.swipeBound = "1";

    let touchStartX = 0;
    let touchStartY = 0;
    let touchFromEdge = false;
    const EDGE_GUARD_PX = 24;

    container.addEventListener("touchstart", function (event) {
        if (!window.isMobileLayout() || !event.touches || event.touches.length !== 1) return;
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        touchFromEdge = touchStartX <= EDGE_GUARD_PX || touchStartX >= (viewportWidth - EDGE_GUARD_PX);
    }, { passive: true });

    container.addEventListener("touchend", function (event) {
        if (!window.isMobileLayout() || !event.changedTouches || event.changedTouches.length !== 1) return;
        if (touchFromEdge) return;
        const endX = event.changedTouches[0].clientX;
        const endY = event.changedTouches[0].clientY;
        const dx = endX - touchStartX;
        const dy = endY - touchStartY;
        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        window.swipeMobileDictionary(dx < 0 ? "left" : "right");
    }, { passive: true });

    window.addEventListener("message", function (event) {
        if (event.origin !== window.location.origin || !event.data) return;
        if (event.data.type === "dict-swipe") {
            window.swipeMobileDictionary(event.data.direction);
        }
        if (event.data.type === "dict-open-search") {
            window.openSearchOverlay({ clear: true });
        }
    });
};

window.loadDictionaries = function (word) {
    if (!word) return;

    currentSearchWord = word;
    currentAudioUrl = null;
    const slug = word.trim().replace(/\s+/g, "-");
    const dictionaries = [
        { id: "longman", url: `https://www.ldoceonline.com/dictionary/${slug}` },
        { id: "cambridge", url: `https://dictionary.cambridge.org/dictionary/english/${slug}` },
        { id: "oxford", url: `https://www.oxfordlearnersdictionaries.com/definition/english/${slug}` }
    ];

    dictionaries.forEach((dict) => {
        const iframe = document.getElementById(dict.id);
        const link = document.getElementById(`${dict.id}-link`);
        if (link) link.href = dict.url;
        if (!iframe) return;

        iframe.onload = function () {
            try {
                const currentProxyUrl = iframe.contentWindow.location.href || iframe.src;
                if (link) {
                    link.href = window.getOriginalUrlFromProxy(currentProxyUrl, dict.url);
                }

                const doc = iframe.contentWindow.document;

                doc.addEventListener("keydown", function (event) {
                    window.handleGlobalKeydown(event);
                });

                doc.addEventListener("click", function () {
                    window.closeDropdown();
                });

                doc.addEventListener("mouseup", function (event) {
                    setTimeout(() => {
                        const selection = iframe.contentWindow.getSelection().toString().trim();
                        if (!selection || selection.length <= 1 || selection.length >= 50) return;
                        const rect = iframe.getBoundingClientRect();
                        const globalX = rect.left + event.clientX;
                        const globalY = rect.top + event.clientY;
                        window.showSearchHelper(selection, globalX, globalY);
                    }, 10);
                });

                doc.addEventListener("mousedown", function () {
                    window.hideSearchHelper();
                });

                if (dict.id === "cambridge") {
                    window.updateAudioFromCambridgeDoc(doc);
                }
            } catch (error) {
                console.error("Access denied:", error);
            }
        };

        iframe.src = `/proxy?url=${dict.url}`;
    });

    window.setupMobileSwipe();
    window.setMobileDictionary(mobileDictionaryIndex);
};

window.onload = function () {
    window.updateAutoPlayIcon();
    window.setupMobileSwipe();
    window.setupSearchOverlayGestures();
    const initialDict = window.getQueryParam("dict");
    if (mobileDictionaryIds.includes(initialDict)) {
        mobileDictionaryIndex = mobileDictionaryIds.indexOf(initialDict);
    }
    window.setMobileDictionary(mobileDictionaryIndex);
    window.syncCurrentDictionary();

    window.addEventListener("resize", function () {
        window.setMobileDictionary(mobileDictionaryIndex);
        if (!window.isMobileLayout()) {
            document.body.classList.remove("search-overlay-open");
        }
    });

    const initialWord = window.getQueryParam("word");
    const wordInput = document.getElementById("word-input");
    const searchForm = document.querySelector(".search-form");

    if (initialWord && wordInput) {
        currentSearchWord = initialWord.trim().toLowerCase();
        wordInput.value = currentSearchWord;
        window.loadDictionaries(currentSearchWord);
    }

    if (wordInput) {
        const shouldAutoFocus = !initialWord && !wordInput.value.trim() && !window.isMobileLayout();
        if (shouldAutoFocus) {
            isProgrammaticFocus = true;
            setTimeout(() => {
                try {
                    wordInput.focus({ preventScroll: true });
                } catch (_) {
                    wordInput.focus();
                }
                isProgrammaticFocus = false;
            }, 0);
        }

        wordInput.addEventListener("focus", function () {
            if (isProgrammaticFocus) return;
            window.showAutocomplete([], wordInput.value.trim());
        });

        wordInput.addEventListener("input", function (event) {
            const query = event.target.value.trim();
            if (autocompleteTimeout) {
                clearTimeout(autocompleteTimeout);
            }
            autocompleteTimeout = setTimeout(() => {
                window.fetchAutocomplete(query);
            }, 300);
        });

        wordInput.addEventListener("blur", function () {
            setTimeout(() => {
                window.hideAutocomplete();
            }, 200);
        });
    }

    if (searchForm && wordInput) {
        searchForm.addEventListener("submit", function () {
            currentSearchWord = wordInput.value.trim();
            window.syncCurrentDictionary();
        });
    }

    document.addEventListener("keydown", window.handleGlobalKeydown);

    document.addEventListener("click", function (event) {
        const modal = document.getElementById("help-modal");
        const dropdown = document.getElementById("autocomplete-dropdown");
        const searchContainer = document.querySelector(".search-container");

        if (!event.target.closest("#search-helper")) {
            window.hideSearchHelper();
        }

        if (dropdown && !dropdown.contains(event.target) && event.target.id !== "word-input") {
            window.hideAutocomplete();
        }

        if (window.isMobileLayout() && window.isSearchOverlayOpen() && searchContainer && !searchContainer.contains(event.target)) {
            window.closeSearchOverlay();
        }

        if (event.target === modal) {
            window.closeHelpModal();
        }
    });

    document.querySelectorAll(".dict-header").forEach((header) => {
        header.addEventListener("click", function (event) {
            if (!window.isMobileLayout()) return;
            if (event.target.closest(".external-link")) return;
            window.openSearchOverlay({ clear: true });
        });
    });

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/static/sw.js").catch(() => {});
    }
};
