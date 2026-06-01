<script lang="ts">
  import type { SiteSettings } from '@/lib/settings';
  import { detailSpecFieldOptions } from '@/lib/detail-spec-fields';
  import { styles, templates } from '@/lib/theme';
  import type { VehicleView } from '@/lib/vehicles';

  interface Props {
    vehicles: VehicleView[];
    settings: SiteSettings;
    brandAliases: { sourceBrand: string; displayName: string; urlSlug: string }[];
    mode?: 'overview' | 'settings' | 'contact' | 'vehicles';
  }

  type TemplateField = 'cardTitleTemplate' | 'shareMessageTemplate';
  type BrandAliasRow = { sourceBrand: string; displayName: string; urlSlug: string };

  let { vehicles, settings, brandAliases, mode = 'overview' }: Props = $props();
  let message = $state('');
  let selectedId = $state<string | null>(null);
  let vehicleForm = $state(emptyVehicleForm());
  let draggedImageIndex = $state<number | null>(null);
  let isUploadingImages = $state(false);
  const shareTemplatePlaceholder = '憶文豪車，推薦給您\n{車名}\n年份：{年份}\n品牌：{品牌}\n里程：{里程}\n實拍現車，專人介紹車況與配備\n{網址}';
  const cardTitleTemplatePlaceholder = '{年份} {品牌} {型號} {規格}\n{補充}';
  const cardTitleTokens = ['車名', '年份', '品牌', '顯示品牌', '型號', '規格', '補充', '里程', '車況'];
  const shareTemplateTokens = ['車名', '年份', '品牌', '里程', '外觀色', '內裝色', '車況', '價格', '網址'];
  const sourceBrandOptions = Array.from(new Set([...vehicles.map((vehicle) => vehicle.brand), ...brandAliases.map((item) => item.sourceBrand)])).filter(Boolean).sort((a, b) => a.localeCompare(b));
  let brandAliasRows = $state<BrandAliasRow[]>(brandAliases.length ? brandAliases.map((item) => ({ ...item })) : sourceBrandOptions.map((sourceBrand) => ({ sourceBrand, displayName: '', urlSlug: '' })));
  let settingsForm = $state({
    siteName: settings.siteName,
    salespersonName: settings.salespersonName,
    lineUrl: settings.lineUrl,
    instagramUrl: settings.instagramUrl,
    facebookUrl: settings.facebookUrl,
    threadsUrl: settings.threadsUrl,
    tiktokUrl: settings.tiktokUrl,
    phoneNumber: settings.phoneNumber,
    storeAddress: settings.storeAddress,
    businessHours: settings.businessHours,
    homepageEyebrow: settings.homepageEyebrow,
    homepageTitle: settings.homepageTitle,
    homepageLead: settings.homepageLead,
    homepageNote: settings.homepageNote,
    homepageBadge: settings.homepageBadge,
    featuredEyebrow: settings.featuredEyebrow,
    featuredTitle: settings.featuredTitle,
    featuredCount: settings.featuredCount,
    listingEyebrow: settings.listingEyebrow,
    listingTitle: settings.listingTitle,
    listingLead: settings.listingLead,
    cardTitleTemplate: settings.cardTitleTemplate,
    detailNotesEyebrow: settings.detailNotesEyebrow,
    detailNotesTitle: settings.detailNotesTitle,
    shareMessageTemplate: settings.shareMessageTemplate,
    detailSpecFields: settings.detailSpecFields,
    footerDisclaimer: settings.footerDisclaimer,
    heroVehicleSlug: settings.heroVehicleSlug,
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
    const aliases = brandAliasRows
      .map((item) => ({ sourceBrand: item.sourceBrand.trim(), displayName: item.displayName.trim(), urlSlug: item.urlSlug.trim() }))
      .filter((item) => item.sourceBrand && item.displayName);
    const response = await fetch('/api/admin/brand-aliases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aliases }),
    });
    message = response.ok ? '品牌對照已更新' : '品牌對照更新失敗';
  }

  const destructiveStatuses = new Set(['sold', 'archived']);
  const statusConfirmTexts: Record<string, string> = {
    sold: '確定要將此車設為「已售出」嗎？將會在公開網頁顯示為已售。',
    archived: '確定要封存此車嗎？封存後不會顯示在後台列表，僅能透過資料庫還原。',
  };

  async function setStatus(id: string, status: string) {
    if (destructiveStatuses.has(status)) {
      const ok = window.confirm(statusConfirmTexts[status] || '確定要執行此操作嗎？');
      if (!ok) return;
    }
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

  function insertTemplateToken(field: TemplateField, token: string) {
    settingsForm[field] = `${settingsForm[field]}{${token}}`;
  }

  function insertTemplateLineBreak(field: TemplateField) {
    settingsForm[field] = `${settingsForm[field]}\n`;
  }

  function addBrandAliasRow() {
    const used = new Set(brandAliasRows.map((row) => row.sourceBrand));
    const sourceBrand = sourceBrandOptions.find((brand) => !used.has(brand)) || sourceBrandOptions[0] || '';
    brandAliasRows = [...brandAliasRows, { sourceBrand, displayName: '', urlSlug: '' }];
  }

  function removeBrandAliasRow(index: number) {
    brandAliasRows = brandAliasRows.filter((_, rowIndex) => rowIndex !== index);
  }

  function countStatus(status: VehicleView['status']) {
    return vehicles.filter((vehicle) => vehicle.status === status).length;
  }

  const statusLabels: Record<VehicleView['status'], string> = {
    draft: '草稿',
    published: '上架中',
    unpublished: '已下架',
    sold: '已售出',
    archived: '已封存',
  };

  function adminCarMetaLine(vehicle: VehicleView): string {
    const parts: string[] = [statusLabels[vehicle.status]];
    if (vehicle.slug) parts.push(`網址代號 ${vehicle.slug}`);
    if (vehicle.year) parts.push(vehicle.year);
    if (vehicle.mileage) parts.push(vehicle.mileage);
    if (vehicle.monthlyRecommended) parts.push('本月推薦');
    return parts.join('｜');
  }

  function imageUrls() {
    return vehicleForm.imagesText.split('\n').map((item) => item.trim()).filter(Boolean);
  }

  function setImageUrls(urls: string[]) {
    vehicleForm.imagesText = urls.filter(Boolean).join('\n');
  }

  async function uploadVehicleImages(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    isUploadingImages = true;
    message = '圖片上傳中...';
    const formData = new FormData();
    for (const file of files) formData.append('files', file);
    const response = await fetch('/api/admin/media', { method: 'POST', body: formData });
    const result = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(result.urls)) {
      setImageUrls([...imageUrls(), ...result.urls]);
      message = `已上傳 ${result.urls.length} 張圖片`;
    } else {
      message = result.error || '圖片上傳失敗';
    }
    input.value = '';
    isUploadingImages = false;
  }

  function moveImage(fromIndex: number, toIndex: number) {
    const urls = imageUrls();
    if (toIndex < 0 || toIndex >= urls.length || fromIndex === toIndex) return;
    const [item] = urls.splice(fromIndex, 1);
    urls.splice(toIndex, 0, item);
    setImageUrls(urls);
  }

  function removeImage(index: number) {
    const urls = imageUrls();
    urls.splice(index, 1);
    setImageUrls(urls);
  }

  function dropImage(index: number) {
    if (draggedImageIndex === null) return;
    moveImage(draggedImageIndex, index);
    draggedImageIndex = null;
  }

  function previewStyleVars(styleId: keyof typeof styles) {
    return Object.entries(styles[styleId].tokens)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
  }

  function emptyVehicleForm() {
    return {
      title: '',
      cardTitleSupplement: '',
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
      cardTitleSupplement: vehicle.cardTitleSupplement,
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
      message = '車輛已儲存，正在重新載入最新資料...';
      selectedId = null;
      vehicleForm = emptyVehicleForm();
      window.setTimeout(() => window.location.reload(), 600);
    } else {
      message = '車輛儲存失敗，請確認標題、品牌、型號與圖片';
    }
  }

  let vehicleSearch = $state('');
  let lightboxImage = $state<string | null>(null);

  function vehiclesMatching(query: string): VehicleView[] {
    const q = query.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) =>
      v.title.toLowerCase().includes(q) ||
      v.brand.toLowerCase().includes(q) ||
      v.model.toLowerCase().includes(q) ||
      v.slug.toLowerCase().includes(q),
    );
  }

  function previewUrl(vehicle: VehicleView): string {
    return `/cars/${vehicle.slug}`;
  }

  const previewVehicle = vehicles.find((v) => v.status === 'published') || vehicles[0] || null;
</script>

<section class="admin-panel hero-panel">
  <div>
    <p class="admin-eyebrow">私人精品車展</p>
    <h1>{mode === 'overview' ? '管理後台' : mode === 'settings' ? '網站設定' : mode === 'contact' ? '聯絡與品牌' : '車輛管理'}</h1>
    <p>{mode === 'overview' ? '查看目前上架概況，並進入各管理區調整內容。' : mode === 'settings' ? '調整首頁、列表、詳情頁文案與網站外觀。' : mode === 'contact' ? '管理電話、LINE、社群連結與品牌英文顯示對照。' : '新增車輛、修改顧問描述、調整上架狀態。'}</p>
  </div>
  <a class="admin-button" href="/cars">前往公開網頁</a>
</section>

{#if message}
  <p class="admin-message">{message}</p>
{/if}

{#if mode === 'overview'}
  <section class="admin-grid admin-grid--overview">
    <a class="admin-panel admin-link-card" href="/admin/vehicles">
      <span>車輛管理</span>
      <strong>{vehicles.length}</strong>
      <small>全部庫存 / {countStatus('published')} 上架 / {countStatus('draft')} 草稿</small>
    </a>
    <a class="admin-panel admin-link-card" href="/admin/settings">
      <span>網站設定</span>
      <strong>{templates[settings.activeTemplate].label}</strong>
      <small>首頁文案、版面、配色與外部資料匯入預設</small>
    </a>
    <a class="admin-panel admin-link-card" href="/admin/contact">
      <span>聯絡與品牌</span>
      <strong>{brandAliases.length}</strong>
      <small>社群連結與品牌英文網址對照</small>
    </a>
  </section>
{/if}

{#if mode === 'settings'}
  <form class="admin-panel settings-form" onsubmit={(event) => { event.preventDefault(); saveSettings(); }}>
    <h2>網站設定</h2>
    <label>網站名稱 <input bind:value={settingsForm.siteName} /></label>
    <label>業務顯示名稱 <input bind:value={settingsForm.salespersonName} /></label>

    <h3>首頁文案</h3>
    <label>首頁小標 <input bind:value={settingsForm.homepageEyebrow} /></label>
    <label>首頁主標 <textarea bind:value={settingsForm.homepageTitle}></textarea></label>
    <label>首頁說明 <textarea bind:value={settingsForm.homepageLead}></textarea></label>
    <label>首頁形象短句 <textarea bind:value={settingsForm.homepageNote}></textarea></label>
    <label>封面徽章文字 <input bind:value={settingsForm.homepageBadge} /></label>
    <label>首頁主圖車輛
      <select bind:value={settingsForm.heroVehicleSlug}>
        <option value="">自動：使用最新更新的車輛</option>
        {#each vehicles.filter((v) => v.status === 'published' || v.status === 'sold') as v}
          <option value={v.slug}>{v.title}</option>
        {/each}
      </select>
    </label>
    <label>精選區小標 <input bind:value={settingsForm.featuredEyebrow} /></label>
    <label>精選區標題 <input bind:value={settingsForm.featuredTitle} /></label>
    <label>精選車輛顯示數量
      <input type="number" min="1" max="12" bind:value={settingsForm.featuredCount} />
    </label>

    <h3>列表與詳情文案</h3>
    <label>列表小標 <input bind:value={settingsForm.listingEyebrow} /></label>
    <label>列表主標 <textarea bind:value={settingsForm.listingTitle}></textarea></label>
    <label>列表說明 <textarea bind:value={settingsForm.listingLead}></textarea></label>
    <div class="template-builder">
      <label>卡片標題模板 <textarea bind:value={settingsForm.cardTitleTemplate} placeholder={cardTitleTemplatePlaceholder}></textarea></label>
      <div class="token-picker" aria-label="卡片標題變數">
        {#each cardTitleTokens as token}
          <button type="button" onclick={() => insertTemplateToken('cardTitleTemplate', token)}>{token}</button>
        {/each}
        <button type="button" onclick={() => insertTemplateLineBreak('cardTitleTemplate')}>換行</button>
      </div>
      <p class="form-hint">按上方按鈕就會自動把對應項目插入內容中，換行會保留，空白行會自動移除。</p>
    </div>
    <label>詳情備註小標 <input bind:value={settingsForm.detailNotesEyebrow} /></label>
    <label>詳情備註標題 <input bind:value={settingsForm.detailNotesTitle} /></label>
    <div class="template-builder">
      <label>分享訊息模板 <textarea bind:value={settingsForm.shareMessageTemplate} placeholder={shareTemplatePlaceholder}></textarea></label>
      <div class="token-picker" aria-label="分享訊息變數">
        {#each shareTemplateTokens as token}
          <button type="button" onclick={() => insertTemplateToken('shareMessageTemplate', token)}>{token}</button>
        {/each}
        <button type="button" onclick={() => insertTemplateLineBreak('shareMessageTemplate')}>換行</button>
      </div>
      <p class="form-hint">按上方按鈕就會自動把對應項目加入訊息中，不需要自己打括號。</p>
    </div>
    <div class="field-checklist">
      <strong>詳情頁資訊欄位</strong>
      <p class="form-hint">控制車輛詳情頁「完整規格」區塊要顯示哪些欄位。</p>
      <div class="field-checklist__grid">
        {#each detailSpecFieldOptions as field}
          <label class="checkbox-row"><input type="checkbox" bind:group={settingsForm.detailSpecFields} value={field.key} /> {field.label}</label>
        {/each}
      </div>
    </div>
    <label>頁尾提醒 <textarea bind:value={settingsForm.footerDisclaimer}></textarea></label>

    <h3>外觀</h3>
    <div class="visual-options">
      <div class="visual-options__header">
        <strong>模板</strong>
        <span>{templates[settingsForm.activeTemplate].label}</span>
      </div>
      <div class="template-options">
        {#each Object.entries(templates) as [id, template]}
          <button type="button" class:is-selected={settingsForm.activeTemplate === id} class={`template-option ${template.layoutClass}`} onclick={() => { settingsForm.activeTemplate = id; }}>
            <span>{template.label}</span>
            <small>{template.description}</small>
            <div class="template-option__mock">
              <i></i><i></i><i></i>
            </div>
          </button>
        {/each}
      </div>
    </div>
    <div class="visual-options">
      <div class="visual-options__header">
        <strong>風格</strong>
        <span>{styles[settingsForm.activeStyle].label}</span>
      </div>
      <div class="style-options">
        {#each Object.entries(styles) as [id, style]}
          <button type="button" class:is-selected={settingsForm.activeStyle === id} class="style-option" style={previewStyleVars(id)} onclick={() => { settingsForm.activeStyle = id; }}>
            <span>{style.label}</span>
            <div class="style-option__swatches">
              <i style="background: var(--bg)"></i>
              <i style="background: var(--surface)"></i>
              <i style="background: var(--accent)"></i>
            </div>
          </button>
        {/each}
      </div>
    </div>
    <div class={`theme-preview ${templates[settingsForm.activeTemplate].layoutClass}`} style={previewStyleVars(settingsForm.activeStyle)}>
      <div class="theme-preview__topline">
        <span>{templates[settingsForm.activeTemplate].label}</span>
        <strong>{styles[settingsForm.activeStyle].label}</strong>
      </div>
      <div class="theme-preview__hero">
        <div>
          <p>{settingsForm.siteName || '私人精品車展'}</p>
          <h4>{settingsForm.homepageTitle || '嚴選值得收藏的高級座駕'}</h4>
          <small>{templates[settingsForm.activeTemplate].description}</small>
        </div>
        <div class="theme-preview__media">{previewVehicle?.brand?.slice(0, 2).toUpperCase() || 'GT'}</div>
      </div>
      <div class="theme-preview__content">
        <article>
          <span>{previewVehicle?.year || '2023'}</span>
          <strong>{previewVehicle?.title || '示範車款 Continental GT V8 Mulliner'}</strong>
          <small>{previewVehicle?.mileage || '26,000 km'} ／ 價格請洽</small>
        </article>
        <div class="theme-preview__specs">
          <div><span>年份</span><strong>{previewVehicle?.year || '—'}</strong></div>
          <div><span>里程</span><strong>{previewVehicle?.mileage || '—'}</strong></div>
          <div><span>外觀</span><strong>{previewVehicle?.exteriorColor || '—'}</strong></div>
          <div><span>價格</span><strong>價格請洽</strong></div>
        </div>
      </div>
      <button type="button" class="theme-preview__cta">LINE 洽詢</button>
    </div>

    <h3>外部匯入與公開狀態</h3>
    <label>外部來源新車輛預設
      <select bind:value={settingsForm.importBehavior}>
        <option value="draft_first">先存為草稿，需手動上架</option>
        <option value="auto_publish">自動上架到公開網頁</option>
        <option value="import_only">只匯入但不顯示在公開網頁</option>
      </select>
    </label>
    <label class="checkbox-row"><input type="checkbox" bind:checked={settingsForm.showSoldVehicles} /> 公開網頁顯示已售出車輛</label>
    <button class="admin-button" type="submit">儲存設定</button>
  </form>
{/if}

{#if mode === 'contact'}
  <section class="admin-grid admin-grid--single">
    <form class="admin-panel settings-form" onsubmit={(event) => { event.preventDefault(); saveSettings(); }}>
      <h2>聯絡與社群</h2>
      <label>LINE 網址 <input bind:value={settingsForm.lineUrl} /></label>
      <label>電話 <input bind:value={settingsForm.phoneNumber} /></label>
      <label>門市地址 <input bind:value={settingsForm.storeAddress} placeholder="例如 台北市信義區忠孝東路五段 00 號 0 樓" /></label>
      <label>營業時間 <input bind:value={settingsForm.businessHours} placeholder="例如 週一至週六 10:00-19:00，採預約賞車" /></label>
      <label>Instagram 網址 <input bind:value={settingsForm.instagramUrl} /></label>
      <label>Facebook 網址 <input bind:value={settingsForm.facebookUrl} /></label>
      <label>Threads 網址 <input bind:value={settingsForm.threadsUrl} /></label>
      <label>TikTok 網址 <input bind:value={settingsForm.tiktokUrl} /></label>
      <p class="form-hint">社群網址留空時，公開網頁的頁尾就不會顯示該平台。</p>
      <button class="admin-button" type="submit">儲存聯絡資訊</button>
    </form>

    <form class="admin-panel vehicle-edit-form" onsubmit={(event) => { event.preventDefault(); saveBrandAliases(); }}>
      <h2>品牌英文顯示對照</h2>
      <p>來源品牌用選的，公開網頁顯示名稱與英文網址再手動補。網址只能用英文小寫字母、數字、與短橫線 -。</p>
      <div class="alias-editor">
        {#each brandAliasRows as row, index}
          <div class="alias-row">
            <label>來源品牌
              <select bind:value={row.sourceBrand}>
                {#each sourceBrandOptions as sourceBrand}
                  <option value={sourceBrand}>{sourceBrand}</option>
                {/each}
              </select>
            </label>
            <label>公開網頁顯示名稱 <input bind:value={row.displayName} placeholder="例如 Bentley" /></label>
            <label>英文網址 <input bind:value={row.urlSlug} placeholder="例如 bentley" /></label>
            <button type="button" onclick={() => removeBrandAliasRow(index)}>移除</button>
          </div>
        {/each}
      </div>
      <button class="secondary-button" type="button" onclick={addBrandAliasRow}>新增品牌對照</button>
      <button class="admin-button" type="submit">儲存品牌對照</button>
    </form>
  </section>
{/if}

{#if mode === 'vehicles'}
  <section class="admin-panel vehicle-admin-list">
    <h2>車輛管理</h2>
    <form class="vehicle-edit-form" onsubmit={(event) => { event.preventDefault(); saveVehicle(); }}>
      <div class="vehicle-edit-form__head">
        <h3>{selectedId ? '編輯車輛' : '新增車輛'}</h3>
        {#if selectedId && vehicleForm.slug && (vehicleForm.status === 'published' || vehicleForm.status === 'sold')}
          <a class="preview-link" href={`/cars/${vehicleForm.slug}`} target="_blank" rel="noopener">
            在公開網頁預覽 →
          </a>
        {/if}
      </div>
      <div class="form-grid">
        <label>標題 <input bind:value={vehicleForm.title} required /></label>
        <label>卡片標題補充 <input bind:value={vehicleForm.cardTitleSupplement} placeholder="例如 總代、稀有配色、Mulliner" /></label>
        <label>網址代號 <input bind:value={vehicleForm.slug} placeholder="例如 B181" /></label>
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
      <div class="image-manager">
        <div class="image-manager__header">
          <div>
            <strong>車輛圖片</strong>
            <p class="form-hint">可上傳多張圖片，拖曳或用上下按鈕調整順序；第一張作封面。</p>
          </div>
          <label class="upload-button">
            {isUploadingImages ? '上傳中...' : '上傳圖片'}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onchange={uploadVehicleImages} disabled={isUploadingImages} />
          </label>
        </div>
        {#if imageUrls().length}
          <div class="image-sort-list">
            {#each imageUrls() as url, index}
              <article class="image-sort-item" class:is-dragging={draggedImageIndex === index} draggable="true" ondragstart={() => { draggedImageIndex = index; }} ondragover={(event) => event.preventDefault()} ondrop={() => dropImage(index)} ondragend={() => { draggedImageIndex = null; }}>
                <button type="button" class="image-sort-item__thumb" onclick={() => { lightboxImage = url; }} aria-label={`預覽圖片 ${index + 1}`}>
                  <img src={url} alt={`車輛圖片 ${index + 1}`} />
                </button>
                <div>
                  <strong>{index === 0 ? '封面' : `第 ${index + 1} 張`}</strong>
                  <span>{url}</span>
                </div>
                <div class="image-sort-actions">
                  <button type="button" onclick={() => moveImage(index, index - 1)} disabled={index === 0}>上移</button>
                  <button type="button" onclick={() => moveImage(index, index + 1)} disabled={index === imageUrls().length - 1}>下移</button>
                  <button type="button" class="row-button--danger" onclick={() => removeImage(index)}>移除</button>
                </div>
              </article>
            {/each}
          </div>
        {/if}
        <label>圖片網址（進階，一行一張） <textarea bind:value={vehicleForm.imagesText}></textarea></label>
      </div>
      <div class="row-actions form-actions">
        <button type="submit">儲存車輛</button>
        <button type="button" onclick={() => { selectedId = null; vehicleForm = emptyVehicleForm(); }}>清空</button>
      </div>
    </form>
    <div class="admin-list-toolbar">
      <label class="admin-search">
        <span>搜尋車輛</span>
        <input type="search" bind:value={vehicleSearch} placeholder="輸入標題、品牌、型號或網址代號" />
      </label>
      <span class="admin-search__count">{vehiclesMatching(vehicleSearch).length} / {vehicles.length}</span>
    </div>
    {#each vehiclesMatching(vehicleSearch) as vehicle}
      <article class="admin-car-row">
        <img src={vehicle.coverImage?.url || ''} alt={vehicle.title} />
        <div>
          <strong>{vehicle.cardTitle}</strong>
          <span>{adminCarMetaLine(vehicle)}</span>
        </div>
        <div class="row-actions">
          <button onclick={() => editVehicle(vehicle)}>編輯</button>
          <a class="row-button-link" href={`/cars/${vehicle.slug}`} target="_blank" rel="noopener">預覽</a>
          <button onclick={() => setStatus(vehicle.id, 'published')}>上架</button>
          <button onclick={() => setStatus(vehicle.id, 'unpublished')}>下架</button>
          <button class="row-button--warn" onclick={() => setStatus(vehicle.id, 'sold')}>已售</button>
          <button class="row-button--danger" onclick={() => setStatus(vehicle.id, 'archived')}>封存</button>
        </div>
      </article>
    {/each}
    {#if vehiclesMatching(vehicleSearch).length === 0}
      <p class="admin-empty">沒有符合條件的車輛。</p>
    {/if}
  </section>
{/if}

{#if lightboxImage}
  <button class="admin-image-lightbox" type="button" onclick={() => { lightboxImage = null; }} aria-label="關閉預覽">
    <img src={lightboxImage} alt="圖片預覽" />
  </button>
{/if}
