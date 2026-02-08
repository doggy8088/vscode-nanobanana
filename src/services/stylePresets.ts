export type TextPolicy = 'none' | 'allow' | 'placeholder';

export interface StylePreset {
  id: string;
  promptDirectives: string;
  textPolicy: TextPolicy;
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  {
    id: 'infographic',
    promptDirectives:
      'clean infographic layout, clear hierarchy, icon-based visual storytelling, data-friendly composition',
    textPolicy: 'allow'
  },
  {
    id: 'article-cover',
    promptDirectives:
      'editorial hero image, strong focal point, modern composition, magazine-like visual impact',
    textPolicy: 'placeholder'
  },
  {
    id: 'ad-dm',
    promptDirectives:
      'promotional flyer style, high contrast, eye-catching layout, commercial visual language',
    textPolicy: 'allow'
  },
  {
    id: 'social-post',
    promptDirectives: 'social media ready composition, bold focal subject, scroll-stopping colors',
    textPolicy: 'allow'
  },
  {
    id: 'product-showcase',
    promptDirectives:
      'product-centric composition, studio lighting, premium material detail, clean background',
    textPolicy: 'none'
  },
  {
    id: 'ecommerce-banner',
    promptDirectives:
      'ecommerce banner composition, clear focal subject, strong negative space for copy overlay',
    textPolicy: 'placeholder'
  },
  {
    id: 'business-presentation',
    promptDirectives:
      'corporate presentation visual, trustworthy tone, structured layout, clean professional palette',
    textPolicy: 'placeholder'
  },
  {
    id: 'minimal-flat-illustration',
    promptDirectives:
      'minimal flat illustration, geometric forms, simple shapes, balanced negative space',
    textPolicy: 'none'
  },
  {
    id: '3d-render',
    promptDirectives:
      'high quality 3d render, physically based materials, cinematic lighting, realistic shadows',
    textPolicy: 'none'
  },
  {
    id: 'photorealistic',
    promptDirectives:
      'photorealistic style, natural lens behavior, rich texture detail, realistic color grading',
    textPolicy: 'none'
  },
  {
    id: 'watercolor',
    promptDirectives:
      'watercolor illustration style, soft pigment bleeding, delicate brush texture, artistic paper feel',
    textPolicy: 'none'
  },
  {
    id: 'tech-neon',
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
  return getStylePresetById(styleId) ?? getStylePresetById(fallbackStyleId) ?? STYLE_PRESETS[0];
}

export function isSupportedAspectRatio(aspectRatio: string | undefined): aspectRatio is AspectRatioOption {
  if (!aspectRatio) {
    return false;
  }

  return ASPECT_RATIO_OPTIONS.includes(aspectRatio as AspectRatioOption);
}

export function resolveAspectRatio(value: string | undefined, fallback: AspectRatioOption): AspectRatioOption {
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
  styleLabel: string,
  aspectRatio: AspectRatioOption
): string {
  return [
    basePrompt,
    '',
    'Style constraints:',
    `- Style: ${styleLabel}`,
    `- Directives: ${style.promptDirectives}`,
    `- Aspect ratio: ${aspectRatio}`,
    `- Text policy: ${textPolicyInstruction(style.textPolicy)}`
  ].join('\n');
}
