# HTML Preview

Preview local `.html` files inside Obsidian — styles and scripts included — without leaving the app or opening a browser.

## Why

HTML files in a vault are normally treated as plain text. This plugin registers a real view for `.html` / `.htm`, so clicking a file in the file explorer renders it in place.

## Features

- Renders `.html` / `.htm` in a dedicated view
- Scripts and styles run, so self-contained pages (forms, dashboards, reports) work as written
- Injects `<base href>` so relative images / CSS / JS sitting next to the file keep resolving
- Toolbar: reload, open in the system browser, copy path
- File context menu entry: "Open in HTML preview"
- Two safety switches (see Settings)

## Usage

- Click any `.html` file in the file explorer.
- Or use the command palette: "Open HTML preview (pick a file)".
- Or right-click a file and choose "Open in HTML preview".

## Install

### Community plugins

Settings -> Community plugins -> Browse -> search "HTML Preview" -> Install -> Enable.

### Manually

Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/html-preview/`, then enable it under Settings -> Community plugins -> Installed plugins.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Allow backdrop-filter (frosted glass) | off | Pages that use `backdrop-filter: blur()` stack their blur layers with Obsidian's own compositing, which makes the window smear while scrolling. Off keeps previews crisp. Turn it on to render exactly as written. |
| Let the previewed page reach Obsidian (allow-same-origin) | off | Off keeps every preview in an opaque sandbox: scripts run, but the page cannot touch your vault or the app. Turn it on if the page needs `localStorage` or the clipboard — for example a self-made form with autosave. |

## Security

- A preview runs the page's own JavaScript. Only preview HTML you trust.
- The sandbox defaults to `allow-scripts allow-forms allow-modals allow-popups allow-downloads` **without** `allow-same-origin`, so a preview cannot reach into Obsidian or your vault.
- Turning on `allow-same-origin` relaxes that: the preview then shares Obsidian's origin. Use it for your own files only.
- No network requests, no telemetry. Nothing leaves your machine.

## Implementation notes

- Obsidian's `app://` resource URLs can be fetched, but cannot be used as an `iframe` src (the protocol does not support being framed), so the file text is written into `iframe.srcdoc`.
- `contain: paint` on the frame keeps repaints inside the preview pane.

## Development

Plain CommonJS, no build step — `main.js` is the shipped file. Edit it and reload the plugin (Settings -> Community plugins -> reload, or the "Reload app" command).

## License

MIT
