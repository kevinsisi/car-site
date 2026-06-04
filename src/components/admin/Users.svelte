<script lang="ts">
  interface UserRow {
    id: string;
    username: string;
    role: string;
    permissions: number;
    createdAt: string;
  }

  interface Props {
    users: UserRow[];
    currentUserId: string;
    isSuperAdmin: boolean;
    creatorPermissions: number;
    permissionLabels: Record<string, string>;
    permissionBits: Record<string, number>;
  }

  let { users: initialUsers, currentUserId, isSuperAdmin, creatorPermissions, permissionLabels, permissionBits }: Props = $props();

  let users = $state([...initialUsers]);
  let showCreate = $state(false);
  let newUsername = $state('');
  let newPassword = $state('');
  let newPermissions = $state(0);
  let saving = $state(false);
  let error = $state('');
  let status = $state('');

  const permEntries = $derived(Object.entries(permissionLabels).filter(([k]) => k !== 'ALL'));

  function toggleBit(bit: number) {
    newPermissions = newPermissions ^ bit;
  }

  function canGrant(bit: number): boolean {
    return isSuperAdmin || (creatorPermissions & bit) === bit;
  }

  function formatPermissions(role: string, perms: number): string {
    if (role === 'superadmin') return '全部';
    const count = Object.values(permissionBits).filter((b) => (perms & b) === b).length;
    return `${count} 項`;
  }

  async function createUser() {
    if (!newUsername.trim() || newPassword.length < 8) {
      error = '請填寫帳號，密碼至少 8 字元';
      return;
    }
    saving = true;
    error = '';
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword, permissions: newPermissions }),
      });
      const json = await res.json();
      if (!res.ok) {
        error = json.error || '建立失敗';
        return;
      }
      status = '用戶已建立';
      showCreate = false;
      newUsername = '';
      newPassword = '';
      newPermissions = 0;
      // Reload to refresh user list
      location.reload();
    } finally {
      saving = false;
    }
  }

  async function deleteUser(id: string, username: string) {
    if (!confirm(`確定要刪除用戶「${username}」？此操作無法復原。`)) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || '刪除失敗');
      return;
    }
    location.reload();
  }
</script>

<div class="admin-page">
  <div class="page-header">
    <h1>用戶管理</h1>
    {#if isSuperAdmin}
      <button type="button" onclick={() => showCreate = !showCreate} class="btn-primary">
        {showCreate ? '取消' : '＋ 新增用戶'}
      </button>
    {/if}
  </div>

  {#if status}
    <p class="status-success">{status}</p>
  {/if}

  {#if showCreate}
    <div class="create-user-form">
      <h2>新增用戶</h2>
      {#if error}<p class="error-text">{error}</p>{/if}
      <div class="form-row">
        <div class="form-group">
          <label for="new-username">帳號</label>
          <input type="text" id="new-username" bind:value={newUsername} autocomplete="off" />
        </div>
        <div class="form-group">
          <label for="new-password">密碼（至少 8 字元）</label>
          <input type="password" id="new-password" bind:value={newPassword} autocomplete="new-password" />
        </div>
      </div>

      <fieldset>
        <legend>功能權限</legend>
        <div class="perm-grid">
          {#each permEntries as [key, label]}
            {@const bit = permissionBits[key] ?? 0}
            <label class:disabled={!canGrant(bit)}>
              <input
                type="checkbox"
                checked={(newPermissions & bit) === bit}
                disabled={!canGrant(bit)}
                onchange={() => toggleBit(bit)}
              />
              {label}
            </label>
          {/each}
        </div>
      </fieldset>

      <div class="form-actions">
        <button type="button" onclick={createUser} disabled={saving} class="btn-primary">
          {saving ? '建立中...' : '建立用戶'}
        </button>
        <button type="button" onclick={() => showCreate = false}>取消</button>
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
      {#each users as u}
        <tr class:is-current={u.id === currentUserId}>
          <td>
            {u.username}
            {#if u.id === currentUserId}<span class="you-badge">（你）</span>{/if}
          </td>
          <td><span class="role-badge role-badge--{u.role}">{u.role}</span></td>
          <td>{formatPermissions(u.role, u.permissions)}</td>
          <td>{new Date(u.createdAt).toLocaleDateString('zh-TW')}</td>
          <td>
            {#if isSuperAdmin && u.id !== currentUserId && u.role !== 'superadmin'}
              <button type="button" onclick={() => deleteUser(u.id, u.username)} class="btn-danger-sm">
                刪除
              </button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
.admin-page { max-width: 900px; }
.status-success { color: #166534; background: #dcfce7; padding: 0.5rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
.error-text { color: #991b1b; background: #fee2e2; padding: 0.5rem 1rem; border-radius: 6px; }
.you-badge { font-size: 0.75rem; color: var(--muted, #777); }
</style>
