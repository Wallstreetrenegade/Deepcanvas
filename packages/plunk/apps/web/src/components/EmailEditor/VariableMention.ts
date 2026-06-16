import {Mention} from '@tiptap/extension-mention';
import type {Editor, Range} from '@tiptap/core';
import tippy, {Instance as TippyInstance, sticky} from 'tippy.js';
import type {SuggestionProps} from '@tiptap/suggestion';

// This will be set from the component
let availableVariables: string[] = [];

export function setAvailableVariables(variables: string[]) {
  availableVariables = variables || [];
}

// Suggestion component that will be rendered
class VariableSuggestionList {
  public element: HTMLDivElement;
  private items: string[];
  private selectedIndex: number;
  private command: (props: {id: string}) => void;

  constructor(props: SuggestionProps) {
    this.items = Array.isArray(props.items) ? props.items : [];
    this.selectedIndex = 0;
    this.command = props.command;

    this.element = document.createElement('div');
    this.element.className = 'variable-suggestion-list';
    this.render();
  }

  render() {
    if (!Array.isArray(this.items) || this.items.length === 0) {
      this.element.innerHTML = '<div class="suggestion-item-empty">No variables found</div>';
      return;
    }

    this.element.innerHTML = this.items
      .map(
        (item, index) => `
        <div class="suggestion-item${index === this.selectedIndex ? ' is-selected' : ''}" data-index="${index}">
          <code>{{${item}}}</code>
        </div>
      `,
      )
      .join('');

    // Add click handlers
    this.element.querySelectorAll('.suggestion-item').forEach((el, index) => {
      el.addEventListener('click', () => {
        this.selectItem(index);
      });
    });
  }

  selectItem(index: number) {
    const item = this.items[index];
    if (item && this.command) {
      this.command({id: item});
    }
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key === 'ArrowUp') {
      this.upHandler();
      return true;
    }

    if (event.key === 'ArrowDown') {
      this.downHandler();
      return true;
    }

    if (event.key === 'Enter') {
      this.enterHandler();
      return true;
    }

    return false;
  }

  upHandler() {
    if (!Array.isArray(this.items) || this.items.length === 0) return;
    this.selectedIndex = (this.selectedIndex + this.items.length - 1) % this.items.length;
    this.render();
  }

  downHandler() {
    if (!Array.isArray(this.items) || this.items.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
    this.render();
  }

  enterHandler() {
    if (!Array.isArray(this.items) || this.items.length === 0) return;
    this.selectItem(this.selectedIndex);
  }

  update(props: SuggestionProps) {
    this.items = Array.isArray(props.items) ? props.items : [];
    this.selectedIndex = 0;
    this.render();
  }

  destroy() {
    this.element.remove();
  }
}

export const VariableMention = Mention.configure({
  HTMLAttributes: {
    class: 'variable-mention',
  },
  renderLabel({node}) {
    return `{{${node.attrs.id}}}`;
  },
  suggestion: {
    char: '{{',

    items: ({query}) => {
      const safeVariables = Array.isArray(availableVariables) ? availableVariables : [];
      const allVariables = ['id', 'email', 'unsubscribeUrl', 'subscribeUrl', 'manageUrl', 'locale', ...safeVariables];
      const uniqueVariables = Array.from(new Set(allVariables)).filter(v => typeof v === 'string');

      if (!query) {
        return uniqueVariables.slice(0, 10);
      }

      const lowerQuery = query.toLowerCase();
      return uniqueVariables.filter(item => item.toLowerCase().startsWith(lowerQuery)).slice(0, 10);
    },

    command: ({editor, range, props}: {editor: Editor; range: Range; props: {id: string | null}}) => {
      // Delete the {{ trigger characters and insert the variable as plain text
      if (!props.id) return;
      editor.chain().focus().deleteRange(range).insertContent(`{{${props.id}}}`).run();
    },

    render: () => {
      let component: VariableSuggestionList;
      let popup: TippyInstance[];
      let scrollHandler: (() => void) | null = null;

      return {
        onStart: (props: SuggestionProps) => {
          component = new VariableSuggestionList(props);

          if (!props.clientRect) {
            return;
          }

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            theme: 'variable-suggestion',
            plugins: [sticky],
            sticky: 'reference',
            popperOptions: {
              strategy: 'fixed',
            },
          });

          // Update position on scroll
          scrollHandler = () => {
            if (popup?.[0] && props.clientRect) {
              popup[0].setProps({
                getReferenceClientRect: props.clientRect as () => DOMRect,
              });
            }
          };

          // Find the scrolling editor container and add listener
          const editorContainer = document.querySelector('.overflow-y-auto');
          if (editorContainer) {
            editorContainer.addEventListener('scroll', scrollHandler);
          }
          window.addEventListener('scroll', scrollHandler, true);
        },

        onUpdate(props: SuggestionProps) {
          component?.update(props);

          if (!props.clientRect) {
            return;
          }

          popup?.[0]?.setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        },

        onKeyDown(props: {event: KeyboardEvent}) {
          if (props.event.key === 'Escape') {
            popup?.[0]?.hide();
            return true;
          }

          return component?.onKeyDown(props.event) || false;
        },

        onExit() {
          // Clean up scroll listeners
          if (scrollHandler) {
            const editorContainer = document.querySelector('.overflow-y-auto');
            if (editorContainer) {
              editorContainer.removeEventListener('scroll', scrollHandler);
            }
            window.removeEventListener('scroll', scrollHandler, true);
          }

          popup?.[0]?.destroy();
          component?.destroy();
        },
      };
    },
  },
});
