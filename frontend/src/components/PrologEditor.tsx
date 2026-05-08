"use client";
import Editor, { loader } from "@monaco-editor/react";
import { useEffect } from "react";

// Configure Monaco for Prolog syntax highlighting
function configurePrologLanguage(monaco: any) {
  // Register language if not already registered
  const langs = monaco.languages.getLanguages();
  if (langs.some((l: any) => l.id === "prolog")) return;

  monaco.languages.register({ id: "prolog", extensions: [".pl", ".pro", ".prolog"] });

  monaco.languages.setMonarchTokensProvider("prolog", {
    keywords: [
      "is", "not", "true", "false", "fail", "halt",
      "assert", "asserta", "assertz", "retract", "retractall",
      "findall", "bagof", "setof", "forall",
      "call", "once", "ignore", "between",
      "atom", "number", "integer", "float", "string", "var", "nonvar", "compound",
      "functor", "arg", "copy_term", "succ_or_zero",
      "msort", "sort", "length", "append", "member", "memberchk",
      "last", "nth0", "nth1", "flatten", "permutation",
      "write", "writeln", "read", "nl", "tab", "format",
      "succ", "plus", "abs", "max", "min", "sqrt",
      "use_module", "module", "dynamic", "discontiguous", "multifile",
      "catch", "throw", "nb_getval", "nb_setval",
      "aggregate_all", "aggregate",
    ],
    tokenizer: {
      root: [
        // Comments
        [/%.*$/, "comment"],
        // Strings
        [/"[^"]*"/, "string"],
        [/'[^']*'/, "string"],
        // Numbers
        [/\b\d+\.?\d*\b/, "number"],
        // Operators
        [/:-|->|=\.\.|==|\\==|=:=|=\\=|@<|@>|@=<|@>=|\\+|\\=|is\b/, "keyword.operator"],
        [/[+\-*\/\\^<>=!;|,.]/, "operator"],
        // Variables (uppercase or _)
        [/\b[A-Z_][a-zA-Z0-9_]*\b/, "variable"],
        // Atoms (lowercase start)
        [/\b[a-z][a-zA-Z0-9_]*\b/, {
          cases: {
            "@keywords": "keyword",
            "@default": "identifier",
          }
        }],
        // Special atoms in quotes
        [/'[^']*'/, "string"],
        // Brackets
        [/[()[\]{}]/, "delimiter"],
      ],
      comment: [],
      string: [],
    },
  });

  // Theme
  monaco.editor.defineTheme("prolog-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment",          foreground: "6e7681", fontStyle: "italic" },
      { token: "keyword",          foreground: "ff7b72" },
      { token: "keyword.operator", foreground: "ff7b72" },
      { token: "operator",         foreground: "c9d1d9" },
      { token: "variable",         foreground: "79c0ff" },
      { token: "identifier",       foreground: "d2a8ff" },
      { token: "number",           foreground: "f2cc60" },
      { token: "string",           foreground: "a5d6ff" },
      { token: "delimiter",        foreground: "c9d1d9" },
    ],
    colors: {
      "editor.background":           "#0d1117",
      "editor.foreground":           "#e6edf3",
      "editorLineNumber.foreground": "#484f58",
      "editorLineNumber.activeForeground": "#7d8590",
      "editor.selectionBackground":  "#264f78",
      "editor.lineHighlightBackground": "#161b22",
      "editorCursor.foreground":     "#388bfd",
      "editor.inactiveSelectionBackground": "#1c2128",
    },
  });

  // Auto-completion
  monaco.languages.registerCompletionItemProvider("prolog", {
    provideCompletionItems: (model: any, position: any) => {
      const suggestions = [
        "findall(X, Goal, List)",
        "bagof(X, Goal, Bag)",
        "setof(X, Goal, Set)",
        "forall(Cond, Action)",
        "assert(Fact)",
        "retract(Fact)",
        "member(X, List)",
        "append(L1, L2, L3)",
        "length(List, N)",
        "msort(List, Sorted)",
        "sort(List, Sorted)",
        "between(Low, High, X)",
        "format('~w~n', [X])",
        "catch(Goal, Error, Handler)",
        "call_with_time_limit(Secs, Goal)",
        "succ(X, Y)",
        "plus(X, Y, Z)",
      ].map(label => ({
        label,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: label,
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column,
          endColumn: position.column,
        },
      }));
      return { suggestions };
    },
  });
}

interface Props {
  value: string;
  onChange: (value: string | undefined) => void;
  readOnly?: boolean;
}

export default function PrologEditor({ value, onChange, readOnly = false }: Props) {
  return (
    <Editor
      height="100%"
      language="prolog"
      theme="prolog-dark"
      value={value}
      onChange={onChange}
      options={{
        readOnly,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
        fontLigatures: true,
        lineNumbers: "on",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        tabSize: 4,
        insertSpaces: true,
        renderLineHighlight: "line",
        bracketPairColorization: { enabled: true },
        formatOnPaste: false,
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        folding: true,
        scrollbar: {
          vertical: "auto",
          horizontal: "auto",
        },
        padding: { top: 12, bottom: 12 },
      }}
      beforeMount={configurePrologLanguage}
    />
  );
}
