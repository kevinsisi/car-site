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

  let editingId: string | null = null;
  let editPermissions = 0;
  let editSaving = false;
  let editError = '';

  $: permEntries = Object.entries(permissionLabels).filter(([k]) => k !== 'ALL');

  function toggleBit(bit: number) { newPermissions = newPermissions ^ bit; }
  function toggleEditBit(bit: number) { editPermissions = editPermissions ^ bit; }

  function canGrant(bit: number) {
    return isSuperAdmin || (creatorPermissions & bit) === bit;
  }

  function canEdit(u: UserRow) {
    return u.id !== currentUserId && u.role !== 'superadmin';
  }

  function formatPerms(role: string, perms: number) {
    if (role === 'superadmin') return '全部';
    const count = Object.values(permissionBits).filter((b) => (perms & b) === b).length;
    return `${count} 項`;
  }

  function startEdit(u: UserRow) {
    editingId = u.id;
    editPermissions = u.permissions;
    editError = '';
  }

  function cancelEdit() { editingId = null; editError = ''; }

  async function createUser() {
    if (!newUsername.trim() || newPassword.length < 8) {
      error = '帳號不可空白，密碼至少 8 字元';
      return;
    }
    saving = true; error = '';
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

  async function saveEdit(id: string) {
    editSaving = true; editError = '';
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ permissions: editPermissions }),
    });
    editSaving = false;
    const json = await res.json().catch(() => ({ error: '失敗' }));
    if (!res.ok) { editError = json.error || '儲存失敗'; return; }
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

      <fieldset class="permission-fieldset">
        <legend>功能權限</legend>
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

  <!-- Desktop table -->
  <div class="users-table-wrap">
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
              {#if u.id === currentUserId}<span class="current-user-note">（你）</span>{/if}
            </td>
            <td><span class="role-badge role-badge--{u.role}">{u.role}</span></td>
            <td>{formatPerms(u.role, u.permissions)}</td>
            <td>{new Date(u.createdAt).toLocaleDateString('zh-TW')}</td>
            <td class="actions-cell">
              {#if canEdit(u)}
                <button type="button" class="btn-edit-sm" on:click={() => editingId === u.id ? cancelEdit() : startEdit(u)}>
                  {editingId === u.id ? '取消' : '編輯'}
                </button>
              {/if}
              {#if isSuperAdmin && u.id !== currentUserId && u.role !== 'superadmin'}
                <button type="button" class="btn-danger-sm" on:click={() => deleteUser(u.id, u.username)}>刪除</button>
              {/if}
            </td>
          </tr>
          {#if editingId === u.id}
            <tr class="edit-row">
              <td colspan="5">
                <div class="edit-panel">
                  <p class="edit-panel__title">編輯「{u.username}」的功能權限</p>
                  {#if editError}<p class="error-text">{editError}</p>{/if}
                  <div class="perm-grid">
                    {#each permEntries as [key, label] (key)}
                      {@const bit = permissionBits[key] ?? 0}
                      <label class="perm-label" class:disabled={!canGrant(bit)}>
                        <input
                          type="checkbox"
                          checked={(editPermissions & bit) === bit}
                          disabled={!canGrant(bit)}
                          on:change={() => toggleEditBit(bit)}
                        />
                        {label}
                      </label>
                    {/each}
                  </div>
                  <div class="form-actions">
                    <button type="button" class="btn-primary" on:click={() => saveEdit(u.id)} disabled={editSaving}>
                      {editSaving ? '儲存中...' : '儲存'}
                    </button>
                    <button type="button" on:click={cancelEdit}>取消</button>
                  </div>
                </div>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Mobile cards -->
  <div class="users-cards">
    {#each users as u (u.id)}
      <div class="user-card" class:is-current={u.id === currentUserId}>
        <div class="user-card__main">
          <span class="user-card__name">
            {u.username}
            {#if u.id === currentUserId}<span class="current-user-note">（你）</span>{/if}
          </span>
          <span class="role-badge role-badge--{u.role}">{u.role}</span>
        </div>
        <div class="user-card__meta">
          <span>權限：{formatPerms(u.role, u.permissions)}</span>
          <span>{new Date(u.createdAt).toLocaleDateString('zh-TW')}</span>
        </div>
        <div class="user-card__actions">
          {#if canEdit(u)}
            <button type="button" class="btn-edit-sm" on:click={() => editingId === u.id ? cancelEdit() : startEdit(u)}>
              {editingId === u.id ? '取消編輯' : '編輯權限'}
            </button>
          {/if}
          {#if isSuperAdmin && u.id !== currentUserId && u.role !== 'superadmin'}
            <button type="button" class="btn-danger-sm" on:click={() => deleteUser(u.id, u.username)}>刪除</button>
          {/if}
        </div>
        {#if editingId === u.id}
          <div class="edit-panel">
            <p class="edit-panel__title">編輯功能權限</p>
            {#if editError}<p class="error-text">{editError}</p>{/if}
            <div class="perm-grid">
              {#each permEntries as [key, label] (key)}
                {@const bit = permissionBits[key] ?? 0}
                <label class="perm-label" class:disabled={!canGrant(bit)}>
                  <input
                    type="checkbox"
                    checked={(editPermissions & bit) === bit}
                    disabled={!canGrant(bit)}
                    on:change={() => toggleEditBit(bit)}
                  />
                  {label}
                </label>
              {/each}
            </div>
            <div class="form-actions">
              <button type="button" class="btn-primary" on:click={() => saveEdit(u.id)} disabled={editSaving}>
                {editSaving ? '儲存中...' : '儲存'}
              </button>
              <button type="button" on:click={cancelEdit}>取消</button>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
.status-success { color: #166534; background: color-mix(in srgb, #16a34a 12%, var(--surface)); padding: 0.5rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
.error-text { color: #991b1b; background: color-mix(in srgb, #dc5a5a 12%, var(--surface)); padding: 0.5rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
.permission-fieldset { border: 1px solid var(--line); border-radius: 6px; padding: 0.75rem; margin: 1rem 0; }
.permission-fieldset legend { color: var(--accent-strong); font-size: 0.85rem; font-weight: 600; padding: 0 4px; }
.perm-label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; cursor: pointer; }
.current-user-note { color: var(--muted); font-size: 0.75rem; }
/* Desktop table */
.users-table-wrap { overflow-x: auto; }
/* Mobile cards */
.users-cards { display: none; flex-direction: column; gap: 0.5rem; }
.user-card { padding: 0.75rem 1rem; border: 1px solid var(--line); border-radius: 8px; background: color-mix(in srgb, var(--surface) 94%, transparent); }
.user-card.is-current { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.user-card__main { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem; }
.user-card__name { font-weight: 600; font-size: 0.9rem; }
.user-card__meta { display: flex; align-items: center; gap: 0.75rem; font-size: 0.8rem; color: var(--muted); flex-wrap: wrap; }
@media (max-width: 640px) {
  .users-table-wrap { display: none; }
  .users-cards { display: flex; }
}
.perm-label.disabled { opacity: 0.4; cursor: not-allowed; }

.actions-cell { white-space: nowrap; display: flex; gap: 0.4rem; align-items: center; }

.btn-edit-sm {
  padding: 0.2rem 0.6rem;
  font-size: 0.75rem;
  border-radius: 5px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-weight: 600;
  transition: background 0.15s, color 0.15s;
}
.btn-edit-sm:hover { background: var(--accent); color: #fff; }

.edit-row td { padding: 0; }
.edit-panel {
  background: color-mix(in srgb, var(--accent) 5%, var(--surface));
  border-top: 2px solid var(--accent);
  border-bottom: 1px solid var(--line);
  padding: 1rem 1.25rem;
}
.edit-panel__title { font-weight: 700; color: var(--accent-strong); margin-bottom: 0.75rem; font-size: 0.9rem; }

.user-card__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
</style>
