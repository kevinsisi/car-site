<script lang="ts">
  import type { SiteSettings, SocialIconConfig, SocialPlatform } from '@/lib/settings';
  import { detailSpecFieldOptions } from '@/lib/detail-spec-fields';
  import { styles, templates } from '@/lib/theme';
  import type { VehicleView } from '@/lib/vehicles';

  interface Props {
    vehicles: VehicleView[];
    settings: SiteSettings;
    brandAliases: { sourceBrand: string; displayName: string; urlSlug: string; iconUrl?: string | null }[];
    mode?: 'overview' | 'settings' | 'contact' | 'vehicles';
  }

  type TemplateField = 'cardTitleTemplate' | 'shareMessageTemplate';
  type BrandAliasRow = { sourceBrand: string; displayName: string; urlSlug: string; iconUrl?: string | null };

  let { vehicles, settings, brandAliases, mode = 'overview' }: Props = $props();

  type ToastLevel = 'info' | 'success' | 'error' | 'progress';
  interface Toast { id: number; text: string; level: ToastLevel; sticky: boolean; }
  let toasts = $state<Toast[]>([]);
  let toastCounter = 0;

  function pushToast(text: string, level: ToastLevel = 'info', sticky = false): number {
    const id = ++toastCounter;
    toasts = [...toasts, { id, text, level, sticky }];
    if (!sticky) window.setTimeout(() => dismissToast(id), level === 'error' ? 6500 : 3200);
    return id;
  }
  function dismissToast(id: number) { toasts = toasts.filter((t) => t.id !== id); }
  function notify(text: string) { return pushToast(text, 'info'); }
  function notifySuccess(text: string) { return pushToast(text, 'success'); }
  function notifyError(text: string) { return pushToast(text, 'error'); }
  function notifyProgress(text: string) { return pushToast(text, 'progress', true); }
  function updateToast(id: number, text: string, level: ToastLevel) {
    toasts = toasts.map((t) => t.id === id ? { ...t, text, level, sticky: false } : t);
    window.setTimeout(() => dismissToast(id), level === 'error' ? 6500 : 3200);
  }

  async function adminFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const response = await fetch(input, init);
    if (response.status === 401) {
      window.location.href = '/admin/login?expired=1';
      throw new Error('session expired');
    }
    return response;
  }

  let selectedId = $state<string | null>(null);
  let vehicleForm = $state(emptyVehicleForm());
  let vehicleFormBaseline = $state(JSON.stringify(emptyVehicleForm()));
  let vehicleFormDirty = $derived(JSON.stringify(vehicleForm) !== vehicleFormBaseline);
  let draggedImageIndex = $state<number | null>(null);
  let isUploadingImages = $state(false);
  let carsmeetImportUrl = $state('');
  let isImportingCarsmeet = $state(false);
  let uploadProgress = $state<{ current: number; total: number }>({ current: 0, total: 0 });
  const shareTemplatePlaceholder = '憶文豪車，推薦給您\n{車名}\n年份：{年份}\n品牌：{品牌}\n里程：{里程}\n實拍現車，專人介紹車況與配備\n{網址}';
  const cardTitleTemplatePlaceholder = '{年份} {品牌} {型號} {規格}\n{補充}';
  const cardTitleTokens = ['車名', '年份', '品牌', '顯示品牌', '型號', '規格', '補充', '里程', '車況'];
  const shareTemplateTokens = ['車名', '年份', '品牌', '里程', '外觀色', '內裝色', '車況', '價格', '網址'];
  const sourceBrandOptions = Array.from(new Set([...vehicles.map((vehicle) => vehicle.brand), ...brandAliases.map((item) => item.sourceBrand)])).filter(Boolean).sort((a, b) => a.localeCompare(b));
  let brandAliasRows = $state<BrandAliasRow[]>(brandAliases.length ? brandAliases.map((item) => ({ ...item, iconUrl: item.iconUrl ?? null })) : sourceBrandOptions.map((sourceBrand) => ({ sourceBrand, displayName: '', urlSlug: '', iconUrl: null })));
  let settingsForm = $state({
    siteName: settings.siteName,
    siteIconUrl: settings.siteIconUrl,
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
    socialIcons: { ...settings.socialIcons } as Record<SocialPlatform, SocialIconConfig | undefined>,
    galleryMode: settings.galleryMode,
  });
  let originalSettingsForm = $state(JSON.stringify(settingsForm));
  let settingsFormDirty = $derived(JSON.stringify(settingsForm) !== originalSettingsForm);

  const socialPlatformList: { key: SocialPlatform; label: string }[] = [
    { key: 'line', label: 'LINE' },
    { key: 'instagram', label: 'Instagram' },
    { key: 'facebook', label: 'Facebook' },
    { key: 'threads', label: 'Threads' },
    { key: 'tiktok', label: 'TikTok' },
    { key: 'phone', label: '電話' },
    { key: 'share', label: '分享' },
  ];

  let uploadingPlatform = $state<SocialPlatform | null>(null);

  function ensureIconConfig(platform: SocialPlatform): SocialIconConfig {
    const existing = settingsForm.socialIcons[platform];
    if (existing) return existing;
    const fresh: SocialIconConfig = { url: '', zoom: 1, offsetX: 50, offsetY: 50, bgColor: '' };
    settingsForm.socialIcons[platform] = fresh;
    return fresh;
  }

  function setIconBgColor(platform: SocialPlatform, color: string) {
    const cfg = ensureIconConfig(platform);
    cfg.bgColor = color;
    settingsForm.socialIcons = { ...settingsForm.socialIcons };
  }

  function applyBgToAll(color: string) {
    for (const p of socialPlatformList) {
      const cfg = settingsForm.socialIcons[p.key];
      if (cfg?.url) cfg.bgColor = color;
    }
    settingsForm.socialIcons = { ...settingsForm.socialIcons };
  }

  async function uploadSocialIcon(platform: SocialPlatform, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploadingPlatform = platform;
    const tid = notifyProgress(`${platform.toUpperCase()} 圖示上傳中...`);
    const formData = new FormData();
    formData.append('files', file);
    const response = await adminFetch('/api/admin/media', { method: 'POST', body: formData });
    const result = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(result.urls) && result.urls[0]) {
      const cfg = ensureIconConfig(platform);
      cfg.url = result.urls[0];
      cfg.zoom = cfg.zoom || 1;
      cfg.offsetX = cfg.offsetX ?? 50;
      cfg.offsetY = cfg.offsetY ?? 50;
      settingsForm.socialIcons = { ...settingsForm.socialIcons };
      updateToast(tid, `${platform.toUpperCase()} 圖示上傳完成，記得按下方「儲存聯絡資訊」`, 'success');
    } else {
      updateToast(tid, result.error || `${platform.toUpperCase()} 圖示上傳失敗`, 'error');
    }
    input.value = '';
    uploadingPlatform = null;
  }

  async function clearSocialIcon(platform: SocialPlatform) {
    settingsForm.socialIcons = Object.fromEntries(
      Object.entries(settingsForm.socialIcons).filter(([k, v]) => k !== platform && v != null)
    ) as Record<SocialPlatform, SocialIconConfig | undefined>;
    await saveSettings();
  }

  async function uploadSiteIcon(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const tid = notifyProgress('網站 icon 上傳中...');
    const formData = new FormData();
    formData.append('files', file);
    const response = await adminFetch('/api/admin/media', { method: 'POST', body: formData });
    const result = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(result.urls) && result.urls[0]) {
      settingsForm.siteIconUrl = result.urls[0];
      const saved = await saveSettings();
      updateToast(tid, saved ? '網站 icon 已更新' : '網站 icon 已上傳，但設定儲存失敗', saved ? 'success' : 'error');
    } else {
      updateToast(tid, result.error || '網站 icon 上傳失敗', 'error');
    }
    input.value = '';
  }

  async function clearSiteIcon() {
    settingsForm.siteIconUrl = '';
    await saveSettings();
  }

  function updateIconField(platform: SocialPlatform, field: 'zoom' | 'offsetX' | 'offsetY', value: number) {
    const cfg = ensureIconConfig(platform);
    cfg[field] = value;
    settingsForm.socialIcons = { ...settingsForm.socialIcons };
  }

  function iconPreviewStyle(cfg: SocialIconConfig | undefined): string {
    if (!cfg?.url) return '';
    const w = (cfg.zoom || 1) * 100;
    return `width: ${w}%; height: ${w}%; object-position: ${cfg.offsetX ?? 50}% ${cfg.offsetY ?? 50}%;`;
  }

  function defaultIconSvg(platform: SocialPlatform): string {
    const icons: Record<SocialPlatform, string> = {
      line: '<svg class="is-line-logo" viewBox="0 0 48 48"><path d="M24 6C13.5 6 5 12.9 5 21.4c0 7.6 6.7 14 15.8 15.2.6.1 1.4.4 1.6.9.2.5.1 1.2.1 1.7l-.3 2c-.1.6-.5 2.3 1.7 1.3 2.2-1 11.7-6.9 16-11.8 3-3.3 4.1-6.4 4.1-9.3C43 12.9 34.5 6 24 6Z"/><text x="24" y="20.6" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="10.5" letter-spacing="-0.35">LINE</text></svg>',
      instagram: '<svg viewBox="0 0 24 24"><rect x="4.4" y="4.4" width="15.2" height="15.2" rx="4.4"/><circle cx="12" cy="12" r="3.7"/><circle cx="16.75" cy="7.25" r="0.85"/></svg>',
      facebook: '<svg class="is-filled" viewBox="0 0 24 24"><path d="M14.05 8.25h2.15V4.8h-2.6c-3.05 0-4.55 1.82-4.55 4.35v2.1H6.7v3.55h2.35v6.05h3.75V14.8h2.9l.45-3.55H12.8V9.42c0-.82.33-1.17 1.25-1.17Z"/></svg>',
      threads: '<svg viewBox="0 0 24 24"><path d="M18.9 8.45c-.85-3.25-3.1-4.75-6.67-4.78-5.05.04-7.56 3.13-7.6 8.33.04 5.2 2.55 8.3 7.6 8.33 2.95-.02 5.02-.84 6.38-2.52 1.58-1.95 1.06-4.42-.62-5.6-1.17-.82-2.73-1.2-4.72-1.1-2.3.12-3.62 1.12-3.55 2.72.07 1.46 1.45 2.35 3.34 2.2 2.16-.18 3.25-1.58 3.25-4.15 0-2.72-1.35-4.18-3.9-4.2-1.75 0-2.95.78-3.45 2.22"/></svg>',
      tiktok: '<svg class="is-filled" viewBox="0 0 24 24"><path d="M14.65 4.5c.38 3.1 2.1 5.05 5.05 5.25v3.35c-1.72.05-3.35-.48-4.92-1.47v6.28c0 3.55-2.38 5.92-5.65 5.92-3.05 0-5.35-2.22-5.35-5.15 0-3.3 2.7-5.55 6.1-5.02v3.48c-1.45-.35-2.65.45-2.65 1.62 0 1.05.82 1.82 1.9 1.82 1.25 0 2.05-.82 2.05-2.32V4.5h3.47Z"/></svg>',
      phone: '<svg viewBox="0 0 24 24"><path d="M6.55 4.85c.58-.36 1.3-.18 1.64.42l1.12 1.95c.3.52.22 1.17-.2 1.6l-.88.92a12.35 12.35 0 0 0 6.02 6.02l.92-.88c.43-.42 1.08-.5 1.6-.2l1.95 1.12c.6.34.78 1.06.42 1.64l-.78 1.24c-.4.64-1.18.94-1.92.76A17.35 17.35 0 0 1 4.56 7.56c-.18-.74.12-1.52.76-1.92l1.23-.79Z"/></svg>',
      share: '<svg viewBox="0 0 24 24"><circle cx="6.5" cy="12" r="2.7"/><circle cx="17.5" cy="6.6" r="2.7"/><circle cx="17.5" cy="17.4" r="2.7"/><path d="M8.9 10.8 15.1 7.7M8.9 13.2l6.2 3.1"/></svg>',
    };
    return icons[platform];
  }

  async function saveSettings() {
    const tid = notifyProgress('儲存中...');
    const response = await adminFetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(settingsForm),
    });
    if (response.ok) {
      originalSettingsForm = JSON.stringify(settingsForm);
      updateToast(tid, '設定已更新', 'success');
      return true;
    } else {
      updateToast(tid, '設定更新失敗', 'error');
      return false;
    }
  }

  async function saveBrandAliases() {
    const tid = notifyProgress('儲存品牌對照中...');
    const aliases = brandAliasRows
      .map((item) => ({ sourceBrand: item.sourceBrand.trim(), displayName: item.displayName.trim(), urlSlug: item.urlSlug.trim(), iconUrl: item.iconUrl ?? null }))
      .filter((item) => item.sourceBrand && item.displayName);
    const response = await adminFetch('/api/admin/brand-aliases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aliases }),
    });
    updateToast(tid, response.ok ? '品牌對照已更新' : '品牌對照更新失敗', response.ok ? 'success' : 'error');
  }

  const destructiveStatuses = new Set(['sold', 'archived']);
  const statusConfirmTexts: Record<string, string> = {
    sold: '確定要將此車設為「已售出」嗎？將會在公開網頁顯示為已售。',
    archived: '確定要封存此車嗎？封存後不會顯示在後台列表，僅能透過資料庫還原。',
  };

  function syncSelectedVehicleStatus(id: string, status: VehicleView['status']) {
    vehicles = vehicles.map((vehicle) => (vehicle.id === id ? { ...vehicle, status } : vehicle));
    if (selectedId !== id) return;
    vehicleForm.status = status;
    const baseline = JSON.parse(vehicleFormBaseline || '{}');
    baseline.status = status;
    vehicleFormBaseline = JSON.stringify(baseline);
  }

  async function setStatus(id: string, status: string) {
    if (destructiveStatuses.has(status)) {
      const ok = await confirmDialog('請確認狀態變更', statusConfirmTexts[status] || '確定要執行此操作嗎？', true);
      if (!ok) return;
    }
    const response = await adminFetch(`/api/admin/vehicles/${id}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (response.ok) {
      syncSelectedVehicleStatus(id, status as VehicleView['status']);
      notifySuccess(`已將「${vehicles.find((v) => v.id === id)?.title || '車輛'}」設為${statusLabels[status as VehicleView['status']] || status}`);
    } else {
      notifyError('車輛狀態更新失敗');
    }
  }

  function insertAtCursor(field: TemplateField, snippet: string) {
    const ta = document.querySelector<HTMLTextAreaElement>(`textarea[data-template-field="${field}"]`);
    if (!ta) {
      settingsForm[field] = `${settingsForm[field]}${snippet}`;
      return;
    }
    const wasFocused = document.activeElement === ta;
    const start = wasFocused ? (ta.selectionStart ?? ta.value.length) : ta.value.length;
    const end = wasFocused ? (ta.selectionEnd ?? ta.value.length) : ta.value.length;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    settingsForm[field] = before + snippet + after;
    setTimeout(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, 0);
  }

  function insertTemplateToken(field: TemplateField, token: string) {
    insertAtCursor(field, `{${token}}`);
  }

  function insertTemplateLineBreak(field: TemplateField) {
    insertAtCursor(field, '\n');
  }

  $effect(() => {
    const resize = (ta: HTMLTextAreaElement) => {
      ta.style.height = 'auto';
      ta.style.height = `${Math.max(ta.scrollHeight + 2, 80)}px`;
    };
    const ensureAttached = () => {
      const textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea[data-autoresize]');
      textareas.forEach((ta) => {
        if (!(ta as HTMLTextAreaElement & { __resize?: boolean }).__resize) {
          (ta as HTMLTextAreaElement & { __resize?: boolean }).__resize = true;
          ta.addEventListener('input', () => resize(ta));
        }
        resize(ta);
      });
    };
    ensureAttached();
    const details = document.querySelectorAll<HTMLDetailsElement>('details.settings-section');
    const onToggle = () => window.setTimeout(ensureAttached, 0);
    details.forEach((d) => d.addEventListener('toggle', onToggle));
    const interval = window.setInterval(ensureAttached, 800);
    return () => {
      details.forEach((d) => d.removeEventListener('toggle', onToggle));
      window.clearInterval(interval);
    };
  });

  $effect(() => {
    const isDirty = settingsFormDirty || vehicleFormDirty;
    const handler = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  });

  $effect(() => {
    const isInputTarget = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
    };
    const handler = (event: KeyboardEvent) => {
      const cmdKey = event.metaKey || event.ctrlKey;
      if (cmdKey && event.key.toLowerCase() === 's') {
        const targetForm = mode === 'settings' || mode === 'contact'
          ? document.querySelector<HTMLFormElement>('.settings-form')
          : mode === 'vehicles'
            ? document.querySelector<HTMLFormElement>('.vehicle-edit-form')
            : null;
        if (targetForm) {
          event.preventDefault();
          targetForm.requestSubmit();
        }
        return;
      }
      if (!isInputTarget(document.activeElement) && event.key === '/') {
        const search = document.querySelector<HTMLInputElement>('.admin-search input');
        if (search) {
          event.preventDefault();
          search.focus();
          search.select();
        }
        return;
      }
      if (!isInputTarget(document.activeElement) && event.key.toLowerCase() === 'n' && mode === 'vehicles') {
        if (!vehicleFormDirty) {
          event.preventDefault();
          resetVehicleForm();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          const firstInput = document.querySelector<HTMLInputElement>('.vehicle-edit-form input[name], .vehicle-edit-form input');
          firstInput?.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  type ConfirmRequest = { title: string; body: string; danger: boolean; resolve: (ok: boolean) => void };
  let confirmRequest = $state<ConfirmRequest | null>(null);
  function confirmDialog(title: string, body: string, danger = false): Promise<boolean> {
    return new Promise((resolve) => { confirmRequest = { title, body, danger, resolve }; });
  }
  function answerConfirm(ok: boolean) {
    confirmRequest?.resolve(ok);
    confirmRequest = null;
  }

  function exportSettings() {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), settings: settingsForm }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `site-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notifySuccess('已匯出網站設定');
  }

  function addBrandAliasRow() {
    const used = new Set(brandAliasRows.map((row) => row.sourceBrand));
    const sourceBrand = sourceBrandOptions.find((brand) => !used.has(brand)) || sourceBrandOptions[0] || '';
    brandAliasRows = [...brandAliasRows, { sourceBrand, displayName: '', urlSlug: '', iconUrl: null }];
  }

  async function handleBrandIconUpload(e: Event, alias: BrandAliasRow) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('files', file);
    const res = await adminFetch('/api/admin/media', { method: 'POST', body: formData });
    if (!res.ok) { notifyError('上傳失敗'); return; }
    const json = await res.json().catch(() => ({}));
    alias.iconUrl = json.urls?.[0] ?? null;
    brandAliasRows = [...brandAliasRows];
  }

  function removeBrandAliasRow(index: number) {
    brandAliasRows = brandAliasRows.filter((_, rowIndex) => rowIndex !== index);
  }

  function countStatus(status: VehicleView['status']) {
    return vehicles.filter((vehicle) => vehicle.status === status).length;
  }

  const statusLabels: Record<VehicleView['status'], string> = {
    draft: '草稿',
    published: '在庫',
    incoming: '未到港',
    reserved: '收訂',
    special: '特殊',
    unknown: '狀態未確認',
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
    if (vehicle.showSoldCase) parts.push('成交案例');
    return parts.join('｜');
  }

  function imageUrls() {
    return vehicleForm.imagesText.split('\n').map((item) => item.trim()).filter(Boolean);
  }

  function setImageUrls(urls: string[]) {
    vehicleForm.imagesText = urls.filter(Boolean).join('\n');
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    isUploadingImages = true;
    uploadProgress = { current: 0, total: files.length };
    const tid = notifyProgress(`圖片上傳中 (0/${files.length})...`);
    const formData = new FormData();
    for (const file of files) formData.append('files', file);
    const response = await adminFetch('/api/admin/media', { method: 'POST', body: formData });
    const result = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(result.urls)) {
      setImageUrls([...imageUrls(), ...result.urls]);
      updateToast(tid, `已上傳 ${result.urls.length} 張圖片`, 'success');
    } else {
      updateToast(tid, result.error || '圖片上傳失敗', 'error');
    }
    isUploadingImages = false;
    uploadProgress = { current: 0, total: 0 };
  }

  async function uploadVehicleImages(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';
    await uploadFiles(files);
  }

  let isDragOver = $state(false);
  function handleImageDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    const files = Array.from(event.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length) uploadFiles(files);
  }
  function handleImageDragOver(event: DragEvent) {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    isDragOver = true;
  }
  function handleImageDragLeave() { isDragOver = false; }

  function handleImagePaste(event: ClipboardEvent) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageFiles = items
      .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    if (imageFiles.length) {
      event.preventDefault();
      uploadFiles(imageFiles);
    }
  }

  function setAsCover(index: number) {
    if (index === 0) return;
    const urls = imageUrls();
    const [item] = urls.splice(index, 1);
    urls.unshift(item);
    setImageUrls(urls);
    notify('已設為封面');
  }

  function addFeature(value: string) {
    const v = value.trim();
    if (!v) return;
    const existing = vehicleForm.featuresText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (existing.includes(v)) return;
    existing.push(v);
    vehicleForm.featuresText = existing.join('\n');
  }
  function removeFeature(idx: number) {
    const existing = vehicleForm.featuresText.split('\n').map((s) => s.trim()).filter(Boolean);
    existing.splice(idx, 1);
    vehicleForm.featuresText = existing.join('\n');
  }
  const currentFeatures = $derived(vehicleForm.featuresText.split('\n').map((s) => s.trim()).filter(Boolean));
  let featureDraft = $state('');
  function commitFeatureDraft() {
    if (!featureDraft.trim()) return;
    addFeature(featureDraft);
    featureDraft = '';
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
      showSoldCase: false,
      headline: '',
      description: '',
      featuresText: '',
      imagesText: '',
    };
  }

  function editVehicle(vehicle: VehicleView) {
    if (vehicleFormDirty && !window.confirm('目前編輯中尚未儲存，要切換到別台車嗎？變更會遺失。')) return;
    selectedId = vehicle.id;
    const next = {
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
      showSoldCase: vehicle.showSoldCase,
      headline: vehicle.headline,
      description: vehicle.description,
      featuresText: vehicle.features.join('\n'),
      imagesText: vehicle.images.map((image) => image.url).join('\n'),
    };
    vehicleForm = next;
    vehicleFormBaseline = JSON.stringify(next);
  }

  function resetVehicleForm() {
    if (vehicleFormDirty && !window.confirm('目前編輯中尚未儲存，確定要清空？')) return;
    selectedId = null;
    vehicleForm = emptyVehicleForm();
    vehicleFormBaseline = JSON.stringify(vehicleForm);
  }

  function duplicateVehicle(vehicle: VehicleView) {
    if (vehicleFormDirty && !window.confirm('目前編輯中尚未儲存，確定要切換？變更會遺失。')) return;
    selectedId = null;
    const next = {
      title: `${vehicle.title}（複本）`,
      cardTitleSupplement: vehicle.cardTitleSupplement,
      slug: '',
      brand: vehicle.brand,
      model: vehicle.model,
      subModel: vehicle.subModel,
      year: vehicle.year,
      mileage: vehicle.mileage,
      exteriorColor: vehicle.exteriorColor,
      interiorColor: vehicle.interiorColor,
      condition: vehicle.condition,
      status: 'draft' as VehicleView['status'],
      monthlyRecommended: false,
      showSoldCase: false,
      headline: vehicle.headline,
      description: vehicle.description,
      featuresText: vehicle.features.join('\n'),
      imagesText: vehicle.images.map((image) => image.url).join('\n'),
    };
    vehicleForm = next;
    vehicleFormBaseline = JSON.stringify(next);
    notify('已建立草稿副本，請修改後儲存');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveVehicle() {
    const tid = notifyProgress('儲存車輛中...');
    const response = await adminFetch('/api/admin/vehicles', {
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
      updateToast(tid, '車輛已儲存，正在重新載入最新資料...', 'success');
      selectedId = null;
      vehicleForm = emptyVehicleForm();
      vehicleFormBaseline = JSON.stringify(vehicleForm);
      window.setTimeout(() => window.location.reload(), 700);
    } else {
      updateToast(tid, '車輛儲存失敗，請確認標題、品牌、型號與圖片', 'error');
    }
  }

  async function importCarsmeetVehicle() {
    const url = carsmeetImportUrl.trim();
    if (!url) {
      notifyError('請先貼上 Carsmeet 車輛網址');
      return;
    }
    if (vehicleFormDirty && !window.confirm('目前編輯中尚未儲存，匯入後會重新載入頁面。確定要繼續？')) return;
    isImportingCarsmeet = true;
    const tid = notifyProgress('正在從 Carsmeet 匯入車輛...');
    try {
      const response = await adminFetch('/api/admin/vehicles/import-carsmeet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.vehicleId) {
        updateToast(tid, `已匯入「${result.title || 'Carsmeet 車輛'}」，共 ${result.imageCount || 0} 張圖片，正在開啟草稿...`, 'success');
        carsmeetImportUrl = '';
        window.setTimeout(() => {
          window.location.href = `/admin/vehicles?focus=${encodeURIComponent(result.vehicleId)}`;
        }, 700);
      } else {
        updateToast(tid, result.error || 'Carsmeet 匯入失敗，請確認網址', 'error');
      }
    } finally {
      isImportingCarsmeet = false;
    }
  }

  let vehicleSearch = $state('');
  let lightboxImage = $state<string | null>(null);

  type StatusFilter = 'all' | VehicleView['status'];
  type AdminSort = 'recent' | 'oldest' | 'title' | 'year-desc' | 'year-asc' | 'mileage-asc';
  const PAGE_SIZE = 20;
  let statusFilter = $state<StatusFilter>('all');
  let adminSort = $state<AdminSort>('recent');
  let currentPage = $state(1);
  let selectedIds = $state<Set<string>>(new Set());
  let focusApplied = $state(false);

  function adminNumericValue(raw: string): number {
    const match = String(raw || '').replace(/[^\d.]/g, '');
    const n = Number.parseFloat(match);
    return Number.isFinite(n) ? n : Number.NaN;
  }

  const filteredVehicles = $derived.by(() => {
    const q = vehicleSearch.trim().toLowerCase();
    let list = vehicles.filter((v) => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (!q) return true;
      return v.title.toLowerCase().includes(q)
        || v.brand.toLowerCase().includes(q)
        || v.model.toLowerCase().includes(q)
        || v.slug.toLowerCase().includes(q);
    });
    list = [...list];
    if (adminSort === 'recent') list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    else if (adminSort === 'oldest') list.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    else if (adminSort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
    else if (adminSort === 'year-desc') list.sort((a, b) => (adminNumericValue(b.year) || 0) - (adminNumericValue(a.year) || 0));
    else if (adminSort === 'year-asc') list.sort((a, b) => (adminNumericValue(a.year) || 9999) - (adminNumericValue(b.year) || 9999));
    else if (adminSort === 'mileage-asc') list.sort((a, b) => (adminNumericValue(a.mileage) || Infinity) - (adminNumericValue(b.mileage) || Infinity));
    return list;
  });
  const vehicleSearchSuggestions = $derived.by(() => Array.from(new Set(
    vehicles.flatMap((v) => [
      v.title,
      v.brand,
      v.model,
      v.subModel,
      v.year,
      v.slug,
    ].filter((value): value is string => Boolean(value && String(value).trim())))
  )).sort((a, b) => a.localeCompare(b, 'zh-Hant')));

  const totalPages = $derived(Math.max(1, Math.ceil(filteredVehicles.length / PAGE_SIZE)));
  const visibleVehicles = $derived.by(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredVehicles.slice(start, start + PAGE_SIZE);
  });

  $effect(() => {
    // reset page when filters change
    statusFilter; vehicleSearch; adminSort;
    currentPage = 1;
  });

  $effect(() => {
    if (mode !== 'vehicles' || focusApplied) return;
    const focusId = new URLSearchParams(window.location.search).get('focus');
    focusApplied = true;
    if (!focusId) return;
    const vehicle = vehicles.find((v) => v.id === focusId);
    if (!vehicle) return;
    const index = filteredVehicles.findIndex((v) => v.id === focusId);
    if (index >= 0) currentPage = Math.floor(index / PAGE_SIZE) + 1;
    window.setTimeout(() => {
      editVehicle(vehicle);
      document.querySelector('.vehicle-edit-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  });

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedIds = next;
  }
  function toggleSelectAllVisible() {
    const visibleIds = visibleVehicles.map((v) => v.id);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    selectedIds = next;
  }
  function clearSelection() { selectedIds = new Set(); }

  async function batchSetStatus(status: VehicleView['status']) {
    if (selectedIds.size === 0) return;
    if (destructiveStatuses.has(status)) {
      if (!window.confirm(`確定要將 ${selectedIds.size} 台車設為「${statusLabels[status]}」？此操作無法復原。`)) return;
    }
    const tid = notifyProgress(`正在更新 ${selectedIds.size} 台車...`);
    const ids = Array.from(selectedIds);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      const response = await adminFetch(`/api/admin/vehicles/${id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (response.ok) {
        ok += 1;
        syncSelectedVehicleStatus(id, status);
      } else {
        fail += 1;
      }
    }
    if (fail === 0) {
      updateToast(tid, `已將 ${ok} 台車設為「${statusLabels[status]}」`, 'success');
    } else {
      updateToast(tid, `${ok} 台成功、${fail} 台失敗`, 'error');
    }
    clearSelection();
  }

  function exportCsv() {
    const rows = filteredVehicles;
    if (rows.length === 0) {
      notifyError('沒有可匯出的資料');
      return;
    }
    const headers = ['網址代號', '標題', '品牌', '型號', '規格', '年份', '里程', '外觀色', '內裝色', '車況', '狀態', '本月推薦', '成交案例', '更新時間', '網址'];
    const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [headers.join(',')];
    for (const v of rows) {
      lines.push([
        v.slug, v.title, v.brand, v.model, v.subModel, v.year, v.mileage,
        v.exteriorColor, v.interiorColor, v.condition,
        statusLabels[v.status], v.monthlyRecommended ? '是' : '否', v.showSoldCase ? '是' : '否',
        v.updatedAt, `/cars/${v.slug}`,
      ].map(escape).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vehicles-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notifySuccess(`已匯出 ${rows.length} 筆車輛資料`);
  }

  function formatUpdatedAt(raw: string): string {
    if (!raw) return '—';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return '剛剛';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分鐘前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小時前`;
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
    return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: '全部' },
    { value: 'draft', label: '草稿' },
    { value: 'published', label: '在庫' },
    { value: 'incoming', label: '未到港' },
    { value: 'reserved', label: '收訂' },
    { value: 'special', label: '特殊' },
    { value: 'unknown', label: '狀態未確認' },
    { value: 'unpublished', label: '已下架' },
    { value: 'sold', label: '已售出' },
    { value: 'archived', label: '已封存' },
  ];
  function statusFilterCount(s: StatusFilter): number {
    if (s === 'all') return vehicles.length;
    return vehicles.filter((v) => v.status === s).length;
  }

  function previewUrl(vehicle: VehicleView): string {
    return `/cars/${vehicle.slug}`;
  }

  const defaultPreviewVehicle = vehicles.find((v) => v.status === 'published') || vehicles[0] || null;
  let previewVehicleId = $state<string>(defaultPreviewVehicle?.id || '');
  const previewVehicle = $derived(vehicles.find((v) => v.id === previewVehicleId) || defaultPreviewVehicle);
  const previewSiteUrl = $derived(previewVehicle ? `/cars/${previewVehicle.slug}` : '/');
</script>

<section class="admin-panel hero-panel">
  <div>
    <p class="admin-eyebrow">私人精品車展</p>
    <h1>{mode === 'overview' ? '管理後台' : mode === 'settings' ? '網站設定' : mode === 'contact' ? '聯絡與品牌' : '車輛管理'}</h1>
    <p>{mode === 'overview' ? '查看目前上架概況，並進入各管理區調整內容。' : mode === 'settings' ? '調整首頁、列表、詳情頁文案與網站外觀。' : mode === 'contact' ? '管理電話、LINE、社群連結與品牌英文顯示對照。' : '新增車輛、修改顧問描述、調整上架狀態。'}</p>
  </div>
  <a class="admin-button" href="/cars">前往公開網頁</a>
</section>

{#if toasts.length > 0}
  <div class="toast-stack" role="status" aria-live="polite">
    {#each toasts as toast (toast.id)}
      <div class={`toast toast--${toast.level}`}>
        {#if toast.level === 'progress'}
          <span class="toast__spinner" aria-hidden="true"></span>
        {/if}
        <span class="toast__text">{toast.text}</span>
        <button type="button" class="toast__close" aria-label="關閉訊息" onclick={() => dismissToast(toast.id)}>×</button>
      </div>
    {/each}
  </div>
{/if}

{#if mode === 'overview'}
  {@const newThisWeek = vehicles.filter((v) => Date.now() - new Date(v.createdAt).getTime() < 7 * 86400000).length}
  {@const missingCover = vehicles.filter((v) => !v.coverImage && v.status !== 'archived')}
  {@const missingDescription = vehicles.filter((v) => !v.description.trim() && v.status !== 'archived')}
  {@const recentlyEdited = [...vehicles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)}

  <section class="overview-kpis">
    <article class="overview-kpi">
      <span>總車輛</span>
      <strong>{vehicles.length}</strong>
      <small>含所有狀態</small>
    </article>
    <article class="overview-kpi">
      <span>上架中</span>
      <strong>{countStatus('published')}</strong>
      <small>公開網頁顯示</small>
    </article>
    <article class="overview-kpi">
      <span>草稿</span>
      <strong>{countStatus('draft')}</strong>
      <small>尚未上架</small>
    </article>
    <article class="overview-kpi">
      <span>已售出</span>
      <strong>{countStatus('sold')}</strong>
      <small>累計成交</small>
    </article>
    <article class="overview-kpi overview-kpi--accent">
      <span>本週新增</span>
      <strong>{newThisWeek}</strong>
      <small>近 7 天建立的車輛</small>
    </article>
  </section>

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

  <section class="admin-grid admin-grid--single">
    <article class="admin-panel">
      <h2>待辦事項</h2>
      {#if missingCover.length === 0 && missingDescription.length === 0}
        <p class="admin-empty" style="border: 0; padding: 0.5rem 0;">目前沒有需要處理的車輛資料 ✓</p>
      {:else}
        {#if missingCover.length > 0}
          <div class="todo-row">
            <span class="todo-row__label">缺封面圖片</span>
            <strong>{missingCover.length} 台</strong>
            <div class="todo-row__list">
              {#each missingCover.slice(0, 3) as v}
                <a href="/admin/vehicles?focus={v.id}">{v.title}</a>
              {/each}
              {#if missingCover.length > 3}<span>...等 {missingCover.length - 3} 台</span>{/if}
            </div>
          </div>
        {/if}
        {#if missingDescription.length > 0}
          <div class="todo-row">
            <span class="todo-row__label">缺顧問描述</span>
            <strong>{missingDescription.length} 台</strong>
            <div class="todo-row__list">
              {#each missingDescription.slice(0, 3) as v}
                <a href="/admin/vehicles?focus={v.id}">{v.title}</a>
              {/each}
              {#if missingDescription.length > 3}<span>...等 {missingDescription.length - 3} 台</span>{/if}
            </div>
          </div>
        {/if}
      {/if}
    </article>

    <article class="admin-panel">
      <h2>最近編輯</h2>
      {#if recentlyEdited.length === 0}
        <p class="admin-empty" style="border: 0; padding: 0.5rem 0;">還沒有車輛資料</p>
      {:else}
        <ul class="recent-edits">
          {#each recentlyEdited as v}
            <li>
              <a href="/admin/vehicles?focus={v.id}">{v.title}</a>
              <small>{statusLabels[v.status]}｜{formatUpdatedAt(v.updatedAt)}</small>
            </li>
          {/each}
        </ul>
      {/if}
    </article>
  </section>
{/if}

{#if mode === 'settings'}
  <form class="admin-panel settings-form" onsubmit={(event) => { event.preventDefault(); saveSettings(); }}>
    {#if settingsFormDirty}
      <div class="dirty-banner" role="status">有未儲存的變更</div>
    {/if}
    <details class="settings-section" open>
      <summary>網站名稱與業務</summary>
      <div class="settings-section__body">
        <label>網站名稱 <input bind:value={settingsForm.siteName} /></label>
        <label>業務顯示名稱 <input bind:value={settingsForm.salespersonName} /></label>
        <div class="site-icon-editor">
          <div class="site-icon-editor__preview" aria-label="網站 icon 預覽">
            {#if settingsForm.siteIconUrl}
              <img src={settingsForm.siteIconUrl} alt="網站 icon 預覽" />
            {:else}
              <span>{(settingsForm.siteName || '車').slice(0, 1)}</span>
            {/if}
          </div>
          <div class="site-icon-editor__body">
            <strong>瀏覽器分頁 icon</strong>
            <p class="form-hint">建議上傳正方形 PNG/WebP，至少 256×256。會套用到公開頁、後台與登入頁。</p>
            <div class="site-icon-editor__actions">
              <label class="upload-button">
                {settingsForm.siteIconUrl ? '更換網站 icon' : '上傳網站 icon'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange={uploadSiteIcon} />
              </label>
              {#if settingsForm.siteIconUrl}
                <button type="button" class="secondary-button" onclick={clearSiteIcon}>清除 icon</button>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </details>

    <details class="settings-section" open>
      <summary>首頁文案</summary>
      <div class="settings-section__body">
        <label>首頁小標 <input bind:value={settingsForm.homepageEyebrow} /></label>
        <label>首頁主標 <textarea data-autoresize bind:value={settingsForm.homepageTitle}></textarea></label>
        <label>首頁說明 <textarea data-autoresize bind:value={settingsForm.homepageLead}></textarea></label>
        <label>首頁形象短句 <textarea data-autoresize bind:value={settingsForm.homepageNote}></textarea></label>
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
      </div>
    </details>

    <details class="settings-section">
      <summary>列表與詳情文案</summary>
      <div class="settings-section__body">
        <label>列表小標 <input bind:value={settingsForm.listingEyebrow} /></label>
        <label>列表主標 <textarea data-autoresize bind:value={settingsForm.listingTitle}></textarea></label>
        <label>列表說明 <textarea data-autoresize bind:value={settingsForm.listingLead}></textarea></label>
        <div class="template-builder">
          <label>卡片標題模板 <textarea data-autoresize data-template-field="cardTitleTemplate" bind:value={settingsForm.cardTitleTemplate} placeholder={cardTitleTemplatePlaceholder}></textarea></label>
          <div class="token-picker" aria-label="卡片標題變數">
            {#each cardTitleTokens as token}
              <button type="button" aria-label={`插入${token}`} onclick={() => insertTemplateToken('cardTitleTemplate', token)}>{token}</button>
            {/each}
            <button type="button" aria-label="插入換行" onclick={() => insertTemplateLineBreak('cardTitleTemplate')}>換行</button>
          </div>
          <p class="form-hint">按按鈕會插入到游標位置（若沒對焦輸入框則插在末尾），換行會保留，空白行會自動移除。</p>
        </div>
        <label>詳情備註小標 <input bind:value={settingsForm.detailNotesEyebrow} /></label>
        <label>詳情備註標題 <input bind:value={settingsForm.detailNotesTitle} /></label>
        <div class="template-builder">
          <label>分享訊息模板 <textarea data-autoresize data-template-field="shareMessageTemplate" bind:value={settingsForm.shareMessageTemplate} placeholder={shareTemplatePlaceholder}></textarea></label>
          <div class="token-picker" aria-label="分享訊息變數">
            {#each shareTemplateTokens as token}
              <button type="button" aria-label={`插入${token}`} onclick={() => insertTemplateToken('shareMessageTemplate', token)}>{token}</button>
            {/each}
            <button type="button" aria-label="插入換行" onclick={() => insertTemplateLineBreak('shareMessageTemplate')}>換行</button>
          </div>
          <p class="form-hint">按按鈕會插入到游標位置，不需要自己打括號。</p>
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
        <label>頁尾提醒 <textarea data-autoresize bind:value={settingsForm.footerDisclaimer}></textarea></label>
      </div>
    </details>

    <details class="settings-section">
      <summary>外觀（模板與風格）</summary>
      <div class="settings-section__body">
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
    <div class="theme-preview-controls">
      <label class="admin-sort">
        <span>預覽車輛</span>
        <select bind:value={previewVehicleId}>
          {#each vehicles as v}
            <option value={v.id}>{v.title}</option>
          {/each}
        </select>
      </label>
      <a class="secondary-button" href={previewSiteUrl} target="_blank" rel="noopener">在新分頁開啟前台預覽 ↗</a>
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
      </div>
    </details>

    <details class="settings-section">
      <summary>照片展示模式</summary>
      <div class="settings-section__body">
        <div class="setting-group">
          <label>照片展示模式</label>
          <div class="radio-group">
            {#each [
              { value: 'lightbox', label: '展開式 Lightbox（預設）' },
              { value: 'slider', label: '全寬輪播 Slider' },
              { value: 'thumbnail-strip', label: '主圖 + 縮圖列' },
              { value: 'grid', label: '瀑布格 Grid' },
            ] as mode}
              <label class="radio-label">
                <input type="radio" name="galleryMode" value={mode.value} bind:group={settingsForm.galleryMode} />
                {mode.label}
              </label>
            {/each}
          </div>
        </div>
      </div>
    </details>

    <details class="settings-section">
      <summary>外部匯入與公開狀態</summary>
      <div class="settings-section__body">
        <label>外部來源新車輛預設
          <select bind:value={settingsForm.importBehavior}>
            <option value="draft_first">先存為草稿，需手動上架</option>
            <option value="auto_publish">自動上架到公開網頁</option>
            <option value="import_only">只匯入但不顯示在公開網頁</option>
          </select>
        </label>
        <label class="checkbox-row"><input type="checkbox" bind:checked={settingsForm.showSoldVehicles} /> 公開網頁顯示已售出車輛</label>
      </div>
    </details>

    <div class="settings-save-bar">
      <span class="settings-save-bar__hint">{settingsFormDirty ? '有未儲存的變更（Cmd/Ctrl+S 可儲存）' : '所有設定已是最新狀態'}</span>
      <button type="button" class="secondary-button" onclick={exportSettings}>匯出設定</button>
      <button class="admin-button" type="submit" disabled={!settingsFormDirty}>儲存設定</button>
    </div>
  </form>
{/if}

{#if confirmRequest}
  <div class="confirm-overlay" role="dialog" aria-modal="true" onclick={() => answerConfirm(false)}>
    <div class="confirm-card" onclick={(e) => e.stopPropagation()}>
      <h3>{confirmRequest.title}</h3>
      <p>{confirmRequest.body}</p>
      <div class="confirm-actions">
        <button type="button" class="secondary-button" onclick={() => answerConfirm(false)}>取消</button>
        <button type="button" class={confirmRequest.danger ? 'admin-button confirm-danger' : 'admin-button'} onclick={() => answerConfirm(true)}>確認</button>
      </div>
    </div>
  </div>
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

      <h3>社群平台自訂圖示</h3>
      <p class="form-hint">每個平台可上傳專屬圖示、調整縮放/位置、設定底色（讓圖片的方形邊界與圓 chip 同色，視覺上看不到裁切）。</p>
      <div class="bg-all-row">
        <span>批次套用底色到所有已上傳的 icon：</span>
        <button type="button" onclick={() => applyBgToAll('#ffffff')} style="background:#fff;color:#000;">白色</button>
        <button type="button" onclick={() => applyBgToAll('#0b0a09')} style="background:#0b0a09;color:#fff;">黑色</button>
        <button type="button" onclick={() => applyBgToAll('#2f66ad')} style="background:#2f66ad;color:#fff;">主題藍</button>
        <button type="button" onclick={() => applyBgToAll('#06c755')} style="background:#06c755;color:#fff;">LINE 綠</button>
        <button type="button" onclick={() => applyBgToAll('')}>移除底色</button>
      </div>
      <div class="social-icon-editor">
        {#each socialPlatformList as platform}
          {@const cfg = settingsForm.socialIcons[platform.key]}
          <article class="social-icon-card">
            <div class="social-icon-card__head">
              <strong>{platform.label}</strong>
              {#if cfg?.url}
                <button type="button" class="row-button--danger" onclick={() => clearSocialIcon(platform.key)}>清除自訂</button>
              {/if}
            </div>
            <div class="social-icon-card__preview">
              {#if cfg?.url}
                <div class="social-icon-card__circle" style={cfg.bgColor ? `background: ${cfg.bgColor}; border-color: transparent;` : ''}>
                  <img src={cfg.url} alt={`${platform.label} 圖示預覽`} style={iconPreviewStyle(cfg)} />
                </div>
              {:else}
                <div class="social-icon-card__circle social-icon-card__circle--default" aria-label={`${platform.label} 主題預設圖示`}>
                  {@html defaultIconSvg(platform.key)}
                </div>
              {/if}
              <label class="upload-button">
                {uploadingPlatform === platform.key ? '上傳中...' : (cfg?.url ? '更換圖示' : '上傳圖示')}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onchange={(e) => uploadSocialIcon(platform.key, e)} disabled={uploadingPlatform !== null} />
              </label>
            </div>
            {#if cfg?.url}
              <div class="social-icon-card__controls">
                <label class="slider-row">
                  <span>縮放 {(cfg.zoom || 1).toFixed(2)}x（0.5x 縮到一半、1.0x 填滿邊緣）</span>
                  <input type="range" min="0.5" max="3" step="0.05" value={cfg.zoom || 1} oninput={(e) => updateIconField(platform.key, 'zoom', Number.parseFloat((e.currentTarget as HTMLInputElement).value))} />
                </label>
                <label class="slider-row">
                  <span>水平位置 {cfg.offsetX ?? 50}%</span>
                  <input type="range" min="0" max="100" step="1" value={cfg.offsetX ?? 50} oninput={(e) => updateIconField(platform.key, 'offsetX', Number.parseInt((e.currentTarget as HTMLInputElement).value, 10))} />
                </label>
                <label class="slider-row">
                  <span>垂直位置 {cfg.offsetY ?? 50}%</span>
                  <input type="range" min="0" max="100" step="1" value={cfg.offsetY ?? 50} oninput={(e) => updateIconField(platform.key, 'offsetY', Number.parseInt((e.currentTarget as HTMLInputElement).value, 10))} />
                </label>
                <label class="bg-row">
                  <span>底色</span>
                  <input type="color" value={cfg.bgColor || '#1a1612'} oninput={(e) => setIconBgColor(platform.key, (e.currentTarget as HTMLInputElement).value)} />
                  <button type="button" class="bg-clear" onclick={() => setIconBgColor(platform.key, '')} disabled={!cfg.bgColor}>清除</button>
                  {#if cfg.bgColor}<code>{cfg.bgColor}</code>{/if}
                </label>
              </div>
            {/if}
          </article>
        {/each}
      </div>

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
            <div class="brand-icon-field">
              {#if row.iconUrl}
                <img src={row.iconUrl} alt={row.displayName} width="32" height="32" style="object-fit:contain;border-radius:50%;background:#fff;border:1px solid #ddd;" />
                <button type="button" onclick={() => { row.iconUrl = null; brandAliasRows = [...brandAliasRows]; }} title="移除圖示" style="background:none;border:none;cursor:pointer;color:#999;font-size:1rem;">✕</button>
              {:else}
                <label style="cursor:pointer;font-size:0.8rem;color:#888;display:flex;align-items:center;gap:4px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                  圖示
                  <input type="file" accept="image/*" style="display:none" onchange={(e) => handleBrandIconUpload(e, row)} />
                </label>
              {/if}
            </div>
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
    <form class="carsmeet-import" onsubmit={(event) => { event.preventDefault(); importCarsmeetVehicle(); }}>
      <div>
        <strong>從 Carsmeet 官網匯入</strong>
        <p class="form-hint">貼上車輛網址，例如 https://carsmeet.tw/265/，匯入後會建立草稿供你檢查。</p>
      </div>
      <div class="carsmeet-import__actions">
        <input type="url" bind:value={carsmeetImportUrl} placeholder="https://carsmeet.tw/265/" inputmode="url" disabled={isImportingCarsmeet} />
        <button type="submit" class="secondary-button" disabled={isImportingCarsmeet || !carsmeetImportUrl.trim()}>{isImportingCarsmeet ? '匯入中...' : '一鍵匯入'}</button>
      </div>
    </form>
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
          <option value="published">在庫</option>
          <option value="incoming">未到港</option>
          <option value="reserved">收訂</option>
          <option value="special">特殊</option>
          <option value="unknown">狀態未確認</option>
          <option value="unpublished">下架</option>
          <option value="sold">已售</option>
          <option value="archived">封存</option>
        </select>
      </label>
      <label class="checkbox-row"><input type="checkbox" bind:checked={vehicleForm.monthlyRecommended} /> 本月推薦</label>
      <label class="checkbox-row"><input type="checkbox" bind:checked={vehicleForm.showSoldCase} /> 顯示於成交案例</label>
      <p class="form-hint">只有狀態為「已售」且勾選此項的車，才會出現在首頁成交案例。</p>
      <label>顧問標題 <input bind:value={vehicleForm.headline} /></label>
      <label>顧問描述 <textarea data-autoresize bind:value={vehicleForm.description}></textarea></label>

      <div class="feature-editor">
        <strong>配備亮點</strong>
        <p class="form-hint">輸入後按 Enter 加入，點 × 移除。每項顯示為一個 chip。</p>
        {#if currentFeatures.length > 0}
          <div class="feature-chips">
            {#each currentFeatures as feat, i}
              <span class="feature-chip">{feat}<button type="button" aria-label={`移除 ${feat}`} onclick={() => removeFeature(i)}>×</button></span>
            {/each}
          </div>
        {/if}
        <div class="feature-input">
          <input bind:value={featureDraft} placeholder="例如 Black Badge 套件" onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitFeatureDraft(); } }} />
          <button type="button" class="secondary-button" onclick={commitFeatureDraft} disabled={!featureDraft.trim()}>加入</button>
        </div>
      </div>

      <div class="image-manager" class:is-drag-over={isDragOver}
        ondragover={handleImageDragOver} ondragleave={handleImageDragLeave} ondrop={handleImageDrop} onpaste={handleImagePaste}>
        <div class="image-manager__header">
          <div>
            <strong>車輛圖片</strong>
            <p class="form-hint">可上傳多張圖片、拖曳區塊內、或剪貼簿貼上（Ctrl/Cmd+V）。第一張作封面。</p>
          </div>
          <label class="upload-button">
            {isUploadingImages ? `上傳中... (${uploadProgress.total} 張)` : '上傳圖片'}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onchange={uploadVehicleImages} disabled={isUploadingImages} />
          </label>
        </div>
        {#if isDragOver}
          <div class="image-dropzone-hint">放開即可上傳檔案</div>
        {/if}
        {#if imageUrls().length}
          <div class="image-sort-list">
            {#each imageUrls() as url, index}
              <article class="image-sort-item" class:is-cover={index === 0} class:is-dragging={draggedImageIndex === index} draggable="true" ondragstart={() => { draggedImageIndex = index; }} ondragover={(event) => event.preventDefault()} ondrop={() => dropImage(index)} ondragend={() => { draggedImageIndex = null; }}>
                <button type="button" class="image-sort-item__thumb" onclick={() => { lightboxImage = url; }} aria-label={`預覽圖片 ${index + 1}`}>
                  <img src={url} alt={`車輛圖片 ${index + 1}`} loading="lazy" />
                </button>
                <span class="image-sort-item__index">{index + 1} / {imageUrls().length}</span>
                <div class="image-sort-actions">
                  {#if index !== 0}
                    <button type="button" onclick={() => setAsCover(index)}>設封面</button>
                  {/if}
                  <button type="button" onclick={() => moveImage(index, index - 1)} disabled={index === 0}>←</button>
                  <button type="button" onclick={() => moveImage(index, index + 1)} disabled={index === imageUrls().length - 1}>→</button>
                  <button type="button" class="row-button--danger" onclick={() => removeImage(index)}>✕</button>
                </div>
              </article>
            {/each}
          </div>
        {/if}
        <label>圖片網址（進階，一行一張） <textarea data-autoresize bind:value={vehicleForm.imagesText}></textarea></label>
      </div>
      <div class="row-actions form-actions">
        <button type="submit">儲存車輛</button>
        <button type="button" onclick={resetVehicleForm}>清空</button>
        {#if selectedId}
          <button type="button" onclick={() => { const cur = vehicles.find((v) => v.id === selectedId); if (cur) duplicateVehicle(cur); }}>複製為新車</button>
        {/if}
      </div>
    </form>
    <div class="admin-list-toolbar">
      <label class="admin-search">
        <span>搜尋車輛</span>
        <input type="search" bind:value={vehicleSearch} placeholder="輸入標題、品牌、型號或網址代號" list="admin-vehicle-search-suggestions" autocomplete="off" />
        <datalist id="admin-vehicle-search-suggestions">
          {#each vehicleSearchSuggestions as suggestion}
            <option value={suggestion}></option>
          {/each}
        </datalist>
      </label>
      <label class="admin-sort">
        <span>排序</span>
        <select bind:value={adminSort}>
          <option value="recent">最近更新</option>
          <option value="oldest">最早更新</option>
          <option value="title">標題 A→Z</option>
          <option value="year-desc">年份新→舊</option>
          <option value="year-asc">年份舊→新</option>
          <option value="mileage-asc">里程少→多</option>
        </select>
      </label>
      <button type="button" class="secondary-button" onclick={exportCsv}>匯出 CSV</button>
    </div>

    <div class="status-filter-chips" role="tablist" aria-label="狀態篩選">
      {#each STATUS_FILTERS as f}
        <button type="button" role="tab" aria-selected={statusFilter === f.value} class:is-active={statusFilter === f.value} onclick={() => { statusFilter = f.value; }}>
          {f.label} <span>{statusFilterCount(f.value)}</span>
        </button>
      {/each}
      <span class="status-filter-summary">顯示 {filteredVehicles.length} / 總共 {vehicles.length}</span>
    </div>

    {#if selectedIds.size > 0}
      <div class="batch-bar" role="region" aria-label="批次操作">
        <span>已選 <strong>{selectedIds.size}</strong> 台</span>
        <div class="batch-bar__actions">
          <button type="button" onclick={() => batchSetStatus('published')}>批次在庫</button>
          <button type="button" onclick={() => batchSetStatus('incoming')}>批次未到港</button>
          <button type="button" onclick={() => batchSetStatus('reserved')}>批次收訂</button>
          <button type="button" onclick={() => batchSetStatus('unpublished')}>批次下架</button>
          <button type="button" class="row-button--warn" onclick={() => batchSetStatus('sold')}>批次已售</button>
          <button type="button" class="row-button--danger" onclick={() => batchSetStatus('archived')}>批次封存</button>
          <button type="button" class="secondary-button" onclick={clearSelection}>清除選擇</button>
        </div>
      </div>
    {/if}

    {#if visibleVehicles.length > 0}
      <div class="batch-toggle-all">
        <label class="checkbox-row">
          <input type="checkbox" checked={visibleVehicles.every((v) => selectedIds.has(v.id))} onchange={toggleSelectAllVisible} />
          全選目前頁面
        </label>
      </div>
    {/if}

    {#each visibleVehicles as vehicle}
      <article class="admin-car-row" class:is-selected={selectedIds.has(vehicle.id)}>
        <input type="checkbox" class="batch-checkbox" checked={selectedIds.has(vehicle.id)} onchange={() => toggleSelect(vehicle.id)} aria-label={`選擇 ${vehicle.title}`} />
        {#if vehicle.coverImage}
          <img src={vehicle.coverImage.url} alt={vehicle.title} />
        {:else}
          <div class="admin-car-row__placeholder" aria-label={`${vehicle.title} 尚未上傳封面`}>相片整理中</div>
        {/if}
        <div class="admin-car-row__info">
          <strong>{vehicle.cardTitle}</strong>
          <span>{adminCarMetaLine(vehicle)}</span>
          <small class="admin-car-row__updated">更新於 {formatUpdatedAt(vehicle.updatedAt)}</small>
        </div>
        <div class="row-actions">
          <button onclick={() => editVehicle(vehicle)}>編輯</button>
          <button type="button" onclick={() => duplicateVehicle(vehicle)}>複製</button>
          {#if vehicle.status !== 'sold' || settings.showSoldVehicles}
            <a class="row-button-link" href={`/cars/${vehicle.slug}`} target="_blank" rel="noopener">預覽</a>
          {:else}
            <span class="row-button-link row-button-link--disabled">預覽關閉</span>
          {/if}
          <button onclick={() => setStatus(vehicle.id, 'published')}>在庫</button>
          <button onclick={() => setStatus(vehicle.id, 'incoming')}>未到港</button>
          <button onclick={() => setStatus(vehicle.id, 'reserved')}>收訂</button>
          <button onclick={() => setStatus(vehicle.id, 'unpublished')}>下架</button>
          <button class="row-button--warn" onclick={() => setStatus(vehicle.id, 'sold')}>已售</button>
          <button class="row-button--danger" onclick={() => setStatus(vehicle.id, 'archived')}>封存</button>
        </div>
      </article>
    {/each}

    {#if filteredVehicles.length === 0}
      <p class="admin-empty">
        {vehicles.length === 0
          ? '目前還沒有任何車輛，先用上方表單新增第一台車吧。'
          : '沒有符合目前篩選條件的車輛。'}
      </p>
    {/if}

    {#if totalPages > 1}
      <div class="admin-pagination" role="navigation" aria-label="分頁">
        <button type="button" disabled={currentPage === 1} onclick={() => { currentPage -= 1; }}>‹ 上一頁</button>
        <span>第 {currentPage} / {totalPages} 頁</span>
        <button type="button" disabled={currentPage === totalPages} onclick={() => { currentPage += 1; }}>下一頁 ›</button>
      </div>
    {/if}
  </section>
{/if}

{#if lightboxImage}
  <button class="admin-image-lightbox" type="button" onclick={() => { lightboxImage = null; }} aria-label="關閉預覽">
    <img src={lightboxImage} alt="圖片預覽" />
  </button>
{/if}
