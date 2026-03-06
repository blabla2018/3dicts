
import html
import json
import os
from urllib.parse import quote_plus, unquote, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from flask import Flask, Response, jsonify, render_template, request

app = Flask(__name__)
HISTORY_FILE = "history.json"
DEFAULT_TIMEOUT_SECONDS = 4.0
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/91.0.4472.114 Safari/537.36"
    )
}

HOST_SETTINGS = {
    "dictionary.cambridge.org": {"timeout": 8.0},
    "www.oxfordlearnersdictionaries.com": {"timeout": 4.0},
    "www.ldoceonline.com": {"timeout": 4.0},
    "api.datamuse.com": {"timeout": 3.0},
}

def load_history():
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, "r") as f:
            return json.load(f)
    except:
        return []

def save_history(word):
    if not word:
        return
    history = load_history()
    # Remove if exists to move to top
    if word in history:
        history.remove(word)
    history.insert(0, word)
    # Keep last 10
    history = history[:10]
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f)

def modify_html(soup, base_url):
    # Process <link> (CSS), <script> (JS), <img> (images) to absolute URLs
    for tag in soup.find_all(src=True):
        tag["src"] = urljoin(base_url, tag["src"].strip())

    # Process <link> tags (CSS, favicons, etc)
    for tag in soup.find_all("link", href=True):       
        tag["href"] = urljoin(base_url, tag["href"].strip())

    # Process all <a href="..."> to local proxy links
    for link in soup.find_all("a", href=True):
        href = link["href"].strip()
        # Skip special protocols
        if href.startswith(("javascript:", "mailto:", "tel:")):
            continue
            
        absolute_url = urljoin(base_url, href)
        link["href"] = f"/proxy?url={absolute_url}"

    return str(soup)

def get_dictionary_content_div(soup, url):
    if "ldoceonline.com" in url:
        return soup.find("div", class_="entry_content")
    if "cambridge.org" in url:
        path = urlparse(url).path.lower()
        if "/topics/" in path:
            return (
                soup.select_one("ul.hul-ib.lm-0.lmb-10.htc")
                or soup.select_one("ul.hul-ib.htc")
                or soup.find("ul", class_="hul-ib")
            )
        if "/thesaurus/" in path:
            return soup.find("div", class_="thesaurus")
        # Cambridge uses different containers for regular entries and idioms.
        return soup.find("div", class_="entry") or soup.find("div", class_="di-body")
    if "oxfordlearnersdictionaries.com" in url:
        return soup.find(id="entryContent")
    return None

def render_not_found_page():
    return """
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          html, body { margin: 0; height: 100%; }
          body {
            display: flex;
            align-items: center;
            justify-content: center;
            background: #eef6ff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #2b4f7a;
            font-size: 22px;
            font-weight: 600;
          }
        </style>
      </head>
      <body>Not found</body>
    </html>
    """

def build_base_html_doc(source_soup):
    new_soup = BeautifulSoup("<html><head></head><body></body></html>", "html.parser")
    if source_soup.title:
        new_soup.head.append(source_soup.title)

    seen_css = set()
    for css in source_soup.find_all("link", rel="stylesheet"):
        href = css.get("href")
        if not href or href in seen_css:
            continue
        seen_css.add(href)
        new_soup.head.append(css)

    style = new_soup.new_tag("style")
    style.string = """
        html, body {
            max-width: 100%;
            overflow-x: hidden;
        }
        body {
            padding: 10px 10px 30px 10px !important;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #2c3e50;
            background-color: #ffffff;
        }
        img {
            max-width: 100% !important;
            height: auto !important;
        }
        .entry_content, .entry, .di-body, #entryContent, .thesaurus {
            margin: 0 !important;
            padding: 0 !important;
        }
        a { color: #007bff; text-decoration: none; }
        a:hover { text-decoration: underline; }
    """
    new_soup.head.append(style)
    return new_soup

def extract_suggestions_from_selector(soup, selector, base_url):
    suggestions = []
    seen = set()
    for link in soup.select(selector):
        text = link.get_text(" ", strip=True)
        href = (link.get("href") or "").strip()
        if not text or not href:
            continue
        url = urljoin(base_url, href)
        key = f"{text.lower()}::{url}"
        if key in seen:
            continue
        seen.add(key)
        suggestions.append((text, url))
    return suggestions

def render_simple_suggestions_page(suggestions):
    items = []
    for text, url in suggestions[:15]:
        item = (
            f'<li><a href="/proxy?url={html.escape(url, quote=True)}">'
            f"{html.escape(text)}</a></li>"
        )
        items.append(item)

    return (
        "<html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>"
        "<style>html,body{min-height:100%;touch-action:pan-y}"
        "body{padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}"
        "h1{margin:0 0 10px;font-size:20px}ul{margin:0;padding-left:20px}li{margin:6px 0}"
        "a{color:#007bff;text-decoration:none}a:hover{text-decoration:underline}</style></head>"
        "<body><h4>Did you mean?</h4><ul>"
        + "".join(items)
        + """</ul><script>
        (function () {
            let startX = 0;
            let startY = 0;
            let touchFromEdge = false;
            const EDGE_GUARD_PX = 24;
            document.addEventListener("touchstart", function (event) {
                if (!event.touches || event.touches.length !== 1) return;
                startX = event.touches[0].clientX;
                startY = event.touches[0].clientY;
                const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
                touchFromEdge = startX <= EDGE_GUARD_PX || startX >= (viewportWidth - EDGE_GUARD_PX);
            }, { passive: true });
            document.addEventListener("touchend", function (event) {
                if (!event.changedTouches || event.changedTouches.length !== 1) return;
                if (touchFromEdge) return;
                const endX = event.changedTouches[0].clientX;
                const endY = event.changedTouches[0].clientY;
                const dx = endX - startX;
                const dy = endY - startY;
                if (startY < 80 && dy > 50 && dy > Math.abs(dx) * 1.2) {
                    if (window.parent) {
                        window.parent.postMessage({ type: "dict-open-search" }, "*");
                    }
                    return;
                }
                if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
                if (window.parent) {
                    window.parent.postMessage(
                        { type: "dict-swipe", direction: dx < 0 ? "left" : "right" },
                        "*"
                    );
                }
            }, { passive: true });
        })();
        </script></body></html>"""
    )

def build_not_found_suggestions_html(redirect_url, soup):
    host = urlparse(redirect_url).netloc
    suggestions = []

    if "dictionary.cambridge.org" in host:
        path = urlparse(redirect_url).path
        query_word = ""
        marker = "/english/"
        if marker in path:
            query_word = unquote(path.split(marker, 1)[1].split("/", 1)[0]).strip()
        if query_word:
            spellcheck_url = f"https://dictionary.cambridge.org/spellcheck/english/?q={quote_plus(query_word)}"
            spellcheck_response = fetch_url(spellcheck_url, headers=REQUEST_HEADERS, follow_redirects=True)
            spellcheck_soup = BeautifulSoup(spellcheck_response.text, "html.parser")
            suggestions = extract_suggestions_from_selector(
                spellcheck_soup,
                "div.hfl-s.lt2b ul li a",
                str(spellcheck_response.url),
            )
    elif "www.ldoceonline.com" in host:
        suggestions = extract_suggestions_from_selector(soup, "ul.didyoumean li a", redirect_url)
    elif "www.oxfordlearnersdictionaries.com" in host:
        suggestions = extract_suggestions_from_selector(soup, "ul.result-list li a", redirect_url)

    if not suggestions:
        return None
    return render_simple_suggestions_page(suggestions)

def is_not_found_page(soup, requested_url, final_url, status_code):
    host = urlparse(requested_url).netloc
    content_div = get_dictionary_content_div(soup, final_url)

    if "oxfordlearnersdictionaries.com" in host:
        return status_code == 404 or content_div is None
    if "ldoceonline.com" in host:
        return "spellcheck" in final_url or content_div is None
    if "dictionary.cambridge.org" in host:
        path = urlparse(final_url).path.lower()
        is_dictionary_entry = path.startswith("/dictionary/english/") or path.startswith("/us/dictionary/english/")
        if is_dictionary_entry:
            return content_div is None
        return status_code == 404
    return status_code == 404

def clean_html(soup, url):
    content_div = get_dictionary_content_div(soup, url)
    if content_div is None:
        return soup

    # One pass over tags: strip handlers, drop heavy tags, and convert AMP images.
    for tag in list(content_div.find_all(True)):
        tag_name = tag.name.lower()

        if tag_name in {"script", "noscript", "iframe"}:
            tag.decompose()
            continue

        if tag_name == "amp-img":
            img = soup.new_tag("img")
            for attr in ["src", "alt", "width", "height", "class", "style", "srcset"]:
                val = tag.get(attr)
                if val:
                    img[attr] = val
            if not img.get("loading"):
                img["loading"] = "lazy"
            tag.replace_with(img)
            continue

        for attr in list(tag.attrs):
            if attr.lower().startswith("on"):
                del tag.attrs[attr]

    if "cambridge.org" in url:
        # Drop AMP-gated links that are not useful in embedded proxy view.
        for link in content_div.find_all("a"):
            if link.has_attr("amp-access"):
                link.decompose()

        # Cambridge audio buttons depend on icon fonts + inline onclick handlers.
        # Replace with stable text buttons handled by local script below.
        for btn in content_div.select(".c_aud"):
            btn.clear()
            btn.string = "Play"
            btn["class"] = ["c_aud", "local-audio-btn"]

    if "oxfordlearnersdictionaries.com" in url:
        ring_links = content_div.select_one("#ring-links-box")
        if ring_links:
            ring_links.decompose()

    # Create a new HTML document
    new_soup = build_base_html_doc(soup)

    # Add custom styles for entry pages.
    style = new_soup.new_tag("style")
    style.string = """
        .ad, .advertisement, .banner { display: none !important; }
        iframe { display: none !important; }
        .local-audio-btn {
            display: inline-block;
            margin-right: 6px;
            padding: 2px 8px;
            border: 1px solid #007bff;
            border-radius: 999px;
            color: #007bff;
            background: #f5faff;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            user-select: none;
        }
        .local-audio-btn:hover {
            background: #e8f2ff;
        }
    """
    new_soup.head.append(style)

    # Insert the required div into body
    new_soup.body.append(content_div)

    # Add script for Oxford audio and interactions
    if "oxfordlearnersdictionaries.com" in url:
        script = new_soup.new_tag("script")
        script.string = """
            document.querySelectorAll('.unbox').forEach(function(el){
                el.addEventListener('click', function(){
                    el.classList.toggle('is-active');
                });
            });

            document.querySelectorAll('.audio_play_button').forEach(function(btn){
                btn.addEventListener('click', function(event){
                    event.stopPropagation();
                    const audioSrc = btn.getAttribute('data-src-mp3');
                    if (audioSrc) {
                        const audio = new Audio(audioSrc);
                        audio.play();
                    }
                });
            });
        """
        new_soup.body.append(script)

    if "cambridge.org" in url:
        script = new_soup.new_tag("script")
        script.string = """
            document.querySelectorAll('.local-audio-btn').forEach(function(btn){
                btn.addEventListener('click', function(event){
                    event.preventDefault();
                    event.stopPropagation();

                    const scope = btn.closest('.dpron-i, .pron-info, .pos-header, .entry-body__el') || document;
                    const source = scope.querySelector('source[type="audio/mpeg"]');
                    if (!source) return;

                    const src = source.getAttribute('src');
                    if (!src) return;

                    const audio = new Audio(src);
                    audio.play();
                });
            });
        """
        new_soup.body.append(script)

    swipe_script = new_soup.new_tag("script")
    swipe_script.string = """
        (function () {
            let startX = 0;
            let startY = 0;
            let touchFromEdge = false;
            let canOpenSearch = false;
            const EDGE_GUARD_PX = 24;
            const PULL_SEARCH_PX = 72;

            document.addEventListener("touchstart", function (event) {
                if (!event.touches || event.touches.length !== 1) return;
                startX = event.touches[0].clientX;
                startY = event.touches[0].clientY;
                const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
                touchFromEdge = startX <= EDGE_GUARD_PX || startX >= (viewportWidth - EDGE_GUARD_PX);
                canOpenSearch = (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0) <= 4;
            }, { passive: true });

            document.addEventListener("touchend", function (event) {
                if (!event.changedTouches || event.changedTouches.length !== 1) return;
                if (touchFromEdge) return;
                const endX = event.changedTouches[0].clientX;
                const endY = event.changedTouches[0].clientY;
                const dx = endX - startX;
                const dy = endY - startY;
                if (canOpenSearch && dy > PULL_SEARCH_PX && Math.abs(dy) > Math.abs(dx) * 1.2) {
                    if (window.parent) {
                        window.parent.postMessage({ type: "dict-open-search" }, "*");
                    }
                    return;
                }
                if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
                if (window.parent) {
                    window.parent.postMessage(
                        { type: "dict-swipe", direction: dx < 0 ? "left" : "right" },
                        "*"
                    );
                }
            }, { passive: true });
        })();
    """
    new_soup.body.append(swipe_script)

    return new_soup

def get_base_url(url):
    parsed_url = urlparse(url)
    return f"{parsed_url.scheme}://{parsed_url.netloc}"

def get_host_settings(url):
    host = urlparse(url).netloc
    return HOST_SETTINGS.get(host, {"timeout": DEFAULT_TIMEOUT_SECONDS})

def fetch_url(url, headers=None, follow_redirects=True):
    settings = get_host_settings(url)
    timeout = settings["timeout"]
    return app.http_client.get(
        url,
        headers=headers,
        follow_redirects=follow_redirects,
        timeout=timeout,
    )

def build_proxy_response(html: str, status_code: int = 200):
    return Response(html, content_type="text/html", status=status_code)

@app.route("/")
def index():
    word = request.args.get("word", "").strip()
    if word:
        save_history(word)
    
    history = load_history()
    return render_template("index.html", word=word, history=history)

@app.route("/api/autocomplete")
def autocomplete_api():
    """Autocomplete endpoint using Datamuse API"""
    query = request.args.get("q", "").strip()
    
    if not query or len(query) < 2:
        return jsonify([])
    
    try:
        # Use Datamuse API for suggestions
        url = f"https://api.datamuse.com/sug?s={query}&max=10"
        response = fetch_url(url, headers=REQUEST_HEADERS, follow_redirects=True)
        if response and response.status_code == 200:
            results = response.json()
            suggestions = [item['word'] for item in results]
            return jsonify(suggestions)
    except Exception as e:
        print(f"Autocomplete error: {e}")
    
    return jsonify([])

@app.route("/proxy")
def proxy():
    redirect_url = request.args.get("url", "")
    if not redirect_url:
        return Response("Missing URL", status=400)

    try:
        response = fetch_url(redirect_url, headers=REQUEST_HEADERS, follow_redirects=True)
        content = response.text
        soup = BeautifulSoup(content, "html.parser")

        if is_not_found_page(soup, redirect_url, str(response.url), response.status_code):
            fixed_suggestions_html = build_not_found_suggestions_html(
                redirect_url,
                soup,
            )
            if fixed_suggestions_html is not None:
                return build_proxy_response(fixed_suggestions_html, status_code=200)
            return build_proxy_response(render_not_found_page(), status_code=404)

        if response.status_code != 200:
            return Response(f"Error fetching {redirect_url}: Status {response.status_code}", status=502)

        # Clean the HTML to only show relevant content
        soup = clean_html(soup, redirect_url)
        
        # Fix relative links to be absolute or proxy links
        fixed_html = modify_html(soup, get_base_url(redirect_url))

        return build_proxy_response(fixed_html, status_code=200)
    except Exception as e:
        return build_proxy_response(f"Error fetching {redirect_url}: {str(e)}", status_code=500)

app.http_client = httpx.Client()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5002))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    host = os.environ.get("HOST", "127.0.0.1")
    app.run(host=host, port=port, debug=debug)
