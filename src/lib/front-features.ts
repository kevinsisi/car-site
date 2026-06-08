import type { SiteSettings } from './settings';
import {
  hasFeature,
  FEATURE_COMPARE, FEATURE_SELL_INQUIRY, FEATURE_CONTACT_PAGE,
  FEATURE_ABOUT_PAGE, FEATURE_SOCIAL_ICONS, FEATURE_DIRECT_CONTACT,
  FEATURE_HERO_VIDEOS, FEATURE_VIDEO_LINKS,
  DEFAULT_FEATURE_MASK, ALL_FEATURES_MASK,
} from './features';

export interface FrontFeatures {
  compare: boolean;
  sellInquiry: boolean;
  contactPage: boolean;
  aboutPage: boolean;
  socialIcons: boolean;
  directContact: boolean;
  heroVideos: boolean;
  videoLinks: boolean;
}

export interface PublicNavItem {
  href: string;
  label: string;
  activeMatch: string;
}

export function resolveFrontFeatures(settings: SiteSettings): FrontFeatures {
  const license = settings.featureLicenseMask ?? ALL_FEATURES_MASK;
  const admin   = settings.featureMask ?? DEFAULT_FEATURE_MASK;
  const mask    = license & admin;
  return {
    compare:       hasFeature(mask, FEATURE_COMPARE),
    sellInquiry:   hasFeature(mask, FEATURE_SELL_INQUIRY),
    contactPage:   hasFeature(mask, FEATURE_CONTACT_PAGE),
    aboutPage:     hasFeature(mask, FEATURE_ABOUT_PAGE),
    socialIcons:   hasFeature(mask, FEATURE_SOCIAL_ICONS),
    directContact: hasFeature(mask, FEATURE_DIRECT_CONTACT),
    heroVideos:    hasFeature(mask, FEATURE_HERO_VIDEOS),
    videoLinks:    hasFeature(mask, FEATURE_VIDEO_LINKS),
  };
}

export function getPublicNavItems(features: FrontFeatures): PublicNavItem[] {
  return [
    { href: '/', label: '新進車輛', activeMatch: '/' },
    { href: '/cars', label: '全部車輛與找車', activeMatch: '/cars' },
    ...(features.sellInquiry ? [{ href: '/sell', label: '賣車詢問', activeMatch: '/sell' }] : []),
    ...(features.aboutPage ? [{ href: '/about', label: '關於', activeMatch: '/about' }] : []),
    ...(features.contactPage ? [{ href: '/contact', label: '聯絡', activeMatch: '/contact' }] : []),
  ];
}
