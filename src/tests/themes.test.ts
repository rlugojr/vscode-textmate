/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import { Registry, RegistryOptions, IRawTheme } from '../main';
import { ScopeListElement, ScopeMetadata, StackElementMetadata } from '../grammar';
import {
	Theme, strcmp, strArrCmp, ThemeTrieElement, ThemeTrieElementRule,
	parseTheme, ParsedThemeRule, FontStyle, ColorMap
} from '../theme';
import * as plist from 'fast-plist';
import { ThemeTest } from './themeTest';

const THEMES_TEST_PATH = path.join(__dirname, '../../test-cases/themes');

export interface ILanguageRegistration {
	id: string;
	extensions: string[];
	filenames: string[];
}

export interface IGrammarRegistration {
	language: string;
	scopeName: string;
	path: string;
	embeddedLanguages: { [scopeName: string]: string; };
}

export class Resolver implements RegistryOptions {
	public readonly language2id: { [languages: string]: number; };
	private _lastLanguageId: number;
	private _id2language: string[];
	private readonly _grammars: IGrammarRegistration[];
	private readonly _languages: ILanguageRegistration[];

	constructor(grammars: IGrammarRegistration[], languages: ILanguageRegistration[]) {
		this._grammars = grammars;
		this._languages = languages;

		this.language2id = Object.create(null);
		this._lastLanguageId = 0;
		this._id2language = [];

		for (let i = 0; i < this._languages.length; i++) {
			let languageId = ++this._lastLanguageId;
			this.language2id[this._languages[i].id] = languageId;
			this._id2language[languageId] = this._languages[i].id;
		}
	}

	public findLanguageByExtension(fileExtension: string): string {
		for (let i = 0; i < this._languages.length; i++) {
			let language = this._languages[i];

			if (!language.extensions) {
				continue;
			}

			for (let j = 0; j < language.extensions.length; j++) {
				let extension = language.extensions[j];

				if (extension === fileExtension) {
					return language.id;
				}
			}
		}

		return null;
	}

	public findLanguageByFilename(filename: string): string {
		for (let i = 0; i < this._languages.length; i++) {
			let language = this._languages[i];

			if (!language.filenames) {
				continue;
			}

			for (let j = 0; j < language.filenames.length; j++) {
				let lFilename = language.filenames[j];

				if (filename === lFilename) {
					return language.id;
				}
			}
		}

		return null;
	}

	public findGrammarByLanguage(language: string): IGrammarRegistration {
		for (let i = 0; i < this._grammars.length; i++) {
			let grammar = this._grammars[i];

			if (grammar.language === language) {
				return grammar;
			}
		}

		throw new Error('Could not findGrammarByLanguage for ' + language);
	}

	public getFilePath(scopeName: string): string {
		for (let i = 0; i < this._grammars.length; i++) {
			let grammar = this._grammars[i];

			if (grammar.scopeName === scopeName) {
				return path.join(THEMES_TEST_PATH, grammar.path);
			}
		}
		// console.warn('missing grammar for ' + scopeName);
	}
}

export interface ThemeData {
	themeName: string;
	theme: IRawTheme;
	registry: Registry;
}

class ThemeInfo {
	private _themeName: string;
	private _filename: string;
	private _includeFilename: string;

	constructor(themeName: string, filename: string, includeFilename?: string) {
		this._themeName = themeName;
		this._filename = filename;
		this._includeFilename = includeFilename;
	}

	private static _loadThemeFile(filename: string): IRawTheme {
		let fullPath = path.join(THEMES_TEST_PATH, filename);
		let fileContents = fs.readFileSync(fullPath).toString();

		if (/\.json$/.test(filename)) {
			return JSON.parse(fileContents);
		}
		return plist.parse(fileContents);
	}

	public create(resolver: Resolver): ThemeData {
		let theme: IRawTheme = ThemeInfo._loadThemeFile(this._filename);
		if (this._includeFilename) {
			let includeTheme: IRawTheme = ThemeInfo._loadThemeFile(this._includeFilename);
			(<any>theme).settings = includeTheme.settings.concat(theme.settings);
		}

		// console.log(JSON.stringify(theme, null, '\t')); process.exit(0);

		let registry = new Registry(resolver);
		registry.setTheme(theme);

		return {
			themeName: this._themeName,
			theme: theme,
			registry: registry
		};
	}
}

function assertThemeTest(test: ThemeTest, themeDatas: ThemeData[]): void {
	(<any>it(test.testName, (done:(error?:any)=>void) => {
		test.evaluate(themeDatas, (err) => {
			test.writeDiffPage();
			assert.ok(!test.hasDiff(), 'no more unpatched differences');
			done();
		});
	})).timeout(20000);
}

(function () {
	let THEMES = [
		new ThemeInfo('abyss', 'Abyss.tmTheme'),
		new ThemeInfo('dark_vs', 'dark_vs.json'),
		new ThemeInfo('light_vs', 'light_vs.json'),
		new ThemeInfo('hc_black', 'hc_black.json'),
		new ThemeInfo('dark_plus', 'dark_plus.json', 'dark_vs.json'),
		new ThemeInfo('light_plus', 'light_plus.json', 'light_vs.json'),
		new ThemeInfo('kimbie_dark', 'Kimbie_dark.tmTheme'),
		new ThemeInfo('monokai', 'Monokai.tmTheme'),
		new ThemeInfo('monokai_dimmed', 'dimmed-monokai.tmTheme'),
		new ThemeInfo('quietlight', 'QuietLight.tmTheme'),
		new ThemeInfo('red', 'red.tmTheme'),
		new ThemeInfo('solarized_dark', 'Solarized-dark.tmTheme'),
		new ThemeInfo('solarized_light', 'Solarized-light.tmTheme'),
		new ThemeInfo('tomorrow_night_blue', 'Tomorrow-Night-Blue.tmTheme'),
	];

	// Load all language/grammar metadata
	let _grammars: IGrammarRegistration[] = JSON.parse(fs.readFileSync(path.join(THEMES_TEST_PATH, 'grammars.json')).toString('utf8'));
	let _languages: ILanguageRegistration[] = JSON.parse(fs.readFileSync(path.join(THEMES_TEST_PATH, 'languages.json')).toString('utf8'));
	let resolver = new Resolver(_grammars, _languages);

	let themeDatas: ThemeData[] = THEMES.map(theme => theme.create(resolver));

	describe('Theme suite', () => {
		// Discover all tests
		let testFiles = fs.readdirSync(path.join(THEMES_TEST_PATH, 'tests'));
		testFiles = testFiles.filter(testFile => !/\.result$/.test(testFile));
		testFiles = testFiles.filter(testFile => !/\.result.patch$/.test(testFile));
		testFiles = testFiles.filter(testFile => !/\.actual$/.test(testFile));
		testFiles = testFiles.filter(testFile => !/\.diff.html$/.test(testFile));
		testFiles.forEach((testFile) => {
			let themesTest = new ThemeTest(THEMES_TEST_PATH, testFile, resolver);
			assertThemeTest(themesTest, themeDatas);
		});

	});
})();

describe('Theme matching', () => {

	it('gives higher priority to deeper matches', () => {
		let theme = Theme.createFromRawTheme({
			settings: [
				{ settings: { foreground: '#100000', background: '#200000' } },
				{ scope: 'punctuation.definition.string.begin.html', settings: { foreground: '#300000' } },
				{ scope: 'meta.tag punctuation.definition.string', settings: { foreground: '#400000' } },
				// { scope: 'a', settings: { foreground: '#500000' } },
			]
		});

		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#100000');
		const _B = colorMap.getId('#200000');
		const _C = colorMap.getId('#400000');
		const _D = colorMap.getId('#300000');

		let actual = theme.match('punctuation.definition.string.begin.html');
		// console.log(actual); process.exit(0);

		assert.deepEqual(actual, [
			new ThemeTrieElementRule(5, null, FontStyle.NotSet, _D, _NOT_SET),
			new ThemeTrieElementRule(3, ['meta.tag'], FontStyle.NotSet, _C, _NOT_SET),
		]);
	});

	it('gives higher priority to parent matches 1', () => {
		let theme = Theme.createFromRawTheme({
			settings: [
				{ settings: { foreground: '#100000', background: '#200000' } },
				{ scope: 'c a', settings: { foreground: '#300000' } },
				{ scope: 'd a.b', settings: { foreground: '#400000' } },
				{ scope: 'a', settings: { foreground: '#500000' } },
			]
		});

		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#100000');
		const _B = colorMap.getId('#200000');
		const _C = colorMap.getId('#500000');
		const _D = colorMap.getId('#300000');
		const _E = colorMap.getId('#400000');

		let actual = theme.match('a.b');

		assert.deepEqual(actual, [
			new ThemeTrieElementRule(2, ['d'], FontStyle.NotSet, _E, _NOT_SET),
			new ThemeTrieElementRule(1, ['c'], FontStyle.NotSet, _D, _NOT_SET),
			new ThemeTrieElementRule(1, null, FontStyle.NotSet, _C, _NOT_SET),
		]);
	});

	it('gives higher priority to parent matches 2', () => {
		let theme = Theme.createFromRawTheme({
			settings: [
				{ settings: { foreground: '#100000', background: '#200000' } },
				{ scope: 'meta.tag entity', settings: { foreground: '#300000' } },
				{ scope: 'meta.selector.css entity.name.tag', settings: { foreground: '#400000' } },
				{ scope: 'entity', settings: { foreground: '#500000' } },
			]
		});

		let root = new ScopeListElement(null, 'text.html.cshtml', 0);
		let parent = new ScopeListElement(root, 'meta.tag.structure.any.html', 0);
		let r = ScopeListElement.mergeMetadata(0, parent, new ScopeMetadata('entity.name.tag.structure.any.html', 0, 0, theme.match('entity.name.tag.structure.any.html')));
		let colorMap = theme.getColorMap();
		assert.equal(colorMap[StackElementMetadata.getForeground(r)], '#300000');
	});

	it('can match', () => {
		let theme = Theme.createFromRawTheme({
			settings: [
				{ settings: { foreground: '#F8F8F2', background: '#272822' } },
				{ scope: 'source, something', settings: { background: '#100000' } },
				{ scope: ['bar', 'baz'], settings: { background: '#200000' } },
				{ scope: 'source.css selector bar', settings: { fontStyle: 'bold' } },
				{ scope: 'constant', settings: { fontStyle: 'italic', foreground: '#300000' } },
				{ scope: 'constant.numeric', settings: { foreground: '#400000' } },
				{ scope: 'constant.numeric.hex', settings: { fontStyle: 'bold' } },
				{ scope: 'constant.numeric.oct', settings: { fontStyle: 'bold italic underline' } },
				{ scope: 'constant.numeric.dec', settings: { fontStyle: '', foreground: '#500000' } },
				{ scope: 'storage.object.bar', settings: { fontStyle: '', foreground: '#600000' } },
			]
		});

		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#F8F8F2');
		const _B = colorMap.getId('#272822');
		const _C = colorMap.getId('#200000');
		const _D = colorMap.getId('#300000');
		const _E = colorMap.getId('#400000');
		const _F = colorMap.getId('#500000');
		const _G = colorMap.getId('#100000');
		const _H = colorMap.getId('#600000');

		function assertMatch(scopeName: string, expected: ThemeTrieElementRule[]): void {
			let actual = theme.match(scopeName);
			assert.deepEqual(actual, expected, 'when matching <<' + scopeName + '>>');
		}

		function assertSimpleMatch(scopeName: string, scopeDepth: number, fontStyle: FontStyle, foreground: number, background: number): void {
			assertMatch(scopeName, [
				new ThemeTrieElementRule(scopeDepth, null, fontStyle, foreground, background)
			]);
		}

		function assertNoMatch(scopeName: string): void {
			assertMatch(scopeName, [
				new ThemeTrieElementRule(0, null, FontStyle.NotSet, _NOT_SET, _NOT_SET)
			]);
		}

		// matches defaults
		assertNoMatch('');
		assertNoMatch('bazz');
		assertNoMatch('asdfg');

		// matches source
		assertSimpleMatch('source', 1, FontStyle.NotSet, _NOT_SET, _G);
		assertSimpleMatch('source.ts', 1, FontStyle.NotSet, _NOT_SET, _G);
		assertSimpleMatch('source.tss', 1, FontStyle.NotSet, _NOT_SET, _G);

		// matches something
		assertSimpleMatch('something', 1, FontStyle.NotSet, _NOT_SET, _G);
		assertSimpleMatch('something.ts', 1, FontStyle.NotSet, _NOT_SET, _G);
		assertSimpleMatch('something.tss', 1, FontStyle.NotSet, _NOT_SET, _G);

		// matches baz
		assertSimpleMatch('baz', 1, FontStyle.NotSet, _NOT_SET, _C);
		assertSimpleMatch('baz.ts', 1, FontStyle.NotSet, _NOT_SET, _C);
		assertSimpleMatch('baz.tss', 1, FontStyle.NotSet, _NOT_SET, _C);

		// matches constant
		assertSimpleMatch('constant', 1, FontStyle.Italic, _D, _NOT_SET);
		assertSimpleMatch('constant.string', 1, FontStyle.Italic, _D, _NOT_SET);
		assertSimpleMatch('constant.hex', 1, FontStyle.Italic, _D, _NOT_SET);

		// matches constant.numeric
		assertSimpleMatch('constant.numeric', 2, FontStyle.Italic, _E, _NOT_SET);
		assertSimpleMatch('constant.numeric.baz', 2, FontStyle.Italic, _E, _NOT_SET);

		// matches constant.numeric.hex
		assertSimpleMatch('constant.numeric.hex', 3, FontStyle.Bold, _E, _NOT_SET);
		assertSimpleMatch('constant.numeric.hex.baz', 3, FontStyle.Bold, _E, _NOT_SET);

		// matches constant.numeric.oct
		assertSimpleMatch('constant.numeric.oct', 3, FontStyle.Bold | FontStyle.Italic | FontStyle.Underline, _E, _NOT_SET);
		assertSimpleMatch('constant.numeric.oct.baz', 3, FontStyle.Bold | FontStyle.Italic | FontStyle.Underline, _E, _NOT_SET);

		// matches constant.numeric.dec
		assertSimpleMatch('constant.numeric.dec', 3, FontStyle.None, _F, _NOT_SET);
		assertSimpleMatch('constant.numeric.dec.baz', 3, FontStyle.None, _F, _NOT_SET);

		// matches storage.object.bar
		assertSimpleMatch('storage.object.bar', 3, FontStyle.None, _H, _NOT_SET);
		assertSimpleMatch('storage.object.bar.baz', 3, FontStyle.None, _H, _NOT_SET);

		// does not match storage.object.bar
		assertSimpleMatch('storage.object.bart', 0, FontStyle.NotSet, _NOT_SET, _NOT_SET);
		assertSimpleMatch('storage.object', 0, FontStyle.NotSet, _NOT_SET, _NOT_SET);
		assertSimpleMatch('storage', 0, FontStyle.NotSet, _NOT_SET, _NOT_SET);


		assertMatch('bar', [
			new ThemeTrieElementRule(1, ['selector', 'source.css'], FontStyle.Bold, _NOT_SET, _C),
			new ThemeTrieElementRule(1, null, FontStyle.NotSet, _NOT_SET, _C),
		]);
	});
});

describe('Theme parsing', () => {

	it('can parse', () => {

		let actual = parseTheme({
			settings: [
				{ settings: { foreground: '#F8F8F2', background: '#272822' } },
				{ scope: 'source, something', settings: { background: '#100000' } },
				{ scope: ['bar', 'baz'], settings: { background: '#010000' } },
				{ scope: 'source.css selector bar', settings: { fontStyle: 'bold' } },
				{ scope: 'constant', settings: { fontStyle: 'italic', foreground: '#ff0000' } },
				{ scope: 'constant.numeric', settings: { foreground: '#00ff00' } },
				{ scope: 'constant.numeric.hex', settings: { fontStyle: 'bold' } },
				{ scope: 'constant.numeric.oct', settings: { fontStyle: 'bold italic underline' } },
				{ scope: 'constant.numeric.dec', settings: { fontStyle: '', foreground: '#0000ff' } },
			]
		});

		let expected = [
			new ParsedThemeRule('', null, 0, FontStyle.NotSet, '#F8F8F2', '#272822'),
			new ParsedThemeRule('source', null, 1, FontStyle.NotSet, null, '#100000'),
			new ParsedThemeRule('something', null, 1, FontStyle.NotSet, null, '#100000'),
			new ParsedThemeRule('bar', null, 2, FontStyle.NotSet, null, '#010000'),
			new ParsedThemeRule('baz', null, 2, FontStyle.NotSet, null, '#010000'),
			new ParsedThemeRule('bar', ['selector', 'source.css'], 3, FontStyle.Bold, null, null),
			new ParsedThemeRule('constant', null, 4, FontStyle.Italic, '#ff0000', null),
			new ParsedThemeRule('constant.numeric', null, 5, FontStyle.NotSet, '#00ff00', null),
			new ParsedThemeRule('constant.numeric.hex', null, 6, FontStyle.Bold, null, null),
			new ParsedThemeRule('constant.numeric.oct', null, 7, FontStyle.Bold | FontStyle.Italic | FontStyle.Underline, null, null),
			new ParsedThemeRule('constant.numeric.dec', null, 8, FontStyle.None, '#0000ff', null),
		];

		assert.deepEqual(actual, expected);
	});
});

describe('Theme resolving', () => {

	it('strcmp works', () => {
		let actual = ['bar', 'z', 'zu', 'a', 'ab', ''].sort(strcmp);

		let expected = ['', 'a', 'ab', 'bar', 'z', 'zu'];
		assert.deepEqual(actual, expected);
	});

	it('strArrCmp works', () => {
		function assertStrArrCmp(testCase: string, a: string[], b: string[], expected: number): void {
			assert.equal(strArrCmp(a, b), expected, testCase);

		}
		assertStrArrCmp('001', null, null, 0);
		assertStrArrCmp('002', null, [], -1);
		assertStrArrCmp('003', null, ['a'], -1);
		assertStrArrCmp('004', [], null, 1);
		assertStrArrCmp('005', ['a'], null, 1);
		assertStrArrCmp('006', [], [], 0);
		assertStrArrCmp('007', [], ['a'], -1);
		assertStrArrCmp('008', ['a'], [], 1);
		assertStrArrCmp('009', ['a'], ['a'], 0);
		assertStrArrCmp('010', ['a', 'b'], ['a'], 1);
		assertStrArrCmp('011', ['a'], ['a', 'b'], -1);
		assertStrArrCmp('012', ['a', 'b'], ['a', 'b'], 0);
		assertStrArrCmp('013', ['a', 'b'], ['a', 'c'], -1);
		assertStrArrCmp('014', ['a', 'c'], ['a', 'b'], 1);
	});

	it('always has defaults', () => {
		let actual = Theme.createFromParsedTheme([]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#000000');
		const _B = colorMap.getId('#ffffff');
		let expected = new Theme(
			colorMap,
			new ThemeTrieElementRule(0, null, FontStyle.None, _A, _B),
			new ThemeTrieElement(new ThemeTrieElementRule(0, null, FontStyle.NotSet, _NOT_SET, _NOT_SET))
		);
		assert.deepEqual(actual, expected);
	});

	it('respects incoming defaults 1', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', null, -1, FontStyle.NotSet, null, null)
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#000000');
		const _B = colorMap.getId('#ffffff');
		let expected = new Theme(
			colorMap,
			new ThemeTrieElementRule(0, null, FontStyle.None, _A, _B),
			new ThemeTrieElement(new ThemeTrieElementRule(0, null, FontStyle.NotSet, _NOT_SET, _NOT_SET))
		);
		assert.deepEqual(actual, expected);
	});

	it('respects incoming defaults 2', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', null, -1, FontStyle.None, null, null)
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#000000');
		const _B = colorMap.getId('#ffffff');
		let expected = new Theme(
			colorMap,
			new ThemeTrieElementRule(0, null, FontStyle.None, _A, _B),
			new ThemeTrieElement(new ThemeTrieElementRule(0, null, FontStyle.NotSet, _NOT_SET, _NOT_SET))
		);
		assert.deepEqual(actual, expected);
	});

	it('respects incoming defaults 3', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', null, -1, FontStyle.Bold, null, null)
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#000000');
		const _B = colorMap.getId('#ffffff');
		let expected = new Theme(
			colorMap,
			new ThemeTrieElementRule(0, null, FontStyle.Bold, _A, _B),
			new ThemeTrieElement(new ThemeTrieElementRule(0, null, FontStyle.NotSet, _NOT_SET, _NOT_SET))
		);
		assert.deepEqual(actual, expected);
	});

	it('respects incoming defaults 4', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', null, -1, FontStyle.NotSet, '#ff0000', null)
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#ff0000');
		const _B = colorMap.getId('#ffffff');
		let expected = new Theme(
			colorMap,
			new ThemeTrieElementRule(0, null, FontStyle.None, _A, _B),
			new ThemeTrieElement(new ThemeTrieElementRule(0, null, FontStyle.NotSet, _NOT_SET, _NOT_SET))
		);
		assert.deepEqual(actual, expected);
	});

	it('respects incoming defaults 5', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', null, -1, FontStyle.NotSet, null, '#ff0000')
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#000000');
		const _B = colorMap.getId('#ff0000');
		let expected = new Theme(
			colorMap,
			new ThemeTrieElementRule(0, null, FontStyle.None, _A, _B),
			new ThemeTrieElement(new ThemeTrieElementRule(0, null, FontStyle.NotSet, _NOT_SET, _NOT_SET))
		);
		assert.deepEqual(actual, expected);
	});

	it('can merge incoming defaults', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', null, -1, FontStyle.NotSet, null, '#ff0000'),
			new ParsedThemeRule('', null, -1, FontStyle.NotSet, '#00ff00', null),
			new ParsedThemeRule('', null, -1, FontStyle.Bold, null, null),
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#00ff00');
		const _B = colorMap.getId('#ff0000');
		let expected = new Theme(
			colorMap,
			new ThemeTrieElementRule(0, null, FontStyle.Bold, _A, _B),
			new ThemeTrieElement(new ThemeTrieElementRule(0, null, FontStyle.NotSet, _NOT_SET, _NOT_SET))
		);
		assert.deepEqual(actual, expected);
	});

	it('defaults are inherited', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', null, -1, FontStyle.NotSet, '#F8F8F2', '#272822'),
			new ParsedThemeRule('var', null, -1, FontStyle.NotSet, '#ff0000', null)
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#F8F8F2');
		const _B = colorMap.getId('#272822');
		const _C = colorMap.getId('#ff0000');
		let expected = new Theme(
			colorMap,
			new ThemeTrieElementRule(0, null, FontStyle.None, _A, _B),
			new ThemeTrieElement(new ThemeTrieElementRule(0, null, FontStyle.NotSet, _NOT_SET, _NOT_SET), [], {
				'var': new ThemeTrieElement(new ThemeTrieElementRule(1, null, FontStyle.NotSet, _C, _NOT_SET))
			})
		);
		assert.deepEqual(actual, expected);
	});

	it('same rules get merged', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', null, -1, FontStyle.NotSet, '#F8F8F2', '#272822'),
			new ParsedThemeRule('var', null, 1, FontStyle.Bold, null, null),
			new ParsedThemeRule('var', null, 0, FontStyle.NotSet, '#ff0000', null),
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#F8F8F2');
		const _B = colorMap.getId('#272822');
		const _C = colorMap.getId('#ff0000');
		let expected = new Theme(
			colorMap,
			new ThemeTrieElementRule(0, null, FontStyle.None, _A, _B),
			new ThemeTrieElement(new ThemeTrieElementRule(0, null, FontStyle.NotSet, _NOT_SET, _NOT_SET), [], {
				'var': new ThemeTrieElement(new ThemeTrieElementRule(1, null, FontStyle.Bold, _C, _NOT_SET))
			})
		);
		assert.deepEqual(actual, expected);
	});

	it('rules are inherited 1', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', null, -1, FontStyle.NotSet, '#F8F8F2', '#272822'),
			new ParsedThemeRule('var', null, -1, FontStyle.Bold, '#ff0000', null),
			new ParsedThemeRule('var.identifier', null, -1, FontStyle.NotSet, '#00ff00', null),
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#F8F8F2');
		const _B = colorMap.getId('#272822');
		const _C = colorMap.getId('#ff0000');
		const _D = colorMap.getId('#00ff00');
		let expected = new Theme(
			colorMap,
			new ThemeTrieElementRule(0, null, FontStyle.None, _A, _B),
			new ThemeTrieElement(new ThemeTrieElementRule(0, null, FontStyle.NotSet, _NOT_SET, _NOT_SET), [], {
				'var': new ThemeTrieElement(new ThemeTrieElementRule(1, null, FontStyle.Bold, _C, _NOT_SET), [], {
					'identifier': new ThemeTrieElement(new ThemeTrieElementRule(2, null, FontStyle.Bold, _D, _NOT_SET))
				})
			})
		);
		assert.deepEqual(actual, expected);
	});

	it('rules are inherited 2', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', null, -1, FontStyle.NotSet, '#F8F8F2', '#272822'),
			new ParsedThemeRule('var', null, -1, FontStyle.Bold, '#ff0000', null),
			new ParsedThemeRule('var.identifier', null, -1, FontStyle.NotSet, '#00ff00', null),
			new ParsedThemeRule('constant', null, 4, FontStyle.Italic, '#100000', null),
			new ParsedThemeRule('constant.numeric', null, 5, FontStyle.NotSet, '#200000', null),
			new ParsedThemeRule('constant.numeric.hex', null, 6, FontStyle.Bold, null, null),
			new ParsedThemeRule('constant.numeric.oct', null, 7, FontStyle.Bold | FontStyle.Italic | FontStyle.Underline, null, null),
			new ParsedThemeRule('constant.numeric.dec', null, 8, FontStyle.None, '#300000', null),
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#F8F8F2');
		const _B = colorMap.getId('#272822');
		const _C = colorMap.getId('#100000');
		const _D = colorMap.getId('#200000');
		const _E = colorMap.getId('#300000');
		const _F = colorMap.getId('#ff0000');
		const _G = colorMap.getId('#00ff00');
		let expected = new Theme(
			colorMap,
			new ThemeTrieElementRule(0, null, FontStyle.None, _A, _B),
			new ThemeTrieElement(new ThemeTrieElementRule(0, null, FontStyle.NotSet, _NOT_SET, _NOT_SET), [], {
				'var': new ThemeTrieElement(new ThemeTrieElementRule(1, null, FontStyle.Bold, _F, _NOT_SET), [], {
					'identifier': new ThemeTrieElement(new ThemeTrieElementRule(2, null, FontStyle.Bold, _G, _NOT_SET))
				}),
				'constant': new ThemeTrieElement(new ThemeTrieElementRule(1, null, FontStyle.Italic, _C, _NOT_SET), [], {
					'numeric': new ThemeTrieElement(new ThemeTrieElementRule(2, null, FontStyle.Italic, _D, _NOT_SET), [], {
						'hex': new ThemeTrieElement(new ThemeTrieElementRule(3, null, FontStyle.Bold, _D, _NOT_SET)),
						'oct': new ThemeTrieElement(new ThemeTrieElementRule(3, null, FontStyle.Bold | FontStyle.Italic | FontStyle.Underline, _D, _NOT_SET)),
						'dec': new ThemeTrieElement(new ThemeTrieElementRule(3, null, FontStyle.None, _E, _NOT_SET)),
					})
				})
			})
		);
		assert.deepEqual(actual, expected);
	});

	it('rules with parent scopes', () => {
		let actual = Theme.createFromParsedTheme([
			new ParsedThemeRule('', null, -1, FontStyle.NotSet, '#F8F8F2', '#272822'),
			new ParsedThemeRule('var', null, -1, FontStyle.Bold, '#100000', null),
			new ParsedThemeRule('var.identifier', null, -1, FontStyle.NotSet, '#200000', null),
			new ParsedThemeRule('var', ['source.css'], 1, FontStyle.Italic, '#300000', null),
			new ParsedThemeRule('var', ['source.css'], 2, FontStyle.Underline, null, null),
		]);
		let colorMap = new ColorMap();
		const _NOT_SET = 0;
		const _A = colorMap.getId('#F8F8F2');
		const _B = colorMap.getId('#272822');
		const _C = colorMap.getId('#100000');
		const _D = colorMap.getId('#300000');
		const _E = colorMap.getId('#200000');
		let expected = new Theme(
			colorMap,
			new ThemeTrieElementRule(0, null, FontStyle.None, _A, _B),
			new ThemeTrieElement(new ThemeTrieElementRule(0, null, FontStyle.NotSet, _NOT_SET, _NOT_SET), [], {
				'var': new ThemeTrieElement(
					new ThemeTrieElementRule(1, null, FontStyle.Bold, _C, 0),
					[new ThemeTrieElementRule(1, ['source.css'], FontStyle.Underline, _D, _NOT_SET)],
					{
						'identifier': new ThemeTrieElement(
							new ThemeTrieElementRule(2, null, FontStyle.Bold, _E, _NOT_SET),
							[new ThemeTrieElementRule(1, ['source.css'], FontStyle.Underline, _D, _NOT_SET)]
						)
					}
				)
			})
		);
		assert.deepEqual(actual, expected);
	});

});
