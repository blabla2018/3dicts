
import os
import hashlib
import httpx
from flask import Flask, request, render_template, Response, jsonify
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin
import json

app = Flask(__name__)
HISTORY_FILE = "history.json"
CACHE_DIR = "cache"
CACHE_LIMIT = 200

# Ensure cache directory exists
if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

def get_cache_path(url):
    """Generate a file path for the cached content based on URL hash"""
    url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
    return os.path.join(CACHE_DIR, url_hash)

def get_cached_content(url):
    """Retrieve content from cache if it exists"""
    cache_path = get_cache_path(url)
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception:
            return None
    return None

def save_to_cache(url, content):
    """Save content to cache, respecting the CACHE_LIMIT"""
    try:
        # Check cache size and cleanup if needed
        files = [os.path.join(CACHE_DIR, f) for f in os.listdir(CACHE_DIR) if os.path.isfile(os.path.join(CACHE_DIR, f))]
        
        if len(files) >= CACHE_LIMIT:
            # Find the oldest file (LRU strategy based on modification time)
            oldest_file = min(files, key=os.path.getmtime)
            os.remove(oldest_file)

        cache_path = get_cache_path(url)
        with open(cache_path, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception:
        pass

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

async def get_cambridge_audio(word):
    """Fetch US pronunciation audio from Cambridge Dictionary"""
    url = f"https://dictionary.cambridge.org/dictionary/english/{word}"
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36"}
    
    try:
        # Check cache first
        content = get_cached_content(url)
        
        if not content:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, headers=headers, follow_redirects=True)
                content = response.text
                if response.status_code == 200:
                    save_to_cache(url, content)
                else:
                    return None
            
        soup = BeautifulSoup(content, "html.parser")
        # Find US pronunciation audio
        us_span = soup.find("span", class_="us")
        if us_span:
            audio_source = us_span.find("source", type="audio/mpeg")
            if audio_source and audio_source.has_attr("src"):
                # Join with base URL since Cambridge uses relative paths
                from urllib.parse import urljoin
                return urljoin("https://dictionary.cambridge.org", audio_source["src"])
    except Exception:
        pass
    return None


@app.route("/")
def index():
    word = request.args.get("word", "").strip()
    if word:
        save_history(word)
    
    history = load_history()
    return render_template("index.html", word=word, history=history)

@app.route("/api/audio")
async def audio_api():
    word = request.args.get("word", "").strip()
    if not word:
        return jsonify({"error": "No word provided"}), 400
    
    audio_url = await get_cambridge_audio(word)
    if audio_url:
        return jsonify({"audio_url": audio_url})
    else:
        return jsonify({"error": "Audio not found"}), 404

@app.route("/api/autocomplete")
async def autocomplete_api():
    """Autocomplete endpoint using Datamuse API"""
    query = request.args.get("q", "").strip()
    
    if not query or len(query) < 2:
        return jsonify([])
    
    try:
        # Use Datamuse API for suggestions
        url = f"https://api.datamuse.com/sug?s={query}&max=10"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=3.0)
            if response.status_code == 200:
                results = response.json()
                suggestions = [item['word'] for item in results]
                return jsonify(suggestions)
    except Exception as e:
        print(f"Autocomplete error: {e}")
    
    return jsonify([])

@app.route("/proxy")
async def proxy():
    redirect_url = request.args.get("url", "")
    if not redirect_url:
        return "Missing URL", 400

    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36"}

    try:
        # Check cache first
        content = get_cached_content(redirect_url)
        
        if not content:
            # If not in cache, fetch asynchronously
            async with httpx.AsyncClient() as client:
                response = await client.get(redirect_url, headers=headers, follow_redirects=True)
                content = response.text
                
                # Check actual status code before saving
                if response.status_code == 200:
                    save_to_cache(redirect_url, content)
                else:
                    return f"Error fetching {redirect_url}: Status {response.status_code}", 502

        soup = BeautifulSoup(content, "html.parser")
        
        # Clean the HTML to only show relevant content
        soup = clean_html(soup, redirect_url)
        
        # Fix relative links to be absolute or proxy links
        fixed_html = modify_html(soup, get_base_url(redirect_url))

        return Response(fixed_html, content_type="text/html")
    except Exception as e:
        return f"Error fetching {redirect_url}: {str(e)}", 500

if __name__ == "__main__":
    app.run(debug=True, port=5002)
