export interface ApiLimitSettings {
  users: number;
  hunters: number;
  listers: number;
  products: number;
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

export interface SystemSettingsResponse {
  apiLimits: ApiLimitSettings;
  ipRestriction: IpRestrictionSettings;
  currentIp: string;
  ipRestrictionWarning: string;
}
