import {defineConfig, defineDocs} from 'fumadocs-mdx/config';
import {remarkReplaceEnv} from './lib/remark-replace-env.mjs';

// Options: https://fumadocs.vercel.app/docs/mdx/collections#define-docs
export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkReplaceEnv],
  },
});
