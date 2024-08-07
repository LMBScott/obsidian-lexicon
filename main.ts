import { execSync } from 'child_process';
import { App, Editor, MarkdownView, SuggestModal, Notice, Plugin, PluginSettingTab, Setting, TFolder } from 'obsidian';

// Remember to rename these classes and interfaces!

interface ObsidianLexiconSettings {
	wordDir: string;
	dictName: string;
}

const DEFAULT_SETTINGS: ObsidianLexiconSettings = {
	wordDir: 'words',
	dictName: 'fd-fra-eng'
}

export default class ObsidianLexicon extends Plugin {
	settings: ObsidianLexiconSettings;
	statusBarItemEl: HTMLElement;
	definitionFoundPattern = `\\d+ definitions? found\\n\\n`;
	noDefinitionPattern = `No definitions found for ".+", perhaps you mean:\\n.+:  `;
	definitionSourcePattern = `From .+:\\n\\n`
	fs = require('fs');

	async onload() {
		await this.loadSettings();
		this.statusBarItemEl = this.addStatusBarItem();

		this.updateStatusBar();

		// Check whether a lexicon entry was deleted whenever a file or folder is deleted
		this.registerEvent(this.app.vault.on('delete', () => {
			this.updateStatusBar()
		}));

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'create-word-entry',
			name: 'Create word entry',
			hotkeys: undefined,
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				const selection = editor.getSelection();

				if (selection.length < 1)
				{
					new Notice("Please select a word for which to create an entry.")
					console.error("Empty selection")
					return;
				}

				this.addWordEntry(selection, editor);
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ObsidianLexiconSettingsTab(this.app, this));
	}

	tryParseDefinitions(text: string): string | null
	{
		const matchBounds = this.getNextMatchBounds(this.definitionFoundPattern, text);

		if (matchBounds === null)
		{
			console.error(`Definition output failed to match expected format.`);
			return null;
		}

		var definitions = text.slice(matchBounds[1] - 1).trim();

		var defSourceBounds = this.getNextMatchBounds(this.definitionSourcePattern, definitions);

		while (defSourceBounds !== null)
		{
			definitions = definitions.substring(0, defSourceBounds[0]) + definitions.substring(defSourceBounds[1]);

			defSourceBounds = this.getNextMatchBounds(this.definitionSourcePattern, definitions);
		}

		return definitions.trim()
	}

	tryParseWordSuggestions(text: string): string[] | null
	{
		const matchBounds = this.getNextMatchBounds(this.noDefinitionPattern, text);

		if (matchBounds === null)
		{
			console.error(`Missing definition output failed to match expected format.`);
			return null;
		}

		const suggestions = text.slice(matchBounds[1]).split('  ');

		return suggestions
	}

	addWordEntry(word: string, editor: Editor)
	{
		const dictResult = this.getDictionaryResult(word);

		if (!dictResult) {
			new Notice(`Couldn't find word: ${word} in the dictionary.`)
			console.error(`Failed to get dictionary result for ${word}`);
			return;
		}

		const definition = this.tryParseDefinitions(dictResult)

		// No definition found, attempt to get suggestions
		if (definition === null)
		{
			const suggestions = this.tryParseWordSuggestions(dictResult)

			// No suggestions found
			if (suggestions === null || suggestions.length < 1)
			{
				new Notice(`Couldn't find word: ${word} in the dictionary.`)
				console.error(`No suggestions given for word ${word}`);
				return null;
			}

			new Notice(`Couldn't find word: ${word}, did you mean one of these words?`)

			// Allow user to choose one of the suggestions
			new WordSuggestionModal(this.app, suggestions, (value: string) => {
				if (!this.app.workspace.activeEditor || !this.app.workspace.activeEditor.editor)
				{
					console.error(`No editor active, expected active editor when replacing selection.`);
					return;
				}
				
				// Add an entry for the chosen dictionary word
				this.addWordEntry(value.trim(), this.app.workspace.activeEditor.editor);
			}).open();

			return;
		}

		const wordNotePath = `${this.settings.wordDir}/${word}.md`;

		// Replace selection with chosen suggested dictionary word, if one was chosen
		editor.replaceSelection(word);

		this.createWordNote(wordNotePath, word, definition);

		this.updateStatusBar();
	}

	createWordNote(path: string, word: string, text: string)
	{
		if (this.fs.existsSync(path)) {
			new Notice(`Entry for word ${word} already exists.`);
			console.log(`Entry for word ${word} already exists.`);
			return;
		}

		this.fs.writeFile(path, text,  (err: NodeJS.ErrnoException | null) => {
			if (err) {
				console.error(err);
				return;
			}

			new Notice(`Created a new note for word: ${word}`);
			console.log(`Created new note for word ${word}`);
		});
	}

	getNextMatchBounds(pattern: string, input: string): [number, number] | null
	{
		const regex = new RegExp(pattern, 'g');
		const matchFound = regex.exec(input);

		if (!matchFound)
		{
			return null;
		}

		return [regex.lastIndex - matchFound[0].length, regex.lastIndex];
	}

	getDictionaryResult(query: string): string | null {
		const { exec } = require('child_process');

		const queryCommand = `/opt/homebrew/bin/dict -d ${this.settings.dictName} ${query}`;

		try {
			const stdout = execSync(queryCommand).toString();
			
			return stdout;
		}
		catch (err) {
			switch (err.status) {
				// Failed to find definition
				case 21:
					const stdout = err.stderr.toString();

					return stdout;
				// All other errors
				default:
					console.error(`Failed to execute dict command: ${err.message}`);
					break;
			}
			return null;
		}
	}

	getDirFileCount(path: string) : number {
		this.fs.readdir(path, (err: NodeJS.ErrnoException | null, files: string[]) => {
			if (err) {
				console.error(err);
				return -1;
			}

			return files.length;
		});

		return -1;
	}

	updateStatusBar() {
		var wordCount: number | string = this.getDirFileCount(this.settings.wordDir);

		if (wordCount === -1) {
			new Notice('Error getting word count from configured word directory.');
			wordCount = 'N/A'
		}

		this.statusBarItemEl.setText(`Lexicon Words: ${wordCount}`);
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

	onSubmit: (value: string) => void;

	constructor(app: App, suggestions: string[], onSubmit: (value: string) => void) {
		super(app);
		this.suggestions = suggestions;
		this.onSubmit = onSubmit;
	}
	
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
		this.onSubmit(suggestion);
	}
  }

class ObsidianLexiconSettingsTab extends PluginSettingTab {
	plugin: ObsidianLexicon;
	basePath = null;

	constructor(app: App, plugin: ObsidianLexicon) {
		super(app, plugin);
		this.plugin = plugin;
		//@ts-ignore (basePath property is added at runtime)
		this.basePath = this.app.vault.adapter.basePath;
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
					const folder = this.app.vault.getFolderByPath(value);

					if (folder === null) {
						new Notice('Invalid path to word directory.');
						return;
					}
					
					this.plugin.settings.wordDir = `${this.basePath}/${folder.path}`;

					console.log(this.plugin.settings.wordDir);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Dictionary Name')
			.setDesc('The name of the dictionary to be used to retrieve definitions. Should be recognised by the \`dict\` CLI tool. Use \`dict -I\` to list all valid dictionaries.')
			.addText(text => text
				.setPlaceholder('Enter the name of the dictionary')
				.setValue(this.plugin.settings.dictName)
				.onChange(async (value) => {
					this.plugin.settings.dictName = value;
					await this.plugin.saveSettings();
				}));
	}
}
