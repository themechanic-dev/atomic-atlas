// The conversation with the assistant: the messages on screen, the turns with the local
// model, and the tools it calls. The limits of the app are kept here, not left to the model.

import { signal } from '@preact/signals';
import { isOutOfBounds } from '../assistant/guard';
import { runTool, stateNote, TOOLS } from '../assistant/tools';
import { t } from '../i18n';
import { platform, type AssistantStatus } from '../lib/platform';
import { settings } from './settings';

export interface ShownMessage {
  role: 'user' | 'assistant' | 'tool' | 'refusal' | 'error';
  text: string;
}

interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export const assistantStatus = signal<AssistantStatus | null>(null);
export const assistantProgress = signal<number | null>(null);
export const conversation = signal<ShownMessage[]>([]);
export const thinking = signal(false);

let history: ModelMessage[] = [];

type AssistantShell = NonNullable<NonNullable<Window['atomicAtlasShell']>['assistant']>;

/** On Android the same calls go to the native Assistant plugin (mobile/android, AssistantPlugin.java). */
function androidShell(): AssistantShell | undefined {
  const native = window.Capacitor?.nativePromise;
  if (platform() !== 'android' || typeof native !== 'function' || !window.Capacitor?.Plugins?.Assistant) return undefined;
  const call = (method: string, options?: unknown) => native('Assistant', method, options);
  return {
    status: () => call('status') as Promise<AssistantStatus>,
    install: (size) => call('install', { size }) as Promise<AssistantStatus>,
    remove: () => call('remove') as Promise<AssistantStatus>,
    start: () => call('start') as Promise<AssistantStatus>,
    chat: (body) => call('chat', body),
    onProgress: (listener) => {
      let handle: { remove: () => void } | null = null;
      const added = window.Capacitor?.Plugins?.Assistant?.addListener?.('progress', ((event: { share?: number }) => listener(event?.share ?? 0)) as () => void);
      void Promise.resolve(added).then((h) => (handle = h ?? null));
      return () => handle?.remove();
    },
  };
}

const shell = (): AssistantShell | undefined => (platform() === 'desktop' ? window.atomicAtlasShell?.assistant : androidShell());

/** True on a phone: smaller models are offered. */
export const onPhone = (): boolean => platform() === 'android';

export function assistantSupported(): boolean {
  return Boolean(shell());
}

export async function refreshAssistant(): Promise<void> {
  const s = shell();
  if (s) assistantStatus.value = await s.status();
}

export async function downloadAssistant(size: 'small' | 'large'): Promise<void> {
  const s = shell();
  if (!s) return;
  assistantProgress.value = 0;
  const off = s.onProgress((share) => (assistantProgress.value = share));
  try {
    assistantStatus.value = await s.install(size);
  } finally {
    off();
    assistantProgress.value = null;
  }
}

export async function removeAssistant(): Promise<void> {
  const s = shell();
  if (s) assistantStatus.value = await s.remove();
  clearConversation();
}

export function clearConversation(): void {
  history = [];
  conversation.value = [];
}

function systemPrompt(): string {
  const language = settings.value.language === 'el' ? 'Greek' : 'English';
  return [
    'You are the assistant inside Atomic Atlas, an educational simulator of the effects of nuclear weapons built on public scientific models (Glasstone & Dolan 1977 and others), each with its source.',
    `The app is set to ${language}. Answer in ${language} unless the user writes in the other language. Be brief and clear: a few sentences, plain words, numbers with units.`,
    'You may: explain results and the physics behind them, set up and run simulations with the tools, compare yields, look up weapons in the public catalog. Use the tools for every number about effects; do not guess numbers.',
    'You must not: give any information on how to build, obtain or use nuclear weapons or materials; choose, rank or suggest targets or places to attack; suggest how to cause more harm; describe how to defeat a missile defence. If asked, say briefly that this is outside what the app does, and offer something within it.',
    'You cannot place ground zero: the user clicks the map. If it is not placed, ask the user to click the map.',
    'Write units as the app does: kt, Mt, km, m, psi. Terms in Greek: blast wave = ωστικό κύμα, overpressure = υπερπίεση, fireball = πύρινη σφαίρα, fallout = ραδιενεργός σκόνη, ground zero = σημείο της έκρηξης, air burst = έκρηξη στον αέρα, surface burst = έκρηξη στην επιφάνεια, burns = εγκαύματα, water waves = κύματα στο νερό. psi stays psi.',
    'After a tool gives numbers, answer with those numbers and say which effect each one is; do not invent explanations the tools did not give.',
    stateNote(),
  ].join('\n');
}

const MAX_TOOL_ROUNDS = 5;

/** Strips the reasoning some models write before the answer. */
function cleanAnswer(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export async function ask(text: string): Promise<void> {
  const s = shell();
  const question = text.trim();
  if (!s || !question || thinking.value) return;
  conversation.value = [...conversation.value, { role: 'user', text: question }];
  if (isOutOfBounds(question)) {
    conversation.value = [...conversation.value, { role: 'refusal', text: t('assistant.refuse') }];
    return;
  }
  history.push({ role: 'user', content: question });
  thinking.value = true;
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = (await s.chat({ messages: [{ role: 'system', content: systemPrompt() }, ...history], tools: round < MAX_TOOL_ROUNDS ? TOOLS : undefined })) as {
        error?: string;
        choices?: Array<{ message?: ModelMessage }>;
      };
      if (response.error || !response.choices?.[0]?.message) throw new Error(response.error ?? 'no answer');
      const message = response.choices[0].message;
      const calls = message.tool_calls ?? [];
      if (calls.length > 0) {
        history.push({ role: 'assistant', content: message.content ?? null, tool_calls: calls });
        for (const call of calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
          } catch {
            args = {};
          }
          conversation.value = [...conversation.value, { role: 'tool', text: t(`assistant.tool.${call.function.name}`) }];
          const result = await runTool(call.function.name, args);
          history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        }
        continue;
      }
      const answer = cleanAnswer(message.content ?? '');
      history.push({ role: 'assistant', content: answer });
      conversation.value = [...conversation.value, { role: 'assistant', text: answer || t('assistant.empty') }];
      break;
    }
  } catch (error) {
    console.error('assistant failed', error);
    conversation.value = [...conversation.value, { role: 'error', text: t('assistant.error') }];
    void refreshAssistant();
  } finally {
    thinking.value = false;
    // The server starts with the first question: show where it runs.
    void refreshAssistant();
    // A long conversation is cut from the start, so the model's memory does not overflow.
    // It starts again at a question, never in the middle of a tool call.
    if (history.length > 40) {
      const from = history.findIndex((m, i) => i >= history.length - 30 && m.role === 'user');
      if (from > 0) history = history.slice(from);
    }
  }
}
