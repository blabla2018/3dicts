import requests
from flask import Flask, request, render_template, Response
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin
import json

app = Flask(__name__)

def modify_html(html, base_url):
    soup = BeautifulSoup(html, "html.parser")

    # Process <link> (CSS), <script> (JS), <img> (images) to absolute URLs
    for tag in soup.find_all(src=True):
        tag["src"] = urljoin(base_url, tag["src"])

    for tag in soup.find_all(href=True):       
        tag["href"] = urljoin(base_url, tag["href"])

    # Process all <a href="..."> to local proxy links
    for link in soup.find_all("a", href=True):
        link["href"] = f"/proxy?url={link["href"]}"

    # Process JSON inside <script type="application/json"> to absolute URLs
    for script in soup.find_all("script", {"type": "application/json"}):
        try:
            json_data = json.loads(script.string)  
            if isinstance(json_data, dict): 
                for key, value in json_data.items():
                    if isinstance(value, str) and value.startswith("/"):  
                        json_data[key] = urljoin(base_url, value)
                script.string = json.dumps(json_data)  
        except json.JSONDecodeError:
            pass  

    return str(soup)

@app.route("/")
def index():
    word = request.args.get("word", "").strip()
    return render_template("index.html", word=word)

def get_base_url(url):
    parsed_url = urlparse(url)
    return f"{parsed_url.scheme}://{parsed_url.netloc}"

@app.route("/proxy")
def proxy():
    redirect_url = request.args.get("url", "")
    if not redirect_url:
        return "Missing URL", 400

    headers = {"User-Agent": "Mozilla/5.0"}

    try:
        response = requests.get(redirect_url, headers=headers)
        response.raise_for_status()

        fixed_html = modify_html(response.text, get_base_url(redirect_url))

        return Response(fixed_html, content_type="text/html")
    except requests.exceptions.RequestException as e:
        return f"Error fetching {redirect_url}: {str(e)}", 500

if __name__ == "__main__":
    app.run(debug=True, port=5001)