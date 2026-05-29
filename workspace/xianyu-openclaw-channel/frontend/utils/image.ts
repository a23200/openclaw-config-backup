import { translate as tr } from '../lib/i18n';
const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const toSvgDataUrl = (svg: string) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

const hashSeed = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const palette = [
  ['#FFE27A', '#FFB800'],
  ['#A7F3D0', '#10B981'],
  ['#BFDBFE', '#3B82F6'],
  ['#FBCFE8', '#EC4899'],
  ['#DDD6FE', '#8B5CF6'],
  ['#FDE68A', '#F59E0B'],
];

const parseJson = (value: unknown) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

export const normalizeImageUrl = (value?: string | null) => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
};

const extractFirstUrl = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') {
    const parsed = parseJson(value);
    if (parsed) return extractFirstUrl(parsed);
    return normalizeImageUrl(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = extractFirstUrl(item);
      if (url) return url;
    }
    return '';
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['url', 'picUrl', 'pic_url', 'imageUrl', 'image_url', 'mainImage', 'main_image']) {
      const url = normalizeImageUrl(typeof record[key] === 'string' ? record[key] : '');
      if (url) return url;
    }
  }

  return '';
};

export const extractItemTitle = (item: any): string => {
  const directTitle = item?.item_title || item?.title;
  if (directTitle) return String(directTitle);

  const detail = parseJson(item?.item_detail_parsed || item?.item_detail) as Record<string, any> | null;
  return (
    detail?.title ||
    detail?.item_title ||
    detail?.detail_params?.title ||
    detail?.detailParams?.title ||
    ''
  );
};

export const extractItemPrice = (item: any): string => {
  const directPrice = item?.item_price || item?.price_text || item?.price;
  if (directPrice !== undefined && directPrice !== null && String(directPrice).trim()) {
    return String(directPrice);
  }

  const detail = parseJson(item?.item_detail_parsed || item?.item_detail) as Record<string, any> | null;
  const rawPrice =
    detail?.price_text ||
    detail?.price ||
    detail?.detail_params?.soldPrice ||
    detail?.detailParams?.soldPrice ||
    '';

  if (!rawPrice) return '';
  const priceText = String(rawPrice).trim();
  return /^¥/.test(priceText) ? priceText : `¥${priceText}`;
};

export const extractItemImage = (item: any): string => {
  const directImage = normalizeImageUrl(item?.item_image || item?.image_url || item?.main_image);
  if (directImage) return directImage;

  const detail = parseJson(item?.item_detail_parsed || item?.item_detail) as Record<string, any> | null;
  if (!detail) return '';

  const candidates = [
    detail.pic_info,
    detail.picInfo,
    detail.detail_params,
    detail.detailParams,
    detail.main_image,
    detail.mainImage,
    detail.image_url,
    detail.imageUrl,
    detail.images,
    detail.imageInfos,
    detail.detail_params?.imageInfos,
    detail.detailParams?.imageInfos,
    detail.itemDO?.picInfo,
    detail.data?.itemDO?.picInfo,
  ];

  for (const candidate of candidates) {
    const image = extractFirstUrl(candidate);
    if (image) return image;
  }

  return '';
};

export const buildAvatarDataUrl = (label?: string, seed?: string) => {
  const base = (label || seed || tr('image.avatarFallback')).trim();
  const text = escapeXml(base.slice(0, 2) || tr('image.avatarFallback'));
  const colors = palette[hashSeed(seed || base) % palette.length];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="avatarGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${colors[0]}" />
          <stop offset="100%" stop-color="${colors[1]}" />
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="40" fill="url(#avatarGradient)" />
      <text x="80" y="92" text-anchor="middle" font-size="48" font-family="Arial, PingFang SC, sans-serif" font-weight="700" fill="#111827">${text}</text>
    </svg>
  `;
  return toSvgDataUrl(svg);
};

export const buildItemPlaceholderDataUrl = (title?: string, price?: string) => {
  const safeTitle = escapeXml((title || tr('image.productFallbackTitle')).trim().slice(0, 18) || tr('image.productFallbackTitle'));
  const safePrice = escapeXml((price || tr('image.noImage')).trim().slice(0, 16) || tr('image.noImage'));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720">
      <defs>
        <linearGradient id="itemGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FFF7C2" />
          <stop offset="100%" stop-color="#FFE27A" />
        </linearGradient>
      </defs>
      <rect width="720" height="720" rx="48" fill="url(#itemGradient)" />
      <rect x="44" y="44" width="632" height="632" rx="36" fill="#FFFDF5" stroke="#F3E3A2" />
      <circle cx="164" cy="190" r="64" fill="#FFE27A" />
      <path d="M94 286c40-54 83-88 130-88 48 0 93 32 142 101 29-22 59-34 90-34 67 0 118 56 156 130v171H108V286z" fill="#F7D548" opacity="0.95" />
      <text x="84" y="536" font-size="42" font-family="Arial, PingFang SC, sans-serif" font-weight="700" fill="#111827">${safeTitle}</text>
      <text x="84" y="600" font-size="28" font-family="Arial, PingFang SC, sans-serif" fill="#4B5563">${safePrice}</text>
      <text x="84" y="648" font-size="24" font-family="Arial, PingFang SC, sans-serif" fill="#9CA3AF">${escapeXml(tr('image.missingAutoFilled'))}</text>
    </svg>
  `;
  return toSvgDataUrl(svg);
};

export const buildCardPreviewFallback = () => buildItemPlaceholderDataUrl(tr('image.preview'), tr('image.loadFailed'));

export const resolveItemImage = (item: any, title?: string, price?: string) =>
  extractItemImage(item) || buildItemPlaceholderDataUrl(title || extractItemTitle(item), price || extractItemPrice(item));
