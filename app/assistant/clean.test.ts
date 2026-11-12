import { describe, expect, it } from 'vitest';
import { cleanAnswer, cleanPartial } from './clean';

describe('cleanAnswer', () => {
  it('removes bold marks and keeps the words', () => {
    expect(cleanAnswer('Τα εγκαύματα έφτασαν σε απόσταση **2,17 km**.')).toBe('Τα εγκαύματα έφτασαν σε απόσταση 2,17 km.');
  });

  it('turns list marks into bullets and drops headings', () => {
    expect(cleanAnswer('## Results\n*   Fireball: 0.2 km\n- Blast: 1 km')).toBe('Results\n• Fireball: 0.2 km\n• Blast: 1 km');
  });

  it('removes reasoning before the answer', () => {
    expect(cleanAnswer('<think>let me see</think>\n\nThe answer.')).toBe('The answer.');
  });

  it('keeps a multiplication sign or a lone star inside a sentence', () => {
    expect(cleanAnswer('2 * 3 = 6')).toBe('2 * 3 = 6');
  });
});

describe('cleanPartial', () => {
  it('hides a bold mark not closed yet and reasoning not closed yet', () => {
    expect(cleanPartial('Η ακτίνα είναι **2,1')).toBe('Η ακτίνα είναι 2,1');
    expect(cleanPartial('<think>still thinking')).toBe('');
  });
});
