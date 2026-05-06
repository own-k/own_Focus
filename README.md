# OWN_Focus

OWN_Focus is a Chrome extension that gives students an all-in-one study workspace inside the browser: focus tools, quick productivity apps, and learning helpers in one side panel.

## Features

- Focus-oriented side panel experience
- Distraction-blocking and lock-in flow
- Built-in Pomodoro and stopwatch/timer tools
- Notes and to-do utilities
- PDF viewing support
- YouTube utility/player integration
- AI chat shortcuts for ChatGPT, Claude, and Gemini
- Desmos quick access

## Tech

- Chrome Extension (Manifest V3)
- Vanilla JavaScript, HTML, CSS

## Project Structure

- `manifest.json` - extension configuration
- `background.js` - service worker logic
- `content.js` / `content.css` - page-level injected behavior and styles
- `sidepanel.html` / `sidepanel.css` / `sidepanel.js` - main UI
- `tools/` - individual tool modules (notes, pomodoro, lock-in, etc.)
- `icons/` - extension icons and assets
- `lib/` - third-party browser libraries (PDF.js worker/files)

## Load Locally In Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder

## Screenshots:
<img width="750" height="1606" alt="Shot Google Chrome111328" src="https://github.com/user-attachments/assets/d02aeb6e-ada0-48f3-bc40-3cc9e7d0e424" />
