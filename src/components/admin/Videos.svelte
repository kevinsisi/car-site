<script lang="ts">
  import type { SiteSettings } from '@/lib/settings';
  import type { VideoLinkView } from '@/lib/video-links';

  interface Props {
    settings: SiteSettings;
    videoLinks: VideoLinkView[];
    canCarousel: boolean;
    canLinks: boolean;
  }
  let { settings, videoLinks, canCarousel, canLinks }: Props = $props();
</script>

<div class="admin-page">
  <div class="page-header">
    <h1>影片管理</h1>
  </div>

  {#if canCarousel}
    <section class="settings-section">
      <h2>Banner 影片輪播</h2>
      <p class="muted">影片輪播功能將在下一階段啟用。</p>
    </section>
  {/if}

  {#if canLinks}
    <section class="settings-section">
      <h2>底部影片連結</h2>
      <p class="muted">影片連結功能將在下一階段啟用。</p>
    </section>
  {/if}
</div>
