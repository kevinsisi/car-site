<script lang="ts">
  import type { SiteSettings, HeroVideo } from '@/lib/settings';
  import type { VideoLinkView } from '@/lib/video-links';

  interface Props {
    settings: SiteSettings;
    videoLinks: VideoLinkView[];
    canCarousel: boolean;
    canLinks: boolean;
  }
  let { settings, videoLinks: initialLinks, canCarousel, canLinks }: Props = $props();

  // Carousel state
  let videoSectionEnabled = $state(settings.videoSectionEnabled);
  let videoSectionPosition = $state(settings.videoSectionPosition);
  let heroVideos = $state<HeroVideo[]>(settings.heroVideos.map((v) => ({ ...v })));
  let carouselDirty = $state(false);
  let carouselSaving = $state(false);
  let carouselStatus = $state('');

  // Video links state
  let links = $state(initialLinks.map((l) => ({ ...l })));
  let linksDirty = $state(false);
  let linksSaving = $state(false);
  let linksStatus = $state('');

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

  async function uploadLinkThumb(e: Event, link: (typeof links)[number]) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('files', file);
    const res = await fetch('/api/admin/media', { method: 'POST', body: fd });
    if (!res.ok) return;
    const json = await res.json();
    link.thumbnailUrl = json.urls?.[0] ?? null;
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

  async function saveLinksEnabled() {
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ videoLinksEnabled: settings.videoLinksEnabled, videoLinksSectionTitle: settings.videoLinksSectionTitle }),
    });
  }
</script>

<div class="admin-page">
  <div class="page-header">
    <h1>影片管理</h1>
  </div>

  {#if canCarousel}
    <section class="settings-section">
      <h2>Banner 影片輪播</h2>
      <div class="form-group" style="margin-bottom:1rem">
        <label class="checkbox-label" style="font-weight:600">
          <input type="checkbox" bind:checked={videoSectionEnabled} onchange={() => carouselDirty = true} />
          啟用影片輪播區塊
        </label>
      </div>
      {#if videoSectionEnabled}
        <div class="form-group" style="margin-bottom:1rem">
          <label>顯示位置</label>
          <select bind:value={videoSectionPosition} onchange={() => carouselDirty = true} style="padding:0.4rem 0.6rem;border:1px solid #ddd;border-radius:4px;">
            <option value="below-hero">Hero 下方</option>
            <option value="below-featured">精選車輛下方</option>
            <option value="above-footer">頁尾上方</option>
          </select>
        </div>
        <div class="video-list" style="display:flex;flex-direction:column;gap:0.75rem;margin-bottom:1rem">
          {#each heroVideos as video, i}
            <div style="display:grid;grid-template-columns:1fr auto auto auto auto;gap:0.5rem;align-items:center;background:#f8f8f8;padding:0.75rem;border-radius:6px;">
              <input type="text" bind:value={video.url} placeholder="YouTube URL 或 MP4 URL" oninput={() => carouselDirty = true} style="padding:0.35rem 0.5rem;border:1px solid #ddd;border-radius:4px;font-size:0.85rem;" />
              <select bind:value={video.type} onchange={() => carouselDirty = true} style="padding:0.35rem;border:1px solid #ddd;border-radius:4px;font-size:0.85rem;">
                <option value="youtube">YouTube</option>
                <option value="mp4">MP4</option>
              </select>
              <input type="text" bind:value={video.label} placeholder="標題（選填）" oninput={() => carouselDirty = true} style="padding:0.35rem 0.5rem;border:1px solid #ddd;border-radius:4px;font-size:0.85rem;" />
              <label style="cursor:pointer;font-size:0.8rem;color:#666;white-space:nowrap;">
                縮圖
                <input type="file" accept="image/*" style="display:none" onchange={(e) => uploadThumb(e, video)} />
              </label>
              {#if video.thumbnailUrl}<img src={video.thumbnailUrl} alt="" width="48" style="height:30px;object-fit:cover;border-radius:3px;" />{/if}
              <button type="button" onclick={() => removeVideo(i)} style="background:none;border:none;color:#999;cursor:pointer;font-size:1rem;">✕</button>
            </div>
          {/each}
        </div>
        <button type="button" onclick={addVideo} style="font-size:0.85rem;padding:0.4rem 0.8rem;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;">＋ 新增影片</button>
      {/if}
      <div style="display:flex;align-items:center;gap:1rem;margin-top:1rem">
        <button type="button" onclick={saveCarousel} disabled={carouselSaving || !carouselDirty} class="btn-primary" style="font-size:0.875rem;padding:0.45rem 1.2rem;">
          {carouselSaving ? '儲存中...' : '儲存'}
        </button>
        {#if carouselStatus}<span style="font-size:0.85rem;color:#166534">{carouselStatus}</span>{/if}
      </div>
    </section>
  {/if}

  {#if canLinks}
    <section class="settings-section">
      <h2>底部影片連結</h2>
      <div class="form-group" style="margin-bottom:1rem">
        <label class="checkbox-label" style="font-weight:600">
          <input type="checkbox" bind:checked={settings.videoLinksEnabled} onchange={saveLinksEnabled} />
          啟用影片連結區塊
        </label>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.75rem;margin-bottom:1rem">
        {#each links as link, i}
          <div style="display:grid;grid-template-columns:1fr 1fr auto auto auto;gap:0.5rem;align-items:center;background:#f8f8f8;padding:0.75rem;border-radius:6px;">
            <input type="text" bind:value={link.title} placeholder="標題" oninput={() => linksDirty = true} style="padding:0.35rem 0.5rem;border:1px solid #ddd;border-radius:4px;font-size:0.85rem;" />
            <input type="text" bind:value={link.url} placeholder="IG Reel / YouTube URL" oninput={() => linksDirty = true} style="padding:0.35rem 0.5rem;border:1px solid #ddd;border-radius:4px;font-size:0.85rem;" />
            <label style="cursor:pointer;font-size:0.8rem;color:#666;white-space:nowrap;">
              縮圖
              <input type="file" accept="image/*" style="display:none" onchange={(e) => uploadLinkThumb(e, link)} />
            </label>
            {#if link.thumbnailUrl}<img src={link.thumbnailUrl} alt="" width="48" style="height:30px;object-fit:cover;border-radius:3px;" />{/if}
            <button type="button" onclick={() => removeLink(i)} style="background:none;border:none;color:#999;cursor:pointer;font-size:1rem;">✕</button>
          </div>
        {/each}
      </div>
      <button type="button" onclick={addLink} style="font-size:0.85rem;padding:0.4rem 0.8rem;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;">＋ 新增連結</button>
      <div style="display:flex;align-items:center;gap:1rem;margin-top:1rem">
        <button type="button" onclick={saveLinks} disabled={linksSaving || !linksDirty} class="btn-primary" style="font-size:0.875rem;padding:0.45rem 1.2rem;">
          {linksSaving ? '儲存中...' : '儲存連結'}
        </button>
        {#if linksStatus}<span style="font-size:0.85rem;color:#166534">{linksStatus}</span>{/if}
      </div>
    </section>
  {/if}
</div>
