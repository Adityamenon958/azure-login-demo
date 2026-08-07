import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { ANALYTICS_PRESETS } from '../../constants/analyticsConfig';
import { analyticsExportUrl } from '../../services/trackerApi';
import {
  formatAnalyticsDayLabel,
  isoToDateInputValue,
} from '../../utils/analyticsFormatters';
import styles from './AnalyticsFilterBar.module.css';

/** Presets + day stepper + custom range picker + search + export. */
export default function AnalyticsFilterBar({
  preset,
  onPreset,
  onCustomRange,
  search,
  onSearch,
  from,
  to,
  onPrevDay,
  onNextDay,
  canGoNext = true,
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const customWrapRef = useRef(null);

  const dayLabel = formatAnalyticsDayLabel(to);
  const todayYmd = isoToDateInputValue(new Date().toISOString());

  // Sync draft inputs when opening / when range changes while open
  useEffect(() => {
    if (!customOpen) return;
    setDraftFrom(isoToDateInputValue(from));
    setDraftTo(isoToDateInputValue(to));
  }, [customOpen, from, to]);

  // Close popover on outside click
  useEffect(() => {
    if (!customOpen) return undefined;
    const onDoc = (e) => {
      if (customWrapRef.current && !customWrapRef.current.contains(e.target)) {
        setCustomOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [customOpen]);

  const handlePresetClick = (key) => {
    if (key === 'custom') {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onPreset?.(key);
  };

  const applyCustom = () => {
    if (!draftFrom || !draftTo) return;
    onCustomRange?.(draftFrom, draftTo);
    setCustomOpen(false);
  };

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
      <div className={styles.left}>
        <div className={styles.presetsWrap} ref={customWrapRef}>
          <div className={styles.presets}>
            {ANALYTICS_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`${styles.chip} ${preset === p.key ? styles.active : ''}`}
                onClick={() => handlePresetClick(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {customOpen && (
            <div className={styles.customPopover} role="dialog" aria-label="Custom date range">
              <div className={styles.customTitle}>Custom range</div>
              <label className={styles.customField}>
                <span>From</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={draftFrom}
                  max={draftTo || todayYmd}
                  onChange={(e) => setDraftFrom(e.target.value)}
                />
              </label>
              <label className={styles.customField}>
                <span>To</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={draftTo}
                  min={draftFrom || undefined}
                  max={todayYmd}
                  onChange={(e) => setDraftTo(e.target.value)}
                />
              </label>
              <div className={styles.customActions}>
                <button
                  type="button"
                  className={styles.customCancel}
                  onClick={() => setCustomOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.customApply}
                  onClick={applyCustom}
                  disabled={!draftFrom || !draftTo}
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={styles.dayNav} aria-label="Day selector">
          <button
            type="button"
            className={styles.dayBtn}
            onClick={() => onPrevDay?.()}
            aria-label="Previous day"
          >
            <ChevronLeft size={16} strokeWidth={2.25} />
          </button>
          <span className={styles.dayLabel}>{dayLabel}</span>
          <button
            type="button"
            className={styles.dayBtn}
            onClick={() => onNextDay?.()}
            disabled={!canGoNext}
            aria-label="Next day"
          >
            <ChevronRight size={16} strokeWidth={2.25} />
          </button>
        </div>
      </div>

      <div className={styles.right}>
        <input
          className={styles.search}
          type="search"
          placeholder="Search vehicle…"
          value={search || ''}
          onChange={(e) => onSearch?.(e.target.value)}
        />
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
