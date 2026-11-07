import type { Publication, Sector } from './types';

export default function ServicesMap({ services, selected, onSelect, sectors, online }: { services: Publication[]; selected: Publication | undefined; onSelect: (id: string) => void; sectors: Sector[]; online: boolean }) {
  const sector = sectors.find(item => item.id === selected?.sectorId);
  const place = selected ? `${selected.sectorNombre}, ${sector?.distrito || ''}, ${sector?.ciudad || ''}, Perú` : '';
  return <section className="services-map-panel" aria-labelledby="services-map-title">
    <div className="services-map-heading"><div><p className="eyebrow">EXPLORA TU BARRIO</p><h2 id="services-map-title" className="font-display">Servicios en el mapa</h2></div><span className="map-count">{services.length} publicaciones</span></div>
    <div className="map-service-picker" role="group" aria-label="Elegir publicación para explorar su zona">{services.map((service,index) => <button key={service.id} className={`map-service-option ${selected?.id === service.id ? 'selected' : ''}`} aria-pressed={selected?.id === service.id} onClick={() => onSelect(service.id)}><span className="listing-map-number">{index+1}</span>{service.titulo}</button>)}</div>
    {selected && online ? <div className="services-map"><iframe className="google-map-frame" src={`https://www.google.com/maps?${new URLSearchParams({q:place,z:'14',hl:'es',output:'embed'})}`} title={`Mapa de referencia del sector ${selected.sectorNombre}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen/></div> : <p className="map-demo-note">{!online ? 'El mapa necesita internet. Puedes seguir consultando las publicaciones guardadas.' : 'Selecciona una publicación para explorar su sector.'}</p>}
    {selected && <div className="map-service-details"><div className="map-service-copy"><h3>{selected.titulo}</h3><p>{selected.propietario} · {selected.sectorNombre}</p><span>Referencia del sector, no del domicilio</span></div><a className="map-directions" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`} target="_blank" rel="noopener noreferrer">Explorar zona<span className="sr-only"> (abre otra pestaña)</span></a></div>}
    <p className="map-demo-note">El mapa muestra una referencia del sector. La dirección exacta del vecino se mantiene privada.</p>
  </section>;
}
