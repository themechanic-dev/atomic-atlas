// The tool calls of one turn of the model, kept within reason.

/** Distinct tool calls run in one turn; a small model sometimes writes the same call dozens of times. */
const MAX_CALLS_PER_ROUND = 3;

/** The calls of one turn, each distinct call once and only the first few. */
export function distinctCalls<C extends { function: { name: string; arguments: string } }>(calls: C[]): C[] {
  const seen = new Set<string>();
  return calls
    .filter((call) => {
      const key = `${call.function.name}(${call.function.arguments})`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CALLS_PER_ROUND);
}
