<svelte:options accessors={true} />
<script lang="ts">
  import type { SiteSettings } from '@/lib/settings';
  export let settings: SiteSettings;

  let gmailUser = settings.gmailUser ?? '';
  let gmailAppPassword = settings.gmailAppPassword ?? '';
  let notificationEmail = settings.notificationEmail ?? '';
  let dirty = false;
  let saving = false;
  let saveStatus = '';
  let testing = false;
  let testStatus = '';

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
    <p class="muted">
      使用 Gmail 發送賣車申請通知。需先在 Google 帳號開啟兩步驟驗證，再產生應用程式密碼。
      <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">前往產生 ↗</a>
    </p>

    <div class="smtp-fields">
      <div class="form-group">
        <label for="gmailUser">Gmail 帳號（寄件方）</label>
        <input id="gmailUser" type="email" bind:value={gmailUser} placeholder="yourname@gmail.com" on:input={() => (dirty = true)} />
      </div>
      <div class="form-group">
        <label for="gmailPass">應用程式密碼（16 碼）</label>
        <input id="gmailPass" type="password" bind:value={gmailAppPassword} placeholder="xxxx xxxx xxxx xxxx" autocomplete="new-password" on:input={() => (dirty = true)} />
        <small class="muted">Google 帳號 → 安全性 → 兩步驟驗證 → 應用程式密碼</small>
      </div>
      <div class="form-group">
        <label for="notifyEmail">通知收件信箱（可選）</label>
        <input id="notifyEmail" type="email" bind:value={notificationEmail} placeholder="留空則寄到 Gmail 帳號本身" on:input={() => (dirty = true)} />
      </div>
    </div>

    <div class="form-actions" style="margin-top:1.25rem">
      <button type="button" on:click={save} disabled={saving || !dirty} class="btn-primary">
        {saving ? '儲存中...' : '儲存'}
      </button>
      {#if saveStatus}<span class="save-status">{saveStatus}</span>{/if}
      <button type="button" on:click={sendTest} disabled={testing || !gmailUser || !gmailAppPassword}>
        傳送測試信
      </button>
      {#if testStatus}<span class="test-status">{testStatus}</span>{/if}
    </div>
  </section>
</div>

<style>
.smtp-fields { display: grid; gap: 1rem; max-width: 560px; }
.form-group { display: grid; gap: 0.4rem; }
.form-group label { font-size: 0.92rem; font-weight: 800; color: var(--accent-strong); }
.form-group small { font-size: 0.84rem; }
.save-status { font-size: 0.9rem; color: var(--accent-strong); }
.test-status { font-size: 0.9rem; color: var(--muted); }
.form-actions button:not(.btn-primary) { min-height: 2.8rem; border-radius: 999px; border: 1px solid var(--line); background: transparent; color: var(--text); font: inherit; font-weight: 800; padding: 0 1rem; cursor: pointer; }
.form-actions button:not(.btn-primary):hover { border-color: var(--accent); color: var(--accent-strong); }
.form-actions button:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
