import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestConversion } from '../src/utils/conversionRequest.js';

function fakeXHR() {
  const xhr = {
    upload: {},
    status: 200,
    response: new Blob([Buffer.from('%PDF-1.7')]),
    getResponseHeader: name => name.toLowerCase() === 'content-type' ? 'application/pdf' : null,
    open(method, url) { this.method = method; this.url = url; },
    send(form) { this.form = form; this.upload.onprogress?.({ loaded: 1, total: 2, lengthComputable: true }); this.upload.onload?.(); this.status = 200; this.onload?.(); },
    abort() { this.onabort?.(); },
  };
  return xhr;
}

test('conversion request reports measured upload percentage and succeeds', async () => {
  const stages = [];
  const { response, blob } = await requestConversion('/api/convert/pdf-merger', {}, { xhrFactory: fakeXHR, onProgress: value => stages.push(value) });
  assert.equal(response.status, 200);
  assert.equal(blob.size, 8);
  assert.deepEqual(stages, [{ stage: 'Uploading', percent: 50 }, { stage: 'Converting', percent: null }]);
});

test('HTTP 429 returns a user-friendly explanation', async () => {
  const xhrFactory = () => ({ ...fakeXHR(), send() { this.status = 429; this.response = new Blob([JSON.stringify({ error: 'Wait before trying again.' })]); this.onload(); } });
  await assert.rejects(requestConversion('/api/convert/pdf-merger', {}, { xhrFactory }), /Wait before trying again/);
});
