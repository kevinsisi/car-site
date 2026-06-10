<script lang="ts">
  interface DailyPoint { date: string; count: number }
  interface TopVehicle { vehicleSlug: string; count: number }
  interface TopReferrer { referrer: string; count: number }
  interface ActivityEntry {
    id: string; username: string; action: string;
    targetType?: string | null; targetId?: string | null;
    details: Record<string, unknown>; createdAt: string;
  }

  interface ViewStats {
    thisMonthViews: number; thisMonthSessions: number;
    last30Views: number; last30Sessions: number;
    lastMonthViews: number; lastMonthSessions: number;
  }

  interface AnalyticsData {
    viewStats: ViewStats;
    dailyTrend: DailyPoint[];
    topVehicles: TopVehicle[];
    deviceBreakdown: { mobile: number; tablet: number; desktop: number };
    sellStats: { thisMonth: number; lastMonth: number };
    superAdmin: null | {
      errorStats: { errors4xx: number; errors5xx: number; errorsToday: number };
      slowStats: { count: number };
      botStats: { count: number };
      topReferrers: TopReferrer[];
      activityLog: ActivityEntry[];
    };
  }

  let data = $state<AnalyticsData | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/admin/analytics');
      if (!res.ok) throw new Error(`${res.status}`);
      data = await res.json();
    } catch (e) {
      error = e instanceof Error ? e.message : '載入失敗';
    } finally {
      loading = false;
    }
  }

  $effect(() => { load(); });

  function pct(n: number, total: number): number {
    return total === 0 ? 0 : Math.round((n / total) * 100);
  }

  function trend(current: number, previous: number): string {
    if (previous === 0) return current > 0 ? '+100%' : '—';
    const delta = Math.round(((current - previous) / previous) * 100);
    return delta >= 0 ? `+${delta}%` : `${delta}%`;
  }

  function trendClass(current: number, previous: number): string {
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'neutral';
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function actionLabel(action: string): string {
    const map: Record<string, string> = {
      login: '登入',
      logout: '登出',
      vehicle_status_change: '車輛狀態變更',
      settings_update: '更新設定',
      user_create: '新增用戶',
      user_update: '更新用戶',
      user_delete: '刪除用戶',
    };
    return map[action] ?? action;
  }

  // SVG bar chart
  const CHART_W = 600;
  const CHART_H = 100;
  const BAR_GAP = 2;

  function buildBars(points: DailyPoint[]): { x: number; h: number; count: number; date: string }[] {
    const max = Math.max(...points.map((p) => p.count), 1);
    const barW = (CHART_W - BAR_GAP * (points.length - 1)) / points.length;
    return points.map((p, i) => ({
      x: i * (barW + BAR_GAP),
      h: (p.count / max) * CHART_H,
      count: p.count,
      date: p.date,
      w: barW,
    })) as { x: number; h: number; count: number; date: string; w: number }[];
  }

  let tooltip = $state<{ x: number; text: string } | null>(null);
</script>

{#if loading}
  <div class="state-msg">載入中…</div>
{:else if error}
  <div class="state-msg error">錯誤：{error} <button onclick={load}>重試</button></div>
{:else if data}
  <!-- ── ROI cards ── -->
  <section class="analytics-section">
    <h2 class="section-title">本月概況</h2>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">本月瀏覽次數</div>
        <div class="stat-value">{data.viewStats.thisMonthViews.toLocaleString()}</div>
        <div class="stat-trend {trendClass(data.viewStats.thisMonthViews, data.viewStats.lastMonthViews)}">
          vs 上月 {trend(data.viewStats.thisMonthViews, data.viewStats.lastMonthViews)}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">本月獨立訪客</div>
        <div class="stat-value">{data.viewStats.thisMonthSessions.toLocaleString()}</div>
        <div class="stat-trend {trendClass(data.viewStats.thisMonthSessions, data.viewStats.lastMonthSessions)}">
          vs 上月 {trend(data.viewStats.thisMonthSessions, data.viewStats.lastMonthSessions)}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">賣車申請（本月）</div>
        <div class="stat-value">{data.sellStats.thisMonth}</div>
        <div class="stat-trend {trendClass(data.sellStats.thisMonth, data.sellStats.lastMonth)}">
          vs 上月 {trend(data.sellStats.thisMonth, data.sellStats.lastMonth)}
        </div>
      </div>
    </div>
  </section>

  <!-- ── 30-day trend chart ── -->
  <section class="analytics-section">
    <h2 class="section-title">近 30 天瀏覽趨勢</h2>
    <div class="chart-wrap">
      <svg
        viewBox="0 0 {CHART_W} {CHART_H + 20}"
        class="trend-chart"
        role="img"
        aria-label="30天瀏覽趨勢"
        onmouseleave={() => tooltip = null}
      >
        {#each buildBars(data.dailyTrend) as bar}
          <rect
            x={bar.x}
            y={CHART_H - bar.h}
            width={bar.w}
            height={Math.max(bar.h, 1)}
            class="bar"
            rx="2"
            onmouseenter={(e) => {
              const svg = (e.currentTarget as SVGElement).closest('svg');
              const rect2 = svg?.getBoundingClientRect();
              const barRect = (e.currentTarget as SVGElement).getBoundingClientRect();
              tooltip = { x: barRect.left - (rect2?.left ?? 0) + barRect.width / 2, text: `${bar.date}\n${bar.count} 次` };
            }}
          />
        {/each}
      </svg>
      {#if tooltip}
        <div class="chart-tooltip" style="left:{tooltip.x}px">{tooltip.text}</div>
      {/if}
    </div>
    <div class="chart-meta">共 {data.viewStats.last30Views.toLocaleString()} 次（{data.viewStats.last30Sessions.toLocaleString()} 訪客）</div>
  </section>

  <!-- ── Top vehicles + device ── -->
  <div class="two-col">
    <section class="analytics-section">
      <h2 class="section-title">人氣車款 Top 10（近 30 天）</h2>
      {#if data.topVehicles.length === 0}
        <p class="empty">尚無資料</p>
      {:else}
        <table class="data-table">
          <thead><tr><th>車款</th><th>瀏覽</th></tr></thead>
          <tbody>
            {#each data.topVehicles as v}
              <tr>
                <td><a href="/cars/{v.vehicleSlug}" target="_blank" rel="noopener">{v.vehicleSlug}</a></td>
                <td class="num">{v.count}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <section class="analytics-section">
      <h2 class="section-title">裝置分布（近 30 天）</h2>
      <div class="device-bars">
        {#each [
          { label: '手機', cls: 'mobile', n: data.deviceBreakdown.mobile },
          { label: '平板', cls: 'tablet', n: data.deviceBreakdown.tablet },
          { label: '桌機', cls: 'desktop', n: data.deviceBreakdown.desktop },
        ] as row}
          {@const total = data.deviceBreakdown.mobile + data.deviceBreakdown.tablet + data.deviceBreakdown.desktop}
          <div class="device-row">
            <span class="device-label">{row.label}</span>
            <div class="device-bar-track">
              <div class="device-bar {row.cls}" style="width:{pct(row.n, total)}%"></div>
            </div>
            <span class="device-pct">{pct(row.n, total)}%</span>
          </div>
        {/each}
      </div>
    </section>
  </div>

  <!-- ── Superadmin section ── -->
  {#if data.superAdmin}
    <hr class="section-divider" />
    <h2 class="superadmin-title">系統監控（Superadmin）</h2>

    <div class="stat-grid">
      <div class="stat-card warn">
        <div class="stat-label">HTTP 4xx 錯誤（近 7 天）</div>
        <div class="stat-value">{data.superAdmin.errorStats.errors4xx}</div>
      </div>
      <div class="stat-card danger">
        <div class="stat-label">HTTP 5xx 錯誤（近 7 天）</div>
        <div class="stat-value">{data.superAdmin.errorStats.errors5xx}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">慢速請求 &gt;2s（近 7 天）</div>
        <div class="stat-value">{data.superAdmin.slowStats.count}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">機器人流量（近 7 天）</div>
        <div class="stat-value">{data.superAdmin.botStats.count}</div>
      </div>
    </div>

    <div class="two-col">
      <section class="analytics-section">
        <h2 class="section-title">來源分析 Top 10（近 30 天）</h2>
        {#if data.superAdmin.topReferrers.length === 0}
          <p class="empty">尚無外部來源</p>
        {:else}
          <table class="data-table">
            <thead><tr><th>來源</th><th>次數</th></tr></thead>
            <tbody>
              {#each data.superAdmin.topReferrers as r}
                <tr><td class="ref-cell">{r.referrer}</td><td class="num">{r.count}</td></tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>

      <section class="analytics-section">
        <h2 class="section-title">管理員操作記錄（近 50 筆）</h2>
        {#if data.superAdmin.activityLog.length === 0}
          <p class="empty">無操作記錄</p>
        {:else}
          <div class="activity-list">
            {#each data.superAdmin.activityLog as entry}
              <div class="activity-row">
                <span class="activity-user">{entry.username}</span>
                <span class="activity-action">{actionLabel(entry.action)}</span>
                {#if entry.targetId}<span class="activity-target">{entry.targetId}</span>{/if}
                <span class="activity-time">{formatDate(entry.createdAt)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  {/if}
{/if}

<style>
.state-msg { padding: 2rem; color: var(--muted); text-align: center; }
.state-msg.error { color: #e05; }
.state-msg button { margin-left: 1rem; padding: 0.25rem 0.75rem; border: 1px solid var(--line); border-radius: 6px; background: none; cursor: pointer; color: var(--text); font-size: 0.8rem; }

.analytics-section {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 1.25rem 1.35rem;
}

.section-title {
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--muted) 70%, transparent);
  margin: 0 0 1rem;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0.85rem;
}

.stat-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 1.1rem 1.25rem;
}
.stat-card.warn { border-color: color-mix(in srgb, #f5a623 40%, var(--line)); }
.stat-card.danger { border-color: color-mix(in srgb, #e05555 40%, var(--line)); }

.stat-label { font-size: 0.78rem; color: var(--muted); margin-bottom: 0.35rem; }
.stat-value { font-size: 2rem; font-weight: 800; line-height: 1; color: var(--text); }
.stat-trend { font-size: 0.72rem; margin-top: 0.35rem; color: var(--muted); }
.stat-trend.up { color: #3cba6d; }
.stat-trend.down { color: #e05555; }

/* Chart */
.chart-wrap { position: relative; overflow: hidden; }
.trend-chart { width: 100%; height: auto; display: block; }
.bar { fill: var(--accent); opacity: 0.75; cursor: pointer; transition: opacity 0.1s; }
.bar:hover { opacity: 1; }
.chart-tooltip {
  position: absolute; top: 4px;
  transform: translateX(-50%);
  background: color-mix(in srgb, var(--text) 90%, transparent);
  color: var(--bg);
  font-size: 0.72rem;
  padding: 4px 8px;
  border-radius: 6px;
  pointer-events: none;
  white-space: pre;
  z-index: 10;
}
.chart-meta { font-size: 0.78rem; color: var(--muted); margin-top: 0.5rem; text-align: right; }

/* Two-column layout */
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem;
}
@media (max-width: 700px) {
  .two-col { grid-template-columns: 1fr; }
}

/* Tables */
.data-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.data-table th { text-align: left; font-weight: 700; color: var(--muted); padding: 0.3rem 0; border-bottom: 1px solid var(--line); font-size: 0.72rem; }
.data-table td { padding: 0.4rem 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 50%, transparent); color: var(--text); }
.data-table td.num { text-align: right; font-weight: 700; color: var(--accent-strong); }
.data-table a { color: var(--accent-strong); text-decoration: none; }
.data-table a:hover { text-decoration: underline; }
.ref-cell { font-size: 0.75rem; word-break: break-all; }

/* Device bars */
.device-bars { display: flex; flex-direction: column; gap: 0.9rem; }
.device-row { display: grid; grid-template-columns: 3rem 1fr 2.5rem; gap: 0.5rem; align-items: center; }
.device-label { font-size: 0.8rem; color: var(--muted); }
.device-bar-track { height: 8px; background: color-mix(in srgb, var(--line) 60%, transparent); border-radius: 4px; overflow: hidden; }
.device-bar { height: 100%; border-radius: 4px; transition: width 0.4s; }
.device-bar.mobile { background: var(--accent); }
.device-bar.tablet { background: color-mix(in srgb, var(--accent) 60%, #a060ff); }
.device-bar.desktop { background: color-mix(in srgb, var(--accent) 40%, var(--muted)); }
.device-pct { font-size: 0.78rem; font-weight: 700; text-align: right; color: var(--text); }

/* Superadmin */
.section-divider { border: 0; border-top: 1px solid var(--line); margin: 0.5rem 0; }
.superadmin-title {
  font-size: 0.75rem; font-weight: 800;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: color-mix(in srgb, var(--muted) 55%, transparent);
  margin: 0;
}

/* Activity log */
.activity-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 320px; overflow-y: auto; }
.activity-row {
  display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
  font-size: 0.78rem; padding: 0.3rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 40%, transparent);
}
.activity-user { font-weight: 700; color: var(--accent-strong); }
.activity-action { color: var(--text); }
.activity-target { font-size: 0.7rem; color: var(--muted); background: color-mix(in srgb, var(--line) 60%, transparent); padding: 1px 6px; border-radius: 4px; }
.activity-time { margin-left: auto; font-size: 0.7rem; color: var(--muted); white-space: nowrap; }

.empty { font-size: 0.82rem; color: var(--muted); padding: 0.5rem 0; }
</style>
