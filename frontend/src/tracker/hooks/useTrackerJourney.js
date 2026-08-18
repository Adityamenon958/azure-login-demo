import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJourney, fetchTripSummary } from '../services/trackerApi';

function isCanceled(err) {
  return err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';
}

function errorMessage(err) {
  return err?.response?.data?.error?.message || err?.message || 'Request failed';
}

function boundsOf(path) {
  if (!path || path.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of path) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return { north: maxLat, south: minLat, east: maxLon, west: minLon };
}

/** Append new GPS points; drop anything that slid out of a rolling 1h/3h window. */
function mergeJourneyDelta(prev, delta, fromIso) {
  const cut = fromIso ? new Date(fromIso).getTime() : 0;
  const prevPath = prev?.path || [];
  const lastT = prevPath.length ? prevPath[prevPath.length - 1].t : null;
  const extra = (delta?.path || []).filter((p) => !lastT || p.t > lastT);
  const path = [...prevPath, ...extra].filter((p) => new Date(p.t).getTime() >= cut);
  const stops = (prev?.stops || []).filter((s) => {
    const end = new Date(s.departedAt || s.arrivedAt).getTime();
    return Number.isFinite(end) && end >= cut;
  });
  const timeline = (prev?.timeline || []).filter((t) => {
    const ts = new Date(t.timestamp).getTime();
    return Number.isFinite(ts) && ts >= cut;
  });
  return {
    ...(prev || {}),
    path,
    stops,
    timeline,
    events: prev?.events || [],
    bounds: boundsOf(path),
    to: delta?.to || prev?.to,
    incremental: true,
  };
}

function windowIdFor(deviceId, from, to, preset) {
  if (!preset || preset === 'custom') return `${deviceId}|custom|${from}|${to}`;
  if (preset === 'today') {
    return `${deviceId}|today|${new Date(from).toDateString()}`;
  }
  return `${deviceId}|${preset}`;
}

/**
 * Path+stops first, timeline second (reuses backend cache).
 * Rolling `to` slides only fetch points after the last path timestamp.
 */
export function useTrackerJourney(deviceId, from, to, preset = 'today') {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const lastPathTRef = useRef(null);
  const windowRef = useRef('');
  const seqRef = useRef(0);

  const windowId = windowIdFor(deviceId, from, to, preset);

  const loadFull = useCallback(
    async (signal, seq) => {
      if (!deviceId || !from || !to) return;
      setLoading(true);
      lastPathTRef.current = null;
      try {
        const res = await fetchJourney(
          deviceId,
          { from, to, include: 'path,stops' },
          { signal }
        );
        if (seq !== seqRef.current) return;
        const payload = res?.data ?? res;
        setData(payload);
        lastPathTRef.current = payload.path?.[payload.path.length - 1]?.t || null;
        setError(null);
      } catch (err) {
        if (isCanceled(err) || seq !== seqRef.current) return;
        setError(errorMessage(err));
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }

      setTimelineLoading(true);
      try {
        const res = await fetchJourney(
          deviceId,
          { from, to, include: 'timeline' },
          { signal }
        );
        if (seq !== seqRef.current) return;
        const payload = res?.data ?? res;
        setData((prev) => ({
          ...(prev || {}),
          timeline: payload.timeline || [],
          events: payload.events || [],
        }));
      } catch (err) {
        if (isCanceled(err) || seq !== seqRef.current) return;
      } finally {
        if (seq === seqRef.current) setTimelineLoading(false);
      }
    },
    [deviceId, from, to]
  );

  const loadDelta = useCallback(
    async (signal, seq) => {
      const after = lastPathTRef.current;
      if (!after) {
        await loadFull(signal, seq);
        return;
      }
      try {
        const res = await fetchJourney(
          deviceId,
          { from, to, after, include: 'path' },
          { signal }
        );
        if (seq !== seqRef.current) return;
        const delta = res?.data ?? res;
        setData((prev) => {
          const next = mergeJourneyDelta(prev, delta, from);
          lastPathTRef.current = next.path?.[next.path.length - 1]?.t || after;
          return next;
        });
      } catch (err) {
        if (isCanceled(err) || seq !== seqRef.current) return;
      }
    },
    [deviceId, from, to, loadFull]
  );

  useEffect(() => {
    if (!deviceId || !from || !to) return undefined;
    const ac = new AbortController();
    seqRef.current += 1;
    const seq = seqRef.current;
    windowRef.current = windowId;
    lastPathTRef.current = null;
    setData(null);
    loadFull(ac.signal, seq);
    return () => ac.abort();
    // ❗ windowId only — a 60s `to` slide must not abort the first path load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, windowId]);

  useEffect(() => {
    if (!deviceId || !from || !to) return undefined;
    if (windowRef.current !== windowId) return undefined;
    if (!lastPathTRef.current) return undefined;
    const ac = new AbortController();
    seqRef.current += 1;
    const seq = seqRef.current;
    loadDelta(ac.signal, seq);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const refresh = useCallback(() => {
    seqRef.current += 1;
    lastPathTRef.current = null;
    loadFull(undefined, seqRef.current);
  }, [loadFull]);

  return { data, error, loading, timelineLoading, refresh };
}

/**
 * Availability / hours cards — TrackerStat, silent refresh when only `to` slides.
 */
export function useTrackerTripSummary(deviceId, from, to, preset = 'today') {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const windowRef = useRef('');
  const seqRef = useRef(0);
  const windowId = windowIdFor(deviceId, from, to, preset);

  const load = useCallback(
    async (silent, signal, seq) => {
      if (!deviceId || !from || !to) return;
      if (!silent) setLoading(true);
      try {
        const res = await fetchTripSummary(deviceId, { from, to }, { signal });
        if (seq !== seqRef.current) return;
        setData(res?.data ?? res);
        setError(null);
      } catch (err) {
        if (isCanceled(err) || seq !== seqRef.current) return;
        setError(errorMessage(err));
      } finally {
        if (seq === seqRef.current && !silent) setLoading(false);
      }
    },
    [deviceId, from, to]
  );

  useEffect(() => {
    if (!deviceId || !from || !to) return undefined;
    const ac = new AbortController();
    seqRef.current += 1;
    const seq = seqRef.current;
    const isNewWindow = windowRef.current !== windowId;
    windowRef.current = windowId;
    if (isNewWindow) setData(null);
    load(!isNewWindow, ac.signal, seq);
    return () => ac.abort();
  }, [deviceId, from, to, windowId, load]);

  const refresh = useCallback(() => {
    seqRef.current += 1;
    load(true, undefined, seqRef.current);
  }, [load]);

  return { data, error, loading, refresh };
}
