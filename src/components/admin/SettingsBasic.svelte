<script lang="ts">
  import type { SiteSettings, SocialIconConfig, SocialPlatform } from '@/lib/settings';
  import type { FrontFeatures } from '@/lib/front-features';

  interface Props {
    settings: SiteSettings;
    features: FrontFeatures;
  }

  let { settings, features }: Props = $props();

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

  const socialPlatformList: { key: SocialPlatform; label: string }[] = [
    { key: 'line', label: 'LINE' },
    { key: 'instagram', label: 'Instagram' },
    { key: 'facebook', label: 'Facebook' },
    { key: 'threads', label: 'Threads' },
    { key: 'tiktok', label: 'TikTok' },
    { key: 'phone', label: '電話' },
    { key: 'share', label: '分享' },
  ];

  let form = $state({
    siteName: settings.siteName,
    siteIconUrl: settings.siteIconUrl,
    salespersonName: settings.salespersonName,
    phoneNumber: settings.phoneNumber,
    storeAddress: settings.storeAddress,
    businessHours: settings.businessHours,
    lineUrl: settings.lineUrl,
    instagramUrl: settings.instagramUrl,
    facebookUrl: settings.facebookUrl,
    threadsUrl: settings.threadsUrl,
    tiktokUrl: settings.tiktokUrl,
    notificationEmail: settings.notificationEmail,
    socialIcons: { ...settings.socialIcons } as Record<SocialPlatform, SocialIconConfig | undefined>,
  });

  let originalForm = $state(JSON.stringify(form));
  let formDirty = $derived(JSON.stringify(form) !== originalForm);

  let uploadingPlatform = $state<SocialPlatform | null>(null);

  function ensureIconConfig(platform: SocialPlatform): SocialIconConfig {
    const existing = form.socialIcons[platform];
    if (existing) return existing;
    const fresh: SocialIconConfig = { url: '', zoom: 1, offsetX: 50, offsetY: 50, bgColor: '' };
    form.socialIcons[platform] = fresh;
    return fresh;
  }

  function setIconBgColor(platform: SocialPlatform, color: string) {
    const cfg = ensureIconConfig(platform);
    cfg.bgColor = color;
    form.socialIcons = { ...form.socialIcons };
  }

  function applyBgToAll(color: string) {
    for (const p of socialPlatformList) {
      const cfg = form.socialIcons[p.key];
      if (cfg?.url) cfg.bgColor = color;
    }
    form.socialIcons = { ...form.socialIcons };
  }

  function updateIconField(platform: SocialPlatform, field: 'zoom' | 'offsetX' | 'offsetY', value: number) {
    const cfg = ensureIconConfig(platform);
    cfg[field] = value;
    form.socialIcons = { ...form.socialIcons };
  }

  function iconPreviewStyle(cfg: SocialIconConfig | undefined): string {
    if (!cfg?.url) return '';
    const w = (cfg.zoom || 1) * 100;
    return `width: ${w}%; height: ${w}%; object-position: ${cfg.offsetX ?? 50}% ${cfg.offsetY ?? 50}%;`;
  }

  function defaultIconSvg(platform: SocialPlatform): string {
    const icons: Record<SocialPlatform, string> = {
      line: '<svg class="is-line-logo" viewBox="0 0 48 48"><path d="M24 6C13.5 6 5 12.9 5 21.4c0 7.6 6.7 14 15.8 15.2.6.1 1.4.4 1.6.9.2.5.1 1.2.1 1.7l-.3 2c-.1.6-.5 2.3 1.7 1.3 2.2-1 11.7-6.9 16-11.8 3-3.3 4.1-6.4 4.1-9.3C43 12.9 34.5 6 24 6Z"/><text x="24" y="20.6" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="10.5" letter-spacing="-0.35">LINE</text></svg>',
      instagram: '<svg viewBox="0 0 24 24"><rect x="4.4" y="4.4" width="15.2" height="15.2" rx="4.4"/><circle cx="12" cy="12" r="3.7"/><circle cx="16.75" cy="7.25" r="0.85"/></svg>',
      facebook: '<svg class="is-filled" viewBox="0 0 24 24"><path d="M14.05 8.25h2.15V4.8h-2.6c-3.05 0-4.55 1.82-4.55 4.35v2.1H6.7v3.55h2.35v6.05h3.75V14.8h2.9l.45-3.55H12.8V9.42c0-.82.33-1.17 1.25-1.17Z"/></svg>',
      threads: '<svg viewBox="0 0 24 24"><path d="M18.9 8.45c-.85-3.25-3.1-4.75-6.67-4.78-5.05.04-7.56 3.13-7.6 8.33.04 5.2 2.55 8.3 7.6 8.33 2.95-.02 5.02-.84 6.38-2.52 1.58-1.95 1.06-4.42-.62-5.6-1.17-.82-2.73-1.2-4.72-1.1-2.3.12-3.62 1.12-3.55 2.72.07 1.46 1.45 2.35 3.34 2.2 2.16-.18 3.25-1.58 3.25-4.15 0-2.72-1.35-4.18-3.9-4.2-1.75 0-2.95.78-3.45 2.22"/></svg>',
      tiktok: '<svg class="is-filled" viewBox="0 0 24 24"><path d="M14.65 4.5c.38 3.1 2.1 5.05 5.05 5.25v3.35c-1.72.05-3.35-.48-4.92-1.47v6.28c0 3.55-2.38 5.92-5.65 5.92-3.05 0-5.35-2.22-5.35-5.15 0-3.3 2.7-5.55 6.1-5.02v3.48c-1.45-.35-2.65.45-2.65 1.62 0 1.05.82 1.82 1.9 1.82 1.25 0 2.05-.82 2.05-2.32V4.5h3.47Z"/></svg>',
      phone: '<svg viewBox="0 0 24 24"><path d="M6.55 4.85c.58-.36 1.3-.18 1.64.42l1.12 1.95c.3.52.22 1.17-.2 1.6l-.88.92a12.35 12.35 0 0 0 6.02 6.02l.92-.88c.43-.42 1.08-.5 1.6-.2l1.95 1.12c.6.34.78 1.06.42 1.64l-.78 1.24c-.4.64-1.18.94-1.92.76A17.35 17.35 0 0 1 4.56 7.56c-.18-.74.12-1.52.76-1.92l1.23-.79Z"/></svg>',
      share: '<svg viewBox="0 0 24 24"><circle cx="6.5" cy="12" r="2.7"/><circle cx="17.5" cy="6.6" r="2.7"/><circle cx="17.5" cy="17.4" r="2.7"/><path d="M8.9 10.8 15.1 7.7M8.9 13.2l6.2 3.1"/></svg>',
    };
    return icons[platform];
  }

  async function uploadSocialIcon(platform: SocialPlatform, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploadingPlatform = platform;
    const tid = notifyProgress(`${platform.toUpperCase()} 圖示上傳中...`);
    const formData = new FormData();
    formData.append('files', file);
    const response = await adminFetch('/api/admin/media', { method: 'POST', body: formData });
    const result = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(result.urls) && result.urls[0]) {
      const cfg = ensureIconConfig(platform);
      cfg.url = result.urls[0];
      cfg.zoom = cfg.zoom || 1;
      cfg.offsetX = cfg.offsetX ?? 50;
      cfg.offsetY = cfg.offsetY ?? 50;
      form.socialIcons = { ...form.socialIcons };
      updateToast(tid, `${platform.toUpperCase()} 圖示上傳完成，記得按下方「儲存」`, 'success');
    } else {
      updateToast(tid, result.error || `${platform.toUpperCase()} 圖示上傳失敗`, 'error');
    }
    input.value = '';
    uploadingPlatform = null;
  }

  async function clearSocialIcon(platform: SocialPlatform) {
    form.socialIcons = Object.fromEntries(
      Object.entries(form.socialIcons).filter(([k, v]) => k !== platform && v != null)
    ) as Record<SocialPlatform, SocialIconConfig | undefined>;
    await saveSettings();
  }

  async function uploadSiteIcon(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const tid = notifyProgress('網站 icon 上傳中...');
    const formData = new FormData();
    formData.append('files', file);
    const response = await adminFetch('/api/admin/media', { method: 'POST', body: formData });
    const result = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(result.urls) && result.urls[0]) {
      form.siteIconUrl = result.urls[0];
      const saved = await saveSettings();
      updateToast(tid, saved ? '網站 icon 已更新' : '網站 icon 已上傳，但設定儲存失敗', saved ? 'success' : 'error');
    } else {
      updateToast(tid, result.error || '網站 icon 上傳失敗', 'error');
    }
    input.value = '';
  }

  async function clearSiteIcon() {
    form.siteIconUrl = '';
    await saveSettings();
  }

  async function saveSettings(): Promise<boolean> {
    const tid = notifyProgress('儲存中...');
    const payload: Record<string, unknown> = { ...form };
    if (!features.directContact) {
      delete payload.lineUrl;
      delete payload.phoneNumber;
    }
    if (!features.socialIcons) {
      delete payload.instagramUrl;
      delete payload.facebookUrl;
      delete payload.threadsUrl;
      delete payload.tiktokUrl;
      delete payload.socialIcons;
    }
    if (!features.sellInquiry) {
      delete payload.notificationEmail;
    }
    const response = await adminFetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
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
    <summary>網站名稱與業務</summary>
    <div class="settings-section__body">
      <label>網站名稱 <input bind:value={form.siteName} /></label>
      <label>業務顯示名稱 <input bind:value={form.salespersonName} /></label>
      <div class="site-icon-editor">
        <div class="site-icon-editor__preview" aria-label="網站 icon 預覽">
          {#if form.siteIconUrl}
            <img src={form.siteIconUrl} alt="網站 icon 預覽" />
          {:else}
            <span>{(form.siteName || '車').slice(0, 1)}</span>
          {/if}
        </div>
        <div class="site-icon-editor__body">
          <strong>瀏覽器分頁 icon</strong>
          <p class="form-hint">建議上傳正方形 PNG/WebP，至少 256×256。會套用到公開頁、後台與登入頁。</p>
          <div class="site-icon-editor__actions">
            <label class="upload-button">
              {form.siteIconUrl ? '更換網站 icon' : '上傳網站 icon'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange={uploadSiteIcon} />
            </label>
            {#if form.siteIconUrl}
              <button type="button" class="secondary-button" onclick={clearSiteIcon}>清除 icon</button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </details>

  <details class="settings-section" open>
    <summary>聯絡資訊</summary>
    <div class="settings-section__body">
      {#if features.directContact}
        <label>電話 <input bind:value={form.phoneNumber} /></label>
      {/if}
      <label>門市地址 <input bind:value={form.storeAddress} placeholder="例如 台北市信義區忠孝東路五段 00 號 0 樓" /></label>
      <label>營業時間 <input bind:value={form.businessHours} placeholder="例如 週一至週六 10:00-19:00，採預約賞車" /></label>
    </div>
  </details>

  {#if features.directContact || features.socialIcons}
  <details class="settings-section" open>
    <summary>社群連結</summary>
    <div class="settings-section__body">
      {#if features.directContact}
        <label>LINE 網址 <input bind:value={form.lineUrl} /></label>
      {/if}
      {#if features.socialIcons}
        <label>Instagram 網址 <input bind:value={form.instagramUrl} /></label>
        <label>Facebook 網址 <input bind:value={form.facebookUrl} /></label>
        <label>Threads 網址 <input bind:value={form.threadsUrl} /></label>
        <label>TikTok 網址 <input bind:value={form.tiktokUrl} /></label>
      {/if}
      <p class="form-hint">社群網址留空時，公開網頁的頁尾就不會顯示該平台。</p>
    </div>
  </details>
  {/if}

  {#if features.sellInquiry}
  <details class="settings-section">
    <summary>賣車申請通知</summary>
    <div class="settings-section__body">
      <label>通知收件信箱 <input type="email" bind:value={form.notificationEmail} placeholder="your@email.com" /></label>
      <p class="form-hint">收到賣車申請時發送通知到此信箱。留空則使用伺服器預設收件人。</p>
    </div>
  </details>
  {/if}

  {#if features.socialIcons}
  <details class="settings-section">
    <summary>社群平台自訂圖示</summary>
    <div class="settings-section__body">
      <p class="form-hint">每個平台可上傳專屬圖示、調整縮放/位置、設定底色（讓圖片的方形邊界與圓 chip 同色，視覺上看不到裁切）。</p>
      <div class="bg-all-row">
        <span>批次套用底色到所有已上傳的 icon：</span>
        <button type="button" onclick={() => applyBgToAll('#ffffff')} style="background:#fff;color:#000;">白色</button>
        <button type="button" onclick={() => applyBgToAll('#0b0a09')} style="background:#0b0a09;color:#fff;">黑色</button>
        <button type="button" onclick={() => applyBgToAll('#2f66ad')} style="background:#2f66ad;color:#fff;">主題藍</button>
        <button type="button" onclick={() => applyBgToAll('#06c755')} style="background:#06c755;color:#fff;">LINE 綠</button>
        <button type="button" onclick={() => applyBgToAll('')}>移除底色</button>
      </div>
      <div class="social-icon-editor">
        {#each socialPlatformList as platform}
          {@const cfg = form.socialIcons[platform.key]}
          <article class="social-icon-card">
            <div class="social-icon-card__head">
              <strong>{platform.label}</strong>
              {#if cfg?.url}
                <button type="button" class="row-button--danger" onclick={() => clearSocialIcon(platform.key)}>清除自訂</button>
              {/if}
            </div>
            <div class="social-icon-card__preview">
              {#if cfg?.url}
                <div class="social-icon-card__circle" style={cfg.bgColor ? `background: ${cfg.bgColor}; border-color: transparent;` : ''}>
                  <img src={cfg.url} alt={`${platform.label} 圖示預覽`} style={iconPreviewStyle(cfg)} />
                </div>
              {:else}
                <div class="social-icon-card__circle social-icon-card__circle--default" aria-label={`${platform.label} 主題預設圖示`}>
                  {@html defaultIconSvg(platform.key)}
                </div>
              {/if}
              <label class="upload-button">
                {uploadingPlatform === platform.key ? '上傳中...' : (cfg?.url ? '更換圖示' : '上傳圖示')}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onchange={(e) => uploadSocialIcon(platform.key, e)} disabled={uploadingPlatform !== null} />
              </label>
            </div>
            {#if cfg?.url}
              <div class="social-icon-card__controls">
                <label class="slider-row">
                  <span>縮放 {(cfg.zoom || 1).toFixed(2)}x（0.5x 縮到一半、1.0x 填滿邊緣）</span>
                  <input type="range" min="0.5" max="3" step="0.05" value={cfg.zoom || 1} oninput={(e) => updateIconField(platform.key, 'zoom', Number.parseFloat((e.currentTarget as HTMLInputElement).value))} />
                </label>
                <label class="slider-row">
                  <span>水平位置 {cfg.offsetX ?? 50}%</span>
                  <input type="range" min="0" max="100" step="1" value={cfg.offsetX ?? 50} oninput={(e) => updateIconField(platform.key, 'offsetX', Number.parseInt((e.currentTarget as HTMLInputElement).value, 10))} />
                </label>
                <label class="slider-row">
                  <span>垂直位置 {cfg.offsetY ?? 50}%</span>
                  <input type="range" min="0" max="100" step="1" value={cfg.offsetY ?? 50} oninput={(e) => updateIconField(platform.key, 'offsetY', Number.parseInt((e.currentTarget as HTMLInputElement).value, 10))} />
                </label>
                <label class="bg-row">
                  <span>底色</span>
                  <input type="color" value={cfg.bgColor || '#1a1612'} oninput={(e) => setIconBgColor(platform.key, (e.currentTarget as HTMLInputElement).value)} />
                  <button type="button" class="bg-clear" onclick={() => setIconBgColor(platform.key, '')} disabled={!cfg.bgColor}>清除</button>
                  {#if cfg.bgColor}<code>{cfg.bgColor}</code>{/if}
                </label>
              </div>
            {/if}
          </article>
        {/each}
      </div>
    </div>
  </details>
  {/if}

  <div class="settings-save-bar">
    <span class="settings-save-bar__hint">{formDirty ? '有未儲存的變更（Cmd/Ctrl+S 可儲存）' : '所有設定已是最新狀態'}</span>
    <button class="admin-button" type="submit" disabled={!formDirty}>儲存設定</button>
  </div>
</form>
