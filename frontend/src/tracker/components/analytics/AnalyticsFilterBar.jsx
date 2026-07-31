import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { ANALYTICS_PRESETS } from '../../constants/analyticsConfig';
import { analyticsExportUrl } from '../../services/trackerApi';
import styles from './AnalyticsFilterBar.module.css';

export default function AnalyticsFilterBar({
  preset,
  onPreset,
  search,
  onSearch,
  from,
  to,
  onRefresh,
}) {
  const [exportOpen, setExportOpen] = useState(false);

  const download = async (format) => {
    try {
      const url = analyticsExportUrl({ from, to, format });
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const disp = res.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/.exec(disp);
      const filename = match?.[1] || `fleet-analytics.${format}`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.message || 'Export failed');
    } finally {
      setExportOpen(false);
    }
  };

  return (
    <div className={styles.bar}>
      <div className={styles.presets}>
        {ANALYTICS_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`${styles.chip} ${preset === p.key ? styles.active : ''}`}
            onClick={() => onPreset?.(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className={styles.right}>
        <input
          className={styles.search}
          type="search"
          placeholder="Search vehicle…"
          value={search || ''}
          onChange={(e) => onSearch?.(e.target.value)}
        />
        <button type="button" className={styles.exportBtn} onClick={onRefresh}>
          Refresh
        </button>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() => setExportOpen((v) => !v)}
          >
            <Download size={14} /> Export
          </button>
          {exportOpen && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '110%',
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,.08)',
                zIndex: 20,
                minWidth: 120,
              }}
            >
              {['csv', 'xlsx', 'pdf'].map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  className={styles.exportBtn}
                  style={{ width: '100%', border: 'none', borderRadius: 0 }}
                  onClick={() => download(fmt)}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
