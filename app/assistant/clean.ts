// What the model writes, made ready for the conversation on screen and for the voice.

/**
 * Plain text for the screen and the voice: the reasoning some models write before the answer
 * is removed, and so is the markdown they add (bold, headings, list marks), which the
 * conversation shows as plain text.
 */
export function cleanAnswer(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[*-]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The same for an answer still being written: reasoning not closed yet and a bold mark not closed yet are hidden too. */
export function cleanPartial(text: string): string {
  return cleanAnswer(text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '')).replace(/\*\*/g, '');
}
