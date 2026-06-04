<script lang="ts">
  import type { SellInquiryView } from '@/lib/sell-inquiries';

  interface Props {
    inquiries: SellInquiryView[];
  }
  let { inquiries }: Props = $props();
</script>

<div class="admin-page">
  <div class="page-header">
    <h1>賣車申請</h1>
  </div>

  {#if inquiries.length === 0}
    <div class="empty-state">
      <p>尚無賣車申請</p>
      <p class="muted">賣車詢問功能將在下一階段啟用。</p>
    </div>
  {:else}
    <table class="users-table">
      <thead>
        <tr>
          <th>日期</th>
          <th>姓名</th>
          <th>車輛</th>
          <th>聯絡</th>
          <th>狀態</th>
        </tr>
      </thead>
      <tbody>
        {#each inquiries as inq}
          <tr class:is-unread={!inq.readAt}>
            <td>{new Date(inq.createdAt).toLocaleDateString('zh-TW')}</td>
            <td>{inq.contactName}</td>
            <td>{[inq.brand, inq.model, inq.year].filter(Boolean).join(' ')}</td>
            <td>{inq.contactInfo}</td>
            <td>{inq.readAt ? '已讀' : '未讀'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .admin-page {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 1rem;
  }

  .page-header h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .empty-state {
    text-align: center;
    padding: 3rem;
    color: #6b7280;
  }

  .empty-state p {
    margin: 0.5rem 0;
  }

  .empty-state .muted {
    font-size: 0.875rem;
    color: #9ca3af;
  }

  .users-table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .users-table thead {
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
  }

  .users-table th {
    padding: 0.75rem 1rem;
    text-align: left;
    font-weight: 600;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
  }

  .users-table td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #f3f4f6;
    font-size: 0.875rem;
  }

  .users-table tbody tr:last-child td {
    border-bottom: none;
  }

  .users-table tbody tr:hover {
    background: #f9fafb;
  }

  .users-table tbody tr.is-unread {
    background: #fef3c7;
  }

  .users-table tbody tr.is-unread:hover {
    background: #fde68a;
  }
</style>
