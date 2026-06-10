<svelte:options accessors={true} />
<script lang="ts">
  import type { SiteSettings, HeroVideo } from '@/lib/settings';
  import type { VideoLinkView } from '@/lib/video-links';

  export let settings: Pick<SiteSettings, 'videoSectionPosition' | 'heroVideos' | 'videoLinksSectionTitle'>;
  export let videoLinks: VideoLinkView[] = [];
  export let canCarousel: boolean;
  export let canLinks: boolean;

  let videoSectionPosition = settings.videoSectionPosition ?? 'below-hero';
  let heroVideos: HeroVideo[] = (settings.heroVideos ?? []).map((v) => ({ ...v }));
  let carouselDirty = false;
  let carouselSaving = false;
  let carouselStatus = '';
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  let links: VideoLinkView[] = [...videoLinks];
  let videoLinksSectionTitle = settings.videoLinksSectionTitle ?? '精選影片';
  let linksDirty = false;
  let linksSaving = false;
  let linksStatus = '';

  function addVideo() {
    heroVideos = [...heroVideos, { id: crypto.randomUUID(), url: '', type: 'youtube', thumbnailUrl: '', label: '' }];
    carouselDirty = true;
  }

  function removeVideo(i: number) {
    heroVideos = heroVideos.filter((_, idx) => idx !== i);
    carouselDirty = true;
  }

  async function uploadThumb(e: Event, video: HeroVideo) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('files', file);
    const res = await fetch('/api/admin/media', { method: 'POST', body: fd });
    if (!res.ok) return;
    const json = await res.json();
    video.thumbnailUrl = json.urls?.[0] ?? '';
    heroVideos = [...heroVideos];
    carouselDirty = true;
  }

  async function saveCarousel() {
    carouselSaving = true;
    const res = await fetch('/api/admin/video-settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ videoSectionPosition, heroVideos: JSON.stringify(heroVideos) }),
    });
    carouselSaving = false;
    const json = await res.json().catch(() => null);
    carouselStatus = res.ok ? '已儲存' : json?.error || '儲存失敗';
    if (res.ok) {
      if (json?.heroVideos) heroVideos = json.heroVideos;
      carouselDirty = false;
      startConversionPolling();
    }
    setTimeout(() => (carouselStatus = ''), 2500);
  }

  function conversionLabel(video: HeroVideo) {
    if (video.type !== 'youtube') return video.url.startsWith('/media/') ? '本站 MP4' : '外部 MP4';
    if (video.localUrl && video.conversionStatus === 'completed') return '已轉成本站 MP4';
    if (video.conversionStatus === 'processing') return '轉檔中';
    if (video.conversionStatus === 'pending') return '等待轉檔';
    if (video.conversionStatus === 'failed') return '轉檔失敗';
    return 'YouTube fallback';
  }

  function hasActiveConversions() {
    return heroVideos.some((video) => video.type === 'youtube' && (video.conversionStatus === 'pending' || video.conversionStatus === 'processing'));
  }

  async function refreshConversions() {
    const res = await fetch('/api/admin/video-settings');
    if (!res.ok) return;
    const json = await res.json().catch(() => null);
    if (json?.heroVideos) heroVideos = json.heroVideos;
    if (!hasActiveConversions() && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startConversionPolling() {
    if (!hasActiveConversions() || pollTimer) return;
    pollTimer = setInterval(refreshConversions, 3500);
  }

  async function retryConversion(video: HeroVideo) {
    video.conversionStatus = 'pending';
    video.conversionError = '';
    heroVideos = [...heroVideos];
    const res = await fetch(`/api/admin/hero-video-conversions/${encodeURIComponent(video.id)}`, { method: 'POST' });
    if (!res.ok) {
      video.conversionStatus = 'failed';
      video.conversionError = '重試失敗';
      heroVideos = [...heroVideos];
      return;
    }
    startConversionPolling();
  }

  $: if (hasActiveConversions()) startConversionPolling();

  function addLink() {
    links = [...links, { id: '', title: '', url: '', thumbnailUrl: null, sortOrder: links.length }];
    linksDirty = true;
  }

  function removeLink(i: number) {
    links = links.filter((_, idx) => idx !== i);
    linksDirty = true;
  }

  async function uploadLinkThumb(e: Event, i: number) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('files', file);
    const res = await fetch('/api/admin/media', { method: 'POST', body: fd });
    if (!res.ok) return;
    const json = await res.json();
    links[i] = { ...links[i], thumbnailUrl: json.urls?.[0] ?? null };
    links = [...links];
    linksDirty = true;
  }

  async function saveLinks() {
    linksSaving = true;
    const settingsRes = await fetch('/api/admin/video-settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ videoLinksSectionTitle }),
    });
    const res = settingsRes.ok ? await fetch('/api/admin/video-links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(links.map((l, i) => ({ ...l, sortOrder: i }))),
    }) : settingsRes;
    linksSaving = false;
    const json = await res.json().catch(() => null);
    linksStatus = res.ok ? '已儲存' : json?.error || '儲存失敗';
    if (res.ok) {
      links = json?.links ?? links;
      linksDirty = false;
    }
    setTimeout(() => (linksStatus = ''), 2500);
  }
</script>

<div class="admin-page">
  <div class="page-header"><h1>影片管理</h1></div>

  {#if canCarousel}
    <section class="settings-section">
      <h2>Banner 影片輪播</h2>
      <div class="form-group" style="margin-bottom:1rem">
          <label>顯示位置</label>
          <select bind:value={videoSectionPosition} on:change={() => (carouselDirty = true)} class="form-select">
            <option value="above-header">Header 上方整條橫幅</option>
            <option value="below-hero">Hero 下方</option>
            <option value="below-featured">精選車輛下方</option>
            <option value="above-footer">頁尾上方</option>
          </select>
        </div>
        <div class="video-list">
          {#each heroVideos as video, i (i)}
            <div class="video-row">
              <input type="text" bind:value={video.url} placeholder="YouTube URL 或 MP4 URL" on:input={() => (carouselDirty = true)} class="form-input flex1" />
              <select bind:value={video.type} on:change={() => (carouselDirty = true)} class="form-select w80">
                <option value="youtube">YouTube</option>
                <option value="mp4">MP4</option>
              </select>
              <input type="text" bind:value={video.label} placeholder="標題（選填）" on:input={() => (carouselDirty = true)} class="form-input w140" />
              <label class="upload-label">
                縮圖
                <input type="file" accept="image/*" style="display:none" on:change={(e) => uploadThumb(e, video)} />
              </label>
              {#if video.thumbnailUrl}
                <img src={video.thumbnailUrl} alt="" class="thumb-preview" />
              {/if}
              <div class:status-failed={video.conversionStatus === 'failed'} class:status-complete={video.localUrl && video.conversionStatus === 'completed'} class="conversion-status">
                <span>{conversionLabel(video)}</span>
                {#if video.localUrl && video.conversionStatus === 'completed'}<small>{video.localUrl}</small>{/if}
                {#if video.conversionStatus === 'failed' && video.conversionError}<small>{video.conversionError}</small>{/if}
                {#if video.type === 'youtube' && video.conversionStatus === 'failed'}<button type="button" on:click={() => retryConversion(video)}>重試</button>{/if}
              </div>
              <button type="button" class="btn-remove" on:click={() => removeVideo(i)}>✕</button>
            </div>
          {/each}
        </div>
        <button type="button" class="btn-add" on:click={addVideo}>＋ 新增影片</button>
      <div class="form-actions" style="margin-top:1rem">
        <button type="button" class="btn-primary" on:click={saveCarousel} disabled={carouselSaving || !carouselDirty}>
          {carouselSaving ? '儲存中...' : '儲存'}
        </button>
        {#if carouselStatus}<span class="save-status">{carouselStatus}</span>{/if}
      </div>
    </section>
  {/if}

  {#if canLinks}
    <section class="settings-section">
      <h2>底部影片連結</h2>
      <div class="video-options">
        <label class="title-field">
          <span>區塊標題</span>
          <input type="text" bind:value={videoLinksSectionTitle} on:input={() => (linksDirty = true)} class="form-input" placeholder="精選影片" />
        </label>
      </div>
      <div class="video-list">
        {#each links as link, i (i)}
          <div class="video-row">
            <input type="text" bind:value={link.title} placeholder="標題(留白顯示:精選好車)" on:input={() => (linksDirty = true)} class="form-input w140" />
            <input type="text" bind:value={link.url} placeholder="IG Reel / YouTube URL" on:input={() => (linksDirty = true)} class="form-input flex1" />
            <label class="upload-label">
              縮圖
              <input type="file" accept="image/*" style="display:none" on:change={(e) => uploadLinkThumb(e, i)} />
            </label>
            {#if link.thumbnailUrl}
              <img src={link.thumbnailUrl} alt="" class="thumb-preview" />
            {/if}
            <button type="button" class="btn-remove" on:click={() => removeLink(i)}>✕</button>
          </div>
        {/each}
      </div>
      <button type="button" class="btn-add" on:click={addLink}>＋ 新增連結</button>
      <div class="form-actions" style="margin-top:1rem">
        <button type="button" class="btn-primary" on:click={saveLinks} disabled={linksSaving || !linksDirty}>
          {linksSaving ? '儲存中...' : '儲存連結'}
        </button>
        {#if linksStatus}<span class="save-status">{linksStatus}</span>{/if}
      </div>
    </section>
  {/if}
</div>

<style>
.settings-section { display: grid; gap: 1rem; padding: clamp(1rem, 3vw, 1.4rem); border: 1px solid var(--line); border-radius: 1.2rem; background: color-mix(in srgb, var(--surface) 96%, transparent); overflow: hidden; color: var(--text); }
.settings-section h2 { margin: 0; color: var(--text); font-size: clamp(1.35rem, 4.8vw, 2rem); line-height: 1.12; }
.checkbox-row { display: flex; align-items: center; gap: 0.65rem; font-weight: 800; cursor: pointer; color: var(--text); }
.checkbox-row input { width: 1.25rem; min-height: 1.25rem; accent-color: var(--accent); }
.form-select { min-height: 2.65rem; padding: 0 0.75rem; border: 1px solid var(--line); border-radius: 0.75rem; background: color-mix(in srgb, var(--bg) 86%, var(--surface)); color: var(--text); font-size: 1rem; }
.form-input { min-height: 2.65rem; padding: 0 0.75rem; border: 1px solid var(--line); border-radius: 0.75rem; background: color-mix(in srgb, var(--bg) 86%, var(--surface)); color: var(--text); font-size: 1rem; }
.video-options { display: grid; gap: 0.8rem; }
.title-field { display: grid; gap: 0.45rem; color: var(--muted); }
.title-field span { font-size: 0.88rem; font-weight: 800; color: var(--accent-strong); }
.flex1 { flex: 1; min-width: 0; }
.w80 { width: 80px; }
.w140 { width: 140px; }
.video-list { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; }
.video-row { display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap; background: color-mix(in srgb, var(--bg) 78%, var(--surface)); padding: 0.75rem; border: 1px solid var(--line); border-radius: 0.95rem; }
.upload-label { min-height: 2.45rem; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.9rem; font-weight: 800; color: var(--accent-strong); white-space: nowrap; padding: 0 0.9rem; border: 1px solid var(--line); border-radius: 999px; background: color-mix(in srgb, var(--accent) 8%, transparent); }
.thumb-preview { width: 4.8rem; height: 3rem; object-fit: cover; border-radius: 0.45rem; background: var(--surface-soft); border: 1px solid var(--line); }
.conversion-status { min-width: min(100%, 12rem); display: grid; gap: 0.18rem; color: var(--muted); font-size: 0.78rem; line-height: 1.25; }
.conversion-status span { font-weight: 850; color: var(--accent-strong); }
.conversion-status small { max-width: 18rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conversion-status button { width: max-content; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius: 999px; background: transparent; color: var(--accent-strong); font: inherit; font-size: 0.72rem; font-weight: 850; padding: 0.12rem 0.55rem; cursor: pointer; }
.status-complete span { color: #2f8b57; }
.status-failed span { color: #c25555; }
.btn-remove { min-width: 2.45rem; min-height: 2.45rem; border: 1px solid color-mix(in srgb, #dc5a5a 45%, var(--line)); border-radius: 999px; background: transparent; color: #c25555; cursor: pointer; font-size: 1rem; padding: 0 0.65rem; }
.btn-add { min-height: 2.7rem; width: max-content; font-size: 0.95rem; font-weight: 850; padding: 0 1rem; border: 1px solid color-mix(in srgb, var(--accent) 44%, var(--line)); border-radius: 999px; background: var(--accent); color: var(--bg); cursor: pointer; }
.btn-primary { min-height: 2.7rem; padding: 0 1.1rem; border: 1px solid var(--accent); border-radius: 999px; background: var(--accent); color: var(--bg); font-weight: 900; cursor: pointer; }
.btn-primary:disabled { opacity: 0.42; cursor: not-allowed; }
.save-status { font-size: 0.85rem; color: var(--accent-strong); }
@media (max-width: 700px) {
  .admin-page { width: 100%; }
  .video-row { display: grid; grid-template-columns: 1fr auto; align-items: end; }
  .video-row .flex1,
  .video-row .w80,
  .video-row .w140 { width: 100%; grid-column: 1 / -1; }
  .video-row .upload-label { grid-column: 1; width: 100%; }
  .video-row .conversion-status { grid-column: 1 / -1; }
  .video-row .thumb-preview,
  .video-row .btn-remove { grid-column: 2; }
  .form-actions { display: flex; gap: 0.65rem; align-items: center; flex-wrap: wrap; }
}
</style>
