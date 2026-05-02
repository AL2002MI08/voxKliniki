const db = require('../db');

// Approximate center coordinates for every Rwanda district + common aliases.
// Used to convert a district/city name from the AI into lat/lng for distance queries.
const DISTRICT_COORDS = {
  // Kigali City
  'kigali':     { lat: -1.9441, lng: 30.0619 },
  'gasabo':     { lat: -1.9006, lng: 30.1044 },
  'kicukiro':   { lat: -1.9988, lng: 30.1003 },
  'nyarugenge': { lat: -1.9536, lng: 30.0587 },
  // Northern Province
  'musanze':    { lat: -1.4986, lng: 29.6347 },
  'ruhengeri':  { lat: -1.4986, lng: 29.6347 }, // alias
  'gicumbi':    { lat: -1.5763, lng: 30.0671 },
  'byumba':     { lat: -1.5763, lng: 30.0671 }, // alias
  'burera':     { lat: -1.4678, lng: 29.8367 },
  'gakenke':    { lat: -1.6897, lng: 29.7814 },
  'rulindo':    { lat: -1.7259, lng: 30.0378 },
  // Southern Province
  'huye':       { lat: -2.5988, lng: 29.7389 },
  'butare':     { lat: -2.5988, lng: 29.7389 }, // alias
  'muhanga':    { lat: -2.0845, lng: 29.7569 },
  'gitarama':   { lat: -2.0845, lng: 29.7569 }, // alias
  'nyanza':     { lat: -2.3506, lng: 29.7453 },
  'ruhango':    { lat: -2.2256, lng: 29.7836 },
  'kamonyi':    { lat: -1.9736, lng: 29.8786 },
  'nyamagabe':  { lat: -2.4931, lng: 29.4956 },
  'gisagara':   { lat: -2.6022, lng: 29.8328 },
  'nyaruguru':  { lat: -2.7014, lng: 29.5486 },
  // Eastern Province
  'rwamagana':  { lat: -1.9494, lng: 30.4356 },
  'kayonza':    { lat: -1.8775, lng: 30.6478 },
  'ngoma':      { lat: -2.1594, lng: 30.5344 },
  'kibungo':    { lat: -2.1594, lng: 30.5344 }, // alias
  'kirehe':     { lat: -2.2839, lng: 30.6697 },
  'bugesera':   { lat: -2.1395, lng: 30.0516 },
  'nyamata':    { lat: -2.1395, lng: 30.0516 }, // alias
  'nyagatare':  { lat: -1.2994, lng: 30.3278 },
  'gatsibo':    { lat: -1.5858, lng: 30.4231 },
  // Western Province
  'rubavu':     { lat: -1.6830, lng: 29.2547 },
  'gisenyi':    { lat: -1.6830, lng: 29.2547 }, // alias
  'rusizi':     { lat: -2.4800, lng: 28.9072 },
  'cyangugu':   { lat: -2.4800, lng: 28.9072 }, // alias
  'karongi':    { lat: -2.0644, lng: 29.3922 },
  'kibuye':     { lat: -2.0644, lng: 29.3922 }, // alias
  'ngororero':  { lat: -1.8614, lng: 29.5278 },
  'nyabihu':    { lat: -1.6294, lng: 29.4961 },
  'nyamasheke': { lat: -2.3378, lng: 29.1294 },
  'rutsiro':    { lat: -1.9156, lng: 29.3703 },
};

/**
 * Resolve a location string (district, city, alias) to lat/lng.
 * Returns null if unknown.
 */
function resolveCoords(locationStr) {
  if (!locationStr) return null;
  const key = locationStr.toLowerCase().trim();
  return DISTRICT_COORDS[key] ?? null;
}

/**
 * Find the N nearest hospitals to a lat/lng point using Haversine distance.
 */
async function findNearest(lat, lng, limit = 3) {
  const { rows } = await db.query(
    `SELECT id, name, district, province, address, phone_number,
            specialties, is_emergency, latitude, longitude,
            6371 * acos(
              LEAST(1.0,
                cos(radians($1)) * cos(radians(latitude))
                  * cos(radians(longitude) - radians($2))
                + sin(radians($1)) * sin(radians(latitude))
              )
            ) AS distance_km
     FROM hospitals
     WHERE is_active = true
     ORDER BY distance_km ASC
     LIMIT $3`,
    [lat, lng, limit]
  );
  return rows;
}

/**
 * Find hospitals by district name (case-insensitive partial match).
 */
async function findByDistrict(district, limit = 3) {
  const { rows } = await db.query(
    `SELECT * FROM hospitals
     WHERE is_active = true
       AND (lower(district) ILIKE lower($1) OR lower(province) ILIKE lower($1))
     ORDER BY is_emergency DESC, name ASC
     LIMIT $2`,
    [`%${district}%`, limit]
  );
  return rows;
}

/**
 * Given a free-text location from the AI or Twilio (e.g. "Gasabo", "Kigali"),
 * return the nearest hospitals. Falls back to district name search.
 */
async function findNearestByLocation(locationStr, limit = 3) {
  const coords = resolveCoords(locationStr);
  if (coords) return findNearest(coords.lat, coords.lng, limit);
  if (locationStr) return findByDistrict(locationStr, limit);
  return [];
}

module.exports = { findNearest, findByDistrict, findNearestByLocation, resolveCoords };
