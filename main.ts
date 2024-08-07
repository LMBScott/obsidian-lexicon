import { execSync } from 'child_process';
import { App, Editor, MarkdownView, SuggestModal, Notice, Plugin, PluginSettingTab, Setting, TFolder } from 'obsidian';

// Remember to rename these classes and interfaces!

interface ObsidianLexiconSettings {
	wordDir: string;
	phraseDir: string;
	dictName: string;
}

const DEFAULT_SETTINGS: ObsidianLexiconSettings = {
	wordDir: 'words',
	phraseDir: 'phrases',
	dictName: 'fd-fra-eng'
}

export default class ObsidianLexicon extends Plugin {
	settings: ObsidianLexiconSettings;
	statusBarItemEl: HTMLElement;
	definitionFoundPattern = `\\d+ definitions? found\\n\\nFrom .+:\\n\\n`;
	noDefinitionPattern = `No definitions found for ".+", perhaps you mean:\\n.+:  `;
	fs = require('fs');

	async onload() {
		await this.loadSettings();
		this.statusBarItemEl = this.addStatusBarItem();

		this.updateStatusBar();

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'create-word-entry',
			name: 'Create word entry',
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

	addWordEntry(word: string, editor: Editor)
	{
		const dictResult = this.getDictionaryResult(word);

		if (!dictResult) {
			console.error(`Failed to get dictionary result for ${word}`);
			return;
		}

		word = dictResult[0];
		const wordNotePath = `${this.settings.wordDir}/${word}.md`;

		// Replace selection with chosen suggested dictionary word, if one was chosen
		editor.replaceSelection(word);

		this.createWordNote(wordNotePath, word, dictResult[1]);
	}

	createWordNote(path: string, word: string, text: string)
	{
		if (this.fs.existsSync(path)) {
			new Notice(`Note for word ${word} already exists.`);
			console.log(`Note for word ${word} already exists.`);
			return;
		}

		this.fs.writeFile(path, text,  (err: NodeJS.ErrnoException | null) => {
			if (err) {
				console.error(err);
				return;
			}

			console.log(`Created new note for word ${word}`);
		});
	}

	getLastMatchIndex(pattern: string, input: string)
	{
		const regex = new RegExp(pattern, 'g');
		const matchFound = regex.exec(input);

		if (!matchFound)
		{
			return -1;
		}

		return regex.lastIndex;
	}

	getDictionaryResult(query: string): string[] | null {
		const { exec } = require('child_process');

		const queryCommand = `/opt/homebrew/bin/dict -d ${this.settings.dictName} ${query}`;

		try {
			const stdout = execSync(queryCommand).toString();

			console.log(stdout);

			const lastIndex = this.getLastMatchIndex(this.definitionFoundPattern, stdout);

			if (lastIndex === -1)
			{
				new Notice(`Error parsing definition output.`);
				console.error(`Definition output failed to match expected format.`);
				return null;
			}
			
			const definition = stdout.slice(lastIndex - 1).trim();
			
			return [query, definition];
		}
		catch (err) {
			switch (err.status) {
				// Failed to find definition
				case 21:
					const stdout = err.stderr.toString();

					console.log(stdout)

					const lastIndex = this.getLastMatchIndex(this.noDefinitionPattern, stdout);

					if (lastIndex === -1)
					{
						new Notice(`Error parsing missing definition output.`);
						console.error(`Missing definition output failed to match expected format.`);
						return null;
					}

					const suggestions = stdout.slice(lastIndex).split('  ');

					if (suggestions.length < 1)
					{
						new Notice(`Couldn't find word: ${query} in the dictionary.`)
						console.error(`No suggestions given for word ${query}`);
						return null;
					}
					
					new WordSuggestionModal(this.app, suggestions, (value: string) => {
						if (!this.app.workspace.activeEditor || !this.app.workspace.activeEditor.editor)
						{
							console.error(`No editor active, expected active editor when replacing selection.`);
							return;
						}
						
						// Add an entry for the chosen dictionary word
						this.addWordEntry(value.trim(), this.app.workspace.activeEditor.editor);
					}).open();
					break;
				// All other errors
				default:
					console.error(`Failed to execute dict command: ${err.message}`);
					break;
			}
			return null;
		}
	}

	addWord() {
		this.updateStatusBar();
	}

	addPhrase() {
		this.updateStatusBar();
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

		var phraseCount: number | string = this.getDirFileCount(this.settings.phraseDir);

		if (phraseCount === -1) {
			new Notice('Error getting phrase count from configured phrase directory.');
			phraseCount = 'N/A';
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
			.setName('Phrase Directory')
			.setDesc('The directory containing all phrases in your lexicon. All notes here are assumed to be individual phrase definitions.')
			.addText(text => text
				.setPlaceholder('Enter the path to the phrase directory')
				.setValue(this.plugin.settings.phraseDir)
				.onChange(async (value) => {
					const folder = this.app.vault.getFolderByPath(value);

					if (folder === null) {
						new Notice('Invalid path to word directory.');
						return;
					}

					this.plugin.settings.phraseDir = `${this.basePath}/${folder.path}`;
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
