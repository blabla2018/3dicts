// Dictionary scaling, navigation, iframe lifecycle, and loading
window.applyDictionaryScale = function (doc, dictId) {
    if (!doc || !doc.documentElement || !doc.body) return;
    const userScale = window.getDictionaryFontScale();
    const baseScale = BASE_DICTIONARY_SCALE[dictId] || 1;
    const scale = userScale * baseScale;
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
                window.applyDictionaryScale(doc, id);
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
                window.applyDictionaryScale(doc, dict.id);

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
