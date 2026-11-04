// Language registry and detection. Every supported language is described by an adapter entry:
// how it is analysed (full syntax tree, token level, or plain text), how to recognise it, and a
// one-sentence plain-language description for beginners. New languages are added here.

export type AnalysisMode = 'syntax-tree' | 'tokens' | 'plain';

export interface LanguageInfo {
  id: string;
  name: string;
  mode: AnalysisMode;
  /** Tree-sitter grammar file base name (tree-sitter-<grammar>.wasm) for syntax-tree mode. */
  grammar?: string;
  extensions: string[];
  /** Exact file names (case-insensitive). */
  filenames?: string[];
  /** Interpreter names found in a "#!" first line. */
  shebang?: string[];
  /** What this language is typically used for, in everyday words. */
  about: string;
  /** Kind of file: program code, data/settings, web page, styling, documentation, script. */
  kind: 'code' | 'data' | 'markup' | 'style' | 'docs' | 'script' | 'build';
}

export const LANGUAGES: LanguageInfo[] = [
  { id: 'python', name: 'Python', mode: 'syntax-tree', grammar: 'python', extensions: ['py', 'pyw', 'pyi'], shebang: ['python', 'python3', 'python2'], kind: 'code', about: 'A popular general-purpose programming language known for readable code. Used for scripts, websites, data and automation.' },
  { id: 'javascript', name: 'JavaScript', mode: 'syntax-tree', grammar: 'javascript', extensions: ['js', 'mjs', 'cjs', 'jsx'], shebang: ['node', 'nodejs', 'deno', 'bun'], kind: 'code', about: 'The programming language of web pages. It makes websites interactive and also runs on servers (Node.js).' },
  { id: 'typescript', name: 'TypeScript', mode: 'syntax-tree', grammar: 'typescript', extensions: ['ts', 'mts', 'cts'], kind: 'code', about: 'JavaScript with added "types" — labels that say what kind of data each thing holds, which helps catch mistakes early.' },
  { id: 'tsx', name: 'TypeScript + JSX (React)', mode: 'syntax-tree', grammar: 'tsx', extensions: ['tsx'], kind: 'code', about: 'TypeScript mixed with HTML-like tags. Usually used to build user-interface pieces with React.' },
  { id: 'html', name: 'HTML', mode: 'syntax-tree', grammar: 'html', extensions: ['html', 'htm', 'xhtml'], kind: 'markup', about: 'The structure of a web page: headings, paragraphs, buttons, images. It describes what is on the page.' },
  { id: 'css', name: 'CSS', mode: 'syntax-tree', grammar: 'css', extensions: ['css'], kind: 'style', about: 'The look of a web page: colours, sizes, spacing and layout.' },
  { id: 'c', name: 'C', mode: 'syntax-tree', grammar: 'c', extensions: ['c', 'h'], kind: 'code', about: 'An older, very fast language close to the hardware. Used for operating systems, devices and performance-critical code.' },
  { id: 'cpp', name: 'C++', mode: 'syntax-tree', grammar: 'cpp', extensions: ['cpp', 'cc', 'cxx', 'c++', 'hpp', 'hh', 'hxx', 'h++', 'ino'], kind: 'code', about: 'A fast language built on C with extra organising tools (classes). Used for games, apps and engines.' },
  { id: 'csharp', name: 'C#', mode: 'syntax-tree', grammar: 'c_sharp', extensions: ['cs', 'csx'], kind: 'code', about: 'A Microsoft language used for Windows apps, websites and games (Unity).' },
  { id: 'java', name: 'Java', mode: 'syntax-tree', grammar: 'java', extensions: ['java'], kind: 'code', about: 'A widely used language for business software, servers and Android apps.' },
  { id: 'rust', name: 'Rust', mode: 'syntax-tree', grammar: 'rust', extensions: ['rs'], kind: 'code', about: 'A modern fast language designed to prevent many memory-related bugs.' },
  { id: 'go', name: 'Go', mode: 'syntax-tree', grammar: 'go', extensions: ['go'], kind: 'code', about: 'A simple, fast language from Google, popular for servers and command-line tools.' },
  { id: 'php', name: 'PHP', mode: 'syntax-tree', grammar: 'php', extensions: ['php', 'phtml', 'php3', 'php4', 'php5', 'phps'], shebang: ['php'], kind: 'code', about: 'A language that builds web pages on a server. Many websites (for example WordPress) use it.' },
  { id: 'ruby', name: 'Ruby', mode: 'syntax-tree', grammar: 'ruby', extensions: ['rb', 'rake', 'gemspec', 'ru'], filenames: ['gemfile', 'rakefile', 'guardfile', 'podfile'], shebang: ['ruby'], kind: 'code', about: 'A friendly scripting language, well known from the Ruby on Rails web framework.' },
  { id: 'swift', name: 'Swift', mode: 'syntax-tree', grammar: 'swift', extensions: ['swift'], kind: 'code', about: "Apple's language for iPhone, iPad and Mac apps." },
  { id: 'kotlin', name: 'Kotlin', mode: 'syntax-tree', grammar: 'kotlin', extensions: ['kt', 'kts'], kind: 'code', about: 'A modern language for Android apps and servers; works together with Java.' },
  { id: 'json', name: 'JSON', mode: 'syntax-tree', grammar: 'json', extensions: ['json', 'webmanifest', 'har', 'geojson'], filenames: ['.babelrc', '.eslintrc', '.prettierrc', 'composer.lock', 'package-lock.json'], kind: 'data', about: 'A simple format for storing data and settings as names and values. It contains no instructions, only data.' },
  { id: 'bash', name: 'Bash / Shell script', mode: 'syntax-tree', grammar: 'bash', extensions: ['sh', 'bash', 'zsh', 'ksh'], filenames: ['.bashrc', '.bash_profile', '.profile', '.zshrc'], shebang: ['bash', 'sh', 'zsh', 'ksh', 'dash'], kind: 'script', about: 'Commands for a terminal, written in a file so they can run one after another automatically.' },
  { id: 'toml', name: 'TOML', mode: 'syntax-tree', grammar: 'toml', extensions: ['toml'], filenames: ['cargo.lock', 'poetry.lock'], kind: 'data', about: 'A settings file format with sections in [brackets] and name = value lines.' },
  // Token-level adapters (hand-written lexers).
  { id: 'lua', name: 'Lua', mode: 'tokens', extensions: ['lua'], shebang: ['lua'], kind: 'code', about: 'A small scripting language often used inside games and apps to add behaviour.' },
  { id: 'yaml', name: 'YAML', mode: 'tokens', extensions: ['yml', 'yaml'], kind: 'data', about: 'A settings/data format that uses indentation and "name: value" lines. Common in configuration files.' },
  { id: 'sql', name: 'SQL', mode: 'tokens', extensions: ['sql', 'ddl', 'dml'], kind: 'code', about: 'The language for asking questions to databases and changing the data stored in them.' },
  { id: 'xml', name: 'XML', mode: 'tokens', extensions: ['xml', 'svg', 'xsd', 'xsl', 'xslt', 'plist', 'csproj', 'vbproj', 'fsproj', 'props', 'targets', 'xaml', 'resx', 'config', 'nuspec', 'wsdl', 'rss', 'atom', 'kml'], filenames: ['pom.xml'], kind: 'data', about: 'A tag-based format (like HTML) used to store structured data and settings.' },
  { id: 'powershell', name: 'PowerShell', mode: 'tokens', extensions: ['ps1', 'psm1', 'psd1'], shebang: ['pwsh', 'powershell'], kind: 'script', about: "Microsoft's command language for automating Windows (and other) systems." },
  { id: 'ini', name: 'INI / settings', mode: 'tokens', extensions: ['ini', 'cfg', 'conf', 'properties', 'env', 'editorconfig', 'gitconfig', 'npmrc', 'desktop', 'service'], filenames: ['.env', '.env.local', '.env.example', '.env.production', '.env.development', '.editorconfig', '.gitconfig', '.npmrc', '.gitattributes'], kind: 'data', about: 'A simple settings file: optional [sections] and name = value lines.' },
  { id: 'dockerfile', name: 'Dockerfile', mode: 'tokens', extensions: ['dockerfile'], filenames: ['dockerfile', 'containerfile'], kind: 'build', about: 'Step-by-step instructions to build a "container" — a packaged, ready-to-run copy of an application.' },
  { id: 'makefile', name: 'Makefile', mode: 'tokens', extensions: ['mk', 'mak'], filenames: ['makefile', 'gnumakefile'], kind: 'build', about: 'Recipes that tell the computer how to build a program from its source files.' },
  { id: 'markdown', name: 'Markdown', mode: 'tokens', extensions: ['md', 'markdown', 'mdx'], kind: 'docs', about: 'Plain text with light formatting (# headings, *emphasis*). Used for documentation such as README files.' },
  { id: 'batch', name: 'Windows Batch', mode: 'tokens', extensions: ['bat', 'cmd'], kind: 'script', about: 'Old-style Windows command scripts.' },
  { id: 'scss', name: 'SCSS / Sass / Less', mode: 'tokens', extensions: ['scss', 'sass', 'less', 'styl'], kind: 'style', about: 'CSS with extra features (variables, nesting). It describes how a web page looks.' },
  { id: 'gitignore', name: 'Ignore list', mode: 'tokens', extensions: ['gitignore', 'dockerignore', 'npmignore', 'eslintignore', 'prettierignore'], filenames: ['.gitignore', '.dockerignore', '.npmignore', '.eslintignore', '.prettierignore'], kind: 'data', about: 'A list of file name patterns that a tool should skip (for example files Git should not track).' },
  { id: 'plaintext', name: 'Plain text', mode: 'plain', extensions: ['txt', 'text', 'log', 'csv', 'tsv'], filenames: ['license', 'licence', 'copying', 'authors', 'notice', 'changelog'], kind: 'docs', about: 'Ordinary text with no programming structure.' },
];

const BY_ID = new Map(LANGUAGES.map((l) => [l.id, l]));

export const UNKNOWN_LANGUAGE: LanguageInfo = {
  id: 'unknown',
  name: 'Unknown format',
  mode: 'plain',
  extensions: [],
  kind: 'docs',
  about: 'This file type is not recognised. It is shown as plain text: lines, words, numbers and brackets can still be explored, but its meaning cannot be analysed.',
};

export function getLanguage(id: string): LanguageInfo {
  return BY_ID.get(id) ?? UNKNOWN_LANGUAGE;
}

export function baseName(path: string): string {
  const i = path.replace(/\\/g, '/').lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

export function extensionOf(path: string): string {
  const b = baseName(path).toLowerCase();
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1) : b.startsWith('.') ? b.slice(1) : '';
}

export interface Detection {
  language: LanguageInfo;
  /** How the language was recognised. */
  reason: 'filename' | 'extension' | 'shebang' | 'content' | 'none';
  confidence: 'verified' | 'likely' | 'assumption';
}

/** Recognise the language of a file from its name, extension, "#!" line or content. */
export function detectLanguage(path: string, content = ''): Detection {
  const name = baseName(path).toLowerCase();
  const ext = extensionOf(path);
  for (const l of LANGUAGES) if (l.filenames?.includes(name)) return { language: l, reason: 'filename', confidence: 'verified' };
  if (name.startsWith('dockerfile') || name.endsWith('.dockerfile')) return { language: BY_ID.get('dockerfile')!, reason: 'filename', confidence: 'verified' };
  if (name.startsWith('.env')) return { language: BY_ID.get('ini')!, reason: 'filename', confidence: 'likely' };
  if (ext === 'h') {
    // .h is shared by C and C++: look for C++-only constructs.
    const cpp = /\b(class|namespace|template\s*<|public:|private:|std::|virtual\s)/.test(content);
    return { language: BY_ID.get(cpp ? 'cpp' : 'c')!, reason: 'extension', confidence: 'likely' };
  }
  for (const l of LANGUAGES) if (ext && l.extensions.includes(ext)) return { language: l, reason: 'extension', confidence: 'verified' };
  const first = content.slice(0, 200).split('\n')[0];
  if (first.startsWith('#!')) {
    const m = /^#!\s*(?:\/usr\/bin\/env\s+(?:-\S+\s+)*)?(?:\S*\/)?([A-Za-z0-9_.-]+)/.exec(first);
    const interp = m ? m[1].replace(/[0-9.]+$/, '') : '';
    for (const l of LANGUAGES) if (l.shebang?.some((s) => s.replace(/[0-9.]+$/, '') === interp)) return { language: l, reason: 'shebang', confidence: 'verified' };
  }
  // Content sniffing for extension-less files.
  const t = content.trimStart().slice(0, 2000);
  if (/^<\?xml/.test(t)) return { language: BY_ID.get('xml')!, reason: 'content', confidence: 'likely' };
  if (/^<!doctype html|^<html/i.test(t)) return { language: BY_ID.get('html')!, reason: 'content', confidence: 'likely' };
  if (/^<\?php/.test(t)) return { language: BY_ID.get('php')!, reason: 'content', confidence: 'likely' };
  if (/^[{[]/.test(t)) {
    try {
      JSON.parse(content);
      return { language: BY_ID.get('json')!, reason: 'content', confidence: 'likely' };
    } catch {
      /* not JSON */
    }
  }
  if (!ext && /^(FROM|RUN|CMD|ENTRYPOINT)\s/m.test(t) && /^FROM\s/m.test(t)) return { language: BY_ID.get('dockerfile')!, reason: 'content', confidence: 'assumption' };
  return { language: UNKNOWN_LANGUAGE, reason: 'none', confidence: 'assumption' };
}

/** True when the bytes look like a binary (non-text) file. */
export function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8000);
  if (n === 0) return false;
  let suspicious = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) return true;
    if (b < 7 || (b > 13 && b < 32 && b !== 27)) suspicious++;
  }
  return suspicious / n > 0.1;
}

/** Folders that are never analysed (dependencies, build output, version control). */
export const IGNORED_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'target', '.next', '.nuxt', '.cache', '__pycache__', '.venv', 'venv', 'env', '.idea', '.vscode', 'vendor', 'bin', 'obj', '.gradle', 'Pods', 'coverage', '.pytest_cache', '.mypy_cache', '.turbo', '.parcel-cache']);
