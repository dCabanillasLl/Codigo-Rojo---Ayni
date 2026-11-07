import { useEffect, useState } from "react";

export type MapService = {
  name: string;
  owner: string;
  latitude: number;
  longitude: number;
  mapNumber: number;
};

export default function ServicesMap({
  services,
  selected,
  onSelect,
  radius,
}: {
  services: MapService[];
  selected: MapService | undefined;
  onSelect: (name: string) => void;
  radius: number;
}) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const coordinates = selected ? `${selected.latitude},${selected.longitude}` : "-12.073,-77.063";
  const zoom = radius <= 1000 ? 16 : radius <= 1500 ? 15 : 14;
  const mapUrl = `https://www.google.com/maps?${new URLSearchParams({
    q: coordinates,
    z: String(zoom),
    hl: "es",
    output: "embed",
  })}`;

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  return (
    <section className="services-map-panel" aria-labelledby="services-map-title">
      <div className="services-map-heading">
        <div>
          <p className="eyebrow">EXPLORA TU BARRIO</p>
          <h2 id="services-map-title" className="font-display">
            Servicios en el mapa
          </h2>
        </div>
        <span className="map-count">{services.length} ubicaciones</span>
      </div>
      <div
        className="map-service-picker"
        role="group"
        aria-label="Elegir servicio para mostrar en Google Maps"
      >
        {services.map((service) => (
          <button
            key={service.name}
            className={`map-service-option ${selected?.name === service.name ? "selected" : ""}`}
            aria-pressed={selected?.name === service.name}
            onClick={() => onSelect(service.name)}
          >
            <span className="listing-map-number">{service.mapNumber}</span>
            {service.owner}
          </button>
        ))}
      </div>
      <div className="services-map">
        <iframe
          key={mapUrl}
          className="google-map-frame"
          src={mapUrl}
          title={
            selected ? `Google Maps: ubicación de ${selected.owner}` : "Google Maps: Pueblo Libre"
          }
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
      {!online && (
        <p className="map-network-notice" role="status">
          Google Maps necesita conexión a internet. Puedes seguir consultando la lista de servicios.
        </p>
      )}
      <div className="map-service-details" aria-live="polite">
        {selected ? (
          <>
            <span className="map-service-number">{selected.mapNumber}</span>
            <div className="map-service-copy">
              <h3>{selected.owner}</h3>
              <p>{selected.name}</p>
              <span>Punto de demostración · Pueblo Libre</span>
            </div>
            <a
              className="map-directions"
              href={`https://www.google.com/maps/dir/?api=1&destination=${selected.latitude},${selected.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Cómo llegar <span className="sr-only">a {selected.owner} (abre otra pestaña)</span>
            </a>
          </>
        ) : (
          <p>No hay servicios para esta búsqueda. Prueba otro término.</p>
        )}
      </div>
      <p className="map-demo-note">
        Selecciona un servicio para ver su punto en Google Maps. Ubicaciones de demostración, no
        direcciones verificadas.
      </p>
    </section>
  );
}
