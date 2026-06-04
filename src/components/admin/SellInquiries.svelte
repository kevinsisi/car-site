<script lang="ts">
  import type { SellInquiryView } from '@/lib/sell-inquiries';

  interface Props {
    inquiries: SellInquiryView[];
  }
  let { inquiries: initial }: Props = $props();
  let inquiries = $state(initial.map((i) => ({ ...i })));
  let expanded = $state<string | null>(null);

  async function markRead(id: string) {
    const res = await fetch(`/api/admin/sell-inquiries/${id}/read`, { method: 'POST' });
    if (res.ok) {
      const inq = inquiries.find((i) => i.id === id);
      if (inq) inq.readAt = new Date().toISOString();
      inquiries = [...inquiries];
    }
  }
</script>

<div class="admin-page">
  <div class="page-header">
    <h1>賣車申請</h1>
    <span class="muted">{inquiries.filter((i) => !i.readAt).length} 筆未讀</span>
  </div>

  {#if inquiries.length === 0}
    <div class="empty-state">
      <p>尚無賣車申請</p>
      <p class="muted">訪客透過 <a href="/sell">/sell</a> 頁面提交後會出現在這裡。</p>
    </div>
  {:else}
    <div class="inquiry-list">
      {#each inquiries as inq}
        <div class="inquiry-item{!inq.readAt ? ' is-unread' : ''}">
          <div class="inquiry-summary" role="button" tabindex="0"
            onclick={() => expanded = expanded === inq.id ? null : inq.id}
            onkeydown={(e) => e.key === 'Enter' && (expanded = expanded === inq.id ? null : inq.id)}>
            <span class="inquiry-date">{new Date(inq.createdAt).toLocaleDateString('zh-TW')}</span>
            <span class="inquiry-name">{inq.contactName || '—'}</span>
            <span class="inquiry-vehicle">{[inq.brand, inq.model, inq.year].filter(Boolean).join(' ') || '—'}</span>
            <span class="inquiry-contact">{inq.contactInfo}</span>
            {#if !inq.readAt}<span class="badge-new">未讀</span>{/if}
            <span class="inquiry-toggle">{expanded === inq.id ? '▲' : '▼'}</span>
          </div>

          {#if expanded === inq.id}
            <div class="inquiry-detail">
              <dl class="inquiry-dl">
                <dt>聯絡方式</dt><dd>{inq.contactInfo}</dd>
                <dt>品牌</dt><dd>{inq.brand || '—'}</dd>
                <dt>型號</dt><dd>{inq.model || '—'}</dd>
                <dt>年份</dt><dd>{inq.year ?? '—'}</dd>
                <dt>里程</dt><dd>{inq.mileage != null ? `${inq.mileage} km` : '—'}</dd>
                <dt>外觀顏色</dt><dd>{inq.exteriorColor || '—'}</dd>
                <dt>說明</dt><dd>{inq.notes || '—'}</dd>
              </dl>
              {#if inq.photoUrls.length > 0}
                <div class="inquiry-photos">
                  {#each inq.photoUrls as url}
                    <a href={url} target="_blank"><img src={url} alt="" /></a>
                  {/each}
                </div>
              {/if}
              {#if !inq.readAt}
                <button type="button" onclick={() => markRead(inq.id)} class="btn-mark-read">標記為已讀</button>
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
.inquiry-item { border: 1px solid var(--border, #e5e5e5); border-radius: 8px; overflow: hidden; background: #fff; }
.inquiry-item.is-unread { border-left: 3px solid var(--accent, #0066cc); }
.inquiry-summary {
  display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1rem;
  cursor: pointer; font-size: 0.875rem; flex-wrap: wrap;
}
.inquiry-summary:hover { background: #f9f9f9; }
.inquiry-date { color: var(--muted, #777); white-space: nowrap; }
.inquiry-name { font-weight: 600; }
.inquiry-vehicle { color: var(--muted, #666); }
.inquiry-contact { margin-left: auto; }
.inquiry-toggle { color: var(--muted, #aaa); }
.badge-new { background: #dbeafe; color: #1e40af; font-size: 0.7rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
.inquiry-detail { padding: 1rem; border-top: 1px solid var(--border, #e5e5e5); background: #fafafa; }
.inquiry-dl { display: grid; grid-template-columns: 100px 1fr; gap: 0.4rem 1rem; font-size: 0.875rem; margin: 0 0 1rem; }
.inquiry-dl dt { font-weight: 600; color: var(--muted, #666); }
.inquiry-dl dd { margin: 0; }
.inquiry-photos { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
.inquiry-photos img { width: 80px; height: 60px; object-fit: cover; border-radius: 4px; }
.btn-mark-read { font-size: 0.8rem; padding: 4px 12px; border: 1px solid #ddd; border-radius: 4px; background: #fff; cursor: pointer; }
.btn-mark-read:hover { background: #f0f0f0; }
</style>
