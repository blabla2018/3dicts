import argparse
import statistics
import time
from collections import Counter

from playwright.sync_api import sync_playwright, Error as PlaywrightError

WORDS_20 = [
    "apple", "book", "run", "bright", "table",
    "quick", "cloud", "shift", "time", "people",
    "year", "way", "day", "thing", "man",
    "world", "life", "hand", "part", "child",
]


def wait_for_iframes_loaded(page, timeout_ms=60000):
    page.wait_for_function(
        """
        () => {
            const ids = ['longman','cambridge','oxford'];
            return ids.every(id => {
                const frame = document.getElementById(id);
                if (!frame) return false;
                const src = frame.getAttribute('src') || '';
                if (!src.includes('/proxy?url=')) return false;
                const doc = frame.contentDocument;
                if (!doc || doc.readyState !== 'complete') return false;
                const body = doc.body;
                if (!body) return false;
                return (body.innerText || '').trim().length > 0;
            });
        }
        """,
        timeout=timeout_ms,
    )


def run_mode(base_url, timeout_ms=60000, headless=True):
    timings = []
    encoding_counter = Counter()

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=headless)
        except PlaywrightError:
            browser = p.chromium.launch(channel="chrome", headless=headless)

        context = browser.new_context()

        page = context.new_page()

        def on_response(resp):
            url = resp.url
            if "/proxy?url=" in url:
                enc = resp.headers.get("content-encoding", "identity")
                encoding_counter[enc] += 1

        page.on("response", on_response)

        for word in WORDS_20:
            t0 = time.perf_counter()
            page.goto(f"{base_url}/?word={word}", wait_until="domcontentloaded", timeout=timeout_ms)
            wait_for_iframes_loaded(page, timeout_ms=timeout_ms)
            timings.append(time.perf_counter() - t0)

        browser.close()

    total = sum(timings)
    avg = statistics.mean(timings)
    return timings, total, avg, encoding_counter


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:5003")
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--label", default="run")
    parser.add_argument("--timeout-ms", type=int, default=60000)
    parser.add_argument("--headed", action="store_true")
    args = parser.parse_args()

    headless = not args.headed

    totals = []
    avgs = []
    enc_total = Counter()

    for i in range(args.runs):
        _, total, avg, enc = run_mode(args.base_url, timeout_ms=args.timeout_ms, headless=headless)
        totals.append(total)
        avgs.append(avg)
        enc_total.update(enc)
        print(f"RUN {i + 1} {args.label}: total={total:.3f}s avg={avg:.3f}s")

    total_mean = statistics.mean(totals)
    avg_mean = statistics.mean(avgs)

    print("\nSUMMARY")
    print(f"label={args.label}")
    print(f"total_mean={total_mean:.3f}s")
    print(f"avg_mean={avg_mean:.3f}s")

    print("\nENCODING_COUNTS")
    for k, v in sorted(enc_total.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
