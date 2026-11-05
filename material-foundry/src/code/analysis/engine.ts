// Code engine: detects the language of a file, analyses it with the best available adapter
// (syntax tree, tokens or plain text) and answers "what is at this position?" queries.
// Runs inside the code worker in the browser and directly in Node for tests. Never executes code.

import { detectLanguage, getLanguage, type Detection } from '../languages/registry';
import { getParser, type Tree } from '../languages/treesitter';
import { analyzeTree, buildFlow, elementAt } from './syntax';
import { analyzeTokens, elementAtTokens, type TokenAnalysis } from './tokens';
import { LineIndex } from './lines';
import type { ElementInfo, FileSummary, FlowStep, SyntaxIssue } from './types';

/** Files above this size are shown as plain text (no parsing) to keep the app responsive. */
export const MAX_PARSE_CHARS = 3_000_000;

interface OpenDoc {
  path: string;
  text: string;
  detection: Detection;
  tree: Tree | null;
  tokens: TokenAnalysis | null;
  summary: FileSummary;
  highlight: Int32Array;
}

export interface OpenResult {
  summary: FileSummary;
  highlight: Int32Array;
  languageName: string;
  detectedBy: Detection['reason'];
  detectionConfidence: Detection['confidence'];
  /** Set when the preferred analysis could not be used. */
  fallback?: string;
  parseMs: number;
}

export class CodeEngine {
  private docs = new Map<string, OpenDoc>();

  async open(path: string, text: string, languageOverride?: string): Promise<OpenResult> {
    const t0 = performance.now();
    this.close(path);
    let detection = detectLanguage(path, text);
    if (languageOverride) detection = { language: getLanguage(languageOverride), reason: 'filename', confidence: 'verified' };
    let lang = detection.language;
    let fallback: string | undefined;
    let tree: Tree | null = null;
    let tokens: TokenAnalysis | null = null;
    let summary: FileSummary;
    let highlight: Int32Array;
    if (text.length > MAX_PARSE_CHARS) {
      fallback = `This file is very large (${(text.length / 1e6).toFixed(1)} million characters), so it is shown as plain text without analysis.`;
      tokens = analyzeTokens(text, path, 'plaintext');
      tokens.summary.languageId = lang.id;
      tokens.summary.mode = 'plain';
      tokens.summary.limited = fallback;
      summary = tokens.summary;
      highlight = tokens.highlight;
    } else if (lang.mode === 'syntax-tree' && lang.grammar) {
      try {
        const parser = await getParser(lang.grammar);
        tree = parser.parse(text);
        if (!tree) throw new Error('parser returned no tree');
        const a = analyzeTree(tree, text, path, lang.id);
        summary = a.summary;
        highlight = a.highlight;
      } catch (e) {
        fallback = `The ${lang.name} grammar could not be loaded (${e instanceof Error ? e.message : String(e)}). Showing token-level analysis instead.`;
        tree = null;
        tokens = analyzeTokens(text, path, 'plaintext');
        tokens.summary.languageId = lang.id;
        summary = tokens.summary;
        highlight = tokens.highlight;
      }
    } else {
      tokens = analyzeTokens(text, path, lang.id);
      summary = tokens.summary;
      highlight = tokens.highlight;
    }
    if (fallback && !summary.limited) summary.limited = fallback;
    this.docs.set(path, { path, text, detection: { ...detection, language: lang }, tree, tokens, summary, highlight });
    lang = getLanguage(summary.languageId);
    return { summary, highlight, languageName: lang.name, detectedBy: detection.reason, detectionConfidence: detection.confidence, fallback, parseMs: performance.now() - t0 };
  }

  has(path: string): boolean {
    return this.docs.has(path);
  }

  text(path: string): string | undefined {
    return this.docs.get(path)?.text;
  }

  summary(path: string): FileSummary | undefined {
    return this.docs.get(path)?.summary;
  }

  /** Explain-ready facts about whatever is at `offset` in an open file. */
  element(path: string, offset: number): ElementInfo {
    const d = this.docs.get(path);
    if (!d) throw new Error(`File not open: ${path}`);
    if (d.tree) return elementAt(d.tree, d.text, offset, d.summary.languageId, d.summary);
    return elementAtTokens(d.tokens!, d.text, offset);
  }

  /** Step-by-step outline of the file's top level. */
  fileFlow(path: string): FlowStep[] {
    const d = this.docs.get(path);
    if (!d?.tree) return [];
    return buildFlow(d.tree.rootNode, new LineIndex(d.text));
  }

  /** Parse text without keeping it (used to check proposed edits for syntax errors). */
  async checkSyntax(path: string, text: string): Promise<{ checked: boolean; issues: SyntaxIssue[] }> {
    const lang = this.docs.get(path)?.detection.language ?? detectLanguage(path, text).language;
    if (lang.mode === 'syntax-tree' && lang.grammar) {
      try {
        const parser = await getParser(lang.grammar);
        const tree = parser.parse(text);
        if (!tree) return { checked: false, issues: [] };
        const a = analyzeTree(tree, text, path, lang.id);
        tree.delete();
        return { checked: true, issues: a.summary.issues };
      } catch {
        return { checked: false, issues: [] };
      }
    }
    if (lang.mode === 'tokens') return { checked: true, issues: analyzeTokens(text, path, lang.id).summary.issues };
    return { checked: false, issues: [] };
  }

  close(path: string): void {
    const d = this.docs.get(path);
    d?.tree?.delete();
    this.docs.delete(path);
  }

  closeAll(): void {
    for (const p of [...this.docs.keys()]) this.close(p);
  }
}
