import argparse
import os
import time
import statistics
from playwright.sync_api import sync_playwright, Error as PlaywrightError

def wait_for_iframes_loaded(page, frame_ids, slug, timeout_ms=60000):
    page.wait_for_function(
        """
        ({ ids, slug }) => {
            return ids.every(id => {
                const frame = document.getElementById(id);
                if (!frame) return false;
                const src = frame.getAttribute('src') || '';
                if (!src.includes('/proxy?url=')) return false;
                if (!src.includes(slug)) return false;
                const doc = frame.contentDocument;
                if (!doc) return false;
                if (doc.readyState !== 'complete') return false;
                if (!doc.body) return false;
                const docUrl = doc.URL || '';
                return docUrl.includes(slug);
            });
        }
        """,
        arg={"ids": frame_ids, "slug": slug},
        timeout=timeout_ms,
    )

def run_benchmark(base_url, words, frame_ids, timeout_ms=60000, headless=True):
    results = []
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=headless)
        except PlaywrightError:
            browser = p.chromium.launch(channel="chrome", headless=headless)
        context = browser.new_context()

        page = context.new_page()

        for word in words:
            url = f"{base_url}/?word={word}"
            slug = word.strip().replace(" ", "-")
            t0 = time.perf_counter()
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            wait_for_iframes_loaded(page, frame_ids=frame_ids, slug=slug, timeout_ms=timeout_ms)
            t1 = time.perf_counter()
            elapsed = t1 - t0
            results.append((word, elapsed))

        browser.close()

    total = sum(t for _, t in results)
    avg = statistics.mean(t for _, t in results)
    return results, total, avg


def main():
    os.environ.setdefault("PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL", "0")
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:5003")
    parser.add_argument("--timeout-ms", type=int, default=60000)
    parser.add_argument("--headless", action="store_true", default=True)
    parser.add_argument("--headed", action="store_true", default=False)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    words = [
        "apple", "book", "run", "bright", "table",
        "quick", "cloud", "shift", "time", "people",
        "year", "way", "day", "thing", "man",
        "world", "life", "hand", "part", "child",
        "eye", "woman", "place", "work", "week",
        "case", "point", "government", "company", "number",
        "group", "problem", "fact", "be", "have",
        "do", "say", "get", "make", "go",
        "know", "take", "see", "come", "think",
        "look", "want", "give", "use", "find",
        "tell", "ask", "seem", "feel", "try",
        "leave", "call", "good", "new", "first",
        "last", "long", "great", "little", "own",
        "other", "old", "right", "big", "high",
        "different", "small", "large", "next", "early",
        "young", "important", "few", "public", "bad",
        "same", "able", "to", "of", "in",
        "for", "on", "with", "at", "by",
        "from", "up", "about", "into", "after",
        "apple", "run", "time", "work", "after",
    ]
    if args.limit and args.limit > 0:
        words = words[:args.limit]

    headless = True
    if args.headed:
        headless = False

    frame_ids = ["longman", "cambridge", "oxford"]

    results, total, avg = run_benchmark(
        base_url=args.base_url,
        words=words,
        frame_ids=frame_ids,
        timeout_ms=args.timeout_ms,
        headless=headless,
    )

    print("Results:")
    for word, elapsed in results:
        print(f"  {word:>10s}: {elapsed:.3f}s")
    print(f"Total: {total:.3f}s")
    print(f"Average per word: {avg:.3f}s")

if __name__ == "__main__":
    main()
