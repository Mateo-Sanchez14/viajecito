export const tripPath = (crewId: string, tripId: string) =>
  `/crews/${crewId}/trips/${tripId}`;

export const sectionPath = (crewId: string, tripId: string, section: string) =>
  `${tripPath(crewId, tripId)}/${section}`;
