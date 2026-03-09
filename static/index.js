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
const FONT_SCALE_KEY = "dictionaryFontScale";

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

window.getDictionaryFontScale = function () {
    const value = parseFloat(localStorage.getItem(FONT_SCALE_KEY) || "1");
    if (!Number.isFinite(value)) return 1;
    const presets = [0.9, 0.95, 1, 1.05, 1.1];
    return presets.reduce((best, current) => {
        return Math.abs(current - value) < Math.abs(best - value) ? current : best;
    }, 1);
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

window.openSearchOverlay = function (options = {}) {
    if (!window.isMobileLayout()) return;

    const wordInput = document.getElementById("word-input");
    if (!wordInput) return;

    const clear = options.clear !== false;
    document.body.classList.add("search-overlay-open");

    if (currentSearchDraft) {
        wordInput.value = currentSearchDraft;
    } else if (clear) {
        wordInput.value = "";
    } else {
        wordInput.value = currentSearchWord;
    }
    window.updateSearchClearButton();

    const focusInput = () => {
        try {
            wordInput.focus({ preventScroll: true });
        } catch (_) {
            wordInput.focus();
        }
        const valueLength = wordInput.value.length;
        if (typeof wordInput.setSelectionRange === "function") {
            wordInput.setSelectionRange(valueLength, valueLength);
        }
        window.restoreAutocompleteForInput(wordInput.value);
    };

    isProgrammaticFocus = true;
    if (options.userGesture) {
        focusInput();
        isProgrammaticFocus = false;
        return;
    }
    setTimeout(focusInput, 0);
    setTimeout(() => {
        isProgrammaticFocus = false;
    }, 0);
};

window.setupMobileSearchFab = function () {
    const fab = document.getElementById("mobile-search-fab");
    if (!fab || fab.dataset.bound === "1") return;
    fab.dataset.bound = "1";

    const storageKey = "mobileSearchFabPosition";
    const size = 54;
    const margin = 12;
    let startPointerX = 0;
    let startPointerY = 0;
    let startLeft = 0;
    let startTop = 0;
    let pointerId = null;

    const clampFabPosition = (left, top) => {
        const maxLeft = Math.max(margin, window.innerWidth - size - margin);
        const maxTop = Math.max(margin, window.innerHeight - size - margin);
        return {
            left: Math.min(Math.max(left, margin), maxLeft),
            top: Math.min(Math.max(top, margin), maxTop)
        };
    };

    const applyFabPosition = (left, top, persist = true) => {
        const pos = clampFabPosition(left, top);
        fab.style.left = `${pos.left}px`;
        fab.style.top = `${pos.top}px`;
        if (persist) {
            localStorage.setItem(storageKey, JSON.stringify(pos));
        }
    };

    const restoreFabPosition = () => {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
            if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
                applyFabPosition(saved.left, saved.top, false);
                fab.classList.add("is-ready");
                return;
            }
        } catch (_) {}
        applyFabPosition(window.innerWidth - size - margin, window.innerHeight - size - 20, false);
        fab.classList.add("is-ready");
    };

    fab.addEventListener("pointerdown", function (event) {
        if (!window.isMobileLayout()) return;
        pointerId = event.pointerId;
        startPointerX = event.clientX;
        startPointerY = event.clientY;
        startLeft = fab.offsetLeft;
        startTop = fab.offsetTop;
        mobileSearchFabMoved = false;
        fab.setPointerCapture(event.pointerId);
    });

    fab.addEventListener("pointermove", function (event) {
        if (pointerId !== event.pointerId || !window.isMobileLayout()) return;
        const dx = event.clientX - startPointerX;
        const dy = event.clientY - startPointerY;
        if (!mobileSearchFabMoved && Math.abs(dx) + Math.abs(dy) > 6) {
            mobileSearchFabMoved = true;
        }
        if (!mobileSearchFabMoved) return;
        applyFabPosition(startLeft + dx, startTop + dy, false);
    });

    fab.addEventListener("pointerup", function (event) {
        if (pointerId !== event.pointerId) return;
        if (fab.hasPointerCapture && fab.hasPointerCapture(event.pointerId)) {
            fab.releasePointerCapture(event.pointerId);
        }
        pointerId = null;
        if (mobileSearchFabMoved) {
            applyFabPosition(fab.offsetLeft, fab.offsetTop, true);
            return;
        }
        window.openSearchOverlay({ clear: true, userGesture: true });
    });

    fab.addEventListener("pointercancel", function (event) {
        if (pointerId === event.pointerId) {
            pointerId = null;
        }
    });

    fab.addEventListener("click", function (event) {
        if (!window.isMobileLayout()) return;
        if (mobileSearchFabMoved) {
            mobileSearchFabMoved = false;
            event.preventDefault();
            return;
        }
        window.openSearchOverlay({ clear: true, userGesture: true });
    });

    window.addEventListener("resize", function () {
        if (!window.isMobileLayout()) return;
        applyFabPosition(fab.offsetLeft, fab.offsetTop, false);
    });

    restoreFabPosition();
};

window.closeSearchOverlay = function () {
    if (!window.isMobileLayout()) return;

    const wordInput = document.getElementById("word-input");
    document.body.classList.remove("search-overlay-open");
    window.hideAutocomplete();
    if (wordInput) {
        wordInput.value = currentSearchDraft || currentSearchWord;
        wordInput.blur();
    }
    window.updateSearchClearButton();
};

window.setupSearchOverlayGestures = function () {
    const searchInputWrapper = document.querySelector(".search-input-wrapper");
    if (!searchInputWrapper || searchInputWrapper.dataset.touchBound === "1") return;
    searchInputWrapper.dataset.touchBound = "1";

    let startX = 0;
    let startY = 0;

    searchInputWrapper.addEventListener("touchstart", function (event) {
        if (!window.isMobileLayout() || !window.isSearchOverlayOpen()) return;
        if (!event.touches || event.touches.length !== 1) return;
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
    }, { passive: true });

    searchInputWrapper.addEventListener("touchend", function (event) {
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
        window.showAutocomplete([]);
        return;
    }

    try {
        const response = await fetch(`https://api.datamuse.com/sug?s=${encodeURIComponent(query)}&max=10`);
        if (!response.ok) {
            window.showAutocomplete([]);
            return;
        }
        const suggestions = await response.json();
        window.showAutocomplete(suggestions.map((item) => item.word).filter(Boolean));
    } catch (error) {
        console.error("Autocomplete error:", error);
        window.showAutocomplete([]);
    }
};

window.showAutocomplete = function (suggestions) {
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

    const historyItems = window.loadSearchHistory()
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

    const info = document.createElement("div");
    info.className = "autocomplete-info";
    info.innerHTML = `<strong>Info:</strong> <span>${window.APP_VERSION || "v00.00.00"}</span> <span>&middot;</span> <a href="${window.SETTINGS_URL || "/settings"}">Settings</a> <span>&middot;</span> <a href="${window.HELP_URL || "/help"}">Help</a>`;
    dropdown.appendChild(info);

    if (!dropdown.querySelector(".autocomplete-item") && !dropdown.querySelector(".autocomplete-info")) {
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
    if (!input) return;

    input.value = word;
    currentSearchWord = word;
    currentSearchDraft = "";
    window.saveSearchHistory(word);
    window.updateSearchClearButton();
    window.location.search = window.buildSearchUrl(word);
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
        if (window.isSearchOverlayOpen()) {
            return false;
        }
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
            if (window.isSearchOverlayOpen()) {
                event.preventDefault();
                window.closeSearchOverlay();
                return;
            }
            window.hideAutocomplete();
            activeElement.blur();
            window.closeDropdown();
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
    currentSearchDraft = "";
    window.saveSearchHistory(selectedWord);
    window.location.search = window.buildSearchUrl(selectedWord);
};

window.updateAudioFromCambridgeDoc = function (doc) {
    const source = doc.querySelector('span.us source[type="audio/mpeg"]');
    if (!source) return;

    const src = source.getAttribute("src");
    if (!src) return;

    currentAudioUrl = src;
    if (window.isAutoPlayEnabled() && !window.isMobileLayout()) {
        window.playAudio();
    }
};

window.playAudio = function () {
    if (currentAudioUrl) {
        new Audio(currentAudioUrl).play();
    }
};

window.applyDictionaryScale = function (doc) {
    if (!doc || !doc.documentElement || !doc.body) return;
    const scale = window.getDictionaryFontScale();
    const fontSize = `${16 * scale}px`;
    doc.documentElement.style.setProperty("font-size", fontSize, "important");
    doc.body.style.setProperty("font-size", fontSize, "important");
    if (scale === 1) {
        doc.body.style.removeProperty("zoom");
        doc.body.style.removeProperty("width");
        return;
    }
    doc.body.style.setProperty("zoom", String(scale));
    doc.body.style.setProperty("width", `${100 / scale}%`);
};

window.applyScaleToLoadedIframes = function () {
    ["longman", "cambridge", "oxford"].forEach((id) => {
        const iframe = document.getElementById(id);
        if (!iframe) return;
        try {
            const doc = iframe.contentWindow?.document;
            if (doc) {
                window.applyDictionaryScale(doc);
            }
        } catch (_) {}
    });
};

window.syncCurrentDictionary = function () {
    currentDictionaryId = mobileDictionaryIds[mobileDictionaryIndex] || "longman";
    localStorage.setItem(CURRENT_DICTIONARY_KEY, currentDictionaryId);
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
                const currentOriginalUrl = window.getOriginalUrlFromProxy(currentProxyUrl, dict.url);
                if (link) {
                    link.href = currentOriginalUrl;
                }

                const historyWord = window.extractHistoryWordFromUrl(currentOriginalUrl);
                if (historyWord) {
                    currentSearchWord = historyWord;
                    window.saveSearchHistory(historyWord);
                }

                const doc = iframe.contentWindow.document;
                window.applyDictionaryScale(doc);

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
    window.setupMobileSwipe();
    window.setupSearchOverlayGestures();
    window.setupMobileSearchFab();
    const initialDict = window.getQueryParam("dict");
    const savedDict = localStorage.getItem(CURRENT_DICTIONARY_KEY);
    if (mobileDictionaryIds.includes(initialDict)) {
        mobileDictionaryIndex = mobileDictionaryIds.indexOf(initialDict);
    } else if (mobileDictionaryIds.includes(savedDict)) {
        mobileDictionaryIndex = mobileDictionaryIds.indexOf(savedDict);
    }
    window.setMobileDictionary(mobileDictionaryIndex);
    window.syncCurrentDictionary();

    window.addEventListener("resize", function () {
        window.setMobileDictionary(mobileDictionaryIndex);
        if (!window.isMobileLayout()) {
            document.body.classList.remove("search-overlay-open");
        }
    });

    window.addEventListener("pageshow", function () {
        window.applyScaleToLoadedIframes();
    });

    const initialWord = window.getQueryParam("word");
    const wordInput = document.getElementById("word-input");
    const searchForm = document.querySelector(".search-form");

    if (initialWord && wordInput) {
        currentSearchWord = initialWord.trim().toLowerCase();
        currentSearchDraft = "";
        wordInput.value = currentSearchWord;
        window.saveSearchHistory(currentSearchWord);
        window.updateSearchClearButton();
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
                currentSearchDraft = wordInput.value.trim();
                window.restoreAutocompleteForInput(currentSearchDraft);
                isProgrammaticFocus = false;
            }, 0);
        }

        wordInput.addEventListener("focus", function () {
            if (isProgrammaticFocus) return;
            window.updateSearchClearButton();
            currentSearchDraft = wordInput.value.trim();
            window.restoreAutocompleteForInput(currentSearchDraft);
        });

        wordInput.addEventListener("input", function (event) {
            const query = event.target.value.trim();
            currentSearchDraft = query;
            window.updateSearchClearButton();
            if (autocompleteTimeout) {
                clearTimeout(autocompleteTimeout);
            }
            autocompleteTimeout = setTimeout(() => {
                window.fetchAutocomplete(query);
            }, 300);
        });

        wordInput.addEventListener("blur", function () {
            setTimeout(() => {
                window.updateSearchClearButton();
                if (window.isMobileLayout() && window.isSearchOverlayOpen()) {
                    return;
                }
                window.hideAutocomplete();
            }, 200);
        });
    }

    if (searchForm && wordInput) {
        searchForm.addEventListener("submit", function () {
            currentSearchWord = wordInput.value.trim();
            currentSearchDraft = "";
            window.saveSearchHistory(currentSearchWord);
            window.updateSearchClearButton();
            window.syncCurrentDictionary();
        });
    }

    const clearButton = document.getElementById("search-clear-btn");
    if (clearButton && wordInput) {
        clearButton.addEventListener("click", function () {
            wordInput.value = "";
            currentSearchDraft = "";
            window.updateSearchClearButton();
            try {
                wordInput.focus({ preventScroll: true });
            } catch (_) {
                wordInput.focus();
            }
            window.restoreAutocompleteForInput("");
        });
    }

    document.addEventListener("keydown", window.handleGlobalKeydown);

    document.addEventListener("click", function (event) {
        const dropdown = document.getElementById("autocomplete-dropdown");
        const searchContainer = document.querySelector(".search-container");
        const wordInput = document.getElementById("word-input");
        const mobileSearchFab = document.getElementById("mobile-search-fab");

        if (!event.target.closest("#search-helper")) {
            window.hideSearchHelper();
        }

        if (
            dropdown &&
            !window.isSearchOverlayOpen() &&
            !dropdown.contains(event.target) &&
            event.target.id !== "word-input"
        ) {
            window.hideAutocomplete();
        }

        if (
            window.isMobileLayout() &&
            window.isSearchOverlayOpen() &&
            searchContainer &&
            !searchContainer.contains(event.target) &&
            (!mobileSearchFab || !mobileSearchFab.contains(event.target))
        ) {
            window.closeSearchOverlay();
        }

        if (
            window.isMobileLayout() &&
            window.isSearchOverlayOpen() &&
            wordInput &&
            event.target.closest(".search-input-wrapper") &&
            !event.target.closest(".autocomplete-item") &&
            !event.target.closest(".autocomplete-section") &&
            event.target !== wordInput
        ) {
            setTimeout(() => {
                try {
                    wordInput.focus({ preventScroll: true });
                } catch (_) {
                    wordInput.focus();
                }
                window.restoreAutocompleteForInput(wordInput.value);
            }, 0);
        }

        if (
            window.isMobileLayout() &&
            window.isSearchOverlayOpen() &&
            dropdown &&
            event.target === dropdown
        ) {
            window.closeSearchOverlay();
        }

    });

    document.querySelectorAll(".dict-header").forEach((header) => {
        header.addEventListener("click", function (event) {
            if (!window.isMobileLayout()) return;
            if (event.target.closest(".external-link")) return;
            window.openSearchOverlay({ clear: true });
        });
    });

    window.updateSearchClearButton();

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/static/sw.js").catch(() => {});
    }
};
