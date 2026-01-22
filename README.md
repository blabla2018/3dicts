# 3dicts

## Overview
`3dicts` is a web tool to view **Oxford**, **Cambridge**, and **Longman** dictionaries simultaneously for any given word.

## Features
- **Unified Search:** Search bar to look up words in all three dictionaries at once.
- **Audio Pronunciation:** Play pronunciation directly from the header (sourced from Oxford).
- **Search History:** Quick-access dropdown with your recently searched words.
- **Clean Interface:** Distraction-free reading with removed ads and headers. 
- **Responsive Layout:** Three-column view for desktop.

## Installation
1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Run the application:
   ```bash
   python app.py
   ```

## Usage
Open your browser and go to:
**http://127.0.0.1:5002/**

## Docker
Build and run with Docker:
```bash
docker build -t 3dicts .
docker run -p 5002:5002 3dicts
```
