<script lang="ts">
  import type { SiteSettings } from '@/lib/settings';
  interface Props { settings: SiteSettings; }
  let { settings }: Props = $props();

  let notificationEmail = $state(settings.notificationEmail);
  let smtpHost = $state(settings.smtpHost);
  let smtpPort = $state(settings.smtpPort);
  let smtpUser = $state(settings.smtpUser);
  let smtpPass = $state(settings.smtpPass);
  let dirty = $state(false);
  let saving = $state(false);
  let saveStatus = $state('');
  let testing = $state(false);
  let testStatus = $state('');

  async function save() {
    saving = true;
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notificationEmail, smtpHost, smtpPort, smtpUser, smtpPass }),
    });
    saving = false;
    saveStatus = res.ok ? '已儲存' : '儲存失敗';
    if (res.ok) dirty = false;
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
  <div class="page-header"><h1>SMTP 通知設定</h1></div>
  <section class="settings-section">
    <h2>Email 通知</h2>
    <p class="muted" style="margin-bottom:1rem">設定後，每筆新賣車申請會自動發信通知。</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;max-width:600px;">
      <div class="form-group" style="grid-column:1/-1">
        <label>通知信箱</label>
        <input type="email" bind:value={notificationEmail} placeholder="接收通知的 Email" oninput={() => dirty = true} style="padding:0.5rem;border:1px solid #ddd;border-radius:4px;width:100%;" />
      </div>
      <div class="form-group">
        <label>SMTP Host</label>
        <input type="text" bind:value={smtpHost} placeholder="smtp.gmail.com" oninput={() => dirty = true} style="padding:0.5rem;border:1px solid #ddd;border-radius:4px;width:100%;" />
      </div>
      <div class="form-group">
        <label>SMTP Port</label>
        <input type="text" bind:value={smtpPort} placeholder="587" oninput={() => dirty = true} style="padding:0.5rem;border:1px solid #ddd;border-radius:4px;width:100%;" />
      </div>
      <div class="form-group">
        <label>SMTP 帳號</label>
        <input type="text" bind:value={smtpUser} autocomplete="off" oninput={() => dirty = true} style="padding:0.5rem;border:1px solid #ddd;border-radius:4px;width:100%;" />
      </div>
      <div class="form-group">
        <label>SMTP 密碼</label>
        <input type="password" bind:value={smtpPass} autocomplete="new-password" oninput={() => dirty = true} style="padding:0.5rem;border:1px solid #ddd;border-radius:4px;width:100%;" />
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:1rem;margin-top:1.25rem;flex-wrap:wrap;">
      <button type="button" onclick={save} disabled={saving || !dirty} class="btn-primary" style="font-size:0.875rem;padding:0.45rem 1.2rem;">
        {saving ? '儲存中...' : '儲存'}
      </button>
      {#if saveStatus}<span style="font-size:0.85rem;color:#166534">{saveStatus}</span>{/if}
      <button type="button" onclick={sendTest} disabled={testing} style="font-size:0.85rem;padding:0.4rem 0.9rem;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;">
        傳送測試信
      </button>
      {#if testStatus}<span style="font-size:0.85rem">{testStatus}</span>{/if}
    </div>
  </section>
</div>
