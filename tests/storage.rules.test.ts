import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ref, uploadString } from 'firebase/storage';

let testEnv: RulesTestEnvironment;

describe('storage security rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: `zerou-storage-${Date.now()}`,
      storage: {
        rules: readFileSync('storage.rules', 'utf8')
      }
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it('keeps storage closed before authorized paths are designed', async () => {
    const storage = testEnv.authenticatedContext('alice').storage();

    await expect(uploadString(ref(storage, 'receipts/test.txt'), 'zerou')).rejects.toBeDefined();
  });
});
