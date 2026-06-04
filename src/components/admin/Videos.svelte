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
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ videoSectionEnabled, videoSectionPosition, heroVideos: JSON.stringify(heroVideos) }),
    });
    carouselSaving = false;
    carouselStatus = res.ok ? '已儲存' : '儲存失敗';
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
    const res = await fetch('/api/admin/video-links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(links.map((l, i) => ({ ...l, sortOrder: i }))),
    });
    linksSaving = false;
    linksStatus = res.ok ? '已儲存' : '儲存失敗';
    if (res.ok) linksDirty = false;
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
.checkbox-row { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; cursor: pointer; }
.form-select { padding: 0.35rem 0.5rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.85rem; }
.form-input { padding: 0.35rem 0.5rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.85rem; }
.flex1 { flex: 1; min-width: 0; }
.w80 { width: 80px; }
.w140 { width: 140px; }
.video-list { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; }
.video-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; background: #f8f8f8; padding: 0.5rem 0.75rem; border-radius: 6px; }
.upload-label { cursor: pointer; font-size: 0.8rem; color: #666; white-space: nowrap; padding: 3px 8px; border: 1px solid #ddd; border-radius: 4px; }
.thumb-preview { width: 48px; height: 30px; object-fit: cover; border-radius: 3px; }
.btn-remove { background: none; border: none; color: #999; cursor: pointer; font-size: 1rem; padding: 0 4px; }
.btn-add { font-size: 0.85rem; padding: 0.4rem 0.8rem; border: 1px solid #ddd; border-radius: 4px; background: #fff; cursor: pointer; }
.save-status { font-size: 0.85rem; color: #166534; }
</style>
