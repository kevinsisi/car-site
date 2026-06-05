# 競爭對手網站深度研究報告:HANK豪車館 (hankbentleyrr.com)

> 研究日期:2026-06-05
> 研究方式:Playwright 實機載入(桌面 1440×900 / 手機 390×844 iPhone UA)、HTML/JS 原始碼分析、互動測試(比較流程、篩選、手機選單、深淺色切換)
> 截圖與原始資料:`D:\tmp\hank-research\`(18+ 張截圖、HTML dump、JS 原始碼、cookie/DOM dump)

---

## 1. 網站總覽

| 項目 | 內容 |
|---|---|
| 站名 | HANK豪車館(頁面 Logo 為 HANK MOTORS / BENTLEY ROLLS ROYCE) |
| 定位 | 台北二手豪車專賣(出售+收購),主打法拉利、藍寶堅尼、保時捷、勞斯萊斯、賓利 |
| 地址 | 台北市內湖區行忠路57號 |
| 電話 | 0912-178-095(全站 `tel:` 連結) |
| LINE | @hank_bentley_rr |
| 社群 | Facebook、LINE、Threads、Instagram(@hank_bentley_rr)、TikTok(@hank67658) |
| 車輛數 | 共 170 台:**在庫 15 / 售出 155**(售出車輛保留展示,當作戰績牆) |
| 品牌分佈 | Bentley 57、Rolls-Royce 38、Lamborghini 34、Ferrari 14、Porsche 9、Mercedes Benz 9、McLaren 4、Lexus 2、Aston Martin 2、Alfa Romeo 1 |
| 車型分佈 | 雙門跑車 59、休旅車 58、旗艦轎車 29、敞篷車 21、商旅車 1、電動車 1、掀背車 1 |
| 設計商 | 洛克科技(footer 掛名) |
| YouTube 數據(首頁展示) | 1M 訂閱、104M 觀看、90k 影片(與「遇見好車 CarsMeet」頻道內容合作) |

### 商業模式觀察
- **全站無標價**:所有車輛一律「電洽」,點擊直接撥打 `tel:0912-178095`。價格排序選項存在但實際無意義(無公開價格)。
- **售出車不下架**:155 台售出車保留為信任背書;首頁「近期入庫」用 `cmz-no-sold-loop` class 排除售出車,但列表頁預設混排。
- **無購物車/結帳**:WooCommerce 只當作車輛資料庫(CPT+taxonomy)使用,完全去商城化。
- **無詢價表單**:聯絡頁只有地址/電話/LINE 三張卡 + Google Map,沒有任何表單(WPForms 樣式有載入但未使用)。轉換全靠電話與 LINE。

---

## 2. 技術架構

| 層 | 技術 | 版本 |
|---|---|---|
| CMS | WordPress | 6.8.1 |
| 主題 | Blocksy + **blocksy-child**(客製 child theme,版本 1.065) | 2.1.0 |
| 頁面建構 | Elementor 3.35.6 + **Elementor Pro 3.22.1**(Loop Grid、Taxonomy Filter、Image Carousel、Video Widget、單品模板) | |
| 商品系統 | WooCommerce 10.5.3(僅作車輛 CPT 用) | |
| 比較功能 | **Blocksy Companion Pro — WooCommerce Extra**(compare-bar)+ child theme 自寫比較頁 | |
| 篩選 | **Filter Everything 1.9.0**(wpc-filters)+ child theme 自寫 select2 品牌下拉 | |
| 輪播 | tiny-slider(child theme 自帶)、Swiper(Elementor 內建) | |
| 分享 | AddToAny(Facebook / LINE / Threads / Email) | |
| 深淺色 | Blocksy Companion Pro color-mode-switch 擴充 | |
| 追蹤 | Google Ads gtag(AW-17112097492,投放 Google Ads 轉換追蹤);**無 GA4、無 Meta Pixel 偵測到** | |
| 字型 | Poppins(700)、Roboto、Roboto Slab(Google Fonts,本地化快取) | |
| SEO | `sitemap_index.xml` 404 → **無 Yoast/RankMath 等 SEO 外掛跡象** | |

**客製核心**:幾乎所有差異化功能都在 child theme 的一支 `assets/script.js`(約 470 行,前綴 `cmz-`,推測為洛克科技客製),包含:品牌下拉篩選、比較頁渲染、影片跑馬燈、分享連結改寫。

---

## 3. 全站共用 UI / 排版

### 桌面 Header(雙層)
1. **頂部資訊列**(黑底):左側電話 + 地址;右側 6 個社群圓形 icon(FB/LINE/Threads/IG×2/TikTok)+ 深淺色切換(太陽/月亮 icon)。
2. **主導覽列**:左 Logo(HANK MOTORS 橘色車形 Logo),中間選單:首頁/所有車款/關於我們/聯絡我們(僅 4 項,無下拉)。

### 手機 Header(單層)
- Logo + 深淺色切換 + 漢堡按鈕(`button.ct-header-trigger`)。頂部資訊列隱藏。
- 漢堡 → **右側 offcanvas 抽屜**(約 80% 寬、深色、右上 ✕):4 個大字選單項(現行頁面黃色高亮)+ 5 個社群圓形 icon。

### Footer(全站一致)
- 左:Logo;中:地址 + 手機(tel 連結);右:Facebook + LINE 圓形 icon。
- 版權列:`Copyright © 2025 HANK豪車館. Design by 洛克科技`。

### 深淺色模式
- Blocksy Pro color-mode-switch,預設深色(黑底 + 白字 + 黃色強調 #e8c46a 系)。切淺色後 header/背景轉白。整體視覺以深色為主設計,淺色像附屬品。

### 設計語言
- 黑/暗灰底、黃金色(琥珀)強調色、白字;品牌字 Poppins Bold。
- 所有車輛照片統一在**同一個攝影棚場景**(深色車庫+天窗打光)拍攝,列表視覺一致性極高——這是該站最強的視覺資產。

---

## 4. 首頁(桌面)逐區塊

依序由上而下:

### 4.1 Hero:全幅 YouTube 影片橫幅
- `div.video-banner` 內嵌 YouTube iframe:
  `https://www.youtube.com/embed/Ko_LPi8dbrw?autoplay=1&mute=1&playsinline=1&controls=0&modestbranding=1&rel=0&loop=1&playlist=Ko_LPi8dbrw`
- 技巧:`loop=1` 必須搭配 `playlist=<同一支影片ID>` 才能無限循環;`controls=0` 隱藏控制列;CSS 把 iframe 放大裁切成滿版背景(無 mp4 自架影片,**用 YouTube 當免費 CDN**)。
- 內容是該店形象影片(Rolls-Royce 形象【遇見好車】)。
- **手機端缺陷**:iOS UA 下 YouTube 仍會顯示大型播放/暫停鈕、分享鈕與 YouTube logo 浮層,hero 看起來像「卡在那的影片播放器」而非沉浸式背景(實測截圖可證)。

### 4.2 近期入庫 NEW
- **Elementor Pro Loop Grid + Taxonomy Filter** 組合:上方品牌 tab 列(All / Alfa Romeo / Bentley / Ferrari / Lamborghini…,可橫向捲動),點 tab 以 AJAX 過濾卡片,不換頁。
- 卡片網格:桌面 4 欄 / 平板 2 欄 / 手機 1 欄(`elementor-grid-4 / tablet-2 / mobile-1`)。
- Loop Grid 加 `cmz-no-sold-loop`:**首頁只顯示在庫車,排除售出**。
- 卡片內容:棚拍照、品牌小字、車名、年份/里程等摘要。

### 4.3 車系品牌 BRAND
- 品牌 Logo 網格(Porsche、Aston Martin、RR、Bentley、Maybach、Ferrari、Lamborghini、McLaren…)。
- 每個 Logo 連到 `/products/?brand=<slug>`(直接帶篩選參數進列表頁,而非品牌 taxonomy 頁)。

### 4.4 YOUTUBE影片
- 左:1 支大影片(Elementor Video Widget,click-to-play,`controls=1&rel=0&enablejsapi=1`,不自動播放)。
- 右:數據欄 — **1M Subscribers / 104M Views / 90k Videos** + 「前往頻道」。
- 下:3 支小影片縮圖(同為 Elementor Video Widget)。共 4 支獨立 YouTube embed,彼此無連動(沒有「播放 A 暫停 B」的 JS)。

### 4.5 豪車影片精選(IG Reels 跑馬燈)
- `.cmz-marquee-slide`:7 張**直式 9:16 截圖卡**(IG Reel 畫面截圖,含 IG UI 假象),tiny-slider 複製成 31 個 clone 做無縫循環。
- tiny-slider 參數:`autoplay:true, autoplayTimeout:0, speed:3500, fixedWidth:290, gutter:82, loop:true, controls/nav:false, mouseDrag:true, autoplayHoverPause:false` → **等速無限跑馬燈**,滑鼠懸停不暫停,可拖曳。
- 每張卡是 `<a>` 直接外連到對應 Instagram Reel(共 6 支不同 reel)。**站內不播放**,點了就跳去 IG。
- child theme 另有一條未啟用的分支:若卡片含 `.iframe-embed[data-key]`,會動態注入 342×512 的 YouTube Shorts iframe(`autoplay=1&mute=1&loop=1&controls=0&playlist=key`)— 即「跑馬燈內自動播放直式影片」的能力已寫好,目前首頁改用 IG 截圖+外連。

### 4.6 手機版首頁差異
- Hero YouTube 出現原生控制列(上述缺陷)。
- 近期入庫 tabs 橫向捲動、卡片 1 欄全寬。
- 其餘區塊縱向堆疊,跑馬燈與桌面相同(fixedWidth 290 不變)。

---

## 5. 所有車款列表頁 `/products/`

### 5.1 桌面排版
- **左側欄(約 1/4 寬)= 篩選器,右側 = 直列式車卡(一排一台,大圖左、資訊右)**。
- 右上:排序下拉(原生 select):最新(`?orderby=date`)/ 價格:低到高 / 價格:高到低 / 人氣排序(WooCommerce orderby)。
- 分頁:數字分頁,共 **29 頁**(每頁 6 台,170 台)。

### 5.2 篩選器(Filter Everything + 客製)
| 區塊 | UI | 行為 |
|---|---|---|
| 品牌(select2) | child theme 動態建立的「選取車款」多選輸入框 | 實際上**程式強制單選**:選新品牌時先清掉所有已勾 checkbox 再勾新值;清除時觸發 wpc reset |
| 在庫狀況 | 「在庫 15」「售出 155」兩顆 chip(label 樣式) | URL `?car_inv=1 / 0`,點選後 AJAX 重載並更新所有計數 |
| 品牌 | checkbox 清單 + 即時數量 | `?brand=<slug>`,可複選 |
| 車型 | checkbox 清單 + 數量(敞篷車21/旗艦轎車29/休旅車58/商旅車1/雙門跑車59/電動車1/掀背車1) | `?type=<slug>` |
| 動作 | 「清除條件」白鈕 +「搜尋」藍鈕 | Filter Everything 的 apply 模式(選好按搜尋才套用) |
- 篩選為 **GET 參數型**(`/products/?brand=ferrari&type=suv`),對 SEO 與分享友善;選項間計數會交叉更新。
- 「搜尋」按鈕是**藍色**(#2196F3 系)——全站唯一脫離黑金配色的元素,疑似外掛預設色沒改,視覺突兀。

### 5.3 車卡內容(`.cmz-product-single`)
- 棚拍大圖(連結到詳情頁)
- 車名(h3,白色粗體,例:2024 Ferrari Purosangue)
- 規格 chips:**年份 / 里程 / 顏色 / 缸數** 四欄小字
- 右上:黃色「**電洽**」膠囊鈕 → `tel:0912-178095`
- 下方兩顆灰鈕:
  - 「⚖ 比較車款」(`.cmz-c-btn`,data-product=WooCommerce product ID;已在比較清單時 `data-button-state="active"` 星號變色)
  - 「分享車款」→ AddToAny 浮層(Facebook/LINE/Threads/Email);JS 會把卡片連結寫進 `data-a2a-url`,確保分享的是該車網址而非列表頁
- **售出車卡與在庫車卡外觀無差異**(無「售出」蓋章/角標),只能靠篩選器區分——對訪客是個資訊缺陷。

### 5.4 手機排版
- 篩選器**整段移到列表上方**(非抽屜、非彈窗):品牌下拉 → 頁標題 → 在庫狀況 chips → 車型 checkbox 清單 → 清除/搜尋鈕 → 才開始車卡。**進頁要先滑過一整屏的篩選器才看得到第一台車**,是明顯的 UX 弱點(Filter Everything 有 off-canvas 模式但未啟用,`wpc-filters-open-button` 存在但被隱藏)。
- 車卡 1 欄全寬,圖上、資訊下,按鈕同桌面。

### 5.5 品牌/車型 taxonomy 頁
- `/品牌/rolls-royce/`(中文 slug taxonomy archive)版面與列表頁相同,品牌 checkbox 預設勾選、在庫/售出計數隨品牌縮小(RR:在庫 6/售出 32),並出現該品牌專屬車型計數。`/car_type/suv/` 同理。
- 首頁卡片上的品牌/車型小標連到這些 taxonomy 頁;品牌 Logo 區則連到 `?brand=` 參數頁——**兩套入口並存**。

---

## 6. 車輛詳情頁 `/products/<編號>/`

URL 規則:`/products/p23/`、`/products/b181/`、`/products/259/`(自訂貨號 slug:疑似 b=Bentley 進貨批、p=、a=…+ 流水號)。

### 6.1 桌面排版(Elementor Pro 單品模板,`data-elementor-type="product"`)
- **左 2/3:相簿輪播** — Elementor Image Carousel(Swiper):
  - loop 模式(slide 複製)、左右箭頭(inside)、底部圓點分頁(outside,可點)
  - 一次顯示 1 張大圖;**無縮圖列、無 lightbox 放大、無影片混入相簿**
  - 圖片為 webp,檔名直接沿用 LINE 相簿匯出名(`LINE_ALBUM_B179...webp`)→ 工作流是 LINE 相簿 → WP 上傳
- **右 1/3:規格表(深色表格)**,欄位:
  | 欄位 | 範例 |
  |---|---|
  | 年份 | 2020年 / 2024年 |
  | 里程 | 28000KM |
  | 保固 | 1年 / 2028/4(原廠保固到期日或自家保固) |
  | 規格 | 日規車 / 蒙地拿紅…(進口規格) |
  | 引擎燃料 | 汽油 |
  | 外觀顏色 | 白色 / 紅色 |
  | 內裝顏色 | 紅色 / 黑色 |
  | 車門乘客 | 5門5座 |
  | 缸數 | 12 / 8 |
  | 馬力 | 571匹馬力(HP) / 725 |
- 規格表下:黃色大顆「**電洽**」+「比較車款」「分享車款」兩顆次要鈕(與卡片同元件)。
- **無價格欄位、無年式選配表、無貸款試算、無預約賞車表單。**

### 6.2 車輛描述區
- 標題「車輛描述」(黃底黑字標籤)+ 白底黑字內容區(深色頁中唯一白底塊)。
- 內容 = **配備清單 bullet list**(鑑定書、保固餘裕、選配:Apple CarPlay、360環景、碳纖維套件、按摩通風座椅…),純文字無結構化。

### 6.3 其他
- 售出車詳情頁與在庫車**完全相同**,無售出標示。
- 無「相關車款 / 你可能也喜歡」推薦區。
- 手機版:輪播全寬 → 規格表全寬堆疊 → 電洽 → 描述,動線乾淨。

---

## 7. 比較車輛功能(完整逆向)

這是該站最有特色的客製功能,由「Blocksy Pro compare bar」+「child theme 自寫比較頁」拼成:

### 7.1 加入比較
1. 任何車卡/詳情頁點「比較車款」(`.cmz-c-btn a`)→ Blocksy Companion Pro 寫 cookie:
   - **`blc_products_compare_list` = `[{"id":4635},{"id":4656}]`**(JSON 陣列,product ID)
   - path=/、SameSite=Lax、**效期 1 年**(跨 session 保留)
2. 按鈕星號即時轉為 active 狀態;頁面載入時 child JS 讀 cookie 回填各卡按鈕狀態。

### 7.2 比較列(compare bar)
- 加入後,**左下角浮出固定比較列**:每台車一張 150×150 縮圖,hover 顯示車名 tooltip,縮圖右上 ✕(`.ct-compare-remove`,data-product_id)可移除。
- **右下角同時浮出「⇄ 比較車款」白色膠囊鈕** → 前往 `/compare/`。
- Blocksy 設定為 `data-behaviour="modal"`(原生支援彈窗比較),但站方改用獨立頁。
- 手機版:縮圖列縮小在左下,比較鈕變圓形 icon 在右下,不擋內容。

### 7.3 比較頁 `/compare/`(child theme 自寫)
- 頁面含 `#compare-table-container`,流程:
  1. 讀 cookie 取得 id 陣列;空 → 顯示「尚未加入任何產品比較清單」+ Browse products 連結
  2. `POST /wp-admin/admin-ajax.php`,`action=get_compare_products&product_ids[]=...`(自訂 AJAX endpoint)
  3. 回傳每台車 `{title, permalink, thumbnail, meta:{brand, year, warranty, hp, cylinder}}`
  4. JS 動態 render 比較表
- **表格列(屬性為列、車輛為欄)**:縮圖(280px,可點進詳情)→ 品牌 → 車款(連結)→ 年份 → 保固 → 馬力 → 汽缸數 → 移除鈕。
- **移除互動**:點「移除」→ 該欄先 `display:none`、300ms 後真正 deleteCell;同步移除左下 bar 的縮圖、改寫 cookie;欄位歸零時顯示空清單訊息。
- 欄數**無上限**(程式裡 MAX_COLS=4 被註解掉)→ 可加 N 台。
- **手機版重大缺陷(實測)**:比較表無橫向捲動容器,390px 寬只看得到「屬性欄+第一台車」,第二台被硬截斷,無任何捲動提示 → **手機上比較功能實質壞掉**。
- 比較欄位**不含價格、里程、顏色**(年份/保固/馬力/汽缸數而已),資訊量偏少。

---

## 8. 影片播放邏輯(總整理)

全站影片 100% 依賴 YouTube/Instagram 外部平台,**零自架影片檔**:

| 位置 | 實作 | 自動播放 | 循環 | 控制列 | 備註 |
|---|---|---|---|---|---|
| 首頁 Hero | YouTube iframe 滿版背景 | ✅ `autoplay=1&mute=1` | ✅ `loop=1&playlist=<id>` | ❌ `controls=0&modestbranding=1` | 手機會露出 YT 控制鈕,沉浸感破功 |
| YOUTUBE影片區(1大3小) | Elementor Video Widget ×4 | ❌ 點擊播放 | ❌ | ✅ `controls=1&rel=0&enablejsapi=1` | 各自獨立,無互斥暫停邏輯 |
| 豪車影片精選跑馬燈 | IG Reel 截圖 + 外連 `<a>` | —(站內不播放) | tiny-slider 等速循環 | — | 點擊跳轉 Instagram Reel |
| (潛在能力)跑馬燈 Shorts 版 | child JS `.iframe-embed[data-key]` 注入 342×512 YouTube iframe | ✅ mute 自動播 | ✅ playlist 技巧 | ❌ | 程式碼已備好、首頁未啟用 |
| 車輛詳情頁 | **無影片**(純相片輪播) | — | — | — | 車輛影片只存在社群,未進詳情頁 |

關鍵 takeaway:
1. **YouTube `loop=1` 必搭 `playlist=同ID`** 的循環 hack 全站重複使用。
2. 行銷主軸是「把網站流量導去 YouTube/IG」,而不是把影片內容留在站內(詳情頁連影片都沒有)。
3. 跑馬燈 hover 不暫停、不可點停,純氛圍裝飾。

---

## 9. 關於我們 / 聯絡我們

### 關於我們 `/about-us/`
- Hero 大圖(夜拍 Rolls-Royce 門市照)
- 三張 USP 卡:頂級車況交付(交車前美容/檢測)、提供自營保修廠(**全車一年不限額保固**)、高於市場行情(高價收購+舊換新)
- **動態計數器**(滾動觸發,Elementor counter):129 輛豪車過戶 / 432 則私訊詢問 / 42% 顧客滿意度(42% 這數字很怪,疑似填錯)
- CTA:「我要賣車」「我要買車」兩顆鈕
- 底部品牌 Logo 跑馬燈(McLaren/Bentley/Porsche/Ferrari/RR/Maybach)

### 聯絡我們 `/contact-us/`
- 三張資訊卡:實體門市(地址)/ 預約電話 / 官方LINE(LINE ID)
- 全寬 Google Map iframe(內湖門市)
- **無表單**——線索全走電話/LINE。

---

## 10. 資料模型(推測)

WooCommerce product +:
- Taxonomy:`product_brand`(品牌,中文 slug `/品牌/<brand>/`)、`car_type`(車型)
- 自訂欄位(meta):`car_inv`(在庫 1/售出 0)、年份、里程、保固、規格(來源國)、引擎燃料、外觀/內裝顏色、車門乘客、缸數(cylinder)、馬力(hp)
- 比較 AJAX 只回 brand/year/warranty/hp/cylinder 五個 meta
- slug 即車輛編號(b179、p23…),照片檔名保留 LINE 相簿前綴 → 內容工作流:LINE 相簿收圖 → WP 後台建檔

---

## 11. 效能 / SEO / 品質觀察

- **外掛堆疊重**:jQuery + jQuery Migrate + Elementor ×2 + WooCommerce 全套 + Blocksy bundles + select2 + tiny-slider;首頁同時載 6 支 YouTube iframe(1 hero + 4 影片區 + iframe_api)→ 首屏負載大。
- 圖片有做 webp + srcset + lazyload(Blocksy/WP 原生),是少數效能亮點。
- **無 sitemap、無 SEO 外掛**;title 結構靠預設(`車名 – HANK豪車館`);無 JSON-LD 結構化資料(Vehicle/Product schema 全缺)→ 自然搜尋幾乎裸奔,流量應主要靠社群與 Google Ads(有 AW- 轉換追蹤)。
- 售出/在庫無視覺標示、手機比較表截斷、手機篩選器佔首屏、hero 手機露控制列、「搜尋」鈕配色突兀 —— 細節完成度中等。
- 無多語、無會員、無收藏(wishlist 未啟用)、無詢價表單、無 blog/SEO 內容。

---

## 12. 對照本站(car-site)可借鏡 / 可超越點

**值得借鏡**
1. **統一棚拍場景**:全部車輛同一拍攝場景,列表頁視覺整齊度極高,品牌感強。
2. **售出車當戰績牆**:155 台售出紀錄保留展示,是強力信任訊號(但要加「售出」標示,他們沒做)。
3. **比較清單用 1 年期 cookie**:跨造訪保留;比較列(縮圖 bar)+ 浮動按鈕的雙浮層 UX 直覺。
4. **YouTube 當影片 CDN**:hero 背景影片零頻寬成本;`loop=1&playlist=` 循環技巧。
5. 首頁「近期入庫」品牌 tab 即時過濾(Loop Grid + Taxonomy Filter 模式)。
6. 關於頁動態計數器 + 三 USP 卡的信任建構結構。

**可輕鬆超越的弱點**
1. 手機比較表壞掉(無橫向捲動)→ 本站比較功能做好 RWD 即勝出。
2. 售出車無標示、與在庫混排。
3. 詳情頁無影片、無 lightbox、無縮圖列、無相關車款推薦。
4. 手機列表頁篩選器佔掉整個首屏(該用抽屜)。
5. SEO 全缺(無 sitemap、無 schema、無內容行銷)→ 結構化資料 + 車款 SEO 頁能拿走自然流量。
6. 無詢價表單/預約賞車 → 線上轉換動線只有電話與 LINE。
7. 比較表欄位太少(無價格、里程、顏色)。

---

## 13. 廠商設計理念(洛克科技官方案例分享,IG @rok_website)

> 來源:洛克科技 IG 貼文【官網案例分享】二手豪車買賣「傳照片賣車 ➟ 系統化選車體驗」(2026-01-29,7 張輪播)。本節記錄廠商自述的設計意圖,並對照本研究實測到的實作。

### 13.1 委託背景(廠商自述的痛點)
- 合作前,車商**沒有網站,只能透過粉專私訊傳照片賣車**;車輛資訊散落在手機相簿與聊天視窗。
- 業務必須臨時整理照片,無法快速掌握所有在庫車輛;顧客看車效率低、難以比較不同車款。
- 核心診斷:**資訊分散、溝通成本過高** → 解法定調為「**系統化選車體驗**」。

### 13.2 網站規劃四大重點(廠商版)與實作對照
| # | 廠商宣稱 | 實測對應 |
|---|---|---|
| ① | 所有在庫車輛管理:統一建檔、即時新增/下架已售、避免版本混亂、業務只維護一個平台 | WooCommerce 當車輛資料庫 + `car_inv` 在庫/售出欄位;售出不刪檔而是改狀態(成就 155 台戰績牆) |
| ② | 每台車獨立介紹頁:多張實車照片、規格重點、在庫狀態一目了然、統一視覺版型「像在逛精品型錄」 | Elementor 單品模板 + Swiper 相簿 + 10 欄規格表;**「在庫狀態一目了然」未做到**(詳情頁/卡片皆無售出標示) |
| ③ | 依品牌/車款分類瀏覽比較,顧客詢問業務前先完成「初步理性分析」,自行勾選 2–3 台比較 | Filter Everything 篩選 + Blocksy 比較列 + 自寫 `/compare/` 頁,與宣稱相符 |
| ④ | 前端展示、後端好維護:客戶可自行上架新車/下架已售,不需技術門檻 | WP 後台 + LINE 相簿照片直傳的工作流(檔名可證),維護門檻確實低 |

### 13.3 重要落差:「業務分享比較連結給客戶」
- 廠商貼文宣稱:「**比較頁不只給顧客用,業務也能直接分享比較連結給客戶**」。
- **實測不成立**:比較清單存在訪客自己瀏覽器的 cookie(`blc_products_compare_list`),`/compare/` URL 不帶任何車輛參數。業務把 `/compare/` 傳給客戶,客戶打開只會看到自己的(空)清單。
- → 本站若實作「**可分享的比較連結**」(如 `/compare?ids=a,b,c`),即直接補上對手「想做但沒做到」的功能,且正中其行銷話術。

### 13.4 網站之外的整體服務設計(對手的完整漏斗)
洛克科技給 HANK 的方案是三件套:**#網站架設 + #官方LINE建置 + #廣告投放**:
- **官方 LINE 即時客服**:LINE OA 設有圖文選單(rich menu):預約賞車 / 服務據點 / 粉絲專頁 / 出售愛車 / 「立即探索最新在庫車款」(導回網站),且開啟自動回覆。理念:「業務不再是單純介紹車輛,而是從**確認需求**開始」——網站負責資訊整理與初步篩選,LINE 負責即時對話與成交。
- **廣告投放**:對應實測到的 Google Ads gtag(AW-17112097492)。
- 漏斗全貌:**社群(IG/YT/TikTok)→ 官網(篩選/比較/型錄)→ LINE OA(預約賞車、議價)→ 到店成交**。網站刻意不做表單與線上報價,把轉換集中到 LINE/電話,是有意的設計而非缺陷。
- 廠商總結句:「當資訊被整理好,成交其實會變得更輕鬆」「讓網站幫你分擔服務流程」——網站定位是**分擔業務的前段服務流程**(展示、比較、過濾無效詢問),不是電商。

### 13.5 對本站的啟示(疊加第 12 節)
1. 對手的成功不在技術,而在「**把賣車流程系統化**」的敘事與 LINE 漏斗整合 — 本站規劃功能時應以「分擔哪段服務流程」為框架,而非堆功能。
2. 「售出車也是內容資產」是廠商與店家共同的核心理念,值得沿用並做得更好(加售出標示、成交故事)。
3. 可分享比較連結 = 對手已宣傳但未實作的縫隙,優先級可拉高。
4. LINE OA rich menu 與網站互導(預約賞車/出售愛車入口)是台灣市場的標配轉換動線,本站應預留同等入口。

---

## 附錄:研究產物清單(`D:\tmp\hank-research\`)

- 截圖:`home-desktop/mobile`(全頁)、`home-top-mobile`、`home-yt-section`、`home-marquee-section`、`home-lightmode`、`products-top-desktop/mobile`、`products-sold-desktop`、`detail-top-desktop/mobile`、`detail-full-desktop/mobile`、`detail-sold-desktop`、`compare-bar-desktop2/mobile`、`compare-page-desktop/mobile`、`mobile-menu2`、`brand-rr-desktop`、`about-full-desktop`、`contact-full-desktop`
- 資料:各頁 `*.html` dump、`*.json`(links/scripts/iframes)、`child-script.js`(客製 JS 原始碼)、`compare-page-table.json`、`cookies.json`、`marquee-info.json`、`about-text.txt`、`contact-text.txt`
