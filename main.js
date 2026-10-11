/* HTML Preview — render local .html files inside Obsidian.
 *
 * Why it reads the file instead of pointing an iframe at it:
 * Obsidian's app:// resource URLs can be fetched, but cannot be used as an
 * iframe src (the protocol does not support being framed), so the file text is
 * written into iframe.srcdoc instead.
 *
 * The preview injects <base href> so relative assets still resolve, and by
 * default strips backdrop-filter because stacked blur layers inside an iframe
 * make the whole window smear while scrolling.
 */
'use strict';

const obsidian = require('obsidian');
const { Plugin, PluginSettingTab, Setting, ItemView, TFile, FuzzySuggestModal, Notice, setIcon } = obsidian;

const VIEW_TYPE = 'html-preview';
const EXTENSIONS = ['html', 'htm'];
const SANDBOX_BASE = 'allow-scripts allow-forms allow-modals allow-popups allow-downloads';
const DEFAULT_SETTINGS = { disableBlur: true, allowSameOrigin: false };

class HtmlPreviewView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.file = null;
    this.frame = null;
    this.statusEl = null;
    this.nameEl = null;
    this._seq = 0;
  }

  getViewType() { return VIEW_TYPE; }
  getIcon() { return 'file-code-2'; }
  getDisplayText() { return this.file ? this.file.basename : 'HTML Preview'; }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass('html-preview-root');

    const bar = root.createDiv({ cls: 'html-preview-bar' });
    this.nameEl = bar.createDiv({ cls: 'html-preview-name', text: 'HTML Preview' });

    const btn = (icon, label, fn) => {
      const b = bar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label, title: label } });
      setIcon(b, icon);
      b.onclick = fn;
      return b;
    };
    btn('refresh-cw', 'Reload', () => this.load());
    btn('external-link', 'Open in system browser', () => this.openExternally());
    btn('copy', 'Copy path', async () => {
      if (!this.file) return;
      try { await navigator.clipboard.writeText(this.file.path); new Notice('Copied: ' + this.file.path); }
      catch (e) { new Notice('Copy failed'); }
    });

    const wrap = root.createDiv({ cls: 'html-preview-frame-wrap' });
    this.frame = wrap.createEl('iframe', {
      cls: 'html-preview-frame',
      attr: { sandbox: this.sandbox(), referrerpolicy: 'no-referrer' },
    });
    this.statusEl = root.createDiv({ cls: 'html-preview-status' });

    if (this.file) this.load();
  }

  async onLoadFile(file) {
    this.file = file;
    this.updateName();
    this.load();
  }

  async onUnloadFile() { /* keep the current render around */ }

  getState() { return { file: this.file ? this.file.path : null }; }

  async setState(state, result) {
    if (state && state.file) {
      const f = this.app.vault.getAbstractFileByPath(state.file);
      if (f instanceof TFile) this.file = f;
    }
    await super.setState(state, result);
    this.updateName();
    this.load();
  }

  updateName() {
    if (this.nameEl) this.nameEl.setText(this.file ? this.file.path : 'HTML Preview');
    if (this.leaf && this.leaf.updateHeader) this.leaf.updateHeader();
  }

  setStatus(s) { if (this.statusEl) this.statusEl.setText(s || ''); }

  sandbox() {
    return SANDBOX_BASE + (this.plugin.settings.allowSameOrigin ? ' allow-same-origin' : '');
  }

  baseHref() {
    const raw = this.app.vault.adapter.getResourcePath(this.file.path).split('?')[0];
    return raw.slice(0, raw.lastIndexOf('/') + 1);
  }

  /** inject <base> (relative assets) + preview-only styles (blur off by default) */
  decorate(html) {
    let out = html;
    const head = [];
    if (!/<base\s/i.test(out)) head.push('<base href="' + this.baseHref() + '">');
    const css = this.plugin.settings.disableBlur
      ? '*{-webkit-backdrop-filter:none !important;backdrop-filter:none !important}'
      : '';
    head.push('<style id="html-preview-style">' + css + '</style>');
    const tags = head.join('');
    if (/<head[^>]*>/i.test(out)) return out.replace(/<head[^>]*>/i, (m) => m + tags);
    if (/<html[^>]*>/i.test(out)) return out.replace(/<html[^>]*>/i, (m) => m + '<head>' + tags + '</head>');
    return tags + out;
  }

  async load() {
    if (!this.frame || !this.file) return;
    const seq = ++this._seq;
    this.setStatus('Loading…');
    try {
      const raw = await this.app.vault.read(this.file);
      if (seq !== this._seq) return;
      this.frame.srcdoc = this.decorate(raw);
      this.setStatus('');
    } catch (e) {
      this.setStatus('Failed to read: ' + ((e && e.message) || e));
    }
  }

  openExternally() {
    if (!this.file) return;
    window.open(this.app.vault.adapter.getResourcePath(this.file.path), '_blank');
  }

  async onClose() { this.frame = null; }
}

class HtmlFilePicker extends FuzzySuggestModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.setPlaceholder('Pick an HTML file to preview…');
  }
  getItems() { return this.app.vault.getFiles().filter((f) => EXTENSIONS.includes(f.extension)); }
  getItemText(f) { return f.path; }
  onChooseItem(f) { this.plugin.openFile(f); }
}

class HtmlPreviewSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Allow backdrop-filter (frosted glass)')
      .setDesc('Off by default. Blur layers inside the previewed page stack with Obsidian\'s own ' +
        'compositing and make the window smear while scrolling. Turn on to render exactly as written.')
      .addToggle((t) => t.setValue(this.plugin.settings.disableBlur === false).onChange(async (v) => {
        this.plugin.settings.disableBlur = !v;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName('Let the previewed page reach Obsidian (allow-same-origin)')
      .setDesc('Off by default, which keeps each preview in an opaque sandbox: scripts run, but the page ' +
        'cannot touch your vault or Obsidian itself. Turn it on if the page needs localStorage or the ' +
        'clipboard (e.g. a self-made form with autosave).')
      .addToggle((t) => t.setValue(this.plugin.settings.allowSameOrigin === true).onChange(async (v) => {
        this.plugin.settings.allowSameOrigin = v;
        await this.plugin.saveSettings();
      }));
  }
}

module.exports = class HtmlPreviewPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.registerView(VIEW_TYPE, (leaf) => new HtmlPreviewView(leaf, this));
    this.registerExtensions(EXTENSIONS, VIEW_TYPE);
    this.addSettingTab(new HtmlPreviewSettingTab(this.app, this));

    this.addCommand({
      id: 'open-preview',
      name: 'Open HTML preview (pick a file)',
      callback: () => new HtmlFilePicker(this.app, this).open(),
    });

    this.addCommand({
      id: 'preview-active',
      name: 'Preview current file (HTML only)',
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (!f || !EXTENSIONS.includes(f.extension)) return false;
        if (!checking) this.openFile(f);
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && EXTENSIONS.includes(file.extension)) {
          menu.addItem((i) => i.setTitle('Open in HTML preview').setIcon('file-code-2').onClick(() => this.openFile(file)));
        }
      })
    );
  }

  async saveSettings() { await this.saveData(this.settings); }

  openFile(file) {
    const leaf = this.app.workspace.getLeaf('tab');
    leaf.setViewState({ type: VIEW_TYPE, active: true, state: { file: file.path } });
    this.app.workspace.revealLeaf(leaf);
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
};
