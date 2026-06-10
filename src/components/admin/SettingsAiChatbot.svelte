<script lang="ts">
  import type { SiteSettings } from '@/lib/settings';
  import type { OpenCodeStatus, OpenCodeModel, OpenCodeModelsResult } from '@/lib/opencode-settings';
  import { OPENCODE_VARIANTS } from '@/lib/opencode-settings';

  interface Props {
    settings: SiteSettings;
    isSuper: boolean;
    openCodeStatus: OpenCodeStatus | null;
  }

  let { settings, isSuper, openCodeStatus }: Props = $props();

  // ── Toast ──────────────────────────────────────────────────────
  type ToastLevel = 'info' | 'success' | 'error' | 'progress';
  interface Toast { id: number; text: string; level: ToastLevel; sticky: boolean; }
  let toasts = $state<Toast[]>([]);
  let toastCounter = 0;

  function pushToast(text: string, level: ToastLevel = 'info', sticky = false): number {
    const id = ++toastCounter;
    toasts = [...toasts, { id, text, level, sticky }];
    if (!sticky) window.setTimeout(() => dismissToast(id), level === 'error' ? 6500 : 3200);
    return id;
  }
  function dismissToast(id: number) { toasts = toasts.filter((t) => t.id !== id); }
  function notifyProgress(text: string) { return pushToast(text, 'progress', true); }
  function updateToast(id: number, text: string, level: ToastLevel) {
    toasts = toasts.map((t) => t.id === id ? { ...t, text, level, sticky: false } : t);
    window.setTimeout(() => dismissToast(id), level === 'error' ? 6500 : 3200);
  }

  async function adminFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const response = await fetch(input, init);
    if (response.status === 401) { window.location.href = '/admin/login?expired=1'; throw new Error('session expired'); }
    return response;
  }

  // ── Chat content form ─────────────────────────────────────────
  let chatForm = $state({
    aiChatOpening: settings.aiChatOpening,
    aiChatTone: settings.aiChatTone,
  });
  let chatFormOriginal = JSON.stringify(chatForm);
  let chatFormDirty = $derived(JSON.stringify(chatForm) !== chatFormOriginal);
  let savingChat = $state(false);

  async function saveChatSettings() {
    savingChat = true;
    const tid = notifyProgress('儲存中...');
    const res = await adminFetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(chatForm),
    });
    savingChat = false;
    if (res.ok) {
      chatFormOriginal = JSON.stringify(chatForm);
      updateToast(tid, '設定已儲存', 'success');
    } else {
      const data = await res.json().catch(() => ({}));
      updateToast(tid, (data as Record<string, string>).error || '儲存失敗', 'error');
    }
  }

  // ── OpenCode settings (superadmin) ────────────────────────────
  let oc = $state({
    servers:       openCodeStatus?.servers.map((s) => s.baseUrl).join('\n') ?? '',
    textModel:     '',
    visionModel:   '',
    textVariant:   '',
    visionVariant: '',
  });
  let ocOriginal = JSON.stringify(oc);
  let ocDirty = $derived(JSON.stringify(oc) !== ocOriginal);
  let savingOc = $state(false);
  let clearingOc = $state(false);

  // Models list
  let models = $state<OpenCodeModel[]>([]);
  let modelsLoading = $state(false);
  let modelsWarning = $state<string | null>(null);
  let modelsSourceServerId = $state<string | null>(null);
  let modelFilter = $state('');

  let filteredModels = $derived(
    modelFilter
      ? models.filter((m) =>
          m.id.toLowerCase().includes(modelFilter.toLowerCase()) ||
          m.name.toLowerCase().includes(modelFilter.toLowerCase())
        )
      : models
  );

  let groupedModels = $derived(
    filteredModels.reduce<Record<string, OpenCodeModel[]>>((acc, m) => {
      (acc[m.provider] ??= []).push(m);
      return acc;
    }, {})
  );

  async function loadModels() {
    modelsLoading = true;
    modelsWarning = null;
    try {
      const res = await adminFetch('/api/admin/settings/opencode/models');
      const data = (await res.json()) as OpenCodeModelsResult;
      models = data.models;
      modelsWarning = data.warning;
      modelsSourceServerId = data.sourceServerId;
    } catch (err) {
      modelsWarning = err instanceof Error ? err.message : '載入失敗';
    } finally {
      modelsLoading = false;
    }
  }

  async function saveOcSettings() {
    savingOc = true;
    const tid = notifyProgress('儲存 OpenCode 設定中...');
    const body: Record<string, string> = {};
    if (oc.servers   !== undefined) body.servers       = oc.servers;
    if (oc.textModel !== undefined) body.textModel     = oc.textModel;
    if (oc.visionModel !== undefined) body.visionModel = oc.visionModel;
    if (oc.textVariant !== undefined) body.textVariant = oc.textVariant;
    if (oc.visionVariant !== undefined) body.visionVariant = oc.visionVariant;
    const res = await adminFetch('/api/admin/settings/opencode', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    savingOc = false;
    if (res.ok) {
      const data = await res.json() as { openCode: OpenCodeStatus };
      applyOcStatus(data.openCode);
      ocOriginal = JSON.stringify(oc);
      updateToast(tid, 'OpenCode 設定已儲存', 'success');
    } else {
      const data = await res.json().catch(() => ({}));
      updateToast(tid, (data as Record<string, string>).error || '儲存失敗', 'error');
    }
  }

  async function clearOcSettings() {
    clearingOc = true;
    const tid = notifyProgress('清除 DB 設定中...');
    const res = await adminFetch('/api/admin/settings/opencode', { method: 'DELETE' });
    clearingOc = false;
    if (res.ok) {
      const data = await res.json() as { openCode: OpenCodeStatus };
      applyOcStatus(data.openCode);
      ocOriginal = JSON.stringify(oc);
      updateToast(tid, '已清除 DB 設定，改由 env 生效', 'success');
    } else {
      updateToast(tid, '清除失敗', 'error');
    }
  }

  function applyOcStatus(status: OpenCodeStatus) {
    oc.servers       = status.servers.map((s) => s.baseUrl).join('\n');
    oc.textModel     = '';
    oc.visionModel   = '';
    oc.textVariant   = '';
    oc.visionVariant = '';
    openCodeStatus = status;
  }

  function sourceLabel(source: 'setting' | 'env' | 'none'): string {
    if (source === 'setting') return '（DB）';
    if (source === 'env')     return '（env）';
    return '（預設）';
  }

  $effect(() => { if (isSuper) loadModels(); });
</script>

<div class="admin-page">
  <div class="page-header">
    <h1>AI 客服設定</h1>
    <p>設定前台 AI 客服聊天機器人的行為與對話風格。</p>
  </div>

  <!-- Chat Content Section (admin + superadmin) -->
  <section class="settings-section">
    <h2>對話設定</h2>

    <div class="form-grid">
      <label class="form-field">
        <span class="field-label">開場白</span>
        <textarea
          class="field-input"
          rows="3"
          placeholder="Hi！我是您的購車顧問，請問有什麼可以幫您的？"
          bind:value={chatForm.aiChatOpening}
        ></textarea>
        <small class="field-hint">聊天視窗開啟時自動顯示的問候語。</small>
      </label>

      <label class="form-field">
        <span class="field-label">回話語氣指示</span>
        <textarea
          class="field-input"
          rows="4"
          placeholder="請以專業、親切的態度回覆客戶的購車相關問題，保持回應簡潔扼要。"
          bind:value={chatForm.aiChatTone}
        ></textarea>
        <small class="field-hint">用於 AI 的系統提示，規範回話風格。留空則使用預設。</small>
      </label>
    </div>

    <div class="form-actions">
      <button
        type="button"
        class="btn-primary"
        disabled={!chatFormDirty || savingChat}
        onclick={saveChatSettings}
      >
        {savingChat ? '儲存中...' : '儲存對話設定'}
      </button>
    </div>
  </section>

  <!-- OpenCode Section (superadmin only) -->
  {#if isSuper}
    <section class="settings-section">
      <h2>OpenCode 設定 <span class="badge-super">Superadmin</span></h2>
      <p class="muted">設定 AI 服務來源。Server password 請透過環境變數 <code>OPENCODE_SERVER_PASSWORD</code> 設定，不在此頁面顯示。</p>

      {#if openCodeStatus}
        <div class="oc-status">
          <span>
            Text: <strong>{openCodeStatus.textModel}</strong>
            <em>{sourceLabel(openCodeStatus.textModelSource)}</em>
            · variant: <strong>{openCodeStatus.textVariant}</strong>
            <em>{sourceLabel(openCodeStatus.textVariantSource)}</em>
          </span>
          <span>
            Vision: <strong>{openCodeStatus.visionModel}</strong>
            <em>{sourceLabel(openCodeStatus.visionModelSource)}</em>
            · variant: <strong>{openCodeStatus.visionVariant}</strong>
            <em>{sourceLabel(openCodeStatus.visionVariantSource)}</em>
          </span>
          <span>
            Servers: <strong>{openCodeStatus.serversSource === 'none' ? '未設定' : openCodeStatus.servers.length + ' 台'}</strong>
            <em>{sourceLabel(openCodeStatus.serversSource)}</em>
            {#if openCodeStatus.envUrl}· env: {openCodeStatus.envUrl}{/if}
          </span>
        </div>
      {/if}

      <div class="form-grid">
        <label class="form-field">
          <span class="field-label">OpenCode Servers</span>
          <textarea
            class="field-input field-input--mono"
            rows="4"
            placeholder={"https://provider-amd.sisihome.org\nhttps://provider-home.sisihome.org"}
            bind:value={oc.servers}
          ></textarea>
          <small class="field-hint">每行一個 URL，依序嘗試。留空則由 env 生效。</small>
        </label>
      </div>

      <!-- Model selects -->
      <div class="model-section">
        <div class="model-filter-row">
          <input
            type="search"
            class="model-filter"
            placeholder="搜尋 model..."
            bind:value={modelFilter}
          />
          <button
            type="button"
            class="btn-ghost"
            disabled={modelsLoading}
            onclick={loadModels}
          >
            {modelsLoading ? '載入中...' : '重新整理'}
          </button>
        </div>

        {#if modelsWarning}
          <p class="models-warning">{modelsWarning}</p>
        {/if}
        {#if modelsSourceServerId}
          <p class="models-source">來源：{modelsSourceServerId}</p>
        {/if}

        <div class="model-selects">
          <label class="form-field">
            <span class="field-label">Text Model</span>
            <select class="field-select" bind:value={oc.textModel}>
              <option value="">— 使用預設（{openCodeStatus?.textModel ?? '—'}）—</option>
              {#each Object.entries(groupedModels) as [provider, providerModels]}
                <optgroup label={provider}>
                  {#each providerModels as m}
                    <option value={m.id}>{m.name} ({m.id})</option>
                  {/each}
                </optgroup>
              {/each}
            </select>
          </label>

          <label class="form-field">
            <span class="field-label">Text Variant</span>
            <select class="field-select" bind:value={oc.textVariant}>
              <option value="">— 使用預設（{openCodeStatus?.textVariant ?? '—'}）—</option>
              {#each OPENCODE_VARIANTS as v}
                <option value={v}>{v}</option>
              {/each}
            </select>
          </label>

          <label class="form-field">
            <span class="field-label">Vision Model</span>
            <select class="field-select" bind:value={oc.visionModel}>
              <option value="">— 使用預設（{openCodeStatus?.visionModel ?? '—'}）—</option>
              {#each Object.entries(groupedModels) as [provider, providerModels]}
                <optgroup label={provider}>
                  {#each providerModels as m}
                    <option value={m.id}>{m.name} ({m.id})</option>
                  {/each}
                </optgroup>
              {/each}
            </select>
          </label>

          <label class="form-field">
            <span class="field-label">Vision Variant</span>
            <select class="field-select" bind:value={oc.visionVariant}>
              <option value="">— 使用預設（{openCodeStatus?.visionVariant ?? '—'}）—</option>
              {#each OPENCODE_VARIANTS as v}
                <option value={v}>{v}</option>
              {/each}
            </select>
          </label>
        </div>
      </div>

      <div class="form-actions">
        <button
          type="button"
          class="btn-primary"
          disabled={!ocDirty || savingOc}
          onclick={saveOcSettings}
        >
          {savingOc ? '儲存中...' : '儲存 OpenCode 設定'}
        </button>
        <button
          type="button"
          class="btn-ghost btn-danger"
          disabled={clearingOc}
          onclick={clearOcSettings}
        >
          {clearingOc ? '清除中...' : '清除 DB 設定'}
        </button>
      </div>
    </section>
  {/if}
</div>

<!-- Toasts -->
{#if toasts.length > 0}
  <div class="toast-stack">
    {#each toasts as toast (toast.id)}
      <div class="toast toast--{toast.level}" role="status">
        {toast.text}
        <button type="button" class="toast__dismiss" onclick={() => dismissToast(toast.id)}>✕</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .page-header { margin-bottom: 1.5rem; }
  .page-header h1 { font-size: 1.55rem; font-weight: 800; margin: 0 0 0.35rem; }
  .page-header p { color: var(--muted); margin: 0; }

  .settings-section {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }
  .settings-section h2 { font-size: 1.05rem; font-weight: 700; margin: 0 0 1rem; display: flex; align-items: center; gap: 0.6rem; }
  .muted { color: var(--muted); font-size: 0.875rem; margin: 0 0 1.25rem; }

  .badge-super {
    font-size: 0.65rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent-strong);
    padding: 0.15rem 0.55rem; border-radius: 999px;
  }

  .form-grid { display: grid; gap: 1.25rem; }
  .form-field { display: grid; gap: 0.4rem; }
  .field-label { font-size: 0.85rem; font-weight: 600; color: var(--text); }
  .field-input {
    padding: 0.6rem 0.85rem;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--text);
    font-size: 0.9rem;
    font-family: inherit;
    resize: vertical;
    transition: border-color 0.15s;
    width: 100%;
    box-sizing: border-box;
  }
  .field-input:focus { outline: none; border-color: var(--accent); }
  .field-input--mono { font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 0.82rem; }
  .field-hint { color: var(--muted); font-size: 0.78rem; }
  .field-select {
    padding: 0.6rem 0.85rem;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--text);
    font-size: 0.875rem;
    font-family: inherit;
    cursor: pointer;
    width: 100%;
  }
  .field-select:focus { outline: none; border-color: var(--accent); }

  .oc-status {
    display: flex; flex-direction: column; gap: 0.35rem;
    background: color-mix(in srgb, var(--accent) 6%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--line));
    border-radius: 12px;
    padding: 0.85rem 1rem;
    margin-bottom: 1.25rem;
    font-size: 0.82rem;
  }
  .oc-status em { color: var(--muted); font-style: normal; margin-left: 0.25rem; }

  .model-section { margin-top: 1.25rem; }
  .model-filter-row { display: flex; gap: 0.6rem; align-items: center; margin-bottom: 0.75rem; }
  .model-filter {
    flex: 1; padding: 0.5rem 0.85rem;
    background: var(--bg); border: 1px solid var(--line); border-radius: 10px;
    color: var(--text); font-size: 0.875rem; font-family: inherit;
  }
  .model-filter:focus { outline: none; border-color: var(--accent); }
  .models-warning { color: #e57373; font-size: 0.82rem; margin: 0.4rem 0; }
  .models-source { color: var(--muted); font-size: 0.78rem; margin: 0 0 0.75rem; }

  .model-selects { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  @media (max-width: 640px) { .model-selects { grid-template-columns: 1fr; } }

  .form-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.25rem; align-items: center; }

  .btn-primary {
    padding: 0.6rem 1.4rem; border-radius: 10px; font-weight: 700; font-size: 0.9rem;
    background: var(--accent); color: #fff; border: none; cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-primary:not(:disabled):hover { opacity: 0.88; }

  .btn-ghost {
    padding: 0.55rem 1.1rem; border-radius: 10px; font-size: 0.875rem; font-weight: 600;
    background: none; border: 1px solid var(--line); color: var(--muted); cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }
  .btn-ghost:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-ghost:not(:disabled):hover { border-color: var(--text); color: var(--text); }
  .btn-danger:not(:disabled):hover { border-color: #e57373; color: #e57373; }

  code { font-family: monospace; font-size: 0.85em; background: color-mix(in srgb, var(--accent) 10%, transparent); padding: 0.1em 0.4em; border-radius: 4px; }

  .toast-stack {
    position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 9000;
    display: flex; flex-direction: column; gap: 0.5rem; max-width: 340px;
  }
  .toast {
    padding: 0.7rem 1rem; border-radius: 12px; font-size: 0.875rem; font-weight: 600;
    display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
    border: 1px solid transparent;
  }
  .toast--info     { background: var(--surface); border-color: var(--line); color: var(--text); }
  .toast--success  { background: color-mix(in srgb, #4caf50 15%, var(--surface)); border-color: #4caf50; color: #4caf50; }
  .toast--error    { background: color-mix(in srgb, #e57373 15%, var(--surface)); border-color: #e57373; color: #e57373; }
  .toast--progress { background: color-mix(in srgb, var(--accent) 12%, var(--surface)); border-color: var(--accent); color: var(--accent-strong); }
  .toast__dismiss  { background: none; border: none; cursor: pointer; color: inherit; opacity: 0.6; font-size: 0.8rem; padding: 0 0.2rem; line-height: 1; }
  .toast__dismiss:hover { opacity: 1; }
</style>
