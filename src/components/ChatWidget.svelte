<script lang="ts">
  interface Props {
    openingMessage: string;
  }

  const { openingMessage }: Props = $props();

  type Message = { role: 'user' | 'assistant'; content: string; imagePreview?: string };
  type StoredChatSession = { messages: Message[]; exchangeCount: number };

  const MAX_EXCHANGES = 13;
  const STORAGE_KEY = 'car-site-chat-session';

  let open = $state(false);
  let messages = $state<Message[]>([]);
  let input = $state('');
  let loading = $state(false);
  let error = $state('');
  let initialized = $state(false);
  let exchangeCount = $state(0);
  let pendingImage = $state<{ data: string; mediaType: string; preview: string } | null>(null);

  let limitReached = $derived(exchangeCount >= MAX_EXCHANGES);
  let canSend = $derived(!loading && !limitReached && (input.trim().length > 0 || pendingImage !== null));

  let fileInput: HTMLInputElement;
  let messagesEl: HTMLDivElement;

  function isMessage(value: unknown): value is Message {
    if (!value || typeof value !== 'object') return false;
    const msg = value as Record<string, unknown>;
    return (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string';
  }

  function loadStoredSession(): StoredChatSession | null {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') as Partial<StoredChatSession> | null;
      if (!parsed || !Array.isArray(parsed.messages)) return null;
      return {
        messages: parsed.messages.filter(isMessage),
        exchangeCount: Math.max(0, Number.parseInt(String(parsed.exchangeCount ?? '0'), 10) || 0),
      };
    } catch {
      return null;
    }
  }

  function saveStoredSession() {
    if (!initialized || typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, exchangeCount }));
  }

  $effect(saveStoredSession);

  function toggle() {
    open = !open;
    if (open && !initialized) {
      initialized = true;
      const stored = loadStoredSession();
      messages = stored?.messages.length
        ? stored.messages
        : openingMessage
          ? [{ role: 'assistant', content: openingMessage }]
          : [];
      exchangeCount = stored?.exchangeCount ?? 0;
      setTimeout(scrollToBottom, 50);
    }
  }

  function scrollToBottom() {
    if (messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  async function fileToBase64(file: File): Promise<{ data: string; mediaType: string; preview: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const [prefix, data] = dataUrl.split(',');
        const mediaType = prefix.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
        resolve({ data, mediaType, preview: dataUrl });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function handleFileSelect(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) { error = '圖片過大（最大 5MB）'; return; }
    fileToBase64(file).then((img) => { pendingImage = img; error = ''; });
    (e.target as HTMLInputElement).value = '';
  }

  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        if (file.size > 5 * 1024 * 1024) { error = '圖片過大（最大 5MB）'; return; }
        e.preventDefault();
        fileToBase64(file).then((img) => { pendingImage = img; error = ''; });
        return;
      }
    }
  }

  function removePendingImage() {
    pendingImage = null;
  }

  async function send() {
    const text = input.trim();
    if (!canSend) return;
    input = '';
    error = '';

    const userMsg: Message = { role: 'user', content: text || '（圖片）', imagePreview: pendingImage?.preview };
    const imageToSend = pendingImage ? { data: pendingImage.data, mediaType: pendingImage.mediaType } : undefined;
    const nextMessages = [...messages, userMsg];
    pendingImage = null;
    messages = nextMessages;
    loading = true;
    setTimeout(scrollToBottom, 50);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text || '（圖片）',
          history: nextMessages.slice(-7, -1).map((m) => ({ role: m.role, content: m.content })),
          ...(imageToSend ? { image: imageToSend } : {}),
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (res.ok && data.reply) {
        messages = [...messages, { role: 'assistant', content: data.reply }];
        exchangeCount += 1;
      } else {
        error = data.error || '發生錯誤，請稍後再試。';
      }
    } catch {
      error = '網路錯誤，請稍後再試。';
    } finally {
      loading = false;
      setTimeout(scrollToBottom, 50);
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Render assistant text: escape HTML then linkify URLs
  function renderText(text: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped.replace(
      /(https?:\/\/[^\s<>"]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="chat-link">$1</a>',
    );
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

    <div class="chat-messages" bind:this={messagesEl}>
      {#each messages as msg}
        <div class="chat-msg chat-msg--{msg.role}">
          <div class="chat-bubble-msg">
            {#if msg.imagePreview}
              <img class="chat-img-preview" src={msg.imagePreview} alt="附圖" />
            {/if}
            {#if msg.role === 'assistant'}
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html renderText(msg.content)}
            {:else}
              {msg.content}
            {/if}
          </div>
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
      {#if limitReached}
        <div class="chat-limit-notice">本次對話已達 {MAX_EXCHANGES} 輪上限，請重新整理頁面開始新對話。</div>
      {/if}
    </div>

    <!-- Pending image preview -->
    {#if pendingImage}
      <div class="pending-image-strip">
        <img class="pending-thumb" src={pendingImage.preview} alt="待傳送圖片" />
        <button class="pending-remove" onclick={removePendingImage} aria-label="移除圖片">✕</button>
      </div>
    {/if}

    <div class="chat-input-row">
      <!-- Hidden file input -->
      <input
        bind:this={fileInput}
        type="file"
        accept="image/*"
        class="visually-hidden"
        onchange={handleFileSelect}
      />
      <!-- Image attach button -->
      <button
        class="chat-attach"
        onclick={() => fileInput.click()}
        disabled={loading || limitReached}
        aria-label="附加圖片"
        title="附加圖片"
        type="button"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
        </svg>
      </button>

      <textarea
        class="chat-input"
        rows="1"
        placeholder={limitReached ? '對話已達上限' : '輸入訊息...'}
        bind:value={input}
        onkeydown={onKeydown}
        onpaste={handlePaste}
        disabled={loading || limitReached}
      ></textarea>
      <button
        class="chat-send"
        onclick={send}
        disabled={!canSend}
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

  :global(.chat-link) {
    color: var(--accent, #3b82f6);
    text-decoration: underline;
    word-break: break-all;
  }
  .chat-msg--user .chat-bubble-msg :global(.chat-link) { color: #fff; }

  .chat-img-preview {
    display: block;
    max-width: 100%; max-height: 180px;
    border-radius: 10px;
    margin-bottom: 0.4rem;
    object-fit: cover;
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

  .chat-limit-notice {
    font-size: 0.78rem; color: var(--muted, #888);
    text-align: center; padding: 0.5rem;
  }

  .pending-image-strip {
    padding: 0.4rem 0.75rem;
    border-top: 1px solid var(--line, #e5e7eb);
    display: flex; align-items: center; gap: 0.5rem;
    background: var(--surface, #fff);
    flex-shrink: 0;
  }
  .pending-thumb {
    height: 48px; width: 48px; object-fit: cover; border-radius: 8px;
    border: 1px solid var(--line, #e5e7eb);
  }
  .pending-remove {
    background: none; border: none; cursor: pointer;
    color: var(--muted, #888); font-size: 0.85rem; padding: 0.1rem 0.3rem;
    border-radius: 4px;
  }
  .pending-remove:hover { color: #e57373; }

  .chat-input-row {
    padding: 0.65rem 0.75rem;
    border-top: 1px solid var(--line, #e5e7eb);
    display: flex; gap: 0.5rem; align-items: flex-end;
    flex-shrink: 0;
    background: var(--surface, #fff);
  }

  .visually-hidden {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip: rect(0,0,0,0); white-space: nowrap; border: 0;
  }

  .chat-attach {
    width: 2.25rem; height: 2.25rem; border-radius: 50%;
    background: none; color: var(--muted, #888);
    border: 1px solid var(--line, #e5e7eb); cursor: pointer; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: color 0.15s, border-color 0.15s;
  }
  .chat-attach:not(:disabled):hover { color: var(--accent, #3b82f6); border-color: var(--accent, #3b82f6); }
  .chat-attach:disabled { opacity: 0.4; cursor: not-allowed; }
  .chat-attach svg { width: 1rem; height: 1rem; }

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
