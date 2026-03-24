import { initSync } from '@bolt402/bolt402-wasm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const wasmPath = resolve(__dirname, '../../../crates/bolt402-wasm/pkg/bolt402_wasm_bg.wasm');
const wasmBytes = readFileSync(wasmPath);

let initialized = false;

export function ensureInit(): void {
  if (!initialized) {
    initSync({ module: wasmBytes });
    initialized = true;
  }
}
