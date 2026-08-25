// Profils de pilotes sur l'appareil : chaque copain a son badge, choisi au décollage.
// Un code secret optionnel (4 chiffres) protège un profil contre l'emprunt de pseudo
// entre copains. C'est dissuasif, pas une vraie sécurité : tout reste en localStorage —
// une protection réelle demanderait un serveur et des comptes.

const PILOTS_KEY = 'novaswarm.pilots';
const ACTIVE_KEY = 'novaswarm.pilot';
const LEGACY_NAME_KEY = 'novaswarm.lastname';
const MAX_PILOTS = 8;

export function sanitizeName(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ\-. ]/g, '')
    .trim()
    .slice(0, 10);
}

// Hachage djb2 salé par le nom : suffisant pour un code secret dissuasif local.
function hashPin(name, pin) {
  const s = `${name}:${pin}:novaswarm`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

export function listPilots() {
  try {
    const raw = JSON.parse(localStorage.getItem(PILOTS_KEY));
    const pilots = Array.isArray(raw) ? raw.filter((p) => p && p.name) : [];
    // Migration : l'ancien "dernier nom utilisé" devient un profil.
    if (pilots.length === 0) {
      const legacy = sanitizeName(localStorage.getItem(LEGACY_NAME_KEY));
      if (legacy) {
        pilots.push({ name: legacy, pinHash: null });
        savePilots(pilots);
      }
    }
    return pilots;
  } catch {
    return [];
  }
}

function savePilots(pilots) {
  localStorage.setItem(PILOTS_KEY, JSON.stringify(pilots.slice(0, MAX_PILOTS)));
}

export function activePilot() {
  const name = localStorage.getItem(ACTIVE_KEY);
  return listPilots().find((p) => p.name === name) || null;
}

export function setActivePilot(name) {
  localStorage.setItem(ACTIVE_KEY, name);
  localStorage.setItem(LEGACY_NAME_KEY, name); // compat partage de défi
}

// Renvoie { ok, error } — error: 'exists' | 'invalid' | 'full'.
export function createPilot(rawName, pin = '', apparence = {}) {
  const name = sanitizeName(rawName);
  if (!name) return { ok: false, error: 'invalid' };
  const pilots = listPilots();
  if (pilots.some((p) => p.name === name)) return { ok: false, error: 'exists' };
  if (pilots.length >= MAX_PILOTS) return { ok: false, error: 'full' };
  const cleanPin = /^\d{4}$/.test(pin) ? pin : '';
  // L'apparence est attachée au PILOTE, pas à la partie : elle survit aux morts,
  // et c'est elle qu'on reconnaît dans un classement partagé entre copains.
  pilots.push({
    name,
    pinHash: cleanPin ? hashPin(name, cleanPin) : null,
    livree: apparence.livree || 'flotte',
    carene: apparence.carene || 'dague',
  });
  savePilots(pilots);
  setActivePilot(name);
  return { ok: true, name };
}

export function hasPin(pilot) {
  return !!pilot?.pinHash;
}

export function verifyPin(pilot, pin) {
  if (!pilot?.pinHash) return true;
  return hashPin(pilot.name, String(pin)) === pilot.pinHash;
}
