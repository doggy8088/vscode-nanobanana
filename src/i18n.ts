export type SupportedLocale = 'en' | 'zh-TW' | 'zh-CN' | 'ja' | 'ko' | 'th' | 'vi';
export type ConfiguredLanguage = SupportedLocale | 'auto';

export interface RuntimeI18n {
  locale: SupportedLocale;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const EN_MESSAGES: Record<string, string> = {
  'input.apiKeyTitle': 'Set Gemini API Key',
  'input.apiKeyPrompt': 'Enter your Gemini API Key',
  'input.coverSourcePrompt': 'Enter source text for cover image generation',
  'input.freeformPrompt': 'Enter an image prompt',
  'input.dialogTitle': 'Nano Banana Image Generation',
  'error.apiKeyEmpty': 'API key cannot be empty.',
  'error.copilotNoPrompt': 'Copilot returned an empty prompt. Please try again.',
  'error.copilotNoModels': 'No Copilot models are available. Make sure GitHub Copilot is installed and signed in.',
  'error.noGeminiApiKey': 'Gemini API Key is not set. Run "Nano Banana: Set Gemini API Key" first.',
  'error.modelIdEmpty': 'modelId is empty. Update nanoBanana.modelId in settings.',
  'error.geminiFailed': 'Gemini API failed ({status}): {message}',
  'error.geminiNoImage': 'Gemini did not return image data.',
  'error.geminiNetwork': 'Unable to reach Gemini API: {detail}',
  'info.apiKeySaved': 'Gemini API Key saved.',
  'info.imageGenerated': 'Image generated: {path}',
  'progress.generating': 'Nano Banana is generating image...',
  'quickpick.style.title': 'Choose image style',
  'quickpick.style.placeholder': 'Select a style preset',
  'quickpick.aspectRatio.title': 'Choose aspect ratio',
  'quickpick.aspectRatio.placeholder': 'Select an aspect ratio',
  'quickpick.default': 'Default',
  'log.copilotModelSelected': 'Copilot model selected => {modelId}',
  'log.geminiModelAliasApplied': 'Gemini model alias applied => {requested} -> {resolved}',
  'log.geminiRequestModel': 'Gemini request => model={modelId}',
  'log.geminiRetryStatus': 'Gemini returned {status}; retrying once.',
  'log.geminiRetryOnce': 'Gemini request failed on first attempt; retrying once.',

  'style.infographic.label': 'Infographic',
  'style.infographic.description': 'Structured blocks, icon-driven, data-friendly layout',
  'style.article-cover.label': 'Article Cover',
  'style.article-cover.description': 'Editorial hero image with clear focal point',
  'style.ad-dm.label': 'Ad Flyer',
  'style.ad-dm.description': 'Promotional visual with strong marketing impact',
  'style.social-post.label': 'Social Post',
  'style.social-post.description': 'Attention-grabbing visual for social feeds',
  'style.product-showcase.label': 'Product Showcase',
  'style.product-showcase.description': 'Product-centered composition with premium detail',
  'style.ecommerce-banner.label': 'E-commerce Banner',
  'style.ecommerce-banner.description': 'Banner composition with copy-safe negative space',
  'style.business-presentation.label': 'Business Presentation',
  'style.business-presentation.description': 'Clean, professional, and trustworthy visual tone',
  'style.minimal-flat-illustration.label': 'Minimal Flat Illustration',
  'style.minimal-flat-illustration.description': 'Simple geometric forms and flat color blocks',
  'style.3d-render.label': '3D Render',
  'style.3d-render.description': 'Cinematic lighting and realistic 3D materials',
  'style.photorealistic.label': 'Photorealistic',
  'style.photorealistic.description': 'Natural lens feel and highly realistic texture',
  'style.watercolor.label': 'Watercolor Illustration',
  'style.watercolor.description': 'Soft pigment bleeding with handmade brush texture',
  'style.tech-neon.label': 'Tech Neon',
  'style.tech-neon.description': 'Futuristic neon highlights with high contrast'
};

const MESSAGES: Record<SupportedLocale, Record<string, string>> = {
  en: EN_MESSAGES,
  'zh-TW': {
    ...EN_MESSAGES,
    'input.apiKeyTitle': '設定 Gemini API Key',
    'input.apiKeyPrompt': '請輸入 Gemini API Key',
    'input.coverSourcePrompt': '請輸入要生成封面圖的文章內容',
    'input.freeformPrompt': '請輸入要生成的圖片描述',
    'input.dialogTitle': 'Nano Banana 生圖',
    'error.apiKeyEmpty': 'API Key 不可為空。',
    'error.copilotNoPrompt': 'Copilot 未回傳可用提示詞，請稍後再試。',
    'error.copilotNoModels': '找不到可用的 Copilot 模型，請確認已安裝並登入 GitHub Copilot。',
    'error.noGeminiApiKey': '尚未設定 Gemini API Key，請先執行「Nano Banana: 設定 Gemini API Key」。',
    'error.modelIdEmpty': '設定中的 modelId 為空，請更新 nanoBanana.modelId。',
    'error.geminiFailed': 'Gemini API 失敗（{status}）：{message}',
    'error.geminiNoImage': 'Gemini 未回傳圖片資料。',
    'error.geminiNetwork': '無法連線 Gemini API：{detail}',
    'info.apiKeySaved': 'Gemini API Key 已儲存。',
    'info.imageGenerated': '圖片已生成：{path}',
    'progress.generating': 'Nano Banana 正在生成圖片...',
    'quickpick.style.title': '選擇圖片風格',
    'quickpick.style.placeholder': '請選擇生圖風格',
    'quickpick.aspectRatio.title': '選擇圖片比例',
    'quickpick.aspectRatio.placeholder': '請選擇圖片比例',
    'quickpick.default': '預設',

    'style.infographic.label': '資訊圖表',
    'style.infographic.description': '清楚分區、圖示化、可視化資訊層次',
    'style.article-cover.label': '文章封面',
    'style.article-cover.description': '主題聚焦、可作為文章首圖',
    'style.ad-dm.label': '廣告 DM',
    'style.ad-dm.description': '促銷感與吸睛視覺',
    'style.social-post.label': '社群貼文',
    'style.social-post.description': '高辨識、適合社群平台',
    'style.product-showcase.label': '產品展示',
    'style.product-showcase.description': '商品主體清晰、質感突出',
    'style.ecommerce-banner.label': '電商 Banner',
    'style.ecommerce-banner.description': '橫幅導向、留白可放文案',
    'style.business-presentation.label': '商務簡報視覺',
    'style.business-presentation.description': '專業穩重、資訊導向',
    'style.minimal-flat-illustration.label': '極簡扁平插畫',
    'style.minimal-flat-illustration.description': '簡約造型、扁平色塊',
    'style.3d-render.label': '3D 渲染',
    'style.3d-render.description': '立體材質、光影真實',
    'style.photorealistic.label': '寫實攝影',
    'style.photorealistic.description': '逼真照片質感',
    'style.watercolor.label': '水彩插畫',
    'style.watercolor.description': '手繪筆觸、柔和暈染',
    'style.tech-neon.label': '科技霓虹',
    'style.tech-neon.description': '未來感、高對比霓虹光'
  },
  'zh-CN': {
    ...EN_MESSAGES,
    'input.apiKeyTitle': '设置 Gemini API Key',
    'input.apiKeyPrompt': '请输入 Gemini API Key',
    'input.coverSourcePrompt': '请输入用于封面图生成的文章内容',
    'input.freeformPrompt': '请输入图片生成提示词',
    'input.dialogTitle': 'Nano Banana 生图',
    'error.apiKeyEmpty': 'API Key 不能为空。',
    'error.copilotNoPrompt': 'Copilot 未返回可用提示词，请稍后重试。',
    'error.copilotNoModels': '未找到可用的 Copilot 模型，请确认已安装并登录 GitHub Copilot。',
    'error.noGeminiApiKey': '尚未设置 Gemini API Key，请先执行“Nano Banana: 设置 Gemini API Key”。',
    'error.modelIdEmpty': '设置中的 modelId 为空，请更新 nanoBanana.modelId。',
    'error.geminiFailed': 'Gemini API 失败（{status}）：{message}',
    'error.geminiNoImage': 'Gemini 未返回图片数据。',
    'error.geminiNetwork': '无法连接 Gemini API：{detail}',
    'info.apiKeySaved': 'Gemini API Key 已保存。',
    'info.imageGenerated': '图片已生成：{path}',
    'progress.generating': 'Nano Banana 正在生成图片...',
    'quickpick.style.title': '选择图片风格',
    'quickpick.style.placeholder': '请选择生图风格',
    'quickpick.aspectRatio.title': '选择图片比例',
    'quickpick.aspectRatio.placeholder': '请选择图片比例',
    'quickpick.default': '默认',

    'style.infographic.label': '信息图表',
    'style.infographic.description': '分区清晰、图标化、信息层次明确',
    'style.article-cover.label': '文章封面',
    'style.article-cover.description': '主题聚焦，可作为文章首图',
    'style.ad-dm.label': '广告 DM',
    'style.ad-dm.description': '促销感强、吸睛视觉',
    'style.social-post.label': '社交贴文',
    'style.social-post.description': '高辨识度，适合社交平台',
    'style.product-showcase.label': '产品展示',
    'style.product-showcase.description': '主体清晰，突出质感',
    'style.ecommerce-banner.label': '电商 Banner',
    'style.ecommerce-banner.description': '横幅导向，预留文案空间',
    'style.business-presentation.label': '商务演示视觉',
    'style.business-presentation.description': '专业稳重，信息导向',
    'style.minimal-flat-illustration.label': '极简扁平插画',
    'style.minimal-flat-illustration.description': '简洁造型与扁平色块',
    'style.3d-render.label': '3D 渲染',
    'style.3d-render.description': '立体材质与真实光影',
    'style.photorealistic.label': '写实摄影',
    'style.photorealistic.description': '逼真的照片质感',
    'style.watercolor.label': '水彩插画',
    'style.watercolor.description': '柔和晕染与手绘笔触',
    'style.tech-neon.label': '科技霓虹',
    'style.tech-neon.description': '未来感与高对比霓虹光'
  },
  ja: {
    ...EN_MESSAGES,
    'input.apiKeyTitle': 'Gemini API Key を設定',
    'input.apiKeyPrompt': 'Gemini API Key を入力してください',
    'input.coverSourcePrompt': 'カバー画像用の元テキストを入力してください',
    'input.freeformPrompt': '画像生成プロンプトを入力してください',
    'input.dialogTitle': 'Nano Banana 画像生成',
    'error.apiKeyEmpty': 'API キーは空にできません。',
    'error.copilotNoPrompt': 'Copilot から有効なプロンプトが返されませんでした。再試行してください。',
    'error.copilotNoModels': '利用可能な Copilot モデルがありません。GitHub Copilot のインストールとサインインを確認してください。',
    'error.noGeminiApiKey': 'Gemini API Key が未設定です。まず「Nano Banana: Set Gemini API Key」を実行してください。',
    'error.modelIdEmpty': 'modelId が空です。nanoBanana.modelId を設定してください。',
    'error.geminiFailed': 'Gemini API エラー（{status}）：{message}',
    'error.geminiNoImage': 'Gemini が画像データを返しませんでした。',
    'error.geminiNetwork': 'Gemini API に接続できません：{detail}',
    'info.apiKeySaved': 'Gemini API Key を保存しました。',
    'info.imageGenerated': '画像を生成しました：{path}',
    'progress.generating': 'Nano Banana が画像を生成しています...',
    'quickpick.style.title': '画像スタイルを選択',
    'quickpick.style.placeholder': 'スタイルプリセットを選択してください',
    'quickpick.aspectRatio.title': 'アスペクト比を選択',
    'quickpick.aspectRatio.placeholder': 'アスペクト比を選択してください',
    'quickpick.default': '既定',

    'style.infographic.label': 'インフォグラフィック',
    'style.infographic.description': '情報の階層が明確なアイコン中心レイアウト',
    'style.article-cover.label': '記事カバー',
    'style.article-cover.description': '主題を強調したエディトリアル向けビジュアル',
    'style.ad-dm.label': '広告フライヤー',
    'style.ad-dm.description': '販促向けで訴求力の高いデザイン',
    'style.social-post.label': 'SNS 投稿',
    'style.social-post.description': 'SNS フィード向けの視認性重視ビジュアル',
    'style.product-showcase.label': '商品紹介',
    'style.product-showcase.description': '商品主体で質感を強調した構図',
    'style.ecommerce-banner.label': 'EC バナー',
    'style.ecommerce-banner.description': '文字入れしやすい余白を持つ横長バナー',
    'style.business-presentation.label': 'ビジネス資料ビジュアル',
    'style.business-presentation.description': '信頼感のあるクリーンな表現',
    'style.minimal-flat-illustration.label': 'ミニマルフラットイラスト',
    'style.minimal-flat-illustration.description': 'シンプルな幾何形状とフラット配色',
    'style.3d-render.label': '3D レンダー',
    'style.3d-render.description': '立体感と質感を重視した 3D 表現',
    'style.photorealistic.label': 'フォトリアル',
    'style.photorealistic.description': '写真のようなリアルな質感と光',
    'style.watercolor.label': '水彩イラスト',
    'style.watercolor.description': '柔らかなにじみと手描き風の筆致',
    'style.tech-neon.label': 'テックネオン',
    'style.tech-neon.description': '未来感と高コントラストのネオン表現'
  },
  ko: {
    ...EN_MESSAGES,
    'input.apiKeyTitle': 'Gemini API 키 설정',
    'input.apiKeyPrompt': 'Gemini API 키를 입력하세요',
    'input.coverSourcePrompt': '커버 이미지 생성을 위한 원문 텍스트를 입력하세요',
    'input.freeformPrompt': '이미지 프롬프트를 입력하세요',
    'input.dialogTitle': 'Nano Banana 이미지 생성',
    'error.apiKeyEmpty': 'API 키는 비워둘 수 없습니다.',
    'error.copilotNoPrompt': 'Copilot이 유효한 프롬프트를 반환하지 않았습니다. 다시 시도하세요.',
    'error.copilotNoModels': '사용 가능한 Copilot 모델이 없습니다. GitHub Copilot 설치 및 로그인을 확인하세요.',
    'error.noGeminiApiKey': 'Gemini API 키가 설정되지 않았습니다. 먼저 "Nano Banana: Set Gemini API Key"를 실행하세요.',
    'error.modelIdEmpty': 'modelId가 비어 있습니다. nanoBanana.modelId를 설정하세요.',
    'error.geminiFailed': 'Gemini API 실패 ({status}): {message}',
    'error.geminiNoImage': 'Gemini가 이미지 데이터를 반환하지 않았습니다.',
    'error.geminiNetwork': 'Gemini API에 연결할 수 없습니다: {detail}',
    'info.apiKeySaved': 'Gemini API 키가 저장되었습니다.',
    'info.imageGenerated': '이미지가 생성되었습니다: {path}',
    'progress.generating': 'Nano Banana가 이미지를 생성 중입니다...',
    'quickpick.style.title': '이미지 스타일 선택',
    'quickpick.style.placeholder': '스타일 프리셋을 선택하세요',
    'quickpick.aspectRatio.title': '종횡비 선택',
    'quickpick.aspectRatio.placeholder': '종횡비를 선택하세요',
    'quickpick.default': '기본값',

    'style.infographic.label': '인포그래픽',
    'style.infographic.description': '정보 계층이 명확한 아이콘 중심 레이아웃',
    'style.article-cover.label': '아티클 커버',
    'style.article-cover.description': '주제를 강조한 에디토리얼 대표 이미지',
    'style.ad-dm.label': '광고 DM',
    'style.ad-dm.description': '홍보 목적의 강한 시각 임팩트',
    'style.social-post.label': '소셜 포스트',
    'style.social-post.description': '피드에서 눈에 띄는 소셜용 비주얼',
    'style.product-showcase.label': '제품 쇼케이스',
    'style.product-showcase.description': '제품 중심 구도와 고급 질감 표현',
    'style.ecommerce-banner.label': '이커머스 배너',
    'style.ecommerce-banner.description': '문구 배치를 고려한 배너형 구성',
    'style.business-presentation.label': '비즈니스 프레젠테이션',
    'style.business-presentation.description': '신뢰감 있는 깔끔한 업무용 톤',
    'style.minimal-flat-illustration.label': '미니멀 플랫 일러스트',
    'style.minimal-flat-illustration.description': '단순 기하 형태와 플랫 컬러 중심',
    'style.3d-render.label': '3D 렌더',
    'style.3d-render.description': '입체 재질과 사실적인 조명 표현',
    'style.photorealistic.label': '포토리얼',
    'style.photorealistic.description': '사진 같은 질감과 자연스러운 렌즈 느낌',
    'style.watercolor.label': '수채화 일러스트',
    'style.watercolor.description': '부드러운 번짐과 손그림 질감',
    'style.tech-neon.label': '테크 네온',
    'style.tech-neon.description': '미래지향적 네온 강조와 고대비 분위기'
  },
  th: {
    ...EN_MESSAGES,
    'input.apiKeyTitle': 'ตั้งค่า Gemini API Key',
    'input.apiKeyPrompt': 'กรอก Gemini API Key',
    'input.coverSourcePrompt': 'ป้อนข้อความต้นฉบับสำหรับสร้างภาพหน้าปก',
    'input.freeformPrompt': 'ป้อนพรอมป์ต์สำหรับสร้างภาพ',
    'input.dialogTitle': 'สร้างภาพด้วย Nano Banana',
    'error.apiKeyEmpty': 'ห้ามเว้น API Key ว่าง',
    'error.copilotNoPrompt': 'Copilot ไม่ได้ส่งพรอมป์ต์ที่ใช้งานได้ กรุณาลองใหม่',
    'error.copilotNoModels': 'ไม่พบโมเดล Copilot ที่ใช้งานได้ โปรดตรวจสอบการติดตั้งและการลงชื่อเข้าใช้ GitHub Copilot',
    'error.noGeminiApiKey': 'ยังไม่ได้ตั้งค่า Gemini API Key โปรดเรียกใช้ "Nano Banana: Set Gemini API Key" ก่อน',
    'error.modelIdEmpty': 'modelId ว่างอยู่ โปรดอัปเดต nanoBanana.modelId',
    'error.geminiFailed': 'Gemini API ล้มเหลว ({status}): {message}',
    'error.geminiNoImage': 'Gemini ไม่ได้ส่งข้อมูลรูปภาพกลับมา',
    'error.geminiNetwork': 'ไม่สามารถเชื่อมต่อ Gemini API ได้: {detail}',
    'info.apiKeySaved': 'บันทึก Gemini API Key แล้ว',
    'info.imageGenerated': 'สร้างรูปภาพแล้ว: {path}',
    'progress.generating': 'Nano Banana กำลังสร้างรูปภาพ...',
    'quickpick.style.title': 'เลือกสไตล์ภาพ',
    'quickpick.style.placeholder': 'เลือกพรีเซ็ตสไตล์',
    'quickpick.aspectRatio.title': 'เลือกอัตราส่วนภาพ',
    'quickpick.aspectRatio.placeholder': 'เลือกอัตราส่วนภาพ',
    'quickpick.default': 'ค่าเริ่มต้น',

    'style.infographic.label': 'อินโฟกราฟิก',
    'style.infographic.description': 'เลย์เอาต์เป็นสัดส่วนชัดเจน เน้นไอคอนและลำดับข้อมูล',
    'style.article-cover.label': 'ภาพปกบทความ',
    'style.article-cover.description': 'ภาพหลักแบบบรรณาธิการที่เน้นประเด็นสำคัญ',
    'style.ad-dm.label': 'โฆษณา DM',
    'style.ad-dm.description': 'ภาพส่งเสริมการขายที่โดดเด่นสะดุดตา',
    'style.social-post.label': 'โพสต์โซเชียล',
    'style.social-post.description': 'เหมาะกับฟีดโซเชียลและดึงสายตาได้ดี',
    'style.product-showcase.label': 'โชว์สินค้า',
    'style.product-showcase.description': 'เน้นตัวสินค้าและรายละเอียดวัสดุอย่างชัดเจน',
    'style.ecommerce-banner.label': 'แบนเนอร์อีคอมเมิร์ซ',
    'style.ecommerce-banner.description': 'องค์ประกอบแนวนอนพร้อมพื้นที่วางข้อความ',
    'style.business-presentation.label': 'ภาพสำหรับพรีเซนต์ธุรกิจ',
    'style.business-presentation.description': 'โทนมืออาชีพ ดูน่าเชื่อถือ และเป็นระเบียบ',
    'style.minimal-flat-illustration.label': 'ภาพประกอบมินิมอลแบบแฟลต',
    'style.minimal-flat-illustration.description': 'รูปทรงเรียบง่ายและโทนสีแฟลต',
    'style.3d-render.label': '3D เรนเดอร์',
    'style.3d-render.description': 'วัสดุและแสงเงาแบบสามมิติที่สมจริง',
    'style.photorealistic.label': 'สมจริงแบบภาพถ่าย',
    'style.photorealistic.description': 'พื้นผิวและแสงเงาใกล้เคียงภาพถ่ายจริง',
    'style.watercolor.label': 'ภาพสีน้ำ',
    'style.watercolor.description': 'ลายพู่กันนุ่มนวลและการไล่สีแบบสีน้ำ',
    'style.tech-neon.label': 'เทคโนโลยีนีออน',
    'style.tech-neon.description': 'อารมณ์อนาคตพร้อมแสงนีออนคอนทราสต์สูง'
  },
  vi: {
    ...EN_MESSAGES,
    'input.apiKeyTitle': 'Thiết lập Gemini API Key',
    'input.apiKeyPrompt': 'Nhập Gemini API Key',
    'input.coverSourcePrompt': 'Nhập nội dung nguồn để tạo ảnh bìa',
    'input.freeformPrompt': 'Nhập prompt tạo ảnh',
    'input.dialogTitle': 'Tạo ảnh Nano Banana',
    'error.apiKeyEmpty': 'API key không được để trống.',
    'error.copilotNoPrompt': 'Copilot không trả về prompt hợp lệ. Vui lòng thử lại.',
    'error.copilotNoModels': 'Không có model Copilot khả dụng. Hãy kiểm tra cài đặt và đăng nhập GitHub Copilot.',
    'error.noGeminiApiKey': 'Chưa thiết lập Gemini API Key. Hãy chạy "Nano Banana: Set Gemini API Key" trước.',
    'error.modelIdEmpty': 'modelId đang trống. Hãy cập nhật nanoBanana.modelId.',
    'error.geminiFailed': 'Gemini API thất bại ({status}): {message}',
    'error.geminiNoImage': 'Gemini không trả về dữ liệu ảnh.',
    'error.geminiNetwork': 'Không thể kết nối Gemini API: {detail}',
    'info.apiKeySaved': 'Đã lưu Gemini API Key.',
    'info.imageGenerated': 'Đã tạo ảnh: {path}',
    'progress.generating': 'Nano Banana đang tạo ảnh...',
    'quickpick.style.title': 'Chọn phong cách ảnh',
    'quickpick.style.placeholder': 'Chọn preset phong cách',
    'quickpick.aspectRatio.title': 'Chọn tỉ lệ ảnh',
    'quickpick.aspectRatio.placeholder': 'Chọn tỉ lệ ảnh',
    'quickpick.default': 'Mặc định',

    'style.infographic.label': 'Infographic',
    'style.infographic.description': 'Bố cục phân tầng rõ ràng, trực quan bằng biểu tượng',
    'style.article-cover.label': 'Ảnh bìa bài viết',
    'style.article-cover.description': 'Ảnh hero theo phong cách biên tập, nhấn chủ đề chính',
    'style.ad-dm.label': 'Tờ rơi quảng cáo',
    'style.ad-dm.description': 'Hình ảnh quảng bá nổi bật, thu hút chú ý',
    'style.social-post.label': 'Bài đăng mạng xã hội',
    'style.social-post.description': 'Dễ nhận diện, phù hợp hiển thị trên feed xã hội',
    'style.product-showcase.label': 'Trưng bày sản phẩm',
    'style.product-showcase.description': 'Tập trung vào sản phẩm với chi tiết chất liệu rõ nét',
    'style.ecommerce-banner.label': 'Banner thương mại điện tử',
    'style.ecommerce-banner.description': 'Bố cục banner có vùng trống để đặt nội dung chữ',
    'style.business-presentation.label': 'Hình ảnh thuyết trình doanh nghiệp',
    'style.business-presentation.description': 'Phong cách chuyên nghiệp, gọn gàng và đáng tin cậy',
    'style.minimal-flat-illustration.label': 'Minh họa phẳng tối giản',
    'style.minimal-flat-illustration.description': 'Hình khối đơn giản với bảng màu phẳng',
    'style.3d-render.label': 'Kết xuất 3D',
    'style.3d-render.description': 'Hiệu ứng 3D với vật liệu và ánh sáng chân thực',
    'style.photorealistic.label': 'Ảnh siêu thực',
    'style.photorealistic.description': 'Chi tiết và ánh sáng gần với ảnh chụp thực tế',
    'style.watercolor.label': 'Minh họa màu nước',
    'style.watercolor.description': 'Hiệu ứng loang màu mềm và nét cọ thủ công',
    'style.tech-neon.label': 'Công nghệ neon',
    'style.tech-neon.description': 'Không khí tương lai với điểm nhấn neon tương phản cao'
  }
};

export function createRuntimeI18n(
  configuredLanguage: string | undefined,
  envLanguage: string = 'en'
): RuntimeI18n {
  const locale = resolveLocale(configuredLanguage, envLanguage);

  return {
    locale,
    t: (key, vars) => localize(locale, key, vars)
  };
}

export function resolveLocale(configuredLanguage: string | undefined, envLanguage: string): SupportedLocale {
  const configured = normalizeConfiguredLanguage(configuredLanguage);
  if (configured !== 'auto') {
    return configured;
  }

  return detectLocaleFromEnv(envLanguage);
}

function localize(
  locale: SupportedLocale,
  key: string,
  vars?: Record<string, string | number>
): string {
  const template = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
  if (!vars) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = vars[token];
    return value === undefined ? `{${token}}` : String(value);
  });
}

function normalizeConfiguredLanguage(value: string | undefined): ConfiguredLanguage {
  const normalized = (value ?? 'auto').trim().toLowerCase();

  if (normalized === 'auto') {
    return 'auto';
  }

  if (normalized === 'en') {
    return 'en';
  }

  if (['zh-tw', 'zh_tw', 'zh-hant', 'zh-hk', 'zh-mo'].includes(normalized)) {
    return 'zh-TW';
  }

  if (['zh-cn', 'zh_cn', 'zh-hans', 'zh-sg', 'zh'].includes(normalized)) {
    return 'zh-CN';
  }

  if (normalized === 'ja') {
    return 'ja';
  }

  if (['ko', 'kr'].includes(normalized)) {
    return 'ko';
  }

  if (normalized === 'th') {
    return 'th';
  }

  if (normalized === 'vi') {
    return 'vi';
  }

  return 'auto';
}

function detectLocaleFromEnv(envLanguage: string): SupportedLocale {
  const normalized = envLanguage.trim().toLowerCase();

  if (['zh-tw', 'zh-hant', 'zh-hk', 'zh-mo'].some((prefix) => normalized.startsWith(prefix))) {
    return 'zh-TW';
  }

  if (['zh-cn', 'zh-hans', 'zh-sg', 'zh'].some((prefix) => normalized.startsWith(prefix))) {
    return 'zh-CN';
  }

  if (normalized.startsWith('ja')) {
    return 'ja';
  }

  if (normalized.startsWith('ko')) {
    return 'ko';
  }

  if (normalized.startsWith('th')) {
    return 'th';
  }

  if (normalized.startsWith('vi')) {
    return 'vi';
  }

  return 'en';
}
