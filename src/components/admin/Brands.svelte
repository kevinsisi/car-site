<svelte:options accessors={true} />
<script lang="ts">
  import type { BrandAliasView } from '@/lib/brand-aliases';
  import type { VehicleView } from '@/lib/vehicles';

  export let brandAliases: BrandAliasView[] = [];
  export let vehicles: VehicleView[] = [];
  export let canUploadIcon: boolean = false;

  type BrandRow = { sourceBrand: string; displayName: string; urlSlug: string; iconUrl: string | null };

  $: sourceBrandOptions = Array.from(new Set([
    ...vehicles.map((v) => v.brand),
    ...brandAliases.map((a) => a.sourceBrand),
  ])).filter(Boolean).sort((a, b) => a.localeCompare(b));

  let rows: BrandRow[] = brandAliases.length
    ? brandAliases.map((a) => ({ sourceBrand: a.sourceBrand, displayName: a.displayName, urlSlug: a.urlSlug, iconUrl: a.iconUrl ?? null }))
    : [];

  let status = '';
  let saving = false;

  function addRow() {
    const used = new Set(rows.map((r) => r.sourceBrand));
    const brand = sourceBrandOptions.find((b) => !used.has(b)) || sourceBrandOptions[0] || '';
    rows = [...rows, { sourceBrand: brand, displayName: '', urlSlug: '', iconUrl: null }];
  }

  function removeRow(i: number) {
    rows = rows.filter((_, idx) => idx !== i);
  }

  function autoPopulate() {
    const used = new Set(rows.map((r) => r.sourceBrand));
    const toAdd = sourceBrandOptions.filter((b) => !used.has(b));
    if (!toAdd.length) { status = '所有品牌都已在列表中'; return; }
    rows = [...rows, ...toAdd.map((b) => ({ sourceBrand: b, displayName: '', urlSlug: '', iconUrl: null }))];
    status = `已新增 ${toAdd.length} 個品牌，請補充名稱後儲存`;
  }

  async function uploadIcon(e: Event, i: number) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('files', file);
    const res = await fetch('/api/admin/media', { method: 'POST', body: fd });
    if (!res.ok) { status = '上傳失敗'; return; }
    const json = await res.json();
    rows[i] = { ...rows[i], iconUrl: json.urls?.[0] ?? null };
    rows = [...rows];
  }

  function clearIcon(i: number) {
    rows[i] = { ...rows[i], iconUrl: null };
    rows = [...rows];
  }

  async function save() {
    saving = true;
    const aliases = rows
      .map((r) => ({ sourceBrand: r.sourceBrand.trim(), displayName: r.displayName.trim(), urlSlug: r.urlSlug.trim(), iconUrl: r.iconUrl ?? null }))
      .filter((r) => r.sourceBrand && r.displayName);
    const res = await fetch('/api/admin/brand-aliases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aliases }),
    });
    saving = false;
    status = res.ok ? '已儲存' : '儲存失敗';
    setTimeout(() => (status = ''), 3000);
  }
</script>

<div class="admin-page">
  <div class="page-header">
    <h1>品牌管理</h1>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button type="button" on:click={autoPopulate} class="btn-secondary">從車輛帶入</button>
      <button type="button" on:click={addRow} class="btn-secondary">＋ 新增</button>
      <button type="button" on:click={save} disabled={saving} class="btn-primary">
        {saving ? '儲存中...' : '儲存'}
      </button>
    </div>
  </div>
  {#if status}<p class="save-status">{status}</p>{/if}

  {#if rows.length === 0}
    <div class="empty-state">
      <p>尚無品牌對照</p>
      <button type="button" on:click={autoPopulate} class="btn-primary">從車輛自動帶入</button>
    </div>
  {:else}
    <div class="brand-list">
      {#each rows as row, i (i)}
        <div class="brand-row">
          <div class="form-group">
            <label>來源品牌</label>
            <select bind:value={row.sourceBrand} class="form-select">
              {#each sourceBrandOptions as opt (opt)}
                <option value={opt}>{opt}</option>
              {/each}
            </select>
          </div>
          <div class="form-group">
            <label>顯示名稱</label>
            <input type="text" bind:value={row.displayName} placeholder="例：Bentley" class="form-input" />
          </div>
          <div class="form-group">
            <label>英文網址</label>
            <input type="text" bind:value={row.urlSlug} placeholder="例：bentley" class="form-input" />
          </div>
          {#if canUploadIcon}
            <div class="form-group">
              <label>品牌 Icon</label>
              {#if row.iconUrl}
                <div style="display:flex;align-items:center;gap:0.5rem">
                  <img src={row.iconUrl} alt="" style="width:36px;height:36px;object-fit:contain;border-radius:50%;background:#fff;border:1px solid #ddd;" />
                  <button type="button" on:click={() => clearIcon(i)} class="btn-danger-sm">移除</button>
                </div>
              {:else}
                <label class="upload-label">
                  上傳 Icon
                  <input type="file" accept="image/*" style="display:none" on:change={(e) => uploadIcon(e, i)} />
                </label>
              {/if}
            </div>
          {/if}
          <button type="button" on:click={() => removeRow(i)} class="btn-danger-sm" style="align-self:flex-end">移除</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
.brand-list { display: flex; flex-direction: column; gap: 0.75rem; }
.brand-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; background: #f9f9f9; padding: 1rem; border-radius: 8px; border: 1px solid #e5e5e5; align-items: end; }
@media (max-width: 480px) { .brand-row { grid-template-columns: 1fr; } }
.form-group { display: flex; flex-direction: column; gap: 0.3rem; }
.form-group label { font-size: 0.8rem; font-weight: 600; color: #555; }
.form-select, .form-input { padding: 0.4rem 0.6rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.875rem; }
.upload-label { font-size: 0.8rem; padding: 4px 10px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; background: #fff; }
.save-status { color: #166534; background: #dcfce7; padding: 0.5rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
.btn-secondary { font-size: 0.85rem; padding: 0.4rem 0.9rem; border: 1px solid #ddd; border-radius: 4px; background: #fff; cursor: pointer; }
</style>
