<script lang="ts">
  import type { BrandAliasView } from '@/lib/brand-aliases';
  import type { VehicleView } from '@/lib/vehicles';

  interface Props {
    brandAliases: BrandAliasView[];
    vehicles: VehicleView[];
    canUploadIcon: boolean;
  }

  type BrandAliasRow = { sourceBrand: string; displayName: string; urlSlug: string };

  let { brandAliases, vehicles, canUploadIcon }: Props = $props();

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

  const sourceBrandOptions = $derived(
    Array.from(new Set([
      ...vehicles.map((v) => v.brand),
      ...brandAliases.map((item) => item.sourceBrand),
    ])).filter(Boolean).sort((a, b) => a.localeCompare(b))
  );

  let brandAliasRows = $state<BrandAliasRow[]>(
    brandAliases.length
      ? brandAliases.map((item) => ({ ...item }))
      : sourceBrandOptions.map((sourceBrand) => ({ sourceBrand, displayName: '', urlSlug: '' }))
  );

  function addBrandAliasRow() {
    const used = new Set(brandAliasRows.map((row) => row.sourceBrand));
    const sourceBrand = sourceBrandOptions.find((brand) => !used.has(brand)) || sourceBrandOptions[0] || '';
    brandAliasRows = [...brandAliasRows, { sourceBrand, displayName: '', urlSlug: '' }];
  }

  function removeBrandAliasRow(index: number) {
    brandAliasRows = brandAliasRows.filter((_, rowIndex) => rowIndex !== index);
  }

  function autoPopulateFromVehicles() {
    const existing = new Set(brandAliasRows.map((row) => row.sourceBrand));
    const toAdd = sourceBrandOptions.filter((brand) => !existing.has(brand));
    if (toAdd.length === 0) {
      pushToast('所有車輛品牌都已在對照表中', 'info');
      return;
    }
    brandAliasRows = [
      ...brandAliasRows,
      ...toAdd.map((sourceBrand) => ({ sourceBrand, displayName: '', urlSlug: '' })),
    ];
    pushToast(`已新增 ${toAdd.length} 個品牌，請補充顯示名稱與英文網址後儲存`, 'success');
  }

  async function saveBrandAliases() {
    const tid = notifyProgress('儲存品牌對照中...');
    const aliases = brandAliasRows
      .map((item) => ({ sourceBrand: item.sourceBrand.trim(), displayName: item.displayName.trim(), urlSlug: item.urlSlug.trim() }))
      .filter((item) => item.sourceBrand && item.displayName);
    const response = await adminFetch('/api/admin/brand-aliases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aliases }),
    });
    updateToast(tid, response.ok ? '品牌對照已更新' : '品牌對照更新失敗', response.ok ? 'success' : 'error');
  }
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

<section class="admin-panel hero-panel">
  <div>
    <p class="admin-eyebrow">品牌管理</p>
    <h1>品牌英文顯示對照</h1>
    <p>管理車輛品牌的公開網頁顯示名稱與英文網址對照。</p>
  </div>
  <a class="admin-button" href="/admin">返回後台首頁</a>
</section>

<section class="admin-grid admin-grid--single">
  <form class="admin-panel vehicle-edit-form" onsubmit={(event) => { event.preventDefault(); saveBrandAliases(); }}>
    <h2>品牌英文顯示對照</h2>
    <p>來源品牌用選的，公開網頁顯示名稱與英文網址再手動補。網址只能用英文小寫字母、數字、與短橫線 -。</p>
    <div class="alias-editor">
      {#each brandAliasRows as row, index}
        <div class="alias-row">
          <label>來源品牌
            <select bind:value={row.sourceBrand}>
              {#each sourceBrandOptions as sourceBrand}
                <option value={sourceBrand}>{sourceBrand}</option>
              {/each}
            </select>
          </label>
          <label>公開網頁顯示名稱 <input bind:value={row.displayName} placeholder="例如 Bentley" /></label>
          <label>英文網址 <input bind:value={row.urlSlug} placeholder="例如 bentley" /></label>
          <button type="button" onclick={() => removeBrandAliasRow(index)}>移除</button>
        </div>
      {/each}
    </div>
    <div class="form-actions">
      <button class="secondary-button" type="button" onclick={addBrandAliasRow}>新增品牌對照</button>
      <button class="secondary-button" type="button" onclick={autoPopulateFromVehicles}>從車輛自動帶入</button>
      <button class="admin-button" type="submit">儲存品牌對照</button>
    </div>
  </form>
</section>
