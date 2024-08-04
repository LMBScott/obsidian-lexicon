import { App, Editor, MarkdownView, SuggestModal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { readdir } from 'node:fs/promises';

// Remember to rename these classes and interfaces!

interface ObsidianLexiconSettings {
	wordDir: string;
	phraseDir: string;
}

const DEFAULT_SETTINGS: ObsidianLexiconSettings = {
	wordDir: '.',
	phraseDir: '.'
}

export default class ObsidianLexicon extends Plugin {
	settings: ObsidianLexiconSettings;
	statusBarItemEl: HTMLElement;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		
		this.statusBarItemEl = this.addStatusBarItem();

		this.updateStatusBar();

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ObsidianLexiconSettingsTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	addWord() {
		this.updateStatusBar();
	}

	addPhrase() {
		this.updateStatusBar();
	}

	getDirFileCount(path: string) : number {
		try {
			(async () => await readdir(path)
				.then((files) => { return files.length; })
			)();
		} catch (err) {
			console.error(err);
			return -1;
		}

		return -1;
	}

	updateStatusBar() {
		const wordCount = this.getDirFileCount(this.settings.wordDir);

		if (wordCount === -1) {
			new Notice('Error getting word count from configured word directory.');
			return;
		}

		const phraseCount = this.getDirFileCount(this.settings.phraseDir);

		if (phraseCount === -1) {
			new Notice('Error getting phrase count from configured phrase directory.');
			return;
		}

		this.statusBarItemEl.setText(`Words: ${wordCount} Phrases: ${phraseCount}`);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

export class WordSuggestionModal extends SuggestModal<string> {
	suggestions: string[];

	// Returns all available suggestions.
	getSuggestions(query: string): string[] {
	  return this.suggestions.filter((suggestion) =>
		suggestion.toLowerCase().includes(query.toLowerCase())
	  );
	}
  
	// Renders each suggestion item.
	renderSuggestion(suggestion: string, el: HTMLElement) {
	  el.createEl("div", { text: suggestion });
	}
  
	// Perform action on the selected suggestion.
	onChooseSuggestion(suggestion: string, evt: MouseEvent | KeyboardEvent) {
	  new Notice(`Selected ${suggestion}`);
	}
  }

class ObsidianLexiconSettingsTab extends PluginSettingTab {
	plugin: ObsidianLexicon;

	constructor(app: App, plugin: ObsidianLexicon) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Word Directory')
			.setDesc('The directory containing all words in your lexicon. All notes here are assumed to be individual word definitions.')
			.addText(text => text
				.setPlaceholder('Enter the path to the word directory')
				.setValue(this.plugin.settings.wordDir)
				.onChange(async (value) => {
					this.plugin.settings.wordDir = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
		.setName('Phrase Directory')
		.setDesc('The directory containing all phrases in your lexicon. All notes here are assumed to be individual phrase definitions.')
		.addText(text => text
			.setPlaceholder('Enter the path to the phrase directory')
			.setValue(this.plugin.settings.phraseDir)
			.onChange(async (value) => {
				this.plugin.settings.phraseDir = value;
				await this.plugin.saveSettings();
			}));
	}
}
