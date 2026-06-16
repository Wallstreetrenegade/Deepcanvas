import CodeMirror from '@uiw/react-codemirror';
import {html} from '@codemirror/lang-html';
import {EditorView} from '@codemirror/view';
import {useMemo} from 'react';

interface HtmlEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function HtmlEditor({value, onChange, placeholder}: HtmlEditorProps) {
  // Custom theme configuration for better integration with the app
  const theme = EditorView.theme({
    '&': {
      fontSize: '14px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      height: '100%',
    },
    '.cm-content': {
      minHeight: '400px',
      padding: '12px 16px',
      caretColor: '#1f2937',
    },
    '.cm-line': {
      padding: '0',
      lineHeight: '1.6',
    },
    '.cm-gutters': {
      backgroundColor: '#f9fafb',
      color: '#9ca3af',
      border: 'none',
      borderRight: '1px solid #e5e7eb',
      paddingRight: '8px',
      paddingLeft: '8px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#f3f4f6',
      color: '#374151',
    },

    '.cm-selectionBackground, ::selection': {
      backgroundColor: '#dbeafe !important',
    },
    '.cm-focused .cm-selectionBackground, .cm-focused ::selection': {
      backgroundColor: '#bfdbfe !important',
    },
    '.cm-cursor': {
      borderLeftColor: '#1f2937',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      overflow: 'auto',
      maxHeight: '600px',
    },
  });

  // Extensions with HTML support and line numbers
  const extensions = useMemo(
    () => [
      html(),
      theme,
      EditorView.lineWrapping, // Enable line wrapping for long lines
    ],
    [theme],
  );

  return (
    <div className="html-editor-container">
      <CodeMirror
        value={value}
        height="100%"
        extensions={extensions}
        onChange={onChange}
        placeholder={placeholder}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: true,
          crosshairCursor: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          searchKeymap: true,
          foldKeymap: true,
          completionKeymap: true,
          lintKeymap: true,
        }}
      />
    </div>
  );
}
