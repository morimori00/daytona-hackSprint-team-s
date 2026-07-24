import { expect, test, describe } from 'bun:test';
import { renderComment } from './comment';

describe('renderComment', () => {
  test('running state tells the user what is happening and how long', () => {
    const out = renderComment({ state: 'running', commit: 'a86aa7d' });
    expect(out.startsWith('## 🔄 Reproducing…')).toBe(true);
    expect(out).toContain('1–3 minutes');
    expect(out).toContain('commit a86aa7d');
  });

  test('reproduced leads with the verdict word, not just the emoji', () => {
    const out = renderComment({
      state: 'reproduced',
      summary: 'Deleting "Walk the dog" removed "Buy milk" instead',
      gifUrl: 'https://raw.example/run.gif',
      steps: ['OK: Opened the app', 'FAILED: Wrong row disappeared'],
      commit: 'a86aa7d',
      duration: '2m18s',
    });
    expect(out.startsWith('## ✅ Reproduced')).toBe(true);
    // Colourblind-safe / survives email digests: the word carries meaning.
    expect(out).toContain('Reproduced');
    expect(out).toContain('![Recording of the reproduced bug](https://raw.example/run.gif)');
    expect(out).toContain('<details>');
    expect(out).toContain('Steps replayed (2)');
    expect(out).toContain('`commit a86aa7d · 2m18s`');
  });

  test('summary is exactly one bold sentence, punctuated', () => {
    const out = renderComment({
      state: 'reproduced',
      summary: 'The crash happened on step 4',
    });
    expect(out).toContain('**The crash happened on step 4.**');
  });

  test('not reproduced still shows evidence', () => {
    const out = renderComment({
      state: 'not_reproduced',
      summary: 'The list updated correctly at every step',
      gifUrl: 'https://raw.example/run.gif',
    });
    expect(out.startsWith('## ❌ Not reproduced')).toBe(true);
    expect(out).toContain('Recording of the reproduction attempt');
  });

  test('failure explains the cause plainly and offers a retry', () => {
    const out = renderComment({
      state: 'failed',
      summary: "The app didn't start within 60s",
      steps: ['FAILED: healthcheck timed out'],
    });
    expect(out.startsWith("## ⚠️ Couldn't run the reproduction")).toBe(true);
    // Not bolded — a failure is not a verdict about the bug.
    expect(out).not.toContain('**');
    expect(out).toContain('Re-add the `Reproducibility` label');
    expect(out).toContain('<summary>Log</summary>');
  });

  test('no gif means no broken image', () => {
    const out = renderComment({ state: 'reproduced', summary: 'It broke' });
    expect(out).not.toContain('![');
  });
});
