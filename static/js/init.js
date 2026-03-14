// App bootstrap
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
        window.updateMobileScaleDebug();
    });

    window.addEventListener("storage", function (event) {
        if (event.key === "dictionaryScale" || event.key === "dictionaryCalibrationMode") {
            window.applyScaleToLoadedIframes();
            window.updateMobileScaleDebug();
        }
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

    const mobileScaleMinus = document.getElementById("mobile-scale-minus");
    if (mobileScaleMinus) {
        mobileScaleMinus.addEventListener("click", function () {
            window.adjustCurrentDictionaryDebugScale(-0.01);
        });
    }

    const mobileScalePlus = document.getElementById("mobile-scale-plus");
    if (mobileScalePlus) {
        mobileScalePlus.addEventListener("click", function () {
            window.adjustCurrentDictionaryDebugScale(0.01);
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
    window.updateMobileScaleDebug();

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/static/sw.js").catch(() => {});
    }
};
