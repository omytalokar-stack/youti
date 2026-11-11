import assert from 'node:assert/strict';
import test from 'node:test';
import { runPublishStage } from '../services/publishStage.js';

test('runPublishStage returns successful results unchanged', async () => {
  const result = await runPublishStage('rendering-video', async () => 'rendered.mp4');
  assert.equal(result, 'rendered.mp4');
});

test('runPublishStage preserves provider details while tagging the failed stage', async () => {
  const providerError = Object.assign(new Error('quota unavailable'), {
    statusCode: 503,
    publicMessage: 'Gemini is temporarily unavailable.',
  });

  await assert.rejects(
    runPublishStage('generating-voiceover', async () => {
      throw providerError;
    }),
    (error) => {
      assert.equal(error.statusCode, 503);
      assert.equal(error.publishStage, 'generating-voiceover');
      assert.equal(error.cause, providerError);
      assert.match(error.publicMessage, /Gemini is temporarily unavailable/);
      assert.match(error.publicMessage, /generating-voiceover/);
      return true;
    },
  );
});

test('runPublishStage warns against retries when upload recording fails', async () => {
  await assert.rejects(
    runPublishStage('saving-upload-record', async () => {
      throw new Error('database unavailable');
    }),
    (error) => {
      assert.match(error.publicMessage, /Check YouTube before retrying/);
      assert.match(error.publicMessage, /saving-upload-record/);
      return true;
    },
  );
});
