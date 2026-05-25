export const BRANDING = {
  productName: 'TrendWave Commerce Hub',
  shortProductName: 'Commerce Hub',
  companyName: 'Trend Wave Solutions',
  logoLabel: 'TrendWave',
  sidebarSubtitle: 'Commerce Hub',
  loginEyebrow: 'Trend Wave Commerce Ecosystem',
  loginTitle: 'Welcome back',
  loginDescription: 'Manage research, listings, reporting, and marketplace operations.',
  version: 'v1.4',
  environmentLabel: 'Local',
  platforms: [
    {
      key: 'operations',
      label: 'Commerce Hub',
      description: 'Operate hunting, listing, reporting, and approvals in one workspace.',
      icon: 'hub',
      href: '/',
      external: false,
    },
    {
      key: 'workspace',
      label: 'Workspace Portal',
      description: '',
      icon: 'travel_explore',
      href: 'https://workspace.trendwavesolutions.com/',
      external: true,
    },
    {
      key: 'corporate',
      label: 'Corporate Website',
      description: '',
      icon: 'language',
      href: 'https://trendwavesolutions.com/',
      external: true,
    },
  ],
} as const;

export type BrandingPlatformLink = (typeof BRANDING.platforms)[number];
