import React, { useState } from 'react';
import { Button } from 'react-bootstrap';
import { Filter, FileDown, X } from 'lucide-react';
import styles from './TrackerFab.module.css';

export default function TrackerFab({ onFiltersClick, onExportClick }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.wrap}>
      {open && (
        <div className={styles.menu}>
          <Button size="sm" variant="light" className="shadow-sm" onClick={() => { onFiltersClick?.(); setOpen(false); }}>
            <Filter size={14} className="me-1" /> Filters
          </Button>
          <Button size="sm" variant="light" className="shadow-sm" onClick={() => { onExportClick?.(); setOpen(false); }}>
            <FileDown size={14} className="me-1" /> Export
          </Button>
        </div>
      )}
      <Button
        className={styles.fab}
        variant="primary"
        onClick={() => setOpen((v) => !v)}
        aria-label="Tracker actions"
      >
        {open ? <X size={18} /> : <Filter size={18} />}
      </Button>
    </div>
  );
}
