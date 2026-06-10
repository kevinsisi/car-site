<script lang="ts">
  interface Props {
    openingMessage: string;
  }

  const { openingMessage }: Props = $props();

  type Message = { role: 'user' | 'assistant'; content: string };

  let open = $state(false);
  let messages = $state<Message[]>([]);
  let input = $state('');
  let loading = $state(false);
  let error = $state('');
  let initialized = $state(false);

  function toggle() {
    open = !open;
    if (open && !initialized) {
      initialized = true;
      if (openingMessage) {
        messages = [{ role: 'assistant', content: openingMessage }];
      }
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    input = '';
    error = '';
    messages = [...messages, { role: 'user', content: text }];
    loading = true;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-7, -1),
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (res.ok && data.reply) {
        messages = [...messages, { role: 'assistant', content: data.reply }];
      } else {
        error = data.error || '發生錯誤，請稍後再試。';
      }
    } catch {
      error = '網路錯誤，請稍後再試。';
    } finally {
      loading = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }
</script>

<!-- Bubble button -->
<button
  class="chat-bubble"
  class:is-open={open}
  onclick={toggle}
  aria-label={open ? '關閉客服' : '開啟 AI 客服'}
  title={open ? '關閉客服' : 'AI 客服'}
>
  {#if open}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
  {:else}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  {/if}
</button>

<!-- Chat panel -->
{#if open}
  <div class="chat-panel" role="dialog" aria-label="AI 客服">
    <div class="chat-header">
      <span class="chat-title">AI 客服</span>
      <button class="chat-close" onclick={toggle} aria-label="關閉">✕</button>
    </div>

    <div class="chat-messages">
      {#each messages as msg}
        <div class="chat-msg chat-msg--{msg.role}">
          <div class="chat-bubble-msg">{msg.content}</div>
        </div>
      {/each}
      {#if loading}
        <div class="chat-msg chat-msg--assistant">
          <div class="chat-bubble-msg chat-bubble-msg--typing">
            <span></span><span></span><span></span>
          </div>
        </div>
      {/if}
      {#if error}
        <div class="chat-error">{error}</div>
      {/if}
    </div>

    <div class="chat-input-row">
      <textarea
        class="chat-input"
        rows="1"
        placeholder="輸入訊息..."
        bind:value={input}
        onkeydown={onKeydown}
        disabled={loading}
      ></textarea>
      <button
        class="chat-send"
        onclick={send}
        disabled={!input.trim() || loading}
        aria-label="送出"
      >
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>
  </div>
{/if}

<style>
  .chat-bubble {
    position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 8000;
    width: 3.25rem; height: 3.25rem; border-radius: 50%;
    background: var(--accent); color: #fff;
    border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.22);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .chat-bubble:hover { transform: scale(1.07); box-shadow: 0 6px 24px rgba(0,0,0,0.28); }
  .chat-bubble svg { width: 1.45rem; height: 1.45rem; }

  .chat-panel {
    position: fixed; bottom: 5.5rem; right: 1.5rem; z-index: 7900;
    width: min(370px, calc(100vw - 2rem));
    max-height: min(540px, calc(100vh - 7rem));
    background: var(--surface, #fff);
    border: 1px solid var(--line, #e5e7eb);
    border-radius: 20px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.18);
    display: flex; flex-direction: column; overflow: hidden;
  }

  .chat-header {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--line, #e5e7eb);
    display: flex; align-items: center; justify-content: space-between;
    background: var(--surface, #fff);
    flex-shrink: 0;
  }
  .chat-title { font-weight: 700; font-size: 0.9rem; color: var(--text, #111); }
  .chat-close {
    background: none; border: none; cursor: pointer;
    color: var(--muted, #888); font-size: 0.9rem; padding: 0.15rem 0.4rem;
    border-radius: 6px; line-height: 1;
    transition: color 0.12s, background 0.12s;
  }
  .chat-close:hover { color: var(--text, #111); background: color-mix(in srgb, var(--text, #111) 8%, transparent); }

  .chat-messages {
    flex: 1; overflow-y: auto; padding: 0.85rem 1rem;
    display: flex; flex-direction: column; gap: 0.6rem;
    scroll-behavior: smooth;
  }

  .chat-msg { display: flex; }
  .chat-msg--user { justify-content: flex-end; }
  .chat-msg--assistant { justify-content: flex-start; }

  .chat-bubble-msg {
    max-width: 80%;
    padding: 0.6rem 0.9rem;
    border-radius: 18px;
    font-size: 0.875rem;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .chat-msg--user .chat-bubble-msg {
    background: var(--accent, #3b82f6);
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .chat-msg--assistant .chat-bubble-msg {
    background: color-mix(in srgb, var(--line, #e5e7eb) 60%, var(--surface, #fff));
    color: var(--text, #111);
    border-bottom-left-radius: 4px;
  }

  .chat-bubble-msg--typing {
    display: flex; gap: 4px; align-items: center; padding: 0.7rem 0.9rem;
  }
  .chat-bubble-msg--typing span {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--muted, #888);
    animation: typing-dot 1.2s infinite;
  }
  .chat-bubble-msg--typing span:nth-child(2) { animation-delay: 0.2s; }
  .chat-bubble-msg--typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes typing-dot {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
    30% { transform: translateY(-5px); opacity: 1; }
  }

  .chat-error {
    font-size: 0.78rem; color: #e57373;
    background: color-mix(in srgb, #e57373 10%, transparent);
    padding: 0.5rem 0.75rem; border-radius: 10px;
  }

  .chat-input-row {
    padding: 0.65rem 0.75rem;
    border-top: 1px solid var(--line, #e5e7eb);
    display: flex; gap: 0.5rem; align-items: flex-end;
    flex-shrink: 0;
    background: var(--surface, #fff);
  }
  .chat-input {
    flex: 1; resize: none; border: 1px solid var(--line, #e5e7eb);
    border-radius: 12px; padding: 0.55rem 0.8rem;
    font-size: 0.875rem; font-family: inherit;
    background: var(--bg, #f9fafb); color: var(--text, #111);
    line-height: 1.4; max-height: 120px; overflow-y: auto;
    transition: border-color 0.15s;
  }
  .chat-input:focus { outline: none; border-color: var(--accent, #3b82f6); }
  .chat-input:disabled { opacity: 0.6; }

  .chat-send {
    width: 2.25rem; height: 2.25rem; border-radius: 50%;
    background: var(--accent, #3b82f6); color: #fff;
    border: none; cursor: pointer; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: opacity 0.15s;
  }
  .chat-send:disabled { opacity: 0.4; cursor: not-allowed; }
  .chat-send:not(:disabled):hover { opacity: 0.88; }
  .chat-send svg { width: 1.1rem; height: 1.1rem; }
</style>
