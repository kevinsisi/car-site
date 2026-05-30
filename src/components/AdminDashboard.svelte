<script lang="ts">
  import type { SiteSettings } from '@/lib/settings';
  import { styles, templates } from '@/lib/theme';
  import type { VehicleView } from '@/lib/vehicles';

  interface Props {
    vehicles: VehicleView[];
    settings: SiteSettings;
    brandAliases: { sourceBrand: string; displayName: string; urlSlug: string }[];
  }

  let { vehicles, settings, brandAliases }: Props = $props();
  let message = $state('');
  let selectedId = $state<string | null>(null);
  let vehicleForm = $state(emptyVehicleForm());
  let brandAliasText = $state(brandAliases.map((item) => `${item.sourceBrand} = ${item.displayName} | ${item.urlSlug}`).join('\n'));
  let settingsForm = $state({
    siteName: settings.siteName,
    salespersonName: settings.salespersonName,
    lineUrl: settings.lineUrl,
    phoneNumber: settings.phoneNumber,
    homepageEyebrow: settings.homepageEyebrow,
    homepageTitle: settings.homepageTitle,
    homepageLead: settings.homepageLead,
    homepageNote: settings.homepageNote,
    homepageBadge: settings.homepageBadge,
    featuredEyebrow: settings.featuredEyebrow,
    featuredTitle: settings.featuredTitle,
    listingEyebrow: settings.listingEyebrow,
    listingTitle: settings.listingTitle,
    listingLead: settings.listingLead,
    detailNotesEyebrow: settings.detailNotesEyebrow,
    detailNotesTitle: settings.detailNotesTitle,
    footerDisclaimer: settings.footerDisclaimer,
    activeTemplate: settings.activeTemplate,
    activeStyle: settings.activeStyle,
    importBehavior: settings.importBehavior,
    showSoldVehicles: settings.showSoldVehicles,
  });

  async function saveSettings() {
    message = '儲存中...';
    const response = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(settingsForm),
    });
    message = response.ok ? '設定已更新' : '設定更新失敗';
  }

  async function saveBrandAliases() {
    message = '儲存品牌對照中...';
    const aliases = brandAliasText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [sourceBrand, ...displayParts] = line.split('=');
        const [displayName, urlSlug = ''] = displayParts.join('=').split('|');
        return { sourceBrand: sourceBrand.trim(), displayName: displayName.trim(), urlSlug: urlSlug.trim() };
      })
      .filter((item) => item.sourceBrand && item.displayName);
    const response = await fetch('/api/admin/brand-aliases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aliases }),
    });
    message = response.ok ? '品牌對照已更新' : '品牌對照更新失敗';
  }

  async function setStatus(id: string, status: string) {
    const response = await fetch(`/api/admin/vehicles/${id}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (response.ok) {
      vehicles = vehicles.map((vehicle) => (vehicle.id === id ? { ...vehicle, status: status as VehicleView['status'] } : vehicle));
      message = '車輛狀態已更新';
    } else {
      message = '車輛狀態更新失敗';
    }
  }

  function emptyVehicleForm() {
    return {
      title: '',
      slug: '',
      brand: '',
      model: '',
      subModel: '',
      year: '',
      mileage: '',
      exteriorColor: '',
      interiorColor: '',
      condition: '嚴選車況',
      status: 'draft',
      monthlyRecommended: false,
      headline: '',
      description: '',
      featuresText: '',
      imagesText: '',
    };
  }

  function editVehicle(vehicle: VehicleView) {
    selectedId = vehicle.id;
    vehicleForm = {
      title: vehicle.title,
      slug: vehicle.slug,
      brand: vehicle.brand,
      model: vehicle.model,
      subModel: vehicle.subModel,
      year: vehicle.year,
      mileage: vehicle.mileage,
      exteriorColor: vehicle.exteriorColor,
      interiorColor: vehicle.interiorColor,
      condition: vehicle.condition,
      status: vehicle.status,
      monthlyRecommended: vehicle.monthlyRecommended,
      headline: vehicle.headline,
      description: vehicle.description,
      featuresText: vehicle.features.join('\n'),
      imagesText: vehicle.images.map((image) => image.url).join('\n'),
    };
  }

  async function saveVehicle() {
    message = '儲存車輛中...';
    const response = await fetch('/api/admin/vehicles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: selectedId,
        ...vehicleForm,
        features: vehicleForm.featuresText.split('\n').map((item) => item.trim()).filter(Boolean),
        images: vehicleForm.imagesText.split('\n').map((item) => item.trim()).filter(Boolean),
      }),
    });
    if (response.ok) {
      message = '車輛已儲存，重新整理後可看到最新列表';
      selectedId = null;
      vehicleForm = emptyVehicleForm();
    } else {
      message = '車輛儲存失敗，請確認標題、品牌、型號與圖片';
    }
  }
</script>

<section class="admin-panel hero-panel">
  <div>
    <p class="admin-eyebrow">Personal Premium Car Site</p>
    <h1>管理後台</h1>
    <p>快速調整前台文案、網站風格、聯絡資訊與車輛上架狀態。</p>
  </div>
  <a class="admin-button" href="/cars">查看前台車輛</a>
</section>

{#if message}
  <p class="admin-message">{message}</p>
{/if}

<section class="admin-grid">
  <form class="admin-panel settings-form" onsubmit={(event) => { event.preventDefault(); saveSettings(); }}>
    <h2>網站設定</h2>
    <h3>聯絡與品牌</h3>
    <label>網站名稱 <input bind:value={settingsForm.siteName} /></label>
    <label>業務顯示名稱 <input bind:value={settingsForm.salespersonName} /></label>
    <label>LINE URL <input bind:value={settingsForm.lineUrl} /></label>
    <label>電話 <input bind:value={settingsForm.phoneNumber} /></label>

    <h3>首頁文案</h3>
    <label>首頁小標 <input bind:value={settingsForm.homepageEyebrow} /></label>
    <label>首頁主標 <textarea bind:value={settingsForm.homepageTitle}></textarea></label>
    <label>首頁說明 <textarea bind:value={settingsForm.homepageLead}></textarea></label>
    <label>首頁形象短句 <textarea bind:value={settingsForm.homepageNote}></textarea></label>
    <label>封面徽章文字 <input bind:value={settingsForm.homepageBadge} /></label>
    <label>精選區小標 <input bind:value={settingsForm.featuredEyebrow} /></label>
    <label>精選區標題 <input bind:value={settingsForm.featuredTitle} /></label>

    <h3>列表與詳情文案</h3>
    <label>列表小標 <input bind:value={settingsForm.listingEyebrow} /></label>
    <label>列表主標 <textarea bind:value={settingsForm.listingTitle}></textarea></label>
    <label>列表說明 <textarea bind:value={settingsForm.listingLead}></textarea></label>
    <label>詳情備註小標 <input bind:value={settingsForm.detailNotesEyebrow} /></label>
    <label>詳情備註標題 <input bind:value={settingsForm.detailNotesTitle} /></label>
    <label>頁尾提醒 <textarea bind:value={settingsForm.footerDisclaimer}></textarea></label>

    <h3>外觀</h3>
    <label>模板
      <select bind:value={settingsForm.activeTemplate}>
        {#each Object.entries(templates) as [id, template]}
          <option value={id}>{template.label}</option>
        {/each}
      </select>
    </label>
    <label>風格
      <select bind:value={settingsForm.activeStyle}>
        {#each Object.entries(styles) as [id, style]}
          <option value={id}>{style.label}</option>
        {/each}
      </select>
    </label>

    <h3>匯入與公開狀態</h3>
    <label>API 匯入預設
      <select bind:value={settingsForm.importBehavior}>
        <option value="draft_first">匯入為草稿</option>
        <option value="auto_publish">匯入後自動上架</option>
        <option value="import_only">只匯入不上架</option>
      </select>
    </label>
    <label class="checkbox-row"><input type="checkbox" bind:checked={settingsForm.showSoldVehicles} /> 前台顯示已售車輛</label>
    <button class="admin-button" type="submit">儲存設定</button>
  </form>

  <section class="admin-panel vehicle-admin-list">
    <h2>車輛管理</h2>
    <form class="vehicle-edit-form" onsubmit={(event) => { event.preventDefault(); saveBrandAliases(); }}>
      <h3>品牌英文顯示對照</h3>
      <p>每行一組：來源品牌 = 前台顯示名稱 | 英文網址。網址只允許英文小寫、數字與連字號。</p>
      <label>品牌對照 <textarea bind:value={brandAliasText} placeholder="法拉利 = Ferrari | ferrari&#10;賓利(A40) = Bentley | bentley"></textarea></label>
      <button class="admin-button" type="submit">儲存品牌對照</button>
    </form>
    <form class="vehicle-edit-form" onsubmit={(event) => { event.preventDefault(); saveVehicle(); }}>
      <h3>{selectedId ? '編輯車輛' : '新增車輛'}</h3>
      <div class="form-grid">
        <label>標題 <input bind:value={vehicleForm.title} required /></label>
        <label>路由編號 <input bind:value={vehicleForm.slug} placeholder="例如 B181" /></label>
        <label>品牌 <input bind:value={vehicleForm.brand} required /></label>
        <label>型號 <input bind:value={vehicleForm.model} required /></label>
        <label>規格 <input bind:value={vehicleForm.subModel} /></label>
        <label>年份 <input bind:value={vehicleForm.year} /></label>
        <label>里程 <input bind:value={vehicleForm.mileage} /></label>
        <label>外觀色 <input bind:value={vehicleForm.exteriorColor} /></label>
        <label>內裝色 <input bind:value={vehicleForm.interiorColor} /></label>
      </div>
      <label>車況 <input bind:value={vehicleForm.condition} /></label>
      <label>狀態
        <select bind:value={vehicleForm.status}>
          <option value="draft">草稿</option>
          <option value="published">上架</option>
          <option value="unpublished">下架</option>
          <option value="sold">已售</option>
          <option value="archived">封存</option>
        </select>
      </label>
      <label class="checkbox-row"><input type="checkbox" bind:checked={vehicleForm.monthlyRecommended} /> 本月推薦</label>
      <label>顧問標題 <input bind:value={vehicleForm.headline} /></label>
      <label>顧問描述 <textarea bind:value={vehicleForm.description}></textarea></label>
      <label>配備亮點（每行一項） <textarea bind:value={vehicleForm.featuresText}></textarea></label>
      <label>圖片 URL（每行一張，第一張作封面） <textarea bind:value={vehicleForm.imagesText}></textarea></label>
      <div class="row-actions form-actions">
        <button type="submit">儲存車輛</button>
        <button type="button" onclick={() => { selectedId = null; vehicleForm = emptyVehicleForm(); }}>清空</button>
      </div>
    </form>
    {#each vehicles as vehicle}
      <article class="admin-car-row">
        <img src={vehicle.coverImage?.url || ''} alt={vehicle.title} />
        <div>
          <strong>{vehicle.title}</strong>
          <span>{vehicle.status} / /cars/{vehicle.slug} / {vehicle.year} / {vehicle.mileage}{vehicle.monthlyRecommended ? ' / 本月推薦' : ''}</span>
        </div>
        <div class="row-actions">
          <button onclick={() => editVehicle(vehicle)}>編輯</button>
          <button onclick={() => setStatus(vehicle.id, 'published')}>上架</button>
          <button onclick={() => setStatus(vehicle.id, 'unpublished')}>下架</button>
          <button onclick={() => setStatus(vehicle.id, 'sold')}>已售</button>
          <button onclick={() => setStatus(vehicle.id, 'archived')}>封存</button>
        </div>
      </article>
    {/each}
  </section>
</section>
