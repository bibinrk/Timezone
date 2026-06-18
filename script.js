const currentTimeEl = document.getElementById("current-time");
const currentCityEl = document.getElementById("current-city");
const currentTimezoneEl = document.getElementById("current-timezone");
const currentCoordsEl = document.getElementById("current-coords");
const fixedCitiesListEl = document.getElementById("fixed-cities-list");
const selectedCitiesEl = document.getElementById("selected-cities");
const searchFormEl = document.getElementById("search-form");
const citySearchEl = document.getElementById("city-search");
const coordsFormEl = document.getElementById("coords-form");
const latInputEl = document.getElementById("lat-input");
const lonInputEl = document.getElementById("lon-input");
const mapEl = document.getElementById("world-map");

const editBtnEl = document.getElementById("edit-location-btn");
const editFormEl = document.getElementById("edit-location-form");
const editTargetLabelEl = document.getElementById("edit-target-label");
const editTimeOnlyEl = document.getElementById("edit-time-only");
const editErrorEl = document.getElementById("edit-error");
const resetTimeBtnEl = document.getElementById("reset-time-btn");
const focusCurrentBtnEl = document.getElementById("focus-current-btn");
const openOrganicMapsBtnEl = document.getElementById("open-organic-maps-btn");
const timezoneFormatEl = document.getElementById("timezone-format");
const meetingDurationEl = document.getElementById("meeting-duration");
const plannerCalendarEl = document.getElementById("planner-calendar");
const plannerBestTimesEl = document.getElementById("planner-best-times");
const plannerGridEl = document.getElementById("planner-grid");

const map = L.map(mapEl, {
  zoomControl: false,
  worldCopyJump: true,
  preferCanvas: true
}).setView([20, 0], 2);

const osmStreetLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
});

const detailedStreetLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
  subdomains: "abcd",
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
});

const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19,
  attribution: "Tiles &copy; Esri"
});

detailedStreetLayer.addTo(map);
L.control.zoom({ position: "topright" }).addTo(map);
L.control.layers({
  "Detailed streets": detailedStreetLayer,
  "OpenStreetMap": osmStreetLayer,
  "Satellite": satelliteLayer
}, null, { position: "topright" }).addTo(map);
L.control.scale({ position: "bottomleft", metric: true, imperial: true }).addTo(map);

const state = {
  current: {
    city: "Current location",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    lat: null,
    lon: null,
    accuracy: null,
    timeShiftMs: 0,
    manualBaseUtcMs: null,
    manualSetAtMs: null
  },
  editTarget: {
    name: "Current location",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  },
  timezoneFormat: "gmt",
  inlineEdit: null,
  planner: {
    selectedDateKey: null,
    durationMinutes: 60,
    officeHours: {}
  },
  selected: [],
  fixedExtra: []
};

const fixedCitiesBase = [
  { name: "Beijing", timezone: "Asia/Shanghai", lat: 39.9042, lon: 116.4074 },
  { name: "Dubai", timezone: "Asia/Dubai", lat: 25.2048, lon: 55.2708 },
  { name: "Jeruselam", timezone: "Asia/Jerusalem", lat: 31.7683, lon: 35.2137 },
  { name: "Riyadh", timezone: "Asia/Riyadh", lat: 24.7136, lon: 46.6753 },
  { name: "Seoul", timezone: "Asia/Seoul", lat: 37.5665, lon: 126.978 },
  { name: "Singapore", timezone: "Asia/Singapore", lat: 1.3521, lon: 103.8198 },
  { name: "Tokyo", timezone: "Asia/Tokyo", lat: 35.6762, lon: 139.6503 },
  { name: "Berlin", timezone: "Europe/Berlin", lat: 52.52, lon: 13.405 },
  { name: "Moscow", timezone: "Europe/Moscow", lat: 55.7558, lon: 37.6173 },
  { name: "London", timezone: "Europe/London", lat: 51.5074, lon: -0.1278 },
  { name: "Paris", timezone: "Europe/Paris", lat: 48.8566, lon: 2.3522 },
  { name: "Cairo", timezone: "Africa/Cairo", lat: 30.0444, lon: 31.2357 },
  { name: "Lagos", timezone: "Africa/Lagos", lat: 6.5244, lon: 3.3792 },
  { name: "New York", timezone: "America/New_York", lat: 40.7128, lon: -74.006 },
  { name: "San Francisco", timezone: "America/Los_Angeles", lat: 37.7749, lon: -122.4194 }
];

const timezoneFormatOptions = new Set(["gmt", "utc", "short", "long"]);

let currentMarker = null;
let currentAccuracyCircle = null;
let fixedCityMarker = null;
let selectedCityMarker = null;
let idSeed = 1;
const CURRENT_LOCATION_ZOOM = 16;
const DEFAULT_OFFICE_START = "09:00";
const DEFAULT_OFFICE_END = "17:00";
const MANAGE_BUFFER_MINUTES = 60;
const PLANNER_DAY_COUNT = 7;
const PLANNER_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function formatTimeForZone(date, timezone) {
  return new Intl.DateTimeFormat(navigator.language || "en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function formatDateTimeForZone(date, timezone) {
  return new Intl.DateTimeFormat(navigator.language || "en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function formatHmsForZone(date, timezone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function getUtcOffsetMinutes(date, timezone) {
  const safeDate = new Date(date.getTime() - date.getMilliseconds());
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(safeDate);

  let year = 0;
  let month = 1;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const part of parts) {
    if (part.type === "year") year = Number(part.value);
    if (part.type === "month") month = Number(part.value);
    if (part.type === "day") day = Number(part.value);
    if (part.type === "hour") hour = Number(part.value);
    if (part.type === "minute") minute = Number(part.value);
    if (part.type === "second") second = Number(part.value);
  }

  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  return Math.round((asUtcMs - safeDate.getTime()) / 60000);
}

function formatSignedOffsetMinutes(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

function formatGmtTimezone(referenceDate, timezone) {
  return `GMT${formatSignedOffsetMinutes(getUtcOffsetMinutes(referenceDate, timezone))}`;
}

function formatOffsetTimezone(referenceDate, timezone, prefix) {
  const offset = formatSignedOffsetMinutes(getUtcOffsetMinutes(referenceDate, timezone));
  const dstLabel = isDaylightSavingTime(referenceDate, timezone) ? " (DST)" : "";
  return `${prefix}${offset}${dstLabel}`;
}

function isDaylightSavingTime(referenceDate, timezone) {
  const year = referenceDate.getUTCFullYear();
  const currentOffset = getUtcOffsetMinutes(referenceDate, timezone);
  const yearOffsets = Array.from({ length: 12 }, (_, month) => {
    return getUtcOffsetMinutes(new Date(Date.UTC(year, month, 1, 12)), timezone);
  });
  const standardOffset = Math.min(...yearOffsets);
  return currentOffset > standardOffset;
}

function getTimezoneName(referenceDate, timezone, nameStyle) {
  const parts = new Intl.DateTimeFormat(navigator.language || "en-US", {
    timeZone: timezone,
    timeZoneName: nameStyle,
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(referenceDate);

  const timezonePart = parts.find((part) => part.type === "timeZoneName");
  return timezonePart ? timezonePart.value : formatGmtTimezone(referenceDate, timezone);
}

function formatTimezone(referenceDate, timezone) {
  if (state.timezoneFormat === "utc") {
    return formatOffsetTimezone(referenceDate, timezone, "UTC");
  }
  if (state.timezoneFormat === "short") {
    return getTimezoneName(referenceDate, timezone, "short");
  }
  if (state.timezoneFormat === "long") {
    return getTimezoneName(referenceDate, timezone, "long");
  }
  return formatOffsetTimezone(referenceDate, timezone, "GMT");
}

function getDatePartsForZone(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const out = { year: 0, month: 1, day: 1 };
  for (const part of parts) {
    if (part.type === "year") out.year = Number(part.value);
    if (part.type === "month") out.month = Number(part.value);
    if (part.type === "day") out.day = Number(part.value);
  }
  return out;
}

function formatHourDifferenceLabel(offsetMinutes) {
  if (offsetMinutes === 0) return "0 hours difference";

  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  const direction = offsetMinutes > 0 ? "ahead" : "back";

  if (minutes === 0) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} ${direction}`;
  }

  const hourPart = hours > 0 ? `${hours} ${hours === 1 ? "hour" : "hours"} ` : "";
  return `${hourPart}${minutes} minutes ${direction}`;
}

function getRelativeDayLabel(referenceDate, timezone) {
  const current = getDatePartsForZone(referenceDate, state.current.timezone);
  const target = getDatePartsForZone(referenceDate, timezone);
  const currentDayMs = Date.UTC(current.year, current.month - 1, current.day);
  const targetDayMs = Date.UTC(target.year, target.month - 1, target.day);
  const dayDelta = Math.round((targetDayMs - currentDayMs) / 86400000);

  if (dayDelta < 0) return "previous day";
  if (dayDelta > 0) return "next day";
  return "current day";
}

function formatTimeRelation(referenceDate, timezone) {
  const currentOffset = getUtcOffsetMinutes(referenceDate, state.current.timezone);
  const targetOffset = getUtcOffsetMinutes(referenceDate, timezone);
  return `${formatHourDifferenceLabel(targetOffset - currentOffset)} · ${getRelativeDayLabel(referenceDate, timezone)}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function dateKeyFromParts(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function parseDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

function addDaysToDateParts(parts, dayDelta) {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayDelta, 12));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate()
  };
}

function zonedDateTimeToUtcMs(dateParts, hour, minute, timezone) {
  const localAsUtcMs = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, hour, minute);
  let offsetMinutes = getUtcOffsetMinutes(new Date(localAsUtcMs), timezone);
  let utcMs = localAsUtcMs - (offsetMinutes * 60000);
  const adjustedOffsetMinutes = getUtcOffsetMinutes(new Date(utcMs), timezone);

  if (adjustedOffsetMinutes !== offsetMinutes) {
    utcMs = localAsUtcMs - (adjustedOffsetMinutes * 60000);
  }

  return utcMs;
}

function formatTimeHmForZone(date, timezone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function parseTimeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return (hour * 60) + minute;
}

function normalizeMinute(value) {
  return ((value % 1440) + 1440) % 1440;
}

function circularDurationMinutes(startMinute, endMinute) {
  const delta = normalizeMinute(endMinute - startMinute);
  return delta === 0 ? 1440 : delta;
}

function circularRangeFits(localMinute, durationMinutes, windowStartMinute, windowLengthMinutes) {
  if (windowLengthMinutes >= 1440) return true;

  const offsetFromWindowStart = normalizeMinute(localMinute - normalizeMinute(windowStartMinute));
  return offsetFromWindowStart + durationMinutes <= windowLengthMinutes;
}

function getPlannerOfficeHours(zoneKey) {
  if (!state.planner.officeHours[zoneKey]) {
    state.planner.officeHours[zoneKey] = {
      start: DEFAULT_OFFICE_START,
      end: DEFAULT_OFFICE_END
    };
  }

  return state.planner.officeHours[zoneKey];
}

function getPlannerOfficeConfig(zoneKey) {
  const officeHours = getPlannerOfficeHours(zoneKey);
  const startMinute = parseTimeToMinutes(officeHours.start) ?? parseTimeToMinutes(DEFAULT_OFFICE_START);
  const endMinute = parseTimeToMinutes(officeHours.end) ?? parseTimeToMinutes(DEFAULT_OFFICE_END);
  const idealLength = circularDurationMinutes(startMinute, endMinute);
  const manageLength = Math.min(1440, idealLength + (MANAGE_BUFFER_MINUTES * 2));

  return {
    startMinute,
    endMinute,
    idealLength,
    manageStartMinute: startMinute - MANAGE_BUFFER_MINUTES,
    manageLength
  };
}

function getPlannerDateParts(referenceDate) {
  const todayParts = getDatePartsForZone(referenceDate, state.current.timezone);
  return parseDateKey(state.planner.selectedDateKey) || todayParts;
}

function addPlannerZone(zones, seenTimezones, name, timezone) {
  if (!timezone || seenTimezones.has(timezone)) return;

  seenTimezones.add(timezone);
  zones.push({
    key: timezone,
    name: name || timezone,
    timezone
  });
}

function getPlannerZones() {
  const zones = [];
  const seenTimezones = new Set();

  addPlannerZone(zones, seenTimezones, state.current.city, state.current.timezone);
  for (const city of state.selected) {
    addPlannerZone(zones, seenTimezones, city.name, city.timezone);
  }

  return zones;
}

function plannerStatusText(status) {
  if (status === "ideal") return "Ideal";
  if (status === "manage") return "Can manage";
  return "Not good";
}

function scorePlannerSlotForZone(slotDate, zone, durationMinutes) {
  const { hour, minute } = getHmsPartsForZone(slotDate, zone.timezone);
  const localMinute = (hour * 60) + minute;
  const office = getPlannerOfficeConfig(zone.key);
  const isIdeal = circularRangeFits(localMinute, durationMinutes, office.startMinute, office.idealLength);

  if (isIdeal) {
    return {
      status: "ideal",
      localTime: formatTimeHmForZone(slotDate, zone.timezone)
    };
  }

  const isManageable = circularRangeFits(
    localMinute,
    durationMinutes,
    office.manageStartMinute,
    office.manageLength
  );

  return {
    status: isManageable ? "manage" : "bad",
    localTime: formatTimeHmForZone(slotDate, zone.timezone)
  };
}

function getPlannerSlotDate(dateParts, hour) {
  return new Date(zonedDateTimeToUtcMs(dateParts, hour, 0, state.current.timezone));
}

function getPlannerAggregateSlot(dateParts, hour, zones) {
  const slotDate = getPlannerSlotDate(dateParts, hour);
  const zoneStatuses = zones.map((zone) => ({
    zone,
    ...scorePlannerSlotForZone(slotDate, zone, state.planner.durationMinutes)
  }));
  const allIdeal = zoneStatuses.every((entry) => entry.status === "ideal");
  const noneBad = zoneStatuses.every((entry) => entry.status !== "bad");
  const status = allIdeal ? "ideal" : noneBad ? "manage" : "bad";
  const title = zoneStatuses
    .map((entry) => `${entry.zone.name}: ${entry.localTime} - ${plannerStatusText(entry.status)}`)
    .join("\n");

  return {
    hour,
    slotDate,
    status,
    title
  };
}

function getRecommendedPlannerSlots(dateParts, zones) {
  const slots = PLANNER_HOURS.map((hour) => getPlannerAggregateSlot(dateParts, hour, zones));
  const idealSlots = slots.filter((slot) => slot.status === "ideal");
  const manageableSlots = slots.filter((slot) => slot.status === "manage");

  return (idealSlots.length > 0 ? idealSlots : manageableSlots).slice(0, 4);
}

function getPlannerDayStatus(dateParts, zones) {
  const slots = PLANNER_HOURS.map((hour) => getPlannerAggregateSlot(dateParts, hour, zones));
  if (slots.some((slot) => slot.status === "ideal")) return "ideal";
  if (slots.some((slot) => slot.status === "manage")) return "manage";
  return "bad";
}

function formatPlannerSlotLabel(slotDate, durationMinutes) {
  const endDate = new Date(slotDate.getTime() + (durationMinutes * 60000));
  return `${formatTimeHmForZone(slotDate, state.current.timezone)}-${formatTimeHmForZone(endDate, state.current.timezone)}`;
}

function getHmsPartsForZone(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  const out = { hour: 0, minute: 0, second: 0 };
  for (const part of parts) {
    if (part.type === "hour") out.hour = Number(part.value);
    if (part.type === "minute") out.minute = Number(part.value);
    if (part.type === "second") out.second = Number(part.value);
  }
  return out;
}

function updateAnalogClockElement(clockEl, referenceDate) {
  const timezone = clockEl.dataset.timezone || "UTC";
  const hourHand = clockEl.querySelector(".hand.hour");
  const minuteHand = clockEl.querySelector(".hand.minute");
  const secondHand = clockEl.querySelector(".hand.second");
  if (!hourHand || !minuteHand || !secondHand) return;

  const { hour, minute, second } = getHmsPartsForZone(referenceDate, timezone);
  const secondFloat = second + (referenceDate.getMilliseconds() / 1000);
  const minuteFloat = minute + (secondFloat / 60);
  const hourFloat = (hour % 12) + (minuteFloat / 60);

  const hourDeg = hourFloat * 30;
  const minuteDeg = minuteFloat * 6;
  let secondDeg = secondFloat * 6;

  // Avoid a visible "snap back" when second hand wraps from ~360deg to 0deg.
  const lastSecondDeg = Number(clockEl.dataset.lastSecondDeg || "0");
  if (Number.isFinite(lastSecondDeg) && secondDeg + 180 < lastSecondDeg) {
    secondDeg += 360;
  }
  clockEl.dataset.lastSecondDeg = String(secondDeg);

  hourHand.style.transform = `translate(-50%, -100%) rotate(${hourDeg}deg)`;
  minuteHand.style.transform = `translate(-50%, -100%) rotate(${minuteDeg}deg)`;
  secondHand.style.transform = `translate(-50%, -100%) rotate(${secondDeg}deg)`;
}

function createAnalogClockElement(referenceDate, timezone) {
  const clock = document.createElement("div");
  clock.className = "analog-clock";
  clock.setAttribute("aria-hidden", "true");
  clock.dataset.timezone = timezone;

  const hourHand = document.createElement("span");
  hourHand.className = "hand hour";
  const minuteHand = document.createElement("span");
  minuteHand.className = "hand minute";
  const secondHand = document.createElement("span");
  secondHand.className = "hand second";
  const center = document.createElement("span");
  center.className = "center";

  clock.append(hourHand, minuteHand, secondHand, center);
  updateAnalogClockElement(clock, referenceDate);
  return clock;
}

function normalizeCityKey(name, timezone) {
  return `${String(name || "").trim()}|${String(timezone || "").trim()}`.toLowerCase();
}

function continentFromTimezone(timezone) {
  const part = String(timezone || "").split("/")[0] || "";
  return part || "Other";
}

function continentRank(continent) {
  const order = [
    "Africa",
    "America",
    "Antarctica",
    "Asia",
    "Atlantic",
    "Australia",
    "Europe",
    "Indian",
    "Pacific",
    "Etc",
    "Other"
  ];
  const idx = order.indexOf(continent);
  return idx === -1 ? order.length : idx;
}

function sortByContinentThenName(a, b) {
  const aCont = continentFromTimezone(a.timezone);
  const bCont = continentFromTimezone(b.timezone);
  const contDelta = continentRank(aCont) - continentRank(bCont);
  if (contDelta !== 0) return contDelta;
  return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
}

function getFixedCitiesRaw() {
  return [...fixedCitiesBase, ...state.fixedExtra];
}

function getFixedCitiesForRender() {
  const raw = getFixedCitiesRaw();
  const currentKey = normalizeCityKey(state.current.city, state.current.timezone);
  const currentTz = state.current.timezone;

  const exactMatches = raw.filter((city) => normalizeCityKey(city.name, city.timezone) === currentKey);
  const tzMatches = raw.filter((city) => city.timezone === currentTz);

  let toRemoveKey = null;
  if (exactMatches.length > 0) {
    toRemoveKey = currentKey;
  } else if (tzMatches.length === 1) {
    toRemoveKey = normalizeCityKey(tzMatches[0].name, tzMatches[0].timezone);
  }

  const filtered = toRemoveKey
    ? raw.filter((city) => normalizeCityKey(city.name, city.timezone) !== toRemoveKey)
    : raw;

  return filtered.slice().sort(sortByContinentThenName);
}

function parseHmsToSeconds(value) {
  const parts = value.split(":").map(Number);
  if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) return null;
  const [hh, mm, ss = 0] = parts;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return null;
  return (hh * 3600) + (mm * 60) + ss;
}

function formatCoords(lat, lon) {
  if (typeof lat !== "number" || typeof lon !== "number") return "--";
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

function formatAccuracy(meters) {
  if (!Number.isFinite(meters)) return "";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };
    return replacements[char];
  });
}

function organicMapsUrl(lat, lon, title) {
  const params = new URLSearchParams({
    v: "1",
    ll: `${lat.toFixed(6)},${lon.toFixed(6)}`,
    n: title || "Map point"
  });
  return `https://omaps.app/map?${params.toString()}`;
}

function organicMapsLink(lat, lon, title) {
  return `<a href="${organicMapsUrl(lat, lon, title)}" target="_blank" rel="noopener">Open in Organic Maps</a>`;
}

function renderCurrentLocation(referenceDate) {
  currentTimeEl.textContent = `Current Time: ${formatDateTimeForZone(referenceDate, state.current.timezone)}`;
  currentCityEl.textContent = `City: ${state.current.city}`;
  currentTimezoneEl.textContent = `Timezone: ${formatTimezone(referenceDate, state.current.timezone)}`;
  currentCoordsEl.textContent = `Lat, Long: ${formatCoords(state.current.lat, state.current.lon)}`;
}

function renderEditTargetLabel(referenceDate) {
  editTargetLabelEl.textContent = `Time for ${state.editTarget.name} (${formatTimezone(referenceDate, state.editTarget.timezone)})`;
}

function createPlannerCell(status, title) {
  const cell = document.createElement("div");
  cell.className = `planner-cell status-${status}`;
  cell.title = title;
  return cell;
}

function renderPlannerCalendar(referenceDate, zones, selectedDateParts) {
  plannerCalendarEl.innerHTML = "";

  const todayParts = getDatePartsForZone(referenceDate, state.current.timezone);
  const selectedDateKey = dateKeyFromParts(selectedDateParts);
  const dateFormatter = new Intl.DateTimeFormat(navigator.language || "en-US", {
    timeZone: state.current.timezone,
    month: "short",
    day: "numeric"
  });
  const weekdayFormatter = new Intl.DateTimeFormat(navigator.language || "en-US", {
    timeZone: state.current.timezone,
    weekday: "short"
  });

  for (let dayIndex = 0; dayIndex < PLANNER_DAY_COUNT; dayIndex += 1) {
    const dateParts = addDaysToDateParts(todayParts, dayIndex);
    const dateKey = dateKeyFromParts(dateParts);
    const date = new Date(zonedDateTimeToUtcMs(dateParts, 12, 0, state.current.timezone));
    const status = getPlannerDayStatus(dateParts, zones);
    const day = document.createElement("button");
    day.type = "button";
    day.className = `planner-day status-${status}${dateKey === selectedDateKey ? " active" : ""}`;
    day.dataset.dateKey = dateKey;
    day.setAttribute("role", "listitem");
    day.title = `${dateFormatter.format(date)} - ${plannerStatusText(status)}`;

    const weekday = document.createElement("span");
    weekday.className = "planner-day-dow";
    weekday.textContent = dayIndex === 0 ? "Today" : weekdayFormatter.format(date);

    const dateLabel = document.createElement("span");
    dateLabel.className = "planner-day-date";
    dateLabel.textContent = dateFormatter.format(date);

    day.append(weekday, dateLabel);
    plannerCalendarEl.append(day);
  }
}

function renderPlannerBestTimes(dateParts, zones) {
  plannerBestTimesEl.innerHTML = "";

  const recommendedSlots = getRecommendedPlannerSlots(dateParts, zones);
  if (recommendedSlots.length === 0) {
    const chip = document.createElement("div");
    chip.className = "best-time-chip status-bad";
    chip.textContent = "No good overlap";
    plannerBestTimesEl.append(chip);
    return;
  }

  for (const slot of recommendedSlots) {
    const chip = document.createElement("div");
    chip.className = `best-time-chip status-${slot.status}`;
    chip.title = slot.title;
    chip.textContent = `${formatPlannerSlotLabel(slot.slotDate, state.planner.durationMinutes)} ${plannerStatusText(slot.status)}`;
    plannerBestTimesEl.append(chip);
  }
}

function appendPlannerGridHeader() {
  const corner = document.createElement("div");
  corner.className = "planner-grid-label";
  corner.textContent = "Local hour";
  plannerGridEl.append(corner);

  for (const hour of PLANNER_HOURS) {
    const hourLabel = document.createElement("div");
    hourLabel.className = "planner-hour-label";
    hourLabel.textContent = pad2(hour);
    plannerGridEl.append(hourLabel);
  }
}

function appendPlannerAggregateRow(dateParts, zones) {
  const label = document.createElement("div");
  label.className = "planner-grid-label";

  const title = document.createElement("span");
  title.className = "planner-zone-title";
  title.textContent = "All zones";

  const subtitle = document.createElement("span");
  subtitle.className = "planner-zone-tz";
  subtitle.textContent = "Overlap";

  label.append(title, subtitle);
  plannerGridEl.append(label);

  for (const hour of PLANNER_HOURS) {
    const slot = getPlannerAggregateSlot(dateParts, hour, zones);
    plannerGridEl.append(createPlannerCell(
      slot.status,
      `${formatPlannerSlotLabel(slot.slotDate, state.planner.durationMinutes)}\n${slot.title}`
    ));
  }
}

function appendPlannerZoneRow(dateParts, zone) {
  const officeHours = getPlannerOfficeHours(zone.key);
  const label = document.createElement("div");
  label.className = "planner-grid-label";

  const title = document.createElement("span");
  title.className = "planner-zone-title";
  title.textContent = zone.name;

  const timezone = document.createElement("span");
  timezone.className = "planner-zone-tz";
  timezone.textContent = zone.timezone;

  const office = document.createElement("div");
  office.className = "planner-office-hours";

  const start = document.createElement("input");
  start.type = "text";
  start.className = "office-time-input";
  start.value = officeHours.start;
  start.placeholder = DEFAULT_OFFICE_START;
  start.inputMode = "numeric";
  start.dataset.zoneKey = zone.key;
  start.dataset.field = "start";
  start.setAttribute("aria-label", `${zone.name} office start`);

  const separator = document.createElement("span");
  separator.textContent = "to";

  const end = document.createElement("input");
  end.type = "text";
  end.className = "office-time-input";
  end.value = officeHours.end;
  end.placeholder = DEFAULT_OFFICE_END;
  end.inputMode = "numeric";
  end.dataset.zoneKey = zone.key;
  end.dataset.field = "end";
  end.setAttribute("aria-label", `${zone.name} office end`);

  office.append(start, separator, end);
  label.append(title, timezone, office);
  plannerGridEl.append(label);

  for (const hour of PLANNER_HOURS) {
    const slotDate = getPlannerSlotDate(dateParts, hour);
    const status = scorePlannerSlotForZone(slotDate, zone, state.planner.durationMinutes);
    plannerGridEl.append(createPlannerCell(
      status.status,
      `${zone.name}: ${status.localTime} - ${plannerStatusText(status.status)}`
    ));
  }
}

function renderPlannerGrid(dateParts, zones) {
  plannerGridEl.innerHTML = "";
  appendPlannerGridHeader();

  for (const zone of zones) {
    appendPlannerZoneRow(dateParts, zone);
  }
}

function renderMeetingPlanner(referenceDate, force = false) {
  if (!force && document.activeElement && document.activeElement.closest(".meeting-planner")) return;

  const zones = getPlannerZones();
  const dateParts = getPlannerDateParts(referenceDate);
  renderPlannerCalendar(referenceDate, zones, dateParts);
  renderPlannerBestTimes(dateParts, zones);
  renderPlannerGrid(dateParts, zones);
}

function refreshTimezoneDisplay() {
  const referenceDate = getReferenceDate();
  renderCurrentLocation(referenceDate);
  renderFixedCities(referenceDate);
  renderSelectedCities(referenceDate);
  renderMeetingPlanner(referenceDate);
  upsertCurrentMarker();

  if (!editFormEl.classList.contains("hidden")) {
    renderEditTargetLabel(referenceDate);
  }
}

function renderSelectedCities(referenceDate) {
  selectedCitiesEl.innerHTML = "";

  for (const city of state.selected) {
    const li = document.createElement("li");
    li.className = "selected-city-item";
    li.dataset.id = String(city.id);

    const text = document.createElement("span");
    text.className = "selected-city-text";
    text.textContent = `${city.name} | ${formatTimezone(referenceDate, city.timezone)}`;

    const isEditing = state.inlineEdit
      && state.inlineEdit.type === "selected"
      && state.inlineEdit.id === city.id;

    const time = isEditing ? document.createElement("input") : document.createElement("span");
    if (isEditing) {
      time.type = "text";
      time.className = "inline-time-input";
      time.value = state.inlineEdit.value;
      time.placeholder = "HH:MM:SS";
      time.inputMode = "numeric";
      time.addEventListener("input", (event) => {
        const value = event.target.value;
        state.inlineEdit.value = value;
        if (!value.trim()) return;
        const updated = applyEditedTimeForTimezone(value, city.timezone);
        if (updated) renderCurrentLocation(getReferenceDate());
      });
      time.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          closeInlineCityEdit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          closeInlineCityEdit();
        }
      });
    } else {
      time.className = "selected-city-time";
      time.textContent = formatTimeForZone(referenceDate, city.timezone);
    }

    const analog = createAnalogClockElement(referenceDate, city.timezone);

    const relation = document.createElement("span");
    relation.className = "selected-city-relation";
    relation.textContent = formatTimeRelation(referenceDate, city.timezone);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "edit-city-time";
    edit.dataset.id = String(city.id);
    edit.dataset.timezone = city.timezone;
    edit.dataset.name = city.name;
    edit.textContent = isEditing ? "✓" : "✎";
    edit.setAttribute("aria-label", isEditing ? `Done editing ${city.name}` : `Edit ${city.name} time`);
    edit.title = isEditing ? `Done editing ${city.name}` : `Edit ${city.name} time`;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete-city";
    del.dataset.id = String(city.id);
    del.textContent = "🗑";
    del.setAttribute("aria-label", "Delete city");
    del.title = "Delete city";

    li.append(text, time, relation, analog, edit, del);
    selectedCitiesEl.append(li);
  }
}

function renderFixedCities(referenceDate) {
  fixedCitiesListEl.innerHTML = "";

  for (const city of getFixedCitiesForRender()) {
    const li = document.createElement("li");
    li.className = "fixed-city-item";
    li.dataset.city = city.name;
    li.dataset.timezone = city.timezone;

    const name = document.createElement("div");
    name.className = "fixed-city-name";
    name.textContent = `${city.name} (${formatTimezone(referenceDate, city.timezone)})`;

    const isEditing = state.inlineEdit
      && state.inlineEdit.type === "fixed"
      && state.inlineEdit.name === city.name;

    const datetime = isEditing ? document.createElement("input") : document.createElement("div");
    if (isEditing) {
      datetime.type = "text";
      datetime.className = "inline-time-input";
      datetime.value = state.inlineEdit.value;
      datetime.placeholder = "HH:MM:SS";
      datetime.inputMode = "numeric";
      datetime.addEventListener("input", (event) => {
        const value = event.target.value;
        state.inlineEdit.value = value;
        if (!value.trim()) return;
        const updated = applyEditedTimeForTimezone(value, city.timezone);
        if (updated) renderCurrentLocation(getReferenceDate());
      });
      datetime.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          closeInlineCityEdit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          closeInlineCityEdit();
        }
      });
    } else {
      datetime.className = "fixed-city-datetime";
      datetime.textContent = formatTimeForZone(referenceDate, city.timezone);
    }

    datetime.classList.add("fixed-city-datetime");

    const analog = createAnalogClockElement(referenceDate, city.timezone);

    const relation = document.createElement("div");
    relation.className = "fixed-city-relation";
    relation.textContent = formatTimeRelation(referenceDate, city.timezone);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "edit-city-time";
    edit.dataset.city = city.name;
    edit.dataset.timezone = city.timezone;
    edit.textContent = isEditing ? "✓" : "✎";
    edit.setAttribute("aria-label", isEditing ? `Done editing ${city.name}` : `Edit ${city.name} time`);
    edit.title = isEditing ? `Done editing ${city.name}` : `Edit ${city.name} time`;

    li.append(name, datetime, relation, analog, edit);
    fixedCitiesListEl.append(li);
  }
}

function focusFixedCityOnMap(city) {
  if (!city) return;

  const referenceDate = getReferenceDate();
  const time = formatDateTimeForZone(referenceDate, city.timezone);
  const popup = `${escapeHtml(city.name)}<br>${formatTimezone(referenceDate, city.timezone)}<br>${time}<br>${organicMapsLink(city.lat, city.lon, city.name)}`;

  if (!fixedCityMarker) {
    fixedCityMarker = L.marker([city.lat, city.lon]).addTo(map);
  } else {
    fixedCityMarker.setLatLng([city.lat, city.lon]);
  }

  fixedCityMarker.bindPopup(popup).openPopup();
  map.setView([city.lat, city.lon], 9);
}

function tick() {
  const referenceDate = getReferenceDate();
  renderCurrentLocation(referenceDate);
  if (!state.inlineEdit) {
    renderFixedCities(referenceDate);
    renderSelectedCities(referenceDate);
  }
  renderMeetingPlanner(referenceDate);
}

function getReferenceDate() {
  if (state.current.manualBaseUtcMs !== null && state.current.manualSetAtMs !== null) {
    const elapsed = Date.now() - state.current.manualSetAtMs;
    return new Date(state.current.manualBaseUtcMs + elapsed);
  }

  return new Date(Date.now() + state.current.timeShiftMs);
}

function upsertCurrentMarker() {
  if (typeof state.current.lat !== "number" || typeof state.current.lon !== "number") return;

  const coords = [state.current.lat, state.current.lon];
  const coordsLabel = hasCurrentCoordinates()
    ? `<br>${formatCoords(state.current.lat, state.current.lon)}`
    : "";
  const accuracyLabel = Number.isFinite(state.current.accuracy)
    ? `<br>Accuracy: ${formatAccuracy(state.current.accuracy)}`
    : "";
  const organicMapsLabel = hasCurrentCoordinates()
    ? `<br>${organicMapsLink(state.current.lat, state.current.lon, state.current.city)}`
    : "";
  const label = `${escapeHtml(state.current.city)}<br>${formatTimezone(getReferenceDate(), state.current.timezone)}${coordsLabel}${accuracyLabel}${organicMapsLabel}`;
  if (!currentMarker) {
    currentMarker = L.marker(coords, { title: "Current location" }).addTo(map);
  } else {
    currentMarker.setLatLng(coords);
  }
  currentMarker.bindPopup(label);

  if (Number.isFinite(state.current.accuracy)) {
    if (!currentAccuracyCircle) {
      currentAccuracyCircle = L.circle(coords, {
        radius: Math.max(state.current.accuracy, 10),
        color: "#2563eb",
        weight: 2,
        opacity: 0.8,
        fillColor: "#3b82f6",
        fillOpacity: 0.14
      }).addTo(map);
    } else {
      currentAccuracyCircle.setLatLng(coords);
      currentAccuracyCircle.setRadius(Math.max(state.current.accuracy, 10));
    }
  } else if (currentAccuracyCircle) {
    currentAccuracyCircle.remove();
    currentAccuracyCircle = null;
  }
}

function hasCurrentCoordinates() {
  return Number.isFinite(state.current.lat) && Number.isFinite(state.current.lon);
}

function getDisplayedCurrentCoordinates() {
  const match = currentCoordsEl.textContent.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function focusStoredCurrentLocation(zoom = CURRENT_LOCATION_ZOOM) {
  const displayedCoords = hasCurrentCoordinates()
    ? null
    : getDisplayedCurrentCoordinates();

  if (!hasCurrentCoordinates() && !displayedCoords) return false;

  if (displayedCoords) {
    state.current.lat = displayedCoords.lat;
    state.current.lon = displayedCoords.lon;
  }

  const coords = [state.current.lat, state.current.lon];
  upsertCurrentMarker();
  mapEl.scrollIntoView({ behavior: "smooth", block: "center" });
  requestAnimationFrame(() => {
    map.invalidateSize();
    map.flyTo(coords, Math.max(map.getZoom(), zoom), {
      animate: true,
      duration: 0.8
    });
    if (currentMarker) currentMarker.openPopup();
  });
  return true;
}

function addSelectedCity(name, timezone, lat = null, lon = null) {
  if (!name || !timezone) return;
  const key = `${name}|${timezone}`.toLowerCase();
  if (state.selected.some((city) => city.key === key)) return;

  state.selected.unshift({ id: idSeed++, key, name, timezone, lat, lon });
}

function isCityInFixedList(name) {
  const target = String(name || "").toLowerCase();
  return getFixedCitiesRaw().some((city) => city.name.toLowerCase() === target);
}

function addPreviousCurrentToCityTimes(prevCity, prevTimezone, prevLat, prevLon) {
  if (!prevCity || !prevTimezone) return;
  if (prevCity === "Current location") return;

  const prevKey = normalizeCityKey(prevCity, prevTimezone);
  const existsInBase = fixedCitiesBase.some((city) => normalizeCityKey(city.name, city.timezone) === prevKey);
  if (existsInBase) return;

  const existsInExtra = state.fixedExtra.some((city) => normalizeCityKey(city.name, city.timezone) === prevKey);
  if (existsInExtra) return;

  state.fixedExtra.push({
    name: prevCity,
    timezone: prevTimezone,
    lat: prevLat,
    lon: prevLon
  });
}

function updateCurrentLocation(nextCity, nextTimezone, nextLat, nextLon, nextAccuracy = state.current.accuracy) {
  const prevCity = state.current.city;
  const prevTimezone = state.current.timezone;
  const prevLat = state.current.lat;
  const prevLon = state.current.lon;

  const cityChanged = prevCity !== nextCity || prevTimezone !== nextTimezone;
  if (cityChanged) {
    // Always keep the previous current location in City Times.
    addPreviousCurrentToCityTimes(prevCity, prevTimezone, prevLat, prevLon);

    // If the new current location is already in City Times or Selected Cities, remove it to avoid duplication.
    const nextKey = normalizeCityKey(nextCity, nextTimezone);
    state.fixedExtra = state.fixedExtra.filter((city) => normalizeCityKey(city.name, city.timezone) !== nextKey);
    state.selected = state.selected.filter((city) => normalizeCityKey(city.name, city.timezone) !== nextKey);
  }

  state.current.city = nextCity;
  state.current.timezone = nextTimezone;
  state.current.lat = nextLat;
  state.current.lon = nextLon;
  state.current.accuracy = Number.isFinite(nextAccuracy) ? nextAccuracy : null;
}

function focusSelectedCityOnMap(city) {
  if (!city || typeof city.lat !== "number" || typeof city.lon !== "number") return;

  const referenceDate = getReferenceDate();
  const time = formatDateTimeForZone(referenceDate, city.timezone);
  const popup = `${escapeHtml(city.name)}<br>${formatTimezone(referenceDate, city.timezone)}<br>${time}<br>${organicMapsLink(city.lat, city.lon, city.name)}`;

  if (!selectedCityMarker) {
    selectedCityMarker = L.marker([city.lat, city.lon]).addTo(map);
  } else {
    selectedCityMarker.setLatLng([city.lat, city.lon]);
  }

  selectedCityMarker.bindPopup(popup).openPopup();
  map.setView([city.lat, city.lon], 9);
}

function startInlineCityEdit(type, timezone, value, id = null, name = null) {
  state.inlineEdit = {
    type,
    timezone,
    value,
    id,
    name
  };
  const referenceDate = getReferenceDate();
  renderFixedCities(referenceDate);
  renderSelectedCities(referenceDate);
}

function closeInlineCityEdit() {
  state.inlineEdit = null;
  tick();
}

async function reverseGeocode(lat, lon) {
  const response = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data.city || data.locality || data.principalSubdivision || null;
}

async function timezoneByCoordinates(lat, lon) {
  const providers = [
    async () => {
      const response = await fetch(`https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lon}`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.timeZone || data.timezone || null;
    },
    async () => {
      const response = await fetch(`https://secure.geonames.org/timezoneJSON?lat=${lat}&lng=${lon}&username=demo`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.timezoneId || null;
    }
  ];

  for (const provider of providers) {
    try {
      const timezone = await provider();
      if (timezone) return timezone;
    } catch {
      // fall through
    }
  }

  return null;
}

async function initializeCurrentLocation() {
  if (!navigator.geolocation) {
    tick();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      const [city, timezone] = await Promise.all([
        reverseGeocode(latitude, longitude),
        timezoneByCoordinates(latitude, longitude)
      ]);

      const nextCity = city || state.current.city;
      const nextTimezone = timezone || state.current.timezone;
      updateCurrentLocation(nextCity, nextTimezone, latitude, longitude, accuracy);

      upsertCurrentMarker();
      map.setView([latitude, longitude], 12);
      tick();
    },
    () => {
      tick();
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

async function searchCity(query) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`
  );
  if (!response.ok) throw new Error("search failed");
  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) throw new Error("city not found");
  return results[0];
}

citySearchEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  searchFormEl.requestSubmit();
});

searchFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  const query = citySearchEl.value.trim();
  if (!query) return;

  try {
    const result = await searchCity(query);
    const lat = Number(result.lat);
    const lon = Number(result.lon);
    const [city, timezone] = await Promise.all([
      reverseGeocode(lat, lon),
      timezoneByCoordinates(lat, lon)
    ]);

    addSelectedCity(city || query, timezone || "UTC", lat, lon);
    citySearchEl.value = "";
    map.setView([lat, lon], Math.max(map.getZoom(), 8));
    tick();
  } catch {
    // keep UI stable on search errors
  }
});

map.on("click", async (event) => {
  const { lat, lng } = event.latlng;
  const [city, timezone] = await Promise.all([
    reverseGeocode(lat, lng),
    timezoneByCoordinates(lat, lng)
  ]);

  const fallbackName = `Point ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  addSelectedCity(city || fallbackName, timezone || "UTC", lat, lng);
  tick();
});

coordsFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  const lat = Number(latInputEl.value.trim());
  const lon = Number(lonInputEl.value.trim());
  if (Number.isNaN(lat) || Number.isNaN(lon)) return;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

  const [city, timezone] = await Promise.all([
    reverseGeocode(lat, lon),
    timezoneByCoordinates(lat, lon)
  ]);

  const fallbackName = `Point ${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  addSelectedCity(city || fallbackName, timezone || "UTC", lat, lon);
  map.setView([lat, lon], Math.max(map.getZoom(), 8));
  latInputEl.value = "";
  lonInputEl.value = "";
  tick();
});

selectedCitiesEl.addEventListener("click", (event) => {
  const editButton = event.target.closest(".edit-city-time");
  if (editButton) {
    if (state.inlineEdit && state.inlineEdit.type === "selected" && state.inlineEdit.id === Number(editButton.dataset.id)) {
      closeInlineCityEdit();
      return;
    }
    const timezone = editButton.dataset.timezone;
    const cityName = editButton.dataset.name || "City";
    const currentHms = formatHmsForZone(getReferenceDate(), timezone);
    startInlineCityEdit("selected", timezone, currentHms, Number(editButton.dataset.id), cityName);
    return;
  }

  const button = event.target.closest(".delete-city");
  if (button) {
    const id = Number(button.dataset.id);
    state.selected = state.selected.filter((city) => city.id !== id);
    tick();
    return;
  }

  const item = event.target.closest(".selected-city-item");
  if (!item) return;
  const id = Number(item.dataset.id);
  const city = state.selected.find((entry) => entry.id === id);
  focusSelectedCityOnMap(city);

});

fixedCitiesListEl.addEventListener("click", (event) => {
  const editButton = event.target.closest(".edit-city-time");
  if (editButton) {
    if (state.inlineEdit && state.inlineEdit.type === "fixed" && state.inlineEdit.name === editButton.dataset.city) {
      closeInlineCityEdit();
      return;
    }
    const timezone = editButton.dataset.timezone;
    const cityName = editButton.dataset.city || "City";
    const currentHms = formatHmsForZone(getReferenceDate(), timezone);
    startInlineCityEdit("fixed", timezone, currentHms, null, cityName);
    return;
  }

  const item = event.target.closest(".fixed-city-item");
  if (!item) return;

  const city = getFixedCitiesRaw().find((entry) => entry.name === item.dataset.city && entry.timezone === item.dataset.timezone);
  focusFixedCityOnMap(city);
});

function openEditForm(targetName = state.current.city, targetTimezone = state.current.timezone) {
  editErrorEl.textContent = "";
  state.editTarget.name = targetName;
  state.editTarget.timezone = targetTimezone;

  const referenceDate = getReferenceDate();
  renderEditTargetLabel(referenceDate);
  editTimeOnlyEl.value = formatHmsForZone(referenceDate, targetTimezone);
  editFormEl.classList.remove("hidden");
}

function closeEditForm() {
  editFormEl.classList.add("hidden");
  editErrorEl.textContent = "";
  state.editTarget.name = state.current.city;
  state.editTarget.timezone = state.current.timezone;
  editTargetLabelEl.textContent = "Current Time";
}

editBtnEl.addEventListener("click", () => {
  openEditForm(state.current.city, state.current.timezone);
});

timezoneFormatEl.addEventListener("change", (event) => {
  const nextFormat = event.target.value;
  if (!timezoneFormatOptions.has(nextFormat)) return;

  state.timezoneFormat = nextFormat;
  refreshTimezoneDisplay();
});

meetingDurationEl.addEventListener("change", (event) => {
  const duration = Number(event.target.value);
  if (!Number.isFinite(duration)) return;

  state.planner.durationMinutes = duration;
  renderMeetingPlanner(getReferenceDate(), true);
});

plannerCalendarEl.addEventListener("click", (event) => {
  const day = event.target.closest(".planner-day");
  if (!day) return;

  state.planner.selectedDateKey = day.dataset.dateKey;
  renderMeetingPlanner(getReferenceDate(), true);
});

plannerGridEl.addEventListener("change", (event) => {
  const input = event.target.closest(".office-time-input");
  if (!input) return;

  const zoneKey = input.dataset.zoneKey;
  const field = input.dataset.field;
  if (!zoneKey || (field !== "start" && field !== "end")) return;

  const officeHours = getPlannerOfficeHours(zoneKey);
  const fallback = field === "start" ? DEFAULT_OFFICE_START : DEFAULT_OFFICE_END;
  const nextValue = input.value.trim();
  officeHours[field] = parseTimeToMinutes(nextValue) === null ? fallback : nextValue;
  renderMeetingPlanner(getReferenceDate(), true);
});

function openCurrentLocationInOrganicMaps(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (!focusStoredCurrentLocation()) return;

  window.open(
    organicMapsUrl(state.current.lat, state.current.lon, state.current.city),
    "_blank",
    "noopener"
  );
}

function resetToCurrentTime(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  state.current.timeShiftMs = 0;
  state.current.manualBaseUtcMs = null;
  state.current.manualSetAtMs = null;
  closeEditForm();
  tick();
}

resetTimeBtnEl.addEventListener("click", resetToCurrentTime);
resetTimeBtnEl.addEventListener("touchend", resetToCurrentTime, { passive: false });

function focusMapOnCurrentLocation(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  focusStoredCurrentLocation();
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude, accuracy } = position.coords;

      state.current.lat = latitude;
      state.current.lon = longitude;
      state.current.accuracy = Number.isFinite(accuracy) ? accuracy : null;
      tick();
      focusStoredCurrentLocation(CURRENT_LOCATION_ZOOM);

      let city = null;
      let timezone = null;
      try {
        [city, timezone] = await Promise.all([
          reverseGeocode(latitude, longitude),
          timezoneByCoordinates(latitude, longitude)
        ]);
      } catch {
        // Keep the high-accuracy coordinates even if lookup services fail.
      }

      const nextCity = city || state.current.city;
      const nextTimezone = timezone || state.current.timezone;
      updateCurrentLocation(nextCity, nextTimezone, latitude, longitude, accuracy);

      tick();
      focusStoredCurrentLocation(CURRENT_LOCATION_ZOOM);
    },
    () => {
      focusStoredCurrentLocation(CURRENT_LOCATION_ZOOM);
    },
    {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0
    }
  );
}

focusCurrentBtnEl.addEventListener("click", focusMapOnCurrentLocation);
focusCurrentBtnEl.addEventListener("touchend", focusMapOnCurrentLocation, { passive: false });
openOrganicMapsBtnEl.addEventListener("click", openCurrentLocationInOrganicMaps);
openOrganicMapsBtnEl.addEventListener("touchend", openCurrentLocationInOrganicMaps, { passive: false });

function applyEditedTimeForTimezone(value, timezone) {
  const targetSeconds = parseHmsToSeconds(value.trim());
  if (targetSeconds === null) {
    return false;
  }

  const referenceDate = getReferenceDate();
  const currentSeconds = parseHmsToSeconds(formatHmsForZone(referenceDate, timezone));
  if (currentSeconds === null) return false;

  const deltaMs = (targetSeconds - currentSeconds) * 1000;
  const nextReferenceUtcMs = referenceDate.getTime() + deltaMs;
  state.current.manualBaseUtcMs = nextReferenceUtcMs;
  state.current.manualSetAtMs = Date.now();
  return true;
}

editTimeOnlyEl.addEventListener("input", () => {
  const value = editTimeOnlyEl.value;
  if (!value.trim()) {
    editErrorEl.textContent = "";
    return;
  }

  const updated = applyEditedTimeForTimezone(value, state.editTarget.timezone);
  if (!updated) {
    editErrorEl.textContent = "Use HH:MM or HH:MM:SS";
    return;
  }
  editErrorEl.textContent = "";
  if (updated) tick();
});

tick();
initializeCurrentLocation();
setInterval(tick, 1000);

function animateSweepClocks() {
  const referenceDate = getReferenceDate();
  for (const clockEl of document.querySelectorAll(".analog-clock")) {
    updateAnalogClockElement(clockEl, referenceDate);
  }
  requestAnimationFrame(animateSweepClocks);
}

requestAnimationFrame(animateSweepClocks);
