import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/**
 * ✅ Prevent accidental page-scroll zooming the map.
 * Wheel zoom stays off until the user clicks the map once;
 * leaving the map disables it again.
 */
export default function ScrollWheelZoomOnFocus() {
  const map = useMap();

  useEffect(() => {
    map.scrollWheelZoom.disable();
    const el = map.getContainer();

    const enable = () => {
      map.scrollWheelZoom.enable();
    };
    const disable = () => {
      map.scrollWheelZoom.disable();
    };

    el.addEventListener('click', enable);
    el.addEventListener('mouseleave', disable);

    return () => {
      el.removeEventListener('click', enable);
      el.removeEventListener('mouseleave', disable);
      map.scrollWheelZoom.disable();
    };
  }, [map]);

  return null;
}
