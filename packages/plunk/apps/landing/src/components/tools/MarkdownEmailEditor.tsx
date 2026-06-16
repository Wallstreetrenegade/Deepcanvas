import {EditorContent, useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {TextAlign} from '@tiptap/extension-text-align';
import {Color} from '@tiptap/extension-color';
import {TextStyle} from '@tiptap/extension-text-style';
import {Link} from '@tiptap/extension-link';
import {Underline} from '@tiptap/extension-underline';
import {Image} from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import {MarkdownEmailToolbar} from './MarkdownEmailToolbar';
import {useEffect} from 'react';

interface MarkdownEmailEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function MarkdownEmailEditor({value, onChange}: MarkdownEmailEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
      }),
      Color,
      TextStyle,
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'email-image',
        },
        inline: false,
      }),
      Placeholder.configure({
        placeholder: 'Start typing your email here...',
      }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[500px] px-4 py-3 text-neutral-900',
      },
    },
    onUpdate: ({editor}) => {
      const html = editor.getHTML();
      onChange(html);
    },
  });

  // Update editor content when value prop changes from outside
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '');
    }
  }, [value, editor]);

  return (
    <div className="border border-neutral-200 rounded-lg bg-white">
      <MarkdownEmailToolbar editor={editor} />
      <div className="overflow-hidden">
        <EditorContent editor={editor} className="bg-white" />
      </div>
    </div>
  );
}
