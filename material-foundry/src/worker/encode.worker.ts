/// <reference lib="webworker" />
// Dedicated streaming encoder for 4K/8K exports. Strips arrive in row order; each one is encoded
// into the requested PNG streams immediately and acknowledged, which provides back-pressure.

import { StripEncoderSet, type StripEncoderConfig, type StripInput } from '../export/stripEncoder';

declare const self: DedicatedWorkerGlobalScope;

export type EncodeWorkerRequest = { type: 'init'; cfg: StripEncoderConfig } | { type: 'strip'; strip: StripInput } | { type: 'finish' };

let set: StripEncoderSet | null = null;
// Messages are handled strictly one after another (pushStrip is asynchronous).
let chain: Promise<void> = Promise.resolve();
let failed = false;

async function handle(msg: EncodeWorkerRequest): Promise<void> {
  if (msg.type === 'init') {
    set = new StripEncoderSet(msg.cfg);
    self.postMessage({ type: 'ready' });
  } else if (msg.type === 'strip') {
    await set!.pushStrip(msg.strip);
    self.postMessage({ type: 'ack', y0: msg.strip.y0, rows: msg.strip.rows });
  } else {
    const files = await set!.finish();
    const transfer = files.flatMap((f) => f.png.parts.map((p) => p.buffer as ArrayBuffer));
    self.postMessage({ type: 'done', files }, transfer);
    set = null;
  }
}

self.onmessage = (e: MessageEvent<EncodeWorkerRequest>) => {
  const msg = e.data;
  chain = chain.then(async () => {
    if (failed) return;
    try {
      await handle(msg);
    } catch (err) {
      failed = true;
      self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  });
};
