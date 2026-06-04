<svelte:options accessors={true} />
<script lang="ts">
  import type { SiteSettings, GalleryMode } from '@/lib/settings';
  export let settings: SiteSettings;

  let galleryMode: GalleryMode = settings.galleryMode ?? 'lightbox';
  let dirty = false;
  let saving = false;
  let status = '';

  const modes = [
    { value: 'lightbox' as GalleryMode,        label: '展開式 Lightbox（預設）', desc: '點擊縮圖開啟全屏大圖' },
    { value: 'slider' as GalleryMode,          label: '全寬輪播 Slider',          desc: '左右箭頭切換，一次一張' },
    { value: 'thumbnail-strip' as GalleryMode, label: '主圖 + 縮圖列',            desc: '大主圖在上，下方橫向縮圖列' },
    { value: 'grid' as GalleryMode,            label: '瀑布格 Grid',              desc: '所有照片同時展示' },
  ];

  async function save() {
    saving = true;
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ galleryMode }),
    });
    saving = false;
    status = res.ok ? '已儲存' : '儲存失敗';
    if (res.ok) dirty = false;
    setTimeout(() => (status = ''), 2500);
  }
</script>

<div class="admin-page">
  <div class="page-header"><h1>照片展示模式</h1></div>

  <section class="settings-section">
    <h2>車輛詳情頁照片顯示方式</h2>
    <p class="muted" style="margin-bottom:1.25rem">套用於所有車輛詳情頁，儲存後立即生效。</p>

    <div class="mode-list">
      {#each modes as mode (mode.value)}
        <label class="mode-option" class:is-selected={galleryMode === mode.value}>
          <input
            type="radio"
            name="galleryMode"
            value={mode.value}
            bind:group={galleryMode}
            on:change={() => (dirty = true)}
          />
          <span class="mode-label">
            <strong>{mode.label}</strong>
            <span class="muted">{mode.desc}</span>
          </span>
        </label>
      {/each}
    </div>

    <div class="form-actions" style="margin-top:1.5rem">
      <button type="button" on:click={save} disabled={saving || !dirty} class="btn-primary">
        {saving ? '儲存中...' : '儲存'}
      </button>
      {#if status}<span class="save-status">{status}</span>{/if}
    </div>
  </section>
</div>

<style>
.mode-list { display: flex; flex-direction: column; gap: 0.75rem; max-width: 520px; }
.mode-option { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.875rem 1rem; border: 2px solid #e5e5e5; border-radius: 8px; cursor: pointer; background: #fff; transition: border-color .15s; font-weight: normal; }
.mode-option.is-selected { border-color: #2f66ad; background: #f0f6ff; }
.mode-label { display: flex; flex-direction: column; gap: 0.2rem; }
.save-status { font-size: 0.85rem; color: #166534; }
</style>
