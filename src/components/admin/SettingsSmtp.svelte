<script lang="ts">
  import type { SiteSettings } from '@/lib/settings';
  export let settings: SiteSettings;

  let notificationEmail = settings.notificationEmail ?? '';
  let original = notificationEmail;
  let dirty = false;
  let saving = false;
  let saveStatus = '';
  let testing = false;
  let testStatus = '';

  $: dirty = notificationEmail !== original;

  async function save() {
    saving = true;
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notificationEmail }),
    });
    saving = false;
    if (res.ok) { original = notificationEmail; saveStatus = '已儲存'; }
    else saveStatus = '儲存失敗';
    setTimeout(() => (saveStatus = ''), 2500);
  }

  async function sendTest() {
    testing = true;
    testStatus = '傳送中...';
    const res = await fetch('/api/admin/test-email', { method: 'POST' });
    testing = false;
    const json = await res.json().catch(() => ({ ok: false, error: '無法解析回應' }));
    testStatus = json.ok ? '✓ 測試信已送出' : `失敗：${json.error}`;
  }
</script>

<div class="admin-page">
  <div class="page-header"><h1>通知設定</h1></div>
  <section class="settings-section">
    <h2>賣車申請通知信箱</h2>
    <p class="muted">收到賣車申請時，系統會發送通知到此信箱。留空則使用伺服器預設收件人。</p>
    <div class="notify-field">
      <label for="notifyEmail">通知收件信箱</label>
      <input id="notifyEmail" type="email" bind:value={notificationEmail} placeholder="your@email.com" on:input={() => {}} />
    </div>
    <div class="form-actions" style="margin-top:1.25rem">
      <button type="button" on:click={save} disabled={saving || !dirty} class="btn-primary">
        {saving ? '儲存中...' : '儲存'}
      </button>
      {#if saveStatus}<span class="save-status">{saveStatus}</span>{/if}
      <button type="button" on:click={sendTest} disabled={testing}>
        傳送測試信
      </button>
      {#if testStatus}<span class="test-status">{testStatus}</span>{/if}
    </div>
  </section>
</div>

<style>
.notify-field { display: grid; gap: 0.4rem; max-width: 480px; margin-top: 1rem; }
.notify-field label { font-size: 0.92rem; font-weight: 800; color: var(--accent-strong); }
.save-status { font-size: 0.9rem; color: var(--accent-strong); }
.test-status { font-size: 0.9rem; color: var(--muted); }
.form-actions button:not(.btn-primary) { min-height: 2.8rem; border-radius: 999px; border: 1px solid var(--line); background: transparent; color: var(--text); font: inherit; font-weight: 800; padding: 0 1rem; cursor: pointer; }
.form-actions button:not(.btn-primary):hover { border-color: var(--accent); color: var(--accent-strong); }
.form-actions button:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
