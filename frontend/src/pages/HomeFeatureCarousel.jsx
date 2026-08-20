// HomeFeatureCarousel.jsx — feature showcase; follows hovered dashboard card
import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ADMIN_TILES, DASHBOARD_TILES } from './homePortalTiles';
import styles from './HomeFeatureCarousel.module.css';

const AUTO_MS = 5500;

function FeatureVisual({ tileId }) {
  switch (tileId) {
    case 'fleet-monitor':
      return (
        <div className={`${styles.visual} ${styles.visualBars}`} aria-hidden>
          {[62, 88, 45, 74, 56, 91].map((h, i) => (
            <span key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
      );
    case 'fleet-map':
      return (
        <div className={`${styles.visual} ${styles.visualMap}`} aria-hidden>
          <span className={styles.pin} style={{ top: '28%', left: '32%' }} />
          <span className={styles.pin} style={{ top: '48%', left: '58%' }} />
          <span className={styles.pin} style={{ top: '62%', left: '40%' }} />
          <span className={styles.route} />
        </div>
      );
    case 'attendance':
      return (
        <div className={`${styles.visual} ${styles.visualList}`} aria-hidden>
          <span className={styles.listRow}><i className={styles.dotOk} /> Present · 42</span>
          <span className={styles.listRow}><i className={styles.dotWarn} /> Late · 5</span>
          <span className={styles.listRow}><i className={styles.dotBad} /> Absent · 3</span>
        </div>
      );
    case 'crane-overview':
      return (
        <div className={`${styles.visual} ${styles.visualRings}`} aria-hidden>
          <span /><span /><span />
        </div>
      );
    case 'elevator-overview':
      return (
        <div className={`${styles.visual} ${styles.visualFloors}`} aria-hidden>
          <span /><span className={styles.floorActive} /><span /><span />
        </div>
      );
    case 'energy-overview':
      return (
        <div className={`${styles.visual} ${styles.visualSpark}`} aria-hidden>
          <svg viewBox="0 0 120 48" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinejoin="round"
              points="0,34 18,28 36,32 54,18 72,22 90,10 120,16"
            />
          </svg>
        </div>
      );
    case 'fleet-alarms':
      return (
        <div className={`${styles.visual} ${styles.visualAlarms}`} aria-hidden>
          <span className={styles.alarmChip}>High current</span>
          <span className={styles.alarmChip}>PF drop</span>
          <span className={styles.alarmChip}>Offline</span>
        </div>
      );
    case 'manage-users':
      return (
        <div className={`${styles.visual} ${styles.visualList}`} aria-hidden>
          <span className={styles.listRow}><i className={styles.dotOk} /> Admin · 2</span>
          <span className={styles.listRow}><i className={styles.dotWarn} /> User · 7</span>
          <span className={styles.listRow}><i className={styles.dotOk} /> Invites ready</span>
        </div>
      );
    case 'manage-device':
      return (
        <div className={`${styles.visual} ${styles.visualGauges}`} aria-hidden>
          <span /><span /><span />
        </div>
      );
    case 'manage-company':
    case 'subscription':
    case 'settings':
    case 'simulator':
    default:
      return (
        <div className={`${styles.visual} ${styles.visualDocs}`} aria-hidden>
          <span /><span /><span />
        </div>
      );
  }
}

/**
 * @param {string|null} focusTileId — when a left card is hovered, show that slide and pause
 */
export default function HomeFeatureCarousel({ focusTileId = null }) {
  const slides = DASHBOARD_TILES;
  const allSlides = [...DASHBOARD_TILES, ...ADMIN_TILES];
  const [index, setIndex] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);

  // ✅ Hover on dashboard or admin cards drives which slide is shown
  useEffect(() => {
    if (!focusTileId) return;
    const next = slides.findIndex((s) => s.id === focusTileId);
    if (next >= 0) setIndex(next);
  }, [focusTileId, slides]);

  const cardPinned = Boolean(focusTileId);
  const paused = hoverPaused || cardPinned;

  useEffect(() => {
    if (paused || slides.length < 2) return undefined;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [paused, slides.length]);

  const hoveredSlide = focusTileId
    ? allSlides.find((s) => s.id === focusTileId)
    : null;
  const slide = hoveredSlide || slides[index] || slides[0];
  const Icon = slide.icon;

  const go = (next) => {
    setIndex((prev) => (prev + next + slides.length) % slides.length);
  };

  return (
    <aside
      className={styles.carousel}
      style={{ '--slide-accent': slide.accent }}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      aria-roledescription="carousel"
      aria-label="Dashboard features"
    >
      <div className={styles.header}>
        <p className={styles.heading}>
          {cardPinned ? 'Hover preview' : 'What each dashboard does'}
        </p>
      </div>

      <div className={styles.stage} key={slide.id}>
        <div className={styles.stageTop}>
          <span className={styles.iconWrap} aria-hidden>
            <Icon size={22} />
          </span>
          <div>
            <h3 className={styles.title}>{slide.title}</h3>
            <p className={styles.subtitle}>{slide.description}</p>
          </div>
        </div>

        <FeatureVisual tileId={slide.id} />

        <ul className={styles.highlights}>
          {(slide.highlights || []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => go(-1)}
          aria-label="Previous feature"
          disabled={cardPinned}
        >
          <ChevronLeft size={16} />
        </button>
        <div className={styles.dots} role="tablist" aria-label="Slides">
          {slides.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`Show ${item.title}`}
              disabled={cardPinned}
            />
          ))}
        </div>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => go(1)}
          aria-label="Next feature"
          disabled={cardPinned}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className={styles.progressTrack} aria-hidden>
        <span
          key={`${slide.id}-${paused}`}
          className={`${styles.progressBar} ${paused ? styles.progressPaused : ''}`}
        />
      </div>
    </aside>
  );
}
