// Entrées clavier + souris + tactile. Les codes physiques (event.code) couvrent à la fois
// QWERTY (A/D) et AZERTY (Q/D) puisque KeyA désigne la touche physique.
// Tactile : glisser n'importe où = viser une position, le tir est automatique tant qu'on touche.

export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export class Input {
  constructor() {
    this.held = new Set();
    this.listeners = new Map(); // code -> Set<fn>, déclenché au keydown (pas en répétition)
    this.mouseDown = false;
    this.touchActive = false;
    this.touchNdc = { x: 0, y: 0 }; // position du doigt en coordonnées NDC (-1..1)
    this._touchId = null; // identifier du doigt qui pilote (robuste au multi-touch)

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.held.add(e.code);
      const subs = this.listeners.get(e.code);
      if (subs) subs.forEach((fn) => fn(e));
      // Empêche le scroll de la page avec espace/flèches pendant le jeu — sauf quand un
      // bouton ou un champ a le focus (la boutique et la saisie du nom en dépendent).
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
        const onWidget = e.target instanceof Element && e.target.closest('button, input');
        if (!onWidget) e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });

    const updateTouch = (t) => {
      this.touchNdc.x = (t.clientX / window.innerWidth) * 2 - 1;
      this.touchNdc.y = -(t.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener(
      'touchstart',
      (e) => {
        // Les touches sur l'UI (boutons, écrans, champs) restent des taps normaux.
        if (e.target instanceof Element && e.target.closest('button, .screen, input, a')) return;
        // On suit LE doigt nouvellement posé par son identifier : un pouce resté sur le
        // bouton pause ou un second doigt ne doit jamais voler le pilotage.
        const touch = e.changedTouches[0];
        this._touchId = touch.identifier;
        this.touchActive = true;
        updateTouch(touch);
        e.preventDefault(); // bloque scroll/zoom et les événements souris synthétiques
      },
      { passive: false }
    );
    window.addEventListener(
      'touchmove',
      (e) => {
        if (!this.touchActive) return;
        const touch = Array.from(e.touches).find((t) => t.identifier === this._touchId);
        if (!touch) return;
        updateTouch(touch);
        e.preventDefault();
      },
      { passive: false }
    );
    const endTouch = (e) => {
      const lifted = Array.from(e.changedTouches).some((t) => t.identifier === this._touchId);
      if (lifted) {
        this.touchActive = false;
        this._touchId = null;
      }
    };
    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch);
  }

  on(code, fn) {
    if (!this.listeners.has(code)) this.listeners.set(code, new Set());
    this.listeners.get(code).add(fn);
    return () => this.listeners.get(code)?.delete(fn);
  }

  get left() {
    return this.held.has('ArrowLeft') || this.held.has('KeyA');
  }

  get right() {
    return this.held.has('ArrowRight') || this.held.has('KeyD');
  }

  // Avance / recul. KeyW et KeyZ couvrent QWERTY et AZERTY sur la même touche
  // physique — c'est tout l'intérêt de raisonner en event.code.
  get forward() {
    return this.held.has('ArrowUp') || this.held.has('KeyW') || this.held.has('KeyZ');
  }

  get back() {
    return this.held.has('ArrowDown') || this.held.has('KeyS');
  }

  get fire() {
    return this.held.has('Space') || this.mouseDown || this.touchActive;
  }
}
