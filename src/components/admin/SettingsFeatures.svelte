<script lang="ts">
  import type { SiteSettings } from '@/lib/settings';
  import { FEATURE_OPTIONS } from '@/lib/features';

  interface Props {
    settings: SiteSettings;
  }

  let { settings }: Props = $props();
  let licenseMask = $state(settings.featureLicenseMask);
  let originalLicenseMask = $state(settings.featureLicenseMask);
  let saving = $state(false);
  let status = $state('');
  let dirty = $derived(licenseMask !== originalLicenseMask);

  function hasBit(mask: number, bit: number): boolean {
    return (mask & bit) !== 0;
  }

  function toggleBit(mask: number, bit: number, on: boolean): number {
    return on ? mask | bit : mask & ~bit;
  }

  async function save() {
    saving = true;
    status = '儲存中...';
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ featureLicenseMask: licenseMask }),
    });
    saving = false;
    if (res.ok) {
      originalLicenseMask = licenseMask;
      status = '授權設定已更新';
    } else {
      status = '授權設定更新失敗';
    }
    setTimeout(() => (status = ''), 2600);
  }
</script>

<div class="admin-page">
  <div class="page-header">
    <h1>授權管理</h1>
    <p>Superadmin 專用。控制此客戶方案允許使用的收費功能；關閉後前台與後台相關入口一併停用。</p>
  </div>

  <section class="settings-section">
    <h2>收費功能控制</h2>
    <p class="muted">關閉授權後，admin 不能再啟用該功能；相關設定頁、通知與 URL 也會依功能狀態停用或導回可用頁面。</p>
    <div class="feature-grid">
      {#each FEATURE_OPTIONS as feature}
        <label class="feature-card" class:is-enabled={hasBit(licenseMask, feature.bit)}>
          <input
            type="checkbox"
            checked={hasBit(licenseMask, feature.bit)}
            onchange={(event) => {
              licenseMask = toggleBit(licenseMask, feature.bit, (event.currentTarget as HTMLInputElement).checked);
            }}
          />
          <span>
            <strong>{feature.label}</strong>
            <small>{feature.description}</small>
          </span>
        </label>
      {/each}
    </div>
    <div class="form-actions">
      <button type="button" class="btn-primary" disabled={!dirty || saving} onclick={save}>{saving ? '儲存中...' : '儲存授權設定'}</button>
      {#if status}<span class="save-status">{status}</span>{/if}
    </div>
  </section>
</div>

<style>
  .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 0.85rem; margin-top: 1rem; }
  .feature-card { display: flex; gap: 0.75rem; align-items: flex-start; padding: 1rem; border: 1px solid var(--line); border-radius: 16px; background: color-mix(in srgb, var(--surface) 96%, transparent); cursor: pointer; }
  .feature-card.is-enabled { border-color: color-mix(in srgb, var(--accent) 48%, var(--line)); background: color-mix(in srgb, var(--accent) 9%, var(--surface)); }
  .feature-card.is-locked { opacity: 0.58; cursor: not-allowed; }
  .feature-card input { width: 18px; height: 18px; margin-top: 0.15rem; accent-color: var(--accent); }
  .feature-card span { display: grid; gap: 0.28rem; }
  .feature-card strong { color: var(--accent-strong); font-size: 0.95rem; }
  .feature-card small { color: var(--muted); line-height: 1.45; }
  .form-actions { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-top: 1.25rem; }
  .save-status { color: var(--accent-strong); font-weight: 700; }
  @media (max-width: 640px) {
    .feature-grid { grid-template-columns: 1fr; }
  }
</style>
