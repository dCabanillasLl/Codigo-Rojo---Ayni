import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/** Cache only the built, public application shell. APIs and map tiles stay network-only. */
export function offlineBuild(): Plugin {
  return {
    name: 'ayni-offline-shell', apply: 'build', enforce: 'post',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter(name => /\.(?:html|js|css|wasm)$/.test(name));
      const version = createHash('sha256').update(files.sort().map(name => {
        const item = bundle[name];
        return name + (item.type === 'chunk' ? item.code : String(item.source));
      }).join('\n')).digest('hex').slice(0, 16);
      const source = readFileSync(new URL('./offline-worker.js', import.meta.url), 'utf8')
        .replace('__AYNI_VERSION__', version)
        .replace('/*__AYNI_ASSETS__*/[]', JSON.stringify(['./', ...files.map(name => `./${name}`)]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
