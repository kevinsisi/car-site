<script lang="ts">
  import type { SiteSettings, GalleryMode } from '@/lib/settings';
  interface Props { settings: SiteSettings; }
  let { settings }: Props = $props();

  let galleryMode = $state<GalleryMode>(settings.galleryMode ?? 'lightbox');
  let dirty = $state(false);
  let saving = $state(false);
  let status = $state('');

  const modes: { value: GalleryMode; label: string; desc: string }[] = [
    { value: 'lightbox',        label: '展開式 Lightbox（預設）', desc: '點擊縮圖開啟全屏大圖，保留現有互動方式' },
    { value: 'slider',          label: '全寬輪播 Slider',          desc: '左右箭頭切換，一次顯示一張大圖' },
    { value: 'thumbnail-strip', label: '主圖 + 縮圖列',            desc: '大主圖在上，下方橫向縮圖列（參考 vipmotors.ae）' },
    { value: 'grid',            label: '瀑布格 Grid',              desc: '所有照片同時展示於格狀版面' },
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

    <div style="display:flex;flex-direction:column;gap:0.75rem;max-width:520px;">
      {#each modes as mode}
        <label style="display:flex;align-items:flex-start;gap:0.75rem;padding:0.875rem 1rem;border:2px solid {galleryMode === mode.value ? 'var(--accent,#0066cc)' : '#e5e5e5'};border-radius:8px;cursor:pointer;background:{galleryMode === mode.value ? '#f0f6ff' : '#fff'};transition:border-color .15s,background .15s;font-weight:normal;">
          <input
            type="radio"
            name="galleryMode"
            value={mode.value}
            bind:group={galleryMode}
            onchange={() => dirty = true}
            style="margin-top:3px;flex-shrink:0;"
          />
          <span>
            <strong style="display:block;margin-bottom:0.2rem">{mode.label}</strong>
            <span class="muted" style="font-size:0.8rem">{mode.desc}</span>
          </span>
        </label>
      {/each}
    </div>

    <div style="display:flex;align-items:center;gap:1rem;margin-top:1.5rem;">
      <button type="button" onclick={save} disabled={saving || !dirty} class="btn-primary" style="font-size:0.875rem;padding:0.45rem 1.4rem;">
        {saving ? '儲存中...' : '儲存'}
      </button>
      {#if status}<span style="font-size:0.85rem;color:#166534">{status}</span>{/if}
    </div>
  </section>
</div>
