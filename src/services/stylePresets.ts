export type TextPolicy = 'none' | 'allow' | 'placeholder';

export interface StylePreset {
  id: string;
  label: string;
  description: string;
  promptDirectives: string;
  textPolicy: TextPolicy;
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  {
    id: 'infographic',
    label: '資訊圖表',
    description: '清楚分區、圖示化、可視化資訊層次',
    promptDirectives:
      'clean infographic layout, clear hierarchy, icon-based visual storytelling, data-friendly composition',
    textPolicy: 'allow'
  },
  {
    id: 'article-cover',
    label: '文章封面',
    description: '主題聚焦、可作為文章首圖',
    promptDirectives:
      'editorial hero image, strong focal point, modern composition, magazine-like visual impact',
    textPolicy: 'placeholder'
  },
  {
    id: 'ad-dm',
    label: '廣告 DM',
    description: '促銷感與吸睛視覺',
    promptDirectives:
      'promotional flyer style, high contrast, eye-catching layout, commercial visual language',
    textPolicy: 'allow'
  },
  {
    id: 'social-post',
    label: '社群貼文',
    description: '高辨識、適合社群平台',
    promptDirectives:
      'social media ready composition, bold focal subject, scroll-stopping colors',
    textPolicy: 'allow'
  },
  {
    id: 'product-showcase',
    label: '產品展示',
    description: '商品主體清晰、質感突出',
    promptDirectives:
      'product-centric composition, studio lighting, premium material detail, clean background',
    textPolicy: 'none'
  },
  {
    id: 'ecommerce-banner',
    label: '電商 Banner',
    description: '橫幅導向、留白可放文案',
    promptDirectives:
      'ecommerce banner composition, clear focal subject, strong negative space for copy overlay',
    textPolicy: 'placeholder'
  },
  {
    id: 'business-presentation',
    label: '商務簡報視覺',
    description: '專業穩重、資訊導向',
    promptDirectives:
      'corporate presentation visual, trustworthy tone, structured layout, clean professional palette',
    textPolicy: 'placeholder'
  },
  {
    id: 'minimal-flat-illustration',
    label: '極簡扁平插畫',
    description: '簡約造型、扁平色塊',
    promptDirectives:
      'minimal flat illustration, geometric forms, simple shapes, balanced negative space',
    textPolicy: 'none'
  },
  {
    id: '3d-render',
    label: '3D 渲染',
    description: '立體材質、光影真實',
    promptDirectives:
      'high quality 3d render, physically based materials, cinematic lighting, realistic shadows',
    textPolicy: 'none'
  },
  {
    id: 'photorealistic',
    label: '寫實攝影',
    description: '逼真照片質感',
    promptDirectives:
      'photorealistic style, natural lens behavior, rich texture detail, realistic color grading',
    textPolicy: 'none'
  },
  {
    id: 'watercolor',
    label: '水彩插畫',
    description: '手繪筆觸、柔和暈染',
    promptDirectives:
      'watercolor illustration style, soft pigment bleeding, delicate brush texture, artistic paper feel',
    textPolicy: 'none'
  },
  {
    id: 'tech-neon',
    label: '科技霓虹',
    description: '未來感、高對比霓虹光',
    promptDirectives:
      'futuristic neon visual style, luminous accents, high contrast, cyber-tech atmosphere',
    textPolicy: 'none'
  }
] as const;

export const ASPECT_RATIO_OPTIONS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9'
] as const;

export type AspectRatioOption = (typeof ASPECT_RATIO_OPTIONS)[number];

export function getStylePresetById(styleId: string | undefined): StylePreset | undefined {
  if (!styleId) {
    return undefined;
  }

  return STYLE_PRESETS.find((style) => style.id === styleId);
}

export function resolveStylePreset(styleId: string | undefined, fallbackStyleId: string): StylePreset {
  return (
    getStylePresetById(styleId) ??
    getStylePresetById(fallbackStyleId) ??
    STYLE_PRESETS[0]
  );
}

export function isSupportedAspectRatio(aspectRatio: string | undefined): aspectRatio is AspectRatioOption {
  if (!aspectRatio) {
    return false;
  }

  return ASPECT_RATIO_OPTIONS.includes(aspectRatio as AspectRatioOption);
}

export function resolveAspectRatio(
  value: string | undefined,
  fallback: AspectRatioOption
): AspectRatioOption {
  return isSupportedAspectRatio(value) ? value : fallback;
}

export function textPolicyInstruction(policy: TextPolicy): string {
  if (policy === 'allow') {
    return 'Text can appear when useful for the design, but keep it concise and legible.';
  }

  if (policy === 'placeholder') {
    return 'Do not render actual words. Keep clear placeholder-safe areas for later text overlay.';
  }

  return 'No text, no logo, no watermark.';
}

export function buildStyleEnhancedPrompt(
  basePrompt: string,
  style: StylePreset,
  aspectRatio: AspectRatioOption
): string {
  return [
    basePrompt,
    '',
    'Style constraints:',
    `- Style: ${style.label}`,
    `- Directives: ${style.promptDirectives}`,
    `- Aspect ratio: ${aspectRatio}`,
    `- Text policy: ${textPolicyInstruction(style.textPolicy)}`
  ].join('\n');
}
