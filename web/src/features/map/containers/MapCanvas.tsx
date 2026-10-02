"use client";
import { useEffect, useMemo } from "react";
import { divIcon, type LatLngBoundsExpression } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useTranslations } from "next-intl";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import styles from "../components/map.module.css";
import { categoryColors, proposalPath, type MapPlace } from "../lib/places";

/** Fit only when coordinates change, not on every poll or rerender; preserve manual exploration. */
function FitPlaces({ coordinates }: { coordinates: string }) {
  const map = useMap();
  useEffect(() => {
    const points = JSON.parse(coordinates) as LatLngBoundsExpression;
    map.fitBounds(points, { padding: [36, 52], maxZoom: 14, animate: false });
  }, [coordinates, map]);
  return null;
}
function PlaceMarker({
  place,
  tripId,
  crewId,
}: {
  place: MapPlace;
  tripId: string;
  crewId: string;
}) {
  const t = useTranslations("map");
  const category = t(`category.${place.proposal.category}`);
  const icon = useMemo(() => {
    // DivIcon accepts an HTMLElement: textContent never interprets a proposal or translated label as HTML.
    const pin = document.createElement("span");
    pin.className = styles.pin;
    pin.style.setProperty(
      "--marker-color",
      categoryColors[place.proposal.category],
    );
    const number = document.createElement("span");
    number.className = styles.number;
    number.textContent = String(place.number);
    const label = document.createElement("span");
    label.className = styles.label;
    label.textContent = category;
    pin.append(number, label);
    return divIcon({
      html: pin,
      className: styles.marker,
      iconSize: [44, 62],
      iconAnchor: [22, 22],
      popupAnchor: [0, -22],
    });
  }, [place.number, place.proposal.category, category]);
  return (
    <Marker
      position={place.position}
      icon={icon}
      title={`${place.proposal.title} · ${category}`}
      alt={`${place.proposal.title} · ${category}`}
      keyboard
      autoPanOnFocus
    >
      <Popup>
        <div className="space-y-2">
          <p className="text-sm text-muted">
            {category} · {t(`status.${place.proposal.status}`)}
          </p>
          <h3 className="text-base font-semibold">{place.proposal.title}</h3>
          <Link
            href={proposalPath(crewId, tripId, place.proposal.id)}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            {t("openProposal")}
          </Link>
        </div>
      </Popup>
    </Marker>
  );
}
export default function MapCanvas({
  places,
  tripId,
  crewId,
}: {
  places: MapPlace[];
  tripId: string;
  crewId: string;
}) {
  const t = useTranslations("map");
  const attribution = useMemo(() => {
    const link = document.createElement("a");
    link.href = "https://www.openstreetmap.org/copyright";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = t("attribution");
    return link.outerHTML;
  }, [t]);
  const coordinates = JSON.stringify(places.map((place) => place.position));
  return (
    <MapContainer
      className={styles.canvas}
      center={places[0].position}
      zoom={11}
      scrollWheelZoom={false}
      zoomAnimation={false}
      fadeAnimation={false}
      markerZoomAnimation={false}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution={attribution}
        maxZoom={19}
        keepBuffer={0}
        updateWhenIdle
        updateWhenZooming={false}
      />
      <FitPlaces coordinates={coordinates} />
      {places.map((place) => (
        <PlaceMarker
          key={place.proposal.id}
          place={place}
          tripId={tripId}
          crewId={crewId}
        />
      ))}
    </MapContainer>
  );
}
