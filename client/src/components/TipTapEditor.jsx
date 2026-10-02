import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';

export default function TipTapEditor({ initialHtml, onChange, editable = true, onSelection }) {
  const [ready, setReady] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: initialHtml || '<p></p>',
    editable,
    editorProps: { attributes: { class: 'tiptap' } },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onSelectionUpdate: ({ editor }) => {
      if (onSelection) {
        try {
          const { from, to } = editor.state.selection;
          onSelection(editor.state.doc.textBetween(from, to, ' ').trim().slice(0, 300));
        } catch { onSelection(''); }
      }
    },
  });

  useEffect(() => {
    if (editor && !ready) {
      editor.commands.setContent(initialHtml || '<p></p>');
      setReady(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return <div className="editor-loading muted">Loading editor…</div>;

  const btn = (label, action, active) => (
    <button
      key={label}
      type="button"
      className={'tool-btn' + (active ? ' active' : '')}
      onMouseDown={(e) => { e.preventDefault(); action(); }}
    >
      {label}
    </button>
  );

  return (
    <div className="editor-wrap">
      {editable && (
        <div className="toolbar" role="toolbar" aria-label="Formatting">
        {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
        {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
        {btn('U', () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'))}
        <span className="tool-sep" />
        {btn('H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }))}
        {btn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
        {btn('¶', () => editor.chain().focus().setParagraph().run(), editor.isActive('paragraph'))}
        <span className="tool-sep" />
        {btn('• List', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
        {btn('1. List', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
