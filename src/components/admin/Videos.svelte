<svelte:options accessors={true} />
<script lang="ts">
  import type { SiteSettings, HeroVideo } from '@/lib/settings';
  import type { VideoLinkView } from '@/lib/video-links';

  export let settings: SiteSettings;
  export let videoLinks: VideoLinkView[] = [];
  export let canCarousel: boolean;
  export let canLinks: boolean;

  let videoSectionEnabled = settings.videoSectionEnabled ?? false;
  let videoSectionPosition = settings.videoSectionPosition ?? 'below-hero';
  let heroVideos: HeroVideo[] = (settings.heroVideos ?? []).map((v) => ({ ...v }));
  let carouselDirty = false;
  let carouselSaving = false;
  let carouselStatus = '';

  let links: VideoLinkView[] = [...videoLinks];
  let videoLinksEnabled = settings.videoLinksEnabled ?? false;
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
      body: JSON.stringify({ videoSectionEnabled, videoSectionPosition, heroVideos: JSON.stringify(heroVideos) }),
    });
    carouselSaving = false;
    const json = await res.json().catch(() => null);
    carouselStatus = res.ok ? '已儲存' : json?.error || '儲存失敗';
    if (res.ok) carouselDirty = false;
    setTimeout(() => (carouselStatus = ''), 2500);
  }

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
      body: JSON.stringify({ videoLinksEnabled, videoLinksSectionTitle }),
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
        <label class="checkbox-row">
          <input type="checkbox" bind:checked={videoSectionEnabled} on:change={() => (carouselDirty = true)} />
          啟用影片輪播區塊
        </label>
      </div>
      {#if videoSectionEnabled}
        <div class="form-group" style="margin-bottom:1rem">
          <label>顯示位置</label>
          <select bind:value={videoSectionPosition} on:change={() => (carouselDirty = true)} class="form-select">
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
              <button type="button" class="btn-remove" on:click={() => removeVideo(i)}>✕</button>
            </div>
          {/each}
        </div>
        <button type="button" class="btn-add" on:click={addVideo}>＋ 新增影片</button>
      {/if}
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
        <label class="checkbox-row">
          <input type="checkbox" bind:checked={videoLinksEnabled} on:change={() => (linksDirty = true)} />
          啟用底部影片連結區塊
        </label>
        <label class="title-field">
          <span>區塊標題</span>
          <input type="text" bind:value={videoLinksSectionTitle} on:input={() => (linksDirty = true)} class="form-input" placeholder="精選影片" />
        </label>
      </div>
      <div class="video-list">
        {#each links as link, i (i)}
          <div class="video-row">
            <input type="text" bind:value={link.title} placeholder="標題" on:input={() => (linksDirty = true)} class="form-input w140" />
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
.settings-section { display: grid; gap: 1rem; padding: clamp(1rem, 3vw, 1.4rem); border: 1px solid rgba(210, 174, 101, 0.18); border-radius: 1.2rem; background: #110e0b; overflow: hidden; }
.settings-section h2 { margin: 0; color: #f8efe1; font-size: clamp(1.35rem, 4.8vw, 2rem); line-height: 1.12; }
.checkbox-row { display: flex; align-items: center; gap: 0.65rem; font-weight: 800; cursor: pointer; color: #f8efe1; }
.checkbox-row input { width: 1.25rem; min-height: 1.25rem; accent-color: #d6b06a; }
.form-select { min-height: 2.65rem; padding: 0 0.75rem; border: 1px solid rgba(210, 174, 101, 0.28); border-radius: 0.75rem; background: #0d0b09; color: #f8efe1; font-size: 1rem; }
.form-input { min-height: 2.65rem; padding: 0 0.75rem; border: 1px solid rgba(210, 174, 101, 0.28); border-radius: 0.75rem; background: #0d0b09; color: #f8efe1; font-size: 1rem; }
.video-options { display: grid; gap: 0.8rem; }
.title-field { display: grid; gap: 0.45rem; color: #c9bda6; }
.title-field span { font-size: 0.88rem; font-weight: 800; color: #d6b06a; }
.flex1 { flex: 1; min-width: 0; }
.w80 { width: 80px; }
.w140 { width: 140px; }
.video-list { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; }
.video-row { display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap; background: #0d0b09; padding: 0.75rem; border: 1px solid rgba(210, 174, 101, 0.14); border-radius: 0.95rem; }
.upload-label { min-height: 2.45rem; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.9rem; font-weight: 800; color: #d6b06a; white-space: nowrap; padding: 0 0.9rem; border: 1px solid rgba(210, 174, 101, 0.28); border-radius: 999px; background: rgba(210, 174, 101, 0.06); }
.thumb-preview { width: 4.8rem; height: 3rem; object-fit: cover; border-radius: 0.45rem; background: #050403; border: 1px solid rgba(210, 174, 101, 0.18); }
.btn-remove { min-width: 2.45rem; min-height: 2.45rem; border: 1px solid rgba(220, 90, 90, 0.35); border-radius: 999px; background: transparent; color: #e8a0a0; cursor: pointer; font-size: 1rem; padding: 0 0.65rem; }
.btn-add { min-height: 2.7rem; width: max-content; font-size: 0.95rem; font-weight: 850; padding: 0 1rem; border: 1px solid rgba(210, 174, 101, 0.32); border-radius: 999px; background: #f8efe1; color: #0b0a09; cursor: pointer; }
.btn-primary { min-height: 2.7rem; padding: 0 1.1rem; border: 1px solid #d6b06a; border-radius: 999px; background: #d6b06a; color: #0b0a09; font-weight: 900; cursor: pointer; }
.btn-primary:disabled { opacity: 0.42; cursor: not-allowed; }
.save-status { font-size: 0.85rem; color: #166534; }
@media (max-width: 700px) {
  .admin-page { width: 100%; }
  .video-row { display: grid; grid-template-columns: 1fr auto; align-items: end; }
  .video-row .flex1,
  .video-row .w80,
  .video-row .w140 { width: 100%; grid-column: 1 / -1; }
  .video-row .upload-label { grid-column: 1; width: 100%; }
  .video-row .thumb-preview,
  .video-row .btn-remove { grid-column: 2; }
  .form-actions { display: flex; gap: 0.65rem; align-items: center; flex-wrap: wrap; }
}
</style>
