<script lang="ts">
  import type { SiteSettings } from '@/lib/settings';

  interface Props {
    settings: SiteSettings;
  }

  let { settings: _settings }: Props = $props();
  // SMTP/email notification settings will be added in Plan 2
</script>

<div class="admin-panel settings-section">
  <h2>SMTP 通知設定</h2>
  <p class="form-hint muted">此功能將在下一階段啟用。</p>
</div>
