// Search overlay, autocomplete, keyboard shortcuts, and inline search helper
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
    const input = document.getElementById("word-input");
    const query = input ? input.value.trim() : "";
    const hasQuery = query.length >= 2;

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

    if (!hasQuery || uniqueSuggestions.length === 0) {
        if (historyItems.length > 0) {
        addSection("Recent");
        historyItems.forEach(addItem);
        }
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
