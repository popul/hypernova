// Entrées clavier + souris. Les codes physiques (event.code) couvrent à la fois
// QWERTY (A/D) et AZERTY (Q/D) puisque KeyA désigne la touche physique.

export class Input {
  constructor() {
    this.held = new Set();
    this.listeners = new Map(); // code -> Set<fn>, déclenché au keydown (pas en répétition)
    this.mouseDown = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.held.add(e.code);
      const subs = this.listeners.get(e.code);
      if (subs) subs.forEach((fn) => fn(e));
      // Empêche le scroll de la page avec espace/flèches pendant le jeu.
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
        e.preventDefault();
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

  get fire() {
    return this.held.has('Space') || this.mouseDown;
  }
}
