import { describe, expect, it } from 'vitest';
import { distinctCalls } from './calls';

const call = (name: string, args = '{}', id = name) => ({ id, type: 'function' as const, function: { name, arguments: args } });

describe('distinctCalls', () => {
  it('runs a call written many times only once', () => {
    const repeated = Array.from({ length: 29 }, (_, i) => call('run_simulation', '{}', `c${i}`));
    const kept = distinctCalls(repeated);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.id).toBe('c0');
  });

  it('keeps different calls, at most three', () => {
    const kept = distinctCalls([call('get_results'), call('compare_yields', '{"yields_kt":[1,10]}'), call('lookup_weapon', '{"query":"b61"}'), call('explain_effect', '{"effect":"blast5"}')]);
    expect(kept.map((c) => c.function.name)).toEqual(['get_results', 'compare_yields', 'lookup_weapon']);
  });

  it('tells calls apart by their arguments', () => {
    expect(distinctCalls([call('lookup_weapon', '{"query":"b61"}', 'a'), call('lookup_weapon', '{"query":"w88"}', 'b')])).toHaveLength(2);
  });
});
