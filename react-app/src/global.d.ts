/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.module.scss' {
  const classes: { [key: string]: string };
  export default classes;
}

// quilljs-markdown ships no .d.ts. Minimal declaration for our usage
// (constructor with a Quill editor instance and an options object, and
// a destroy() method for cleanup on unmount).
declare module 'quilljs-markdown' {
  export default class QuillMarkdown {
    constructor(editor: unknown, options?: Record<string, unknown>);
    destroy?(): void;
  }
}

declare module 'quilljs-markdown/dist/quilljs-markdown-common-style.css';

// Mammoth ships no .d.ts — declare just enough of the browser build for us.
declare module 'mammoth/mammoth.browser' {
  export interface MammothImage {
    contentType: string;
    altText?: string;
    read(encoding?: string): Promise<Uint8Array | string>;
  }

  export interface MammothMessage {
    type: 'warning' | 'error' | string;
    message: string;
  }

  export interface MammothResult {
    value: string;
    messages: MammothMessage[];
  }

  export const images: {
    imgElement(
      fn: (image: MammothImage) => Promise<{ src: string; alt?: string }>
    ): unknown;
  };

  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: {
      convertImage?: unknown;
      styleMap?: string | string[];
    }
  ): Promise<MammothResult>;
}

