<script lang="ts">
  import type { SiteSettings } from '@/lib/settings';

  interface Props {
    settings: SiteSettings;
  }

  let { settings: _settings }: Props = $props();
  // galleryMode setting will be added in Plan 1
</script>

<div class="admin-panel settings-section">
  <h2>照片展示模式</h2>
  <p class="form-hint muted">此功能將在下一階段啟用。</p>
</div>
