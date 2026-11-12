// The assistant: a conversation with a local model that explains results and sets up
// simulations with the app's own tools. Offline once downloaded; desktop only for now.

import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  ask,
  assistantProgress,
  assistantStatus,
  clearConversation,
  conversation,
  downloadAssistant,
  onPhone,
  partialAnswer,
  refreshAssistant,
  removeAssistant,
  thinking,
} from '../state/assistant';
import { assistantQuestion } from '../state/ui';
import { speak, voiceStatus } from '../state/voice';
import { Button, Dialog } from './controls';

export function AssistantDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const status = assistantStatus.value;
  const progress = assistantProgress.value;
  const messages = conversation.value;

  useEffect(() => {
    void refreshAssistant();
  }, []);
  // A question asked from a result is sent as soon as the assistant is ready.
  const pending = assistantQuestion.value;
  useEffect(() => {
    if (!pending || !status?.installed) return;
    assistantQuestion.value = null;
    void ask(pending);
  }, [pending, status?.installed]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length, thinking.value, partialAnswer.value]);

  const send = (): void => {
    const question = text.trim();
    if (!question) return;
    setText('');
    void ask(question);
  };

  let body;
  if (!status) {
    body = <p class="hint">{t('assistant.checking')}</p>;
  } else if (!status.supported) {
    body = <p class="hint">{t('assistant.unsupported')}</p>;
  } else if (!status.installed) {
    body = (
      <div class="assistant-setup" data-testid="assistant-setup">
        <p>{t('assistant.download.hint')}</p>
        {progress !== null ? (
          <p class="hint" data-testid="assistant-progress">
            {t('assistant.downloading', { percent: Math.round(progress * 100) })}
          </p>
        ) : (
          <div class="assistant-sizes">
            <Button kind="primary" onClick={() => void downloadAssistant('small')} testId="assistant-download-small">
              {t(onPhone() ? 'assistant.download.small.phone' : 'assistant.download.small')}
            </Button>
            <Button onClick={() => void downloadAssistant('large')} testId="assistant-download-large">
              {t(onPhone() ? 'assistant.download.large.phone' : 'assistant.download.large')}
            </Button>
          </div>
        )}
        <p class="hint">{t(onPhone() ? 'assistant.download.sizes.phone' : 'assistant.download.sizes')}</p>
        {status.needsRuntime ? <p class="hint">{t('assistant.download.runtime')}</p> : null}
        {status.error ? <p class="hint warn">{t('assistant.download.error')}</p> : null}
      </div>
    );
  } else {
    body = (
      <div class="assistant" data-testid="assistant">
        <div class="assistant-messages" ref={list} data-testid="assistant-messages">
          {messages.length === 0 ? <p class="hint">{t('assistant.welcome')}</p> : null}
          {messages.map((m, i) => (
            <div key={i} class={`assistant-message is-${m.role}`}>
              {m.text}
              {m.role === 'assistant' && voiceStatus.value?.installed ? (
                <button type="button" class="link assistant-speak" onClick={() => void speak(m.text)} data-testid={`assistant-speak-${i}`}>
                  {t('voice.again')}
                </button>
              ) : null}
            </div>
          ))}
          {thinking.value && partialAnswer.value ? <div class="assistant-message is-assistant">{partialAnswer.value.replace(/<think>[\s\S]*?(<\/think>|$)/g, '')}</div> : null}
          {thinking.value && !partialAnswer.value ? <div class="assistant-message is-thinking">{t('assistant.thinking')}</div> : null}
        </div>
        <form
          class="assistant-input"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <textarea
            value={text}
            rows={2}
            placeholder={t('assistant.placeholder')}
            onInput={(event) => setText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            aria-label={t('assistant.placeholder')}
            data-testid="assistant-input"
          />
          <Button kind="primary" type="submit" disabled={thinking.value || !text.trim()} testId="assistant-send">
            {t('assistant.send')}
          </Button>
        </form>
        <p class="hint">
          {t(status.device === 'gpu' ? 'assistant.device.gpu' : status.device === 'cpu' ? 'assistant.device.cpu' : 'assistant.device.none')} · {t(`assistant.size.${status.size ?? 'small'}`)}
        </p>
      </div>
    );
  }

  return (
    <Dialog
      title={t('assistant.title')}
      onClose={onClose}
      wide
      testId="assistant-dialog"
      footer={
        status?.installed ? (
          <>
            <Button kind="ghost" onClick={clearConversation} testId="assistant-clear">
              {t('assistant.clear')}
            </Button>
            <Button kind="ghost" onClick={() => void removeAssistant()} testId="assistant-remove">
              {t('assistant.remove')}
            </Button>
          </>
        ) : undefined
      }
    >
      {body}
      <p class="hint">{t('assistant.limits')}</p>
    </Dialog>
  );
}
