import type { SiteSettings } from './settings';

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
  return {
    compare: settings.featureCompareEnabled !== false,
    sellInquiry: settings.featureSellInquiryEnabled !== false,
    contactPage: settings.featureContactPageEnabled !== false,
    aboutPage: settings.featureAboutPageEnabled !== false,
    socialIcons: settings.featureSocialIconsEnabled !== false,
    directContact: settings.featureDirectContactEnabled !== false,
    heroVideos: settings.videoSectionEnabled === true,
    videoLinks: settings.videoLinksEnabled === true,
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
