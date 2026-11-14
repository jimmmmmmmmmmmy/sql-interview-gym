import { sql } from '@codemirror/lang-sql';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';

export function mountEditor(parent, { onChange, onRun, onSubmit }) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: 'SELECT\n',
      extensions: [
        basicSetup,
        sql(),
        EditorState.tabSize.of(2),
        Prec.high(keymap.of([
          {
            key: 'Mod-Enter',
            preventDefault: true,
            run: () => {
              onRun();
              return true;
            },
          },
          {
            key: 'Mod-Shift-Enter',
            preventDefault: true,
            run: () => {
              onSubmit();
              return true;
            },
          },
        ])),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
        EditorView.theme({
          '&': { backgroundColor: '#fff' },
          '.cm-content': { padding: '10px 0' },
          '.cm-gutters': { backgroundColor: '#f6faf8', color: '#6d7f76', border: 'none' },
        }),
      ],
    }),
  });

  return {
    get: () => view.state.doc.toString(),
    set(text) {
      const next = text ?? '';
      if (view.state.doc.toString() === next) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
      });
    },
    focus() {
      view.focus();
    },
    refresh() {
      view.requestMeasure();
    },
  };
}
