// SE PARLER EN JOUANT.
//
// Deux enfants qui jouent ensemble à distance ont besoin de s'entendre : c'est
// la moitié du plaisir, et sans ça le jeu à deux reste deux personnes qui font
// la même chose chacune de son côté.
//
// L'AUDIO NE PASSE PAS PAR LE SERVEUR. WebRTC ouvre une liaison DIRECTE entre les
// deux navigateurs. Le serveur ne sert qu'à les présenter — quelques messages
// pour qu'ils se trouvent, et il n'en voit plus rien ensuite. Trois raisons, dans
// cet ordre : deux enfants qui se parlent n'ont pas à transiter par ma machine ;
// la latence d'un aller-retour par le homelab rendrait la conversation pénible ;
// et une conversation continue coûterait de la bande passante à un serveur qui
// n'en a aucune à donner.
//
// CE QU'IL FAUT POUR SE TROUVER. Deux navigateurs derrière deux box ne
// connaissent pas leur adresse publique : c'est à ça que sert un serveur STUN,
// qui répond « voilà de quoi tu as l'air vu de l'extérieur ». On utilise ceux,
// publics, de Google — c'est un échange de deux paquets, aucune donnée, aucun
// son.
//
// CE QUI NE MARCHERA PAS, ET IL FAUT LE DIRE. Certaines liaisons — un partage de
// connexion mobile, un réseau d'entreprise — ne laissent pas deux pairs se
// joindre directement, même avec STUN. Il faudrait alors un serveur TURN, qui
// relaie l'audio, donc coûteux et exactement ce qu'on voulait éviter. Sur deux
// connexions domestiques ordinaires, ça marche ; ailleurs, l'appel échouera et on
// le dira.

const SERVEURS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export class Voix {
  // `envoie(vers, sujet, donnees)` fait passer un message de signalisation par le
  // canal déjà ouvert — c'est la seule chose que cette classe demande au reste.
  constructor({ envoie, onEtat }) {
    this.envoie = envoie;
    this.onEtat = onEtat;
    this.pair = null; // avec qui on parle
    this.etat = 'raccroche'; // raccroche | appelle | sonne | enligne | refus | echec
    this.pc = null;
    this.micro = null;
    this.audio = null;
    this.muet = false;
  }

  _dit(etat, detail = null) {
    this.etat = etat;
    this.onEtat?.(etat, this.pair, detail);
  }

  // --- Ouverture ------------------------------------------------------------

  // On ne demande le micro QU'AU MOMENT de l'appel. Le demander au chargement
  // ferait apparaître la fenêtre de permission du navigateur devant un enfant qui
  // voulait juste jouer, et un refus une fois donné est difficile à reprendre.
  async _prendMicro() {
    if (this.micro) return this.micro;
    try {
      this.micro = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      return this.micro;
    } catch {
      this._dit('echec', 'micro');
      return null;
    }
  }

  _prepare(pair) {
    this.pair = pair;
    const pc = new RTCPeerConnection({ iceServers: SERVEURS });
    this.pc = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate) this.envoie(pair, 'ice', e.candidate.toJSON());
    };
    // C'est ici qu'arrive la voix de l'autre. On la branche sur un élément audio
    // hors écran : rien à afficher, tout à entendre.
    pc.ontrack = (e) => {
      if (!this.audio) {
        this.audio = document.createElement('audio');
        this.audio.autoplay = true;
        this.audio.style.display = 'none';
        document.body.append(this.audio);
      }
      this.audio.srcObject = e.streams[0];
      // La lecture automatique peut être refusée tant que rien n'a été touché ;
      // dans une partie, on a forcément déjà cliqué.
      this.audio.play?.().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this._dit('enligne');
      else if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        // « disconnected » se répare parfois tout seul ; « failed » non.
        if (pc.connectionState === 'failed') this.raccroche('echec');
      }
    };
    return pc;
  }

  // --- Appeler --------------------------------------------------------------

  async appelle(pair) {
    if (this.etat !== 'raccroche') return;
    const micro = await this._prendMicro();
    if (!micro) return;
    this._dit('appelle');
    const pc = this._prepare(pair);
    for (const piste of micro.getTracks()) pc.addTrack(piste, micro);
    const offre = await pc.createOffer();
    await pc.setLocalDescription(offre);
    this.envoie(pair, 'offre', { type: offre.type, sdp: offre.sdp });
  }

  // --- Recevoir -------------------------------------------------------------

  async _surOffre(de, sdp) {
    // Déjà en ligne avec quelqu'un : on refuse plutôt que de couper la première
    // conversation, ce qui serait le pire des deux mondes.
    if (this.etat === 'enligne' && this.pair !== de) {
      this.envoie(de, 'refus', 'occupe');
      return;
    }
    this.pair = de;
    this._dit('sonne');
    this._offreEnAttente = sdp;
  }

  // L'utilisateur décroche : c'est à ce moment qu'on demande le micro, et pas
  // avant. Le geste de décrocher EST le consentement.
  async decroche() {
    if (this.etat !== 'sonne' || !this._offreEnAttente) return;
    const micro = await this._prendMicro();
    if (!micro) return;
    const pc = this._prepare(this.pair);
    for (const piste of micro.getTracks()) pc.addTrack(piste, micro);
    await pc.setRemoteDescription(this._offreEnAttente);
    this._offreEnAttente = null;
    for (const c of this._iceEnAttente || []) await pc.addIceCandidate(c).catch(() => {});
    this._iceEnAttente = [];
    const reponse = await pc.createAnswer();
    await pc.setLocalDescription(reponse);
    this.envoie(this.pair, 'reponse', { type: reponse.type, sdp: reponse.sdp });
  }

  refuse() {
    if (this.pair) this.envoie(this.pair, 'refus', 'non');
    this.raccroche();
  }

  // --- Signalisation --------------------------------------------------------

  async recois(de, sujet, d) {
    try {
      if (sujet === 'offre') return this._surOffre(de, d);
      if (sujet === 'reponse') {
        if (!this.pc) return;
        await this.pc.setRemoteDescription(d);
        return;
      }
      if (sujet === 'ice') {
        // Les candidats peuvent arriver avant qu'on ait décroché : on les garde.
        if (!this.pc || !this.pc.remoteDescription) {
          this._iceEnAttente = this._iceEnAttente || [];
          this._iceEnAttente.push(d);
          return;
        }
        await this.pc.addIceCandidate(d).catch(() => {});
        return;
      }
      if (sujet === 'refus') return this.raccroche('refus');
      if (sujet === 'raccroche') return this.raccroche();
    } catch {
      this.raccroche('echec');
    }
  }

  // --- Fermer ---------------------------------------------------------------

  // Le micro est RELÂCHÉ à chaque fois. Le garder ouvert laisserait la pastille
  // d'enregistrement allumée dans l'onglet après la conversation, ce qui est à la
  // fois inquiétant et mérité.
  raccroche(cause = null) {
    if (this.pair && !cause) this.envoie(this.pair, 'raccroche', null);
    this.pc?.close();
    this.pc = null;
    for (const p of this.micro?.getTracks() || []) p.stop();
    this.micro = null;
    if (this.audio) {
      this.audio.srcObject = null;
      this.audio.remove();
      this.audio = null;
    }
    this._offreEnAttente = null;
    this._iceEnAttente = [];
    const qui = this.pair;
    this.pair = null;
    this.onEtat?.(cause || 'raccroche', qui);
    this.etat = 'raccroche';
  }

  // Couper son micro sans raccrocher : le geste le plus demandé d'une
  // conversation, et le seul qui doive être instantané.
  basculeMuet() {
    this.muet = !this.muet;
    for (const p of this.micro?.getAudioTracks() || []) p.enabled = !this.muet;
    return this.muet;
  }
}
