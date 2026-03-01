        let isAutoPlayEnabled = localStorage.getItem("autoPlay") !== "false"; // Default to true if not set
        let historyIndex = -1; // Track selected history item
        let autocompleteIndex = -1; // Track selected autocomplete item
        let autocompleteTimeout = null; // For debouncing
        let currentAudioUrl = null;
        let mobileDictionaryIndex = 0;
        const mobileDictionaryIds = ["longman", "cambridge", "oxford"];

        const ICON_ON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
        const ICON_OFF = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-3.04-7.86-7.11-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;

        // Autocomplete functions
        window.fetchAutocomplete = async function (query) {
            if (!query || query.length < 2) {
                window.hideAutocomplete();
                return;
            }

            try {
                const response = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}`);
                if (response.ok) {
                    const suggestions = await response.json();
                    window.showAutocomplete(suggestions);
                }
            } catch (error) {
                console.error('Autocomplete error:', error);
            }
        };

        window.showAutocomplete = function (suggestions) {
            const dropdown = document.getElementById('autocomplete-dropdown');
            if (!dropdown) return;

            dropdown.innerHTML = '';
            autocompleteIndex = -1;

            if (suggestions.length === 0) {
                dropdown.classList.remove('show');
                return;
            }

            suggestions.forEach((word, index) => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.textContent = word;
                item.setAttribute('data-index', index);
                item.onclick = () => window.selectAutocomplete(word);
                dropdown.appendChild(item);
            });

            dropdown.classList.add('show');
        };

        window.hideAutocomplete = function () {
            const dropdown = document.getElementById('autocomplete-dropdown');
            if (dropdown) {
                dropdown.classList.remove('show');
                dropdown.innerHTML = '';
            }
            autocompleteIndex = -1;
        };

        window.navigateAutocomplete = function (direction) {
            const dropdown = document.getElementById('autocomplete-dropdown');
            if (!dropdown || !dropdown.classList.contains('show')) return;

            const items = dropdown.querySelectorAll('.autocomplete-item');
            if (items.length === 0) return;

            // Remove previous selection
            if (autocompleteIndex >= 0 && autocompleteIndex < items.length) {
                items[autocompleteIndex].classList.remove('selected');
            }

            // Update index
            autocompleteIndex += direction;

            // Wrap around
            if (autocompleteIndex < 0) {
                autocompleteIndex = items.length - 1;
            } else if (autocompleteIndex >= items.length) {
                autocompleteIndex = 0;
            }

            // Add new selection
            items[autocompleteIndex].classList.add('selected');
            items[autocompleteIndex].scrollIntoView({ block: 'nearest' });

            // Update input with selected word
            const input = document.getElementById('word-input');
            if (input) {
                input.value = items[autocompleteIndex].textContent;
            }
        };

        window.selectAutocomplete = function (word) {
            const input = document.getElementById('word-input');
            if (input) {
                input.value = word;
            }
            window.hideAutocomplete();

            // Trigger search
            const form = document.querySelector('.search-form');
            if (form) {
                form.submit();
            }
        };

        window.handleAutocompleteKeydown = function (event) {
            const dropdown = document.getElementById('autocomplete-dropdown');
            const isAutocompleteOpen = dropdown && dropdown.classList.contains('show');

            if (isAutocompleteOpen) {
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    window.navigateAutocomplete(1);
                    return true;
                } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    window.navigateAutocomplete(-1);
                    return true;
                } else if (event.key === 'Enter') {
                    if (autocompleteIndex >= 0) {
                        event.preventDefault();
                        const items = dropdown.querySelectorAll('.autocomplete-item');
                        if (items[autocompleteIndex]) {
                            window.selectAutocomplete(items[autocompleteIndex].textContent);
                        }
                        return true;
                    }
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    window.hideAutocomplete();
                    return true;
                }
            }
            return false;
        };

        // Global functions must be defined on window to be accessible easily
        window.handleGlobalKeydown = function (event) {
            // console.log("Keydown:", event.key);

            // Should ignore if user is typing in the search bar
            const activeElement = document.activeElement;
            const activeTag = (activeElement && activeElement.tagName) ? activeElement.tagName : "";

            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
                // Check if autocomplete is handling the key
                if (window.handleAutocompleteKeydown(event)) {
                    return; // Autocomplete handled it
                }

                if (event.key === 'Escape') {
                    // console.log("Escape in input");
                    window.hideAutocomplete();
                    activeElement.blur();
                    window.closeDropdown();
                    window.closeHelpModal();
                }
                return;
            }

            if (event.key === '/') {
                event.preventDefault();
                const input = document.getElementById("word-input");
                if (input) {
                    input.focus();
                    input.select();
                }
            } else if (event.key === ' ' || event.code === 'Space') {
                event.preventDefault();
                window.playAudio();
            } else if (event.key === 'h') {
                window.toggleHistory();
            } else if (event.key === 'ArrowDown') {
                window.navigateHistory(1);
            } else if (event.key === 'ArrowUp') {
                window.navigateHistory(-1);
            } else if (event.key === 'Enter') {
                window.selectHistoryItem();
            } else if (event.key === 'Escape') {
                // console.log("Escape global");
                window.closeDropdown();
                window.closeHelpModal();
            }
        };

        window.updateAutoPlayIcon = function () {
            const btn = document.getElementById("audio-toggle-btn");
            if (!btn) return;

            if (isAutoPlayEnabled) {
                btn.style.opacity = "1";
                btn.innerHTML = ICON_ON;
                btn.title = "Auto-Play: ON (Click to mute)";
            } else {
                btn.style.opacity = "0.7";
                btn.innerHTML = ICON_OFF;
                btn.title = "Auto-Play: OFF (Click to enable)";
            }
        };

        window.toggleAutoPlay = function () {
            isAutoPlayEnabled = !isAutoPlayEnabled;
            localStorage.setItem("autoPlay", isAutoPlayEnabled);
            updateAutoPlayIcon();
        };

        window.getQueryParam = function (param) {
            let urlParams = new URLSearchParams(window.location.search);
            return urlParams.get(param);
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

        window.closeDropdown = function () {
            const dropdown = document.getElementById("history-dropdown");
            const btn = document.getElementById("history-btn");
            if (dropdown && dropdown.classList.contains("show")) {
                dropdown.classList.remove("show");
                btn.classList.remove("active");
            }
            window.hideSearchHelper();
        };

        window.toggleHistory = function () {
            const dropdown = document.getElementById("history-dropdown");
            const btn = document.getElementById("history-btn");
            dropdown.classList.toggle("show");
            btn.classList.toggle("active");

            // Reset selection when opening
            if (dropdown.classList.contains("show")) {
                historyIndex = -1;
                updateHistorySelection();
            }
        };

        window.navigateHistory = function (direction) {
            const dropdown = document.getElementById("history-dropdown");
            if (!dropdown.classList.contains("show")) return;

            const items = document.querySelectorAll(".history-item");
            if (items.length === 0) return;

            event.preventDefault(); // Prevent page scroll

            historyIndex += direction;

            // Wrap around
            if (historyIndex < 0) historyIndex = items.length - 1;
            if (historyIndex >= items.length) historyIndex = 0;

            updateHistorySelection();
        };

        window.selectHistoryItem = function () {
            const dropdown = document.getElementById("history-dropdown");
            if (!dropdown.classList.contains("show")) return;

            const items = document.querySelectorAll(".history-item");
            if (historyIndex >= 0 && historyIndex < items.length) {
                const link = items[historyIndex].querySelector("a");
                if (link) {
                    event.preventDefault();
                    window.location.href = link.href;
                }
            }
        };

        window.updateHistorySelection = function () {
            const items = document.querySelectorAll(".history-item");
            items.forEach((item, index) => {
                if (index === historyIndex) {
                    item.classList.add("selected");
                } else {
                    item.classList.remove("selected");
                }
            });
        };

        // Search Helper Logic
        let selectedWord = "";

        window.showSearchHelper = function (word, x, y) {
            const btn = document.getElementById("search-helper");
            btn.style.top = (y + 20) + "px";
            btn.style.left = x + "px";
            btn.style.display = "block";
            selectedWord = word;
        };

        window.hideSearchHelper = function () {
            const btn = document.getElementById("search-helper");
            if (btn) btn.style.display = "none";
        };

        window.executeSearch = function () {
            if (selectedWord) {
                document.getElementById("word-input").value = selectedWord;
                window.location.search = `?word=${encodeURIComponent(selectedWord)}`;
            }
        };

        window.updateAudioFromCambridgeDoc = function (doc) {
            const source = doc.querySelector('span.us source[type="audio/mpeg"]');
            if (!source) return;

            const src = source.getAttribute("src");
            if (!src) return;

            currentAudioUrl = src;
            if (isAutoPlayEnabled) {
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
            modal.style.display = "flex";
        };

        window.closeHelpModal = function () {
            const modal = document.getElementById("help-modal");
            modal.style.display = "none";
        };

        window.isMobileLayout = function () {
            return window.matchMedia("(max-width: 900px)").matches;
        };

        window.setMobileDictionary = function (index) {
            if (!window.isMobileLayout()) return;

            const size = mobileDictionaryIds.length;
            mobileDictionaryIndex = ((index % size) + size) % size;

            mobileDictionaryIds.forEach((id, idx) => {
                const panel = document.getElementById(id)?.closest(".dict-panel");
                if (!panel) return;
                panel.classList.toggle("active", idx === mobileDictionaryIndex);
            });
        };

        window.swipeMobileDictionary = function (direction) {
            if (!window.isMobileLayout()) return;
            if (direction === "left") {
                window.setMobileDictionary(mobileDictionaryIndex + 1);
            } else if (direction === "right") {
                window.setMobileDictionary(mobileDictionaryIndex - 1);
            }
        };

        window.setupMobileSwipe = function () {
            const container = document.querySelector(".container");
            if (!container || container.dataset.swipeBound === "1") return;
            container.dataset.swipeBound = "1";

            let touchStartX = 0;
            let touchStartY = 0;

            container.addEventListener("touchstart", function (event) {
                if (!event.touches || event.touches.length !== 1) return;
                touchStartX = event.touches[0].clientX;
                touchStartY = event.touches[0].clientY;
            }, { passive: true });

            container.addEventListener("touchend", function (event) {
                if (!window.isMobileLayout() || !event.changedTouches || event.changedTouches.length !== 1) return;
                const endX = event.changedTouches[0].clientX;
                const endY = event.changedTouches[0].clientY;
                const dx = endX - touchStartX;
                const dy = endY - touchStartY;
                if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
                window.swipeMobileDictionary(dx < 0 ? "left" : "right");
            }, { passive: true });

            window.addEventListener("message", function (event) {
                if (event.origin !== window.location.origin) return;
                if (!event.data || event.data.type !== "dict-swipe") return;
                window.swipeMobileDictionary(event.data.direction);
            });
        };



        window.loadDictionaries = function (word) {
            if (!word) return;
            currentAudioUrl = null;
            const slug = word.trim().replace(/\s+/g, '-');
            const dictionaries = [
                { id: "longman", name: "Longman", url: `https://www.ldoceonline.com/dictionary/${slug}` },
                { id: "cambridge", name: "Cambridge", url: `https://dictionary.cambridge.org/dictionary/english/${slug}` },
                { id: "oxford", name: "Oxford", url: `https://www.oxfordlearnersdictionaries.com/definition/english/${slug}` }
            ];

            dictionaries.forEach(dict => {
                const iframe = document.getElementById(dict.id);
                const link = document.getElementById(dict.id + "-link");

                if (link) link.href = dict.url;

                if (iframe) {
                    iframe.onload = function () {
                        try {
                            const currentProxyUrl = iframe.contentWindow.location.href || iframe.src;
                            if (link) {
                                link.href = window.getOriginalUrlFromProxy(currentProxyUrl, dict.url);
                            }

                            const doc = iframe.contentWindow.document;

                            doc.addEventListener('keydown', function (e) {
                                window.handleGlobalKeydown(e);
                            });

                            doc.addEventListener('click', function () {
                                window.closeDropdown();
                            });

                            doc.addEventListener('mouseup', function (e) {
                                setTimeout(() => {
                                    const selection = iframe.contentWindow.getSelection().toString().trim();
                                    if (selection && selection.length > 1 && selection.length < 50) {
                                        const rect = iframe.getBoundingClientRect();
                                        const globalX = rect.left + e.clientX;
                                        const globalY = rect.top + e.clientY;
                                        window.showSearchHelper(selection, globalX, globalY);
                                    }
                                }, 10);
                            });

                            doc.addEventListener('mousedown', function (e) {
                                window.hideSearchHelper();
                            });

                            if (dict.id === "cambridge") {
                                window.updateAudioFromCambridgeDoc(doc);
                            }
                        } catch (e) {
                            console.error("Access denied:", e);
                        }
                    };

                    iframe.src = `/proxy?url=${dict.url}`;
                }
            });

            window.setupMobileSwipe();
            window.setMobileDictionary(mobileDictionaryIndex);
        };

        window.onload = function () {
            updateAutoPlayIcon();
            window.setupMobileSwipe();
            window.setMobileDictionary(mobileDictionaryIndex);
            window.addEventListener("resize", function () {
                window.setMobileDictionary(mobileDictionaryIndex);
            });

            let word = getQueryParam("word");
            if (word) {
                word = word.trim().toLowerCase();
                document.getElementById("word-input").value = word;
                loadDictionaries(word);
            }

            // Add input event listener for autocomplete
            const wordInput = document.getElementById("word-input");
            if (wordInput) {
                wordInput.addEventListener('input', function (event) {
                    const query = event.target.value.trim();

                    // Debounce the autocomplete request
                    if (autocompleteTimeout) {
                        clearTimeout(autocompleteTimeout);
                    }

                    autocompleteTimeout = setTimeout(() => {
                        window.fetchAutocomplete(query);
                    }, 300); // 300ms debounce
                });

                // Close autocomplete on blur (with delay for clicks)
                wordInput.addEventListener('blur', function () {
                    setTimeout(() => {
                        window.hideAutocomplete();
                    }, 200);
                });
            }

            document.addEventListener('keydown', window.handleGlobalKeydown);

            document.addEventListener('click', function (event) {
                const dropdown = document.getElementById("history-dropdown");
                const btn = document.getElementById("history-btn");
                const modal = document.getElementById("help-modal");
                const autocompleteDropdown = document.getElementById("autocomplete-dropdown");

                if (!event.target.closest("#search-helper")) {
                    window.hideSearchHelper();
                }

                if (dropdown && !dropdown.contains(event.target) && !btn.contains(event.target)) {
                    if (dropdown.classList.contains("show")) {
                        window.closeDropdown();
                    }
                }

                // Close autocomplete if clicking outside
                if (autocompleteDropdown && !autocompleteDropdown.contains(event.target) && event.target.id !== "word-input") {
                    window.hideAutocomplete();
                }

                if (event.target === modal) {
                    window.closeHelpModal();
                }
            });
        };
