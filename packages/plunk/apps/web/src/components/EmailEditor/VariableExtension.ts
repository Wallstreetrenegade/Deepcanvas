import {mergeAttributes, Node} from '@tiptap/core';
import {Plugin, PluginKey} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';

export interface VariableOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    variable: {
      /**
       * Insert a variable at the current position
       */
      insertVariable: (name: string) => ReturnType;
    };
  }
}

export const Variable = Node.create<VariableOptions>({
  name: 'variable',

  group: 'inline',

  inline: true,

  selectable: true,

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: element => element.getAttribute('data-variable'),
        renderHTML: attributes => {
          if (!attributes.name) {
            return {};
          }

          return {
            'data-variable': attributes.name,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-variable]',
      },
    ];
  },

  renderHTML({node, HTMLAttributes}) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-variable': node.attrs.name,
        'class': 'variable-placeholder',
      }),
      `{{${node.attrs.name}}}`,
    ];
  },

  addCommands() {
    return {
      insertVariable:
        (name: string) =>
        ({commands}) => {
          return commands.insertContent({
            type: this.name,
            attrs: {name},
          });
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('variableAutodetect'),
        props: {
          decorations: ({doc}) => {
            const decorations: Decoration[] = [];
            const regex = /\{\{([^}]+)\}\}/g;

            doc.descendants((node, pos) => {
              if (node.isText && node.text) {
                let match;
                while ((match = regex.exec(node.text)) !== null) {
                  const from = pos + match.index;
                  const to = from + match[0].length;

                  decorations.push(
                    Decoration.inline(from, to, {
                      class: 'variable-highlight',
                    }),
                  );
                }
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
