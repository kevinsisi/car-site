<script lang="ts">
  import type { SiteSettings } from '@/lib/settings';
  interface Props { settings: SiteSettings; }
  let { settings }: Props = $props();

  let gmailUser = $state(settings.gmailUser);
  let gmailAppPassword = $state(settings.gmailAppPassword);
  let notificationEmail = $state(settings.notificationEmail);
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
      body: JSON.stringify({ gmailUser, gmailAppPassword, notificationEmail }),
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
  <div class="page-header"><h1>Email 通知設定</h1></div>
  <section class="settings-section">
    <h2>Gmail 通知</h2>
    <p class="muted" style="margin-bottom:1.25rem">
      使用 Gmail 寄送賣車申請通知。需要先在 Google 帳號開啟「兩步驟驗證」，再產生「應用程式密碼」。
      <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener" style="color:var(--accent,#0066cc)">前往產生應用程式密碼 ↗</a>
    </p>

    <div style="display:flex;flex-direction:column;gap:1rem;max-width:480px;">
      <div class="form-group">
        <label>Gmail 帳號（寄件方）</label>
        <input type="email" bind:value={gmailUser} placeholder="yourname@gmail.com"
          oninput={() => dirty = true}
          style="padding:0.5rem 0.75rem;border:1px solid #ddd;border-radius:4px;width:100%;font-size:0.95rem;" />
      </div>
      <div class="form-group">
        <label>應用程式密碼（16 碼）</label>
        <input type="password" bind:value={gmailAppPassword} placeholder="xxxx xxxx xxxx xxxx"
          autocomplete="new-password" oninput={() => dirty = true}
          style="padding:0.5rem 0.75rem;border:1px solid #ddd;border-radius:4px;width:100%;font-size:0.95rem;" />
        <small class="muted">Google 帳號 → 安全性 → 兩步驟驗證 → 應用程式密碼</small>
      </div>
      <div class="form-group">
        <label>通知收件信箱（可選）</label>
        <input type="email" bind:value={notificationEmail} placeholder="留空則寄到 Gmail 帳號本身"
          oninput={() => dirty = true}
          style="padding:0.5rem 0.75rem;border:1px solid #ddd;border-radius:4px;width:100%;font-size:0.95rem;" />
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:1rem;margin-top:1.5rem;flex-wrap:wrap;">
      <button type="button" onclick={save} disabled={saving || !dirty} class="btn-primary"
        style="font-size:0.875rem;padding:0.45rem 1.4rem;">
        {saving ? '儲存中...' : '儲存'}
      </button>
      {#if saveStatus}<span style="font-size:0.85rem;color:#166534">{saveStatus}</span>{/if}
      <button type="button" onclick={sendTest} disabled={testing || !gmailUser || !gmailAppPassword}
        style="font-size:0.85rem;padding:0.4rem 0.9rem;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;">
        傳送測試信
      </button>
      {#if testStatus}<span style="font-size:0.85rem">{testStatus}</span>{/if}
    </div>
  </section>
</div>
