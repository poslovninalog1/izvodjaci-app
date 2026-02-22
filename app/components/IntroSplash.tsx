"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const INTRO_SEEN_KEY = "intro_seen";
const PODGORICA = { lat: 42.441, lng: 19.2636 };
const ZOOM_INITIAL = 7;
const ZOOM_FINAL = 10;
const ZOOM_DURATION_MS = 1200;

/** Red pin SVG for Leaflet DivIcon */
const RED_PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="32" height="48"><path fill="#dc2626" stroke="#b91c1c" stroke-width="1.5" d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0zm0 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>';

const CARTO_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

type IntroSplashProps = {
  onDismiss: () => void;
};

export default function IntroSplash({ onDismiss }: IntroSplashProps) {
  const router = useRouter();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || typeof window === "undefined") return;

    let mounted = true;

    const initMap = async () => {
      const L = (await import("leaflet")).default;

      if (!mounted || !mapContainerRef.current) return;

      const map = L.map(mapContainerRef.current, {
        center: [PODGORICA.lat, PODGORICA.lng],
        zoom: ZOOM_INITIAL,
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

      map.setView([PODGORICA.lat, PODGORICA.lng], ZOOM_FINAL, {
        animate: true,
        duration: ZOOM_DURATION_MS / 1000,
      });

      const redPinIcon = L.divIcon({
        html: RED_PIN_SVG,
        className: "intro-splash-pin",
        iconSize: [32, 48],
        iconAnchor: [16, 48],
      });
      L.marker([PODGORICA.lat, PODGORICA.lng], { icon: redPinIcon }).addTo(map);
    };

    initMap();

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const handleDismiss = () => {
    if (typeof window === "undefined") return;
    localStorage.setItem(INTRO_SEEN_KEY, "1");
    onDismiss();
  };

  const handleCta = () => {
    if (typeof window === "undefined") return;
    localStorage.setItem(INTRO_SEEN_KEY, "1");
    onDismiss();
    router.push("/jobs");
  };

  return (
    <section
      className="intro-splash-section"
      style={{
        width: "100%",
        maxWidth: 1200,
        margin: "0 auto",
        padding: "24px 0",
      }}
    >
      <div className="intro-splash-grid" style={{ position: "relative" }}>
        <button
          type="button"
          aria-label="Zatvori"
          onClick={handleDismiss}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "1px solid var(--border)",
            background: "#fff",
            color: "var(--muted)",
            fontSize: 18,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          ×
        </button>

        {/* Left: map card */}
        <div
          style={{
            width: "100%",
            maxWidth: 520,
            height: 360,
            borderRadius: 16,
            boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
            overflow: "hidden",
            border: "1px solid var(--border)",
            justifySelf: "center",
          }}
        >
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
