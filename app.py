
import os
from urllib.parse import urlparse, urljoin
import json
import httpx
from flask import Flask, request, render_template, Response, jsonify
from bs4 import BeautifulSoup

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
    "dictionary.cambridge.org": {"timeout": 4.0},
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

    # Process JSON inside <script type="application/json"> to absolute URLs
    for script in soup.find_all("script", {"type": "application/json"}):
        try:
            json_data = json.loads(script.string)  
            if isinstance(json_data, dict): 
                for key, value in json_data.items():
                    if isinstance(value, str) and value.startswith("/"):  
                        json_data[key] = urljoin(base_url, value)
                script.string = json.dumps(json_data)  
        except (json.JSONDecodeError, TypeError):
            pass  

    return str(soup)

def clean_html(soup, url):
    content_div = None
    # Check URL and select the required element
    if "ldoceonline.com" in url:
        content_div = soup.find("div", class_="entry_content")  # For Longman
    elif "cambridge.org" in url:
        content_div = soup.find("div", class_="entry")  # For Cambridge
    elif "oxfordlearnersdictionaries.com" in url:
        content_div = soup.find(id="entryContent")  # For Oxford
    if content_div is None:
        return soup

    # Create a new HTML document
    new_soup = BeautifulSoup("<html><head></head><body></body></html>", "html.parser")

    # Transfer title and CSS (if present)
    if soup.title:
        new_soup.head.append(soup.title)

    for css in soup.find_all("link", rel="stylesheet"):
        new_soup.head.append(css)
    
    # Add custom styles for better readability (padding)
    style = new_soup.new_tag("style")
    style.string = """
        body { 
            padding: 15px !important; 
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #2c3e50;
            background-color: #ffffff;
        }
        a { color: #007bff; text-decoration: none; }
        a:hover { text-decoration: underline; }
        /* Clean up common dictionary clutter */
        .ad, .advertisement, .banner { display: none !important; }
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
        if response.status_code != 200:
            return Response(f"Error fetching {redirect_url}: Status {response.status_code}", status=502)

        soup = BeautifulSoup(content, "html.parser")
        
        # Clean the HTML to only show relevant content
        soup = clean_html(soup, redirect_url)
        
        # Fix relative links to be absolute or proxy links
        fixed_html = modify_html(soup, get_base_url(redirect_url))

        return build_proxy_response(fixed_html, status_code=200)
    except Exception as e:
        return build_proxy_response(f"Error fetching {redirect_url}: {str(e)}", status_code=500)

app.http_client = httpx.Client()

if __name__ == "__main__":
    app.run(debug=True, port=5002)
