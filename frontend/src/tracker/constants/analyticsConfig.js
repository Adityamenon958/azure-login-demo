/** Fleet Analytics config — labels, bands, presets */

export const ANALYTICS_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Week' },
  { key: '30d', label: 'Month' },
  { key: 'custom', label: 'Custom' },
];

export const HEALTH_BANDS = {
  healthy: { min: 75, label: 'Healthy', color: '#15803d' },
  attention: { min: 50, label: 'Attention', color: '#ca8a04' },
  critical: { min: 0, label: 'Critical', color: '#dc2626' },
};

export const OFFLINE_BUCKET_LABELS = {
  online: 'Online',
  offline1d: 'Offline < 1 day',
  offline3d: 'Offline 1–3 days',
  offline7d: 'Offline 3–7 days',
  offline30plus: 'Offline 30+ days',
};
