# 3dicts

## Overview
`3dicts` is a web app for comparing English dictionary entries side by side. It shows the same word from three sources in one interface:

- Oxford
- Cambridge
- Longman

The main goal is simple: help users compare definitions, examples, pronunciation, and usage faster, without opening many browser tabs.

## Who It Is For
This project is designed for people who study English and often check more than one dictionary to understand a word better.

Typical use case:
- search for a word once
- read several dictionary entries in parallel
- compare meaning, examples, and pronunciation

## Product Principles
The interface should stay:

- simple
- fast
- predictable
- easy to use

The app should follow standard web and mobile behavior. The goal is not experimental UX, but a clean and familiar interface with as few actions as possible.

## Core Flow
The main user flow is word search:

1. Open the app.
2. Open search.
3. The input is already focused.
4. Start typing immediately.

This flow should always feel quick and frictionless.

## Dictionary Content Processing
Dictionary pages are not shown as-is. The app fetches content from official dictionary sites and cleans it before display.

Processing includes:

- removing ads, headers, navigation, and secondary UI
- removing unnecessary HTML elements
- stripping or overriding original CSS
- removing JavaScript that is not needed for reading the entry
- adapting images for smaller screens
- rewriting links so they open inside the app

The app keeps the important parts of each entry:

- definitions
- examples
- transcription
- pronunciation audio

The goal is to preserve core dictionary content while making it compact and readable.

## Layout
The app is responsive and works on both desktop and mobile.

### Desktop
- Wide window: all three dictionaries are visible at once.
- Narrow window: one dictionary is visible at a time.
- Left and right arrow keys switch dictionaries in narrow mode.

Keyboard shortcuts:
- `/` open search
- `Space` play pronunciation
- `Escape` close search

### Mobile
- One dictionary is visible at a time.
- Dictionaries can be switched with swipe gestures.
- A floating round search button opens search.
- The button can be moved, and its position is saved.

## Search Overlay
On mobile and narrow layouts, search opens as a full-screen overlay.

It includes:

- a search input at the top
- recent words
- suggestions while typing

The input stays at the top while the list scrolls.

Recent words are stored in browser `localStorage`.

## Missing Words
If a word is not found, dictionaries may return suggestion pages such as “Did you mean”.

The app should display those suggestion states correctly for each dictionary.

## PWA Support
The project supports Progressive Web App behavior so it can be installed on iPhone/iPad and launched like a standalone app.

This includes:

- manifest support
- installable app behavior
- mobile-friendly standalone UI

## Features
- Unified search across Oxford, Cambridge, and Longman
- Cleaned dictionary cards inside a single interface
- Audio pronunciation support
- Local recent history
- Responsive desktop and mobile layout
- PWA support

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
Open:

`http://127.0.0.1:5002/`

## Docker
Build and run with Docker:

```bash
docker build -t 3dicts .
docker run -p 5002:5002 3dicts
```
