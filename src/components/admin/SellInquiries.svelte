<svelte:options accessors={true} />
<script lang="ts">
  import type { SellInquiryView } from '@/lib/sell-inquiries';
  export let inquiries: SellInquiryView[] = [];

  let expanded: string | null = null;

  function toggle(id: string) {
    expanded = expanded === id ? null : id;
  }

  async function markRead(id: string) {
    const res = await fetch(`/api/admin/sell-inquiries/${id}/read`, { method: 'POST' });
    if (res.ok) {
      inquiries = inquiries.map((i) => i.id === id ? { ...i, readAt: new Date().toISOString() } : i);
    }
  }

  $: unreadCount = inquiries.filter((i) => !i.readAt).length;
</script>

<div class="admin-page">
  <div class="page-header">
    <h1>賣車申請</h1>
    <span class="muted">{unreadCount} 筆未讀</span>
  </div>

  {#if inquiries.length === 0}
    <div class="empty-state">
      <p>尚無賣車申請</p>
      <p class="muted">訪客透過 <a href="/sell">/sell</a> 頁面提交後會出現在這裡。</p>
    </div>
  {:else}
    <div class="inquiry-list">
      {#each inquiries as inq (inq.id)}
        <div class="inquiry-item" class:is-unread={!inq.readAt}>
          <button type="button" class="inquiry-summary" on:click={() => toggle(inq.id)}>
            <span class="inquiry-date">{new Date(inq.createdAt).toLocaleDateString('zh-TW')}</span>
            <span class="inquiry-name">{inq.contactName || '—'}</span>
            <span class="inquiry-vehicle">{[inq.brand, inq.model, inq.year].filter(Boolean).join(' ') || '—'}</span>
            <span class="inquiry-contact">{inq.contactInfo}</span>
            {#if !inq.readAt}<span class="badge-new">未讀</span>{/if}
            <span class="inquiry-toggle">{expanded === inq.id ? '▲' : '▼'}</span>
          </button>

          {#if expanded === inq.id}
            <div class="inquiry-detail">
              <table class="inquiry-table">
                <tbody>
                  <tr><th>聯絡方式</th><td>{inq.contactInfo}</td></tr>
                  <tr><th>品牌</th><td>{inq.brand || '—'}</td></tr>
                  <tr><th>型號</th><td>{inq.model || '—'}</td></tr>
                  <tr><th>年份</th><td>{inq.year ?? '—'}</td></tr>
                  <tr><th>里程</th><td>{inq.mileage != null ? `${inq.mileage} km` : '—'}</td></tr>
                  <tr><th>顏色</th><td>{inq.exteriorColor || '—'}</td></tr>
                  <tr><th>說明</th><td>{inq.notes || '—'}</td></tr>
                </tbody>
              </table>
              {#if inq.photoUrls.length > 0}
                <div class="inquiry-photos">
                  {#each inq.photoUrls as url (url)}
                    <a href={url} target="_blank" rel="noopener">
                      <img src={url} alt="申請照片" />
                    </a>
                  {/each}
                </div>
              {/if}
              {#if !inq.readAt}
                <button type="button" class="btn-mark-read" on:click={() => markRead(inq.id)}>
                  標記為已讀
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
.inquiry-list { display: flex; flex-direction: column; gap: 0.5rem; }
.inquiry-item { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: color-mix(in srgb, var(--surface) 94%, transparent); }
.inquiry-item.is-unread { border-left: 3px solid var(--accent); }
.inquiry-summary { display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1rem; width: 100%; text-align: left; background: none; border: none; cursor: pointer; font-size: 0.875rem; flex-wrap: wrap; }
.inquiry-summary:hover { background: color-mix(in srgb, var(--accent) 6%, transparent); }
.inquiry-date { color: var(--muted); white-space: nowrap; }
.inquiry-name { font-weight: 600; }
.inquiry-vehicle { color: var(--muted); }
.inquiry-contact { margin-left: auto; }
.inquiry-toggle { color: color-mix(in srgb, var(--muted) 70%, transparent); }
.badge-new { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent-strong); font-size: 0.7rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
.inquiry-detail { padding: 1rem; border-top: 1px solid var(--line); background: color-mix(in srgb, var(--bg) 72%, var(--surface)); }
.inquiry-table { border-collapse: collapse; font-size: 0.875rem; width: 100%; margin-bottom: 1rem; }
.inquiry-table th { font-weight: 600; color: var(--muted); padding: 3px 12px 3px 0; width: 80px; text-align: left; }
.inquiry-table td { padding: 3px 0; }
.inquiry-photos { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
.inquiry-photos img { width: 80px; height: 60px; object-fit: cover; border-radius: 4px; }
.btn-mark-read { font-size: 0.8rem; padding: 4px 12px; border: 1px solid var(--line); border-radius: 4px; background: var(--surface); color: var(--text); cursor: pointer; }
</style>
