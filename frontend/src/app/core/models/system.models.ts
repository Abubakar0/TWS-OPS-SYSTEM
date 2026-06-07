export interface ApiLimitSettings {
  users: number;
  hunters: number;
  listers: number;
  products: number;
  orders: number;
  accounts: number;
  reports: number;
  assignments: number;
  activity: number;
  listingQueue: number;
  rejections: number;
}

export interface AllowedIpEntry {
  id: string;
  ip: string;
  label: string;
  active: boolean;
}

export interface IpRestrictionSettings {
  enabled: boolean;
  allowedIps: AllowedIpEntry[];
}

export interface AnnouncementBarSettings {
  enabled: boolean;
  tone: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  message: string;
  updatedAt: string | null;
}

export interface HrSettings {
  allowEmployeeProfileEditing: boolean;
}

export interface SystemSettingsResponse {
  apiLimits: ApiLimitSettings;
  ipRestriction: IpRestrictionSettings;
  announcementBar: AnnouncementBarSettings;
  hrSettings: HrSettings;
  currentIp: string;
  ipRestrictionWarning: string;
}
