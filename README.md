# 3dicts

`3dicts` is a small web app for comparing English dictionary entries from three sources in one place:

- Longman
- Cambridge
- Oxford

Search once and read the same word across all three dictionaries without opening multiple tabs.

## What It Does
- shows cleaned dictionary entries in one interface
- keeps navigation inside the app
- supports pronunciation audio
- stores recent words locally in the browser
- works on desktop and mobile
- supports PWA installation on iPhone/iPad

## Layout

### Desktop
- Wide window: all three dictionaries are visible at once.
- Narrow window: one dictionary is visible at a time.
- `/` opens search.
- `Space` plays pronunciation.
- `Escape` closes search.
- `←` and `→` switch dictionaries in narrow mode.

### Mobile
- One dictionary is visible at a time.
- Swipe left and right to switch dictionaries.
- A floating round search button opens full-screen search.
- Mobile loads the current dictionary first and loads the others on demand.

## Settings
The app includes a dedicated settings page with:

- auto-play pronunciation
- per-dictionary scale:
  - Longman
  - Cambridge
  - Oxford
- calibration mode for quick mobile tuning

## Missing Words
If a word is not found, the app shows either:

- the dictionary’s suggestion state, when available
- or a minimal built-in status page such as `Not found` or `Not available`

## Local Storage
The app stores user-specific state in the browser, including:

- recent search history
- current dictionary in narrow/mobile mode
- search draft
- dictionary scale settings
- calibration mode
- floating search button position
- pronunciation auto-play preference

## Run Locally
Install dependencies:

```bash
pip install -r requirements.txt
```

Run:

```bash
python app.py
```

Open:

`http://127.0.0.1:5002/`

Development example:

```bash
PORT=5001 FLASK_DEBUG=1 python app.py
```

## Docker
Build and run:

```bash
docker build -t 3dicts .
docker run -p 5002:5002 3dicts
```
