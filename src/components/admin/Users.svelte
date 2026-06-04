<svelte:options accessors={true} />
<script lang="ts">
  interface UserRow {
    id: string;
    username: string;
    role: string;
    permissions: number;
    createdAt: string;
  }

  export let users: UserRow[] = [];
  export let currentUserId: string;
  export let isSuperAdmin: boolean;
  export let creatorPermissions: number;
  export let permissionLabels: Record<string, string> = {};
  export let permissionBits: Record<string, number> = {};

  let showCreate = false;
  let newUsername = '';
  let newPassword = '';
  let newPermissions = 0;
  let saving = false;
  let error = '';
  let statusMsg = '';

  $: permEntries = Object.entries(permissionLabels).filter(([k]) => k !== 'ALL');

  function toggleBit(bit: number) {
    newPermissions = newPermissions ^ bit;
  }

  function canGrant(bit: number) {
    return isSuperAdmin || (creatorPermissions & bit) === bit;
  }

  function formatPerms(role: string, perms: number) {
    if (role === 'superadmin') return '全部';
    const count = Object.values(permissionBits).filter((b) => (perms & b) === b).length;
    return `${count} 項`;
  }

  async function createUser() {
    if (!newUsername.trim() || newPassword.length < 8) {
      error = '帳號不可空白，密碼至少 8 字元';
      return;
    }
    saving = true;
    error = '';
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: newUsername, password: newPassword, permissions: newPermissions }),
    });
    saving = false;
    const json = await res.json().catch(() => ({ error: '失敗' }));
    if (!res.ok) { error = json.error || '建立失敗'; return; }
    statusMsg = '用戶已建立';
    showCreate = false;
    newUsername = ''; newPassword = ''; newPermissions = 0;
    location.reload();
  }

  async function deleteUser(id: string, username: string) {
    if (!confirm(`確定要刪除「${username}」？`)) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || '刪除失敗'); return; }
    location.reload();
  }
</script>

<div class="admin-page">
  <div class="page-header">
    <h1>用戶管理</h1>
    {#if isSuperAdmin}
      <button type="button" class="btn-primary" on:click={() => showCreate = !showCreate}>
        {showCreate ? '取消' : '＋ 新增用戶'}
      </button>
    {/if}
  </div>

  {#if statusMsg}<p class="status-success">{statusMsg}</p>{/if}

  {#if showCreate}
    <div class="create-user-form">
      <h2>新增用戶</h2>
      {#if error}<p class="error-text">{error}</p>{/if}
      <div class="form-row">
        <div class="form-group">
          <label>帳號</label>
          <input type="text" bind:value={newUsername} autocomplete="off" />
        </div>
        <div class="form-group">
          <label>密碼（至少 8 字元）</label>
          <input type="password" bind:value={newPassword} autocomplete="new-password" />
        </div>
      </div>

      <fieldset style="border:1px solid #ddd;border-radius:6px;padding:0.75rem;margin:1rem 0;">
        <legend style="font-size:0.85rem;font-weight:600;padding:0 4px">功能權限</legend>
        <div class="perm-grid">
          {#each permEntries as [key, label] (key)}
            {@const bit = permissionBits[key] ?? 0}
            <label class="perm-label" class:disabled={!canGrant(bit)}>
              <input
                type="checkbox"
                checked={(newPermissions & bit) === bit}
                disabled={!canGrant(bit)}
                on:change={() => toggleBit(bit)}
              />
              {label}
            </label>
          {/each}
        </div>
      </fieldset>

      <div class="form-actions">
        <button type="button" class="btn-primary" on:click={createUser} disabled={saving}>
          {saving ? '建立中...' : '建立用戶'}
        </button>
        <button type="button" on:click={() => showCreate = false}>取消</button>
      </div>
    </div>
  {/if}

  <table class="users-table">
    <thead>
      <tr>
        <th>帳號</th>
        <th>角色</th>
        <th>權限</th>
        <th>建立時間</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each users as u (u.id)}
        <tr class:is-current={u.id === currentUserId}>
          <td>
            {u.username}
            {#if u.id === currentUserId}<span style="color:#888;font-size:0.75rem">（你）</span>{/if}
          </td>
          <td><span class="role-badge role-badge--{u.role}">{u.role}</span></td>
          <td>{formatPerms(u.role, u.permissions)}</td>
          <td>{new Date(u.createdAt).toLocaleDateString('zh-TW')}</td>
          <td>
            {#if isSuperAdmin && u.id !== currentUserId && u.role !== 'superadmin'}
              <button type="button" class="btn-danger-sm" on:click={() => deleteUser(u.id, u.username)}>刪除</button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
.status-success { color: #166534; background: #dcfce7; padding: 0.5rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
.error-text { color: #991b1b; background: #fee2e2; padding: 0.5rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
.perm-label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; cursor: pointer; }
.perm-label.disabled { opacity: 0.4; cursor: not-allowed; }
</style>
