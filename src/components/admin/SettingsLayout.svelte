<script lang="ts">
  import type { SiteSettings } from '@/lib/settings';
  import { detailSpecFieldOptions } from '@/lib/detail-spec-fields';
  import { styles, templates } from '@/lib/theme';
  import {
    FEATURE_COMPARE, FEATURE_SELL_INQUIRY, FEATURE_CONTACT_PAGE,
    FEATURE_ABOUT_PAGE, FEATURE_SOCIAL_ICONS, FEATURE_DIRECT_CONTACT,
    FEATURE_HERO_VIDEOS, FEATURE_VIDEO_LINKS, ALL_FEATURES_MASK,
  } from '@/lib/features';

  interface Props {
    settings: SiteSettings;
    isSuperadmin: boolean;
  }

  let { settings, isSuperadmin }: Props = $props();

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
    if (response.status === 401) {
      window.location.href = '/admin/login?expired=1';
      throw new Error('session expired');
    }
    return response;
  }

  type TemplateField = 'cardTitleTemplate' | 'shareMessageTemplate';

  const cardTitleTokens = ['車名', '年份', '品牌', '顯示品牌', '型號', '規格', '補充', '里程', '車況'];
  const shareTemplateTokens = ['車名', '年份', '品牌', '里程', '外觀色', '內裝色', '車況', '價格', '網址'];
  const shareTemplatePlaceholder = '憶文豪車，推薦給您\n{車名}\n年份：{年份}\n品牌：{品牌}\n里程：{里程}\n實拍現車，專人介紹車況與配備\n{網址}';
  const cardTitleTemplatePlaceholder = '{年份} {品牌} {型號} {規格}\n{補充}';

  let form = $state({
    activeTemplate: settings.activeTemplate,
    activeStyle: settings.activeStyle,
    homepageEyebrow: settings.homepageEyebrow,
    homepageTitle: settings.homepageTitle,
    homepageLead: settings.homepageLead,
    homepageNote: settings.homepageNote,
    homepageBadge: settings.homepageBadge,
    featuredEyebrow: settings.featuredEyebrow,
    featuredTitle: settings.featuredTitle,
    featuredCount: settings.featuredCount,
    listingEyebrow: settings.listingEyebrow,
    listingTitle: settings.listingTitle,
    listingLead: settings.listingLead,
    cardTitleTemplate: settings.cardTitleTemplate,
    detailNotesEyebrow: settings.detailNotesEyebrow,
    detailNotesTitle: settings.detailNotesTitle,
    shareMessageTemplate: settings.shareMessageTemplate,
    detailSpecFields: settings.detailSpecFields,
    footerDisclaimer: settings.footerDisclaimer,
    heroVehicleSlug: settings.heroVehicleSlug,
    showSoldVehicles: settings.showSoldVehicles,
    importBehavior: settings.importBehavior,
    featureMask: settings.featureMask,
  });

  let originalForm = $state(JSON.stringify(form));
  let formDirty = $derived(JSON.stringify(form) !== originalForm);

  let licenseMask = $state(settings.featureLicenseMask);
  let licenseOriginal = $state(settings.featureLicenseMask);
  let licenseDirty = $derived(licenseMask !== licenseOriginal);

  const FEATURE_LIST = [
    { bit: FEATURE_COMPARE,        label: '顯示比車功能（車卡比較按鈕、浮動比車列、比較頁新增車輛）' },
    { bit: FEATURE_SELL_INQUIRY,   label: '顯示賣車詢問入口與線上表單' },
    { bit: FEATURE_CONTACT_PAGE,   label: '顯示聯絡頁入口' },
    { bit: FEATURE_ABOUT_PAGE,     label: '顯示關於頁入口' },
    { bit: FEATURE_SOCIAL_ICONS,   label: '顯示社群 icon（Instagram、Facebook、Threads、TikTok）' },
    { bit: FEATURE_DIRECT_CONTACT, label: '顯示直接聯絡（LINE、電話、行動快速列）' },
    { bit: FEATURE_HERO_VIDEOS,    label: '顯示 Hero 影片區' },
    { bit: FEATURE_VIDEO_LINKS,    label: '顯示影片連結區' },
  ] as const;

  function hasBit(mask: number, bit: number): boolean {
    return (mask & bit) !== 0;
  }

  function toggleBit(mask: number, bit: number, on: boolean): number {
    return on ? mask | bit : mask & ~bit;
  }

  async function saveLicenseMask(): Promise<void> {
    const tid = notifyProgress('儲存授權設定...');
    const response = await adminFetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ featureLicenseMask: licenseMask }),
    });
    if (response.ok) {
      licenseOriginal = licenseMask;
      updateToast(tid, '授權設定已更新', 'success');
    } else {
      updateToast(tid, '授權設定更新失敗', 'error');
    }
  }

  function insertAtCursor(field: TemplateField, snippet: string) {
    const ta = document.querySelector<HTMLTextAreaElement>(`textarea[data-template-field="${field}"]`);
    if (!ta) {
      form[field] = `${form[field]}${snippet}`;
      return;
    }
    const wasFocused = document.activeElement === ta;
    const start = wasFocused ? (ta.selectionStart ?? ta.value.length) : ta.value.length;
    const end = wasFocused ? (ta.selectionEnd ?? ta.value.length) : ta.value.length;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    form[field] = before + snippet + after;
    setTimeout(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, 0);
  }

  function insertTemplateToken(field: TemplateField, token: string) {
    insertAtCursor(field, `{${token}}`);
  }

  function insertTemplateLineBreak(field: TemplateField) {
    insertAtCursor(field, '\n');
  }

  function previewStyleVars(styleId: keyof typeof styles) {
    return Object.entries(styles[styleId].tokens)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
  }

  async function saveSettings(): Promise<boolean> {
    const tid = notifyProgress('儲存中...');
    const response = await adminFetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (response.ok) {
      originalForm = JSON.stringify(form);
      updateToast(tid, '設定已更新', 'success');
      return true;
    } else {
      updateToast(tid, '設定更新失敗', 'error');
      return false;
    }
  }

  $effect(() => {
    const resize = (ta: HTMLTextAreaElement) => {
      ta.style.height = 'auto';
      ta.style.height = `${Math.max(ta.scrollHeight + 2, 80)}px`;
    };
    const ensureAttached = () => {
      const textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea[data-autoresize]');
      textareas.forEach((ta) => {
        if (!(ta as HTMLTextAreaElement & { __resize?: boolean }).__resize) {
          (ta as HTMLTextAreaElement & { __resize?: boolean }).__resize = true;
          ta.addEventListener('input', () => resize(ta));
        }
        resize(ta);
      });
    };
    ensureAttached();
    const details = document.querySelectorAll<HTMLDetailsElement>('details.settings-section');
    const onToggle = () => window.setTimeout(ensureAttached, 0);
    details.forEach((d) => d.addEventListener('toggle', onToggle));
    const interval = window.setInterval(ensureAttached, 800);
    return () => {
      details.forEach((d) => d.removeEventListener('toggle', onToggle));
      window.clearInterval(interval);
    };
  });

  $effect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!formDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  });

  $effect(() => {
    const handler = (event: KeyboardEvent) => {
      const cmdKey = event.metaKey || event.ctrlKey;
      if (cmdKey && event.key.toLowerCase() === 's') {
        const targetForm = document.querySelector<HTMLFormElement>('.settings-form');
        if (targetForm) {
          event.preventDefault();
          targetForm.requestSubmit();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });
</script>

{#if toasts.length > 0}
  <div class="toast-stack" role="status" aria-live="polite">
    {#each toasts as toast (toast.id)}
      <div class={`toast toast--${toast.level}`}>
        {#if toast.level === 'progress'}
          <span class="toast__spinner" aria-hidden="true"></span>
        {/if}
        <span class="toast__text">{toast.text}</span>
        <button type="button" class="toast__close" aria-label="關閉訊息" onclick={() => dismissToast(toast.id)}>×</button>
      </div>
    {/each}
  </div>
{/if}

<form class="admin-panel settings-form" onsubmit={(event) => { event.preventDefault(); saveSettings(); }}>
  {#if formDirty}
    <div class="dirty-banner" role="status">有未儲存的變更</div>
  {/if}

  <details class="settings-section" open>
    <summary>外觀（模板與風格）</summary>
    <div class="settings-section__body">
      <div class="visual-options">
        <div class="visual-options__header">
          <strong>模板</strong>
          <span>{templates[form.activeTemplate].label}</span>
        </div>
        <div class="template-options">
          {#each Object.entries(templates) as [id, template]}
            <button type="button" class:is-selected={form.activeTemplate === id} class={`template-option ${template.layoutClass}`} onclick={() => { form.activeTemplate = id as typeof form.activeTemplate; }}>
              <span>{template.label}</span>
              <small>{template.description}</small>
              <div class="template-option__mock">
                <i></i><i></i><i></i>
              </div>
            </button>
          {/each}
        </div>
      </div>
      <div class="visual-options">
        <div class="visual-options__header">
          <strong>風格</strong>
          <span>{styles[form.activeStyle].label}</span>
        </div>
        <div class="style-options">
          {#each Object.entries(styles) as [id, style]}
            <button type="button" class:is-selected={form.activeStyle === id} class="style-option" style={previewStyleVars(id as keyof typeof styles)} onclick={() => { form.activeStyle = id as typeof form.activeStyle; }}>
              <span>{style.label}</span>
              <div class="style-option__swatches">
                <i style="background: var(--bg)"></i>
                <i style="background: var(--surface)"></i>
                <i style="background: var(--accent)"></i>
              </div>
            </button>
          {/each}
        </div>
      </div>
      <div class={`theme-preview ${templates[form.activeTemplate].layoutClass}`} style={previewStyleVars(form.activeStyle)}>
        <div class="theme-preview__topline">
          <span>{templates[form.activeTemplate].label}</span>
          <strong>{styles[form.activeStyle].label}</strong>
        </div>
        <div class="theme-preview__hero">
          <div>
            <p>{settings.siteName || '私人精品車展'}</p>
            <h4>{form.homepageTitle || '嚴選值得收藏的高級座駕'}</h4>
            <small>{templates[form.activeTemplate].description}</small>
          </div>
          <div class="theme-preview__media">GT</div>
        </div>
        <div class="theme-preview__content">
          <article>
            <span>2023</span>
            <strong>示範車款 Continental GT V8 Mulliner</strong>
            <small>26,000 km ／ 價格請洽</small>
          </article>
        </div>
        <button type="button" class="theme-preview__cta">LINE 洽詢</button>
      </div>
    </div>
  </details>

  <details class="settings-section" open>
    <summary>首頁文案</summary>
    <div class="settings-section__body">
      <label>首頁小標 <input bind:value={form.homepageEyebrow} /></label>
      <label>首頁主標 <textarea data-autoresize bind:value={form.homepageTitle}></textarea></label>
      <label>首頁說明 <textarea data-autoresize bind:value={form.homepageLead}></textarea></label>
      <label>首頁形象短句 <textarea data-autoresize bind:value={form.homepageNote}></textarea></label>
      <label>封面徽章文字 <input bind:value={form.homepageBadge} /></label>
      <label>精選區小標 <input bind:value={form.featuredEyebrow} /></label>
      <label>精選區標題 <input bind:value={form.featuredTitle} /></label>
      <label>精選車輛顯示數量
        <input type="number" min="1" max="12" bind:value={form.featuredCount} />
      </label>
    </div>
  </details>

  <details class="settings-section">
    <summary>列表與詳情文案</summary>
    <div class="settings-section__body">
      <label>列表小標 <input bind:value={form.listingEyebrow} /></label>
      <label>列表主標 <textarea data-autoresize bind:value={form.listingTitle}></textarea></label>
      <label>列表說明 <textarea data-autoresize bind:value={form.listingLead}></textarea></label>
      <div class="template-builder">
        <label>卡片標題模板 <textarea data-autoresize data-template-field="cardTitleTemplate" bind:value={form.cardTitleTemplate} placeholder={cardTitleTemplatePlaceholder}></textarea></label>
        <div class="token-picker" aria-label="卡片標題變數">
          {#each cardTitleTokens as token}
            <button type="button" aria-label={`插入${token}`} onclick={() => insertTemplateToken('cardTitleTemplate', token)}>{token}</button>
          {/each}
          <button type="button" aria-label="插入換行" onclick={() => insertTemplateLineBreak('cardTitleTemplate')}>換行</button>
        </div>
        <p class="form-hint">按按鈕會插入到游標位置（若沒對焦輸入框則插在末尾），換行會保留，空白行會自動移除。</p>
      </div>
      <label>詳情備註小標 <input bind:value={form.detailNotesEyebrow} /></label>
      <label>詳情備註標題 <input bind:value={form.detailNotesTitle} /></label>
      <div class="template-builder">
        <label>分享訊息模板 <textarea data-autoresize data-template-field="shareMessageTemplate" bind:value={form.shareMessageTemplate} placeholder={shareTemplatePlaceholder}></textarea></label>
        <div class="token-picker" aria-label="分享訊息變數">
          {#each shareTemplateTokens as token}
            <button type="button" aria-label={`插入${token}`} onclick={() => insertTemplateToken('shareMessageTemplate', token)}>{token}</button>
          {/each}
          <button type="button" aria-label="插入換行" onclick={() => insertTemplateLineBreak('shareMessageTemplate')}>換行</button>
        </div>
        <p class="form-hint">按按鈕會插入到游標位置，不需要自己打括號。</p>
      </div>
      <div class="field-checklist">
        <strong>詳情頁資訊欄位</strong>
        <p class="form-hint">控制車輛詳情頁「完整規格」區塊要顯示哪些欄位。</p>
        <div class="field-checklist__grid">
          {#each detailSpecFieldOptions as field}
            <label class="checkbox-row"><input type="checkbox" bind:group={form.detailSpecFields} value={field.key} /> {field.label}</label>
          {/each}
        </div>
      </div>
      <label>頁尾提醒 <textarea data-autoresize bind:value={form.footerDisclaimer}></textarea></label>
    </div>
  </details>

  <details class="settings-section">
    <summary>前台功能開關</summary>
    <div class="settings-section__body">
      <p class="form-hint">控制公開網站要顯示哪些入口與互動功能。關閉後不會讓頁面 404，只會讓相關入口、按鈕或表單依情境收起。鎖頭圖示表示該功能未在此方案中授權。</p>
      {#each FEATURE_LIST as f}
        {@const licensed = hasBit(licenseMask, f.bit)}
        <label class="checkbox-row">
          <input
            type="checkbox"
            disabled={!licensed}
            checked={licensed && hasBit(form.featureMask, f.bit)}
            onchange={(e) => { form.featureMask = toggleBit(form.featureMask, f.bit, (e.currentTarget as HTMLInputElement).checked); }}
          />
          {f.label}
          {#if !licensed}<span style="margin-left:.4em;opacity:.55" title="此功能未在您的方案中啟用">🔒</span>{/if}
        </label>
      {/each}
    </div>
  </details>

  {#if isSuperadmin}
  <details class="settings-section">
    <summary>授權管理（Superadmin）</summary>
    <div class="settings-section__body">
      <p class="form-hint">控制此客戶可使用哪些功能。已關閉的功能，admin 無法在上方功能開關中啟用。儲存後立即生效。</p>
      {#each FEATURE_LIST as f}
        <label class="checkbox-row">
          <input
            type="checkbox"
            checked={hasBit(licenseMask, f.bit)}
            onchange={(e) => { licenseMask = toggleBit(licenseMask, f.bit, (e.currentTarget as HTMLInputElement).checked); }}
          />
          {f.label}
        </label>
      {/each}
      <div style="margin-top:1rem">
        <button
          class="admin-button"
          type="button"
          disabled={!licenseDirty}
          onclick={saveLicenseMask}
        >儲存授權設定</button>
      </div>
    </div>
  </details>
  {/if}

  <details class="settings-section">
    <summary>外部匯入與公開狀態</summary>
    <div class="settings-section__body">
      <label>外部來源新車輛預設
        <select bind:value={form.importBehavior}>
          <option value="draft_first">先存為草稿，需手動上架</option>
          <option value="auto_publish">自動上架到公開網頁</option>
          <option value="import_only">只匯入但不顯示在公開網頁</option>
        </select>
      </label>
      <label class="checkbox-row"><input type="checkbox" bind:checked={form.showSoldVehicles} /> 公開網頁顯示已售出車輛</label>
    </div>
  </details>

  <div class="settings-save-bar">
    <span class="settings-save-bar__hint">{formDirty ? '有未儲存的變更（Cmd/Ctrl+S 可儲存）' : '所有設定已是最新狀態'}</span>
    <button class="admin-button" type="submit" disabled={!formDirty}>儲存設定</button>
  </div>
</form>
