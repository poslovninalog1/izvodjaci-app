"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const CARTO_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const EUROPE = { lat: 50.0, lng: 10.0, zoom: 4 };
const MONTENEGRO = { lat: 42.7087, lng: 19.3744, zoom: 7 };
const PODGORICA = { lat: 42.441, lng: 19.2636, zoom: 10 };

const RED_PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="32" height="48"><path fill="#dc2626" stroke="#b91c1c" stroke-width="1.5" d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0zm0 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>';

export default function LandingHero() {
  const router = useRouter();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current || typeof window === "undefined") return;

    let mounted = true;

    const initMap = async () => {
      const L = (await import("leaflet")).default;

      if (!mounted || !mapContainerRef.current) return;

      const map = L.map(mapContainerRef.current, {
        center: [EUROPE.lat, EUROPE.lng],
        zoom: EUROPE.zoom,
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
      });

      L.tileLayer(CARTO_TILES, { attribution: CARTO_ATTRIBUTION }).addTo(map);
      mapRef.current = map;

      const t1 = window.setTimeout(() => {
        if (!mounted || !mapRef.current) return;
        mapRef.current.setView([MONTENEGRO.lat, MONTENEGRO.lng], MONTENEGRO.zoom, {
          animate: true,
          duration: 0.8,
        });
      }, 300);

      const t2 = window.setTimeout(() => {
        if (!mounted || !mapRef.current) return;
        mapRef.current.setView([PODGORICA.lat, PODGORICA.lng], PODGORICA.zoom, {
          animate: true,
          duration: 1.2,
        });
      }, 300 + 1200);

      const t3 = window.setTimeout(() => {
        if (!mounted || !mapRef.current) return;
        const redPinIcon = L.divIcon({
          html: RED_PIN_SVG,
          className: "landing-hero-pin",
          iconSize: [32, 48],
          iconAnchor: [16, 48],
        });
        L.marker([PODGORICA.lat, PODGORICA.lng], { icon: redPinIcon }).addTo(mapRef.current);
      }, 300 + 1200 + 1200);

      timersRef.current = [t1, t2, t3];
    };

    initMap();

    return () => {
      mounted = false;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const handleCta = () => {
    router.push("/jobs");
  };

  return (
    <section
      className="landing-hero"
      style={{
        width: "100%",
        maxWidth: 1200,
        margin: "0 auto",
        padding: "24px 0",
      }}
    >
      <div className="landing-hero-grid">
        {/* Left: map card */}
        <div className="landing-hero-map-card">
          <div
            ref={mapContainerRef}
            style={{
              width: "100%",
              height: "100%",
              background: "#f8fafc",
            }}
          />
        </div>

        {/* Right: text + CTA */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "1rem 0",
          }}
        >
          <h1
            style={{
              margin: "0 0 1rem",
              fontSize: "clamp(1.5rem, 3vw, 2rem)",
              fontWeight: 700,
              color: "var(--text)",
              lineHeight: 1.2,
            }}
          >
            Tvoj sljedeći posao počinje ovdje
          </h1>
          <p
            style={{
              margin: "0 0 1.5rem",
              fontSize: "1rem",
              lineHeight: 1.6,
              color: "var(--muted)",
            }}
          >
            Bez obzira da li si majstor, pomoćni radnik ili tek učiš — ovdje
            nalaziš poslove, ljude i prilike. Gradi karijeru, skupljaj iskustvo i
            napravi svoju ekipu.
          </p>
          <button
            type="button"
            onClick={handleCta}
            style={{
              padding: "12px 24px",
              fontSize: 16,
              fontWeight: 600,
              color: "#fff",
              background: "var(--accent)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
            }}
          >
            Kreni odmah
          </button>
        </div>
      </div>
    </section>
  );
}
