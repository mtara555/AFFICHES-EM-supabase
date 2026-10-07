import { useEffect, useRef, useState } from 'react';
import './ScannerCodeBarre.css';

/**
 * Lecture de code-barres par la camera du telephone.
 *
 * Deux moteurs :
 * - l'API BarcodeDetector integree au navigateur (Chrome Android, Edge),
 *   rapide et sans telechargement ;
 * - a defaut (iPhone, Firefox), la bibliotheque ZXing, chargee seulement a la
 *   premiere ouverture du scanner pour ne pas alourdir l'application.
 *
 * Formats lus : EAN-13, EAN-8, UPC-A, UPC-E et Code 128 (codes internes).
 * Un EAN dont la cle de controle est valide est accepte a la premiere lecture ;
 * tout autre code doit etre lu deux fois de suite a l'identique, pour ecarter
 * les lectures partielles.
 *
 * La camera exige une page en HTTPS : c'est le cas sur GitHub Pages et dans
 * l'apercu Codespaces.
 */

interface ScannerProps {
  readonly ouvert: boolean;
  readonly surCode: (code: string) => void;
  readonly surFermer: () => void;
}

/* Types minimaux de l'API BarcodeDetector, absente des definitions TypeScript. */
interface CodeDetecte {
  rawValue: string;
}
interface DetecteurNatif {
  detect(source: HTMLVideoElement): Promise<CodeDetecte[]>;
}
interface ConstructeurDetecteur {
  new (options: { formats: string[] }): DetecteurNatif;
  getSupportedFormats(): Promise<string[]>;
}

const FORMATS_NATIFS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

/** Cle de controle GS1 (EAN-8, UPC-A, EAN-13). */
function cleValide(code: string): boolean {
  if (!/^\d{8}$|^\d{12,13}$/.test(code)) return false;
  const chiffres = code.split('').map(Number);
  const cle = chiffres.pop()!;
  const somme = chiffres
    .reverse()
    .reduce((s, c, i) => s + c * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (somme % 10)) % 10 === cle;
}

function messageCamera(erreur: unknown): string {
  const nom = erreur instanceof DOMException ? erreur.name : '';
  if (!window.isSecureContext) return 'La camera exige une connexion securisee (https).';
  if (nom === 'NotAllowedError' || nom === 'SecurityError') {
    return "Acces a la camera refuse. Autorisez la camera pour ce site dans les reglages du navigateur, puis reessayez.";
  }
  if (nom === 'NotFoundError' || nom === 'OverconstrainedError') return 'Aucune camera disponible sur cet appareil.';
  if (nom === 'NotReadableError') return 'La camera est deja utilisee par une autre application.';
  return 'Impossible de demarrer la camera.';
}

/** Petit bip de confirmation (silencieux si le son est bloque). */
function bip() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1800;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
    osc.onended = () => void ctx.close();
  } catch {
    /* son indisponible */
  }
}

export function ScannerCodeBarre({ ouvert, surCode, surFermer }: ScannerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [demarrage, setDemarrage] = useState(true);
  const [lampe, setLampe] = useState<{ dispo: boolean; allumee: boolean }>({ dispo: false, allumee: false });
  const piste = useRef<MediaStreamTrack | null>(null);
  const rappel = useRef(surCode);
  rappel.current = surCode;

  useEffect(() => {
    if (!ouvert) return;
    let actif = true;
    let flux: MediaStream | null = null;
    let minuterie: number | undefined;
    let arretZxing: (() => void) | undefined;
    let derniere = '';

    setErreur(null);
    setDemarrage(true);
    setLampe({ dispo: false, allumee: false });

    const accepter = (brut: string) => {
      const code = brut.trim();
      if (!code || !actif) return;
      const sur = cleValide(code) || code === derniere;
      derniere = code;
      if (!sur) return;
      actif = false;
      navigator.vibrate?.(80);
      bip();
      rappel.current(code);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('', 'NotFoundError');
        flux = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (!actif || !video.current) return;
        const v = video.current;
        v.srcObject = flux;
        await v.play();

        const track = flux.getVideoTracks()[0] ?? null;
        piste.current = track;
        const capacites = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setLampe({ dispo: Boolean(capacites.torch), allumee: false });
        setDemarrage(false);

        const Natif = (window as unknown as { BarcodeDetector?: ConstructeurDetecteur }).BarcodeDetector;
        const formats = Natif ? await Natif.getSupportedFormats().catch(() => [] as string[]) : [];
        const utilisables = FORMATS_NATIFS.filter((f) => formats.includes(f));

        if (Natif && utilisables.includes('ean_13')) {
          const detecteur = new Natif({ formats: utilisables });
          const boucle = async () => {
            if (!actif) return;
            try {
              if (v.readyState >= 2) {
                const resultats = await detecteur.detect(v);
                if (resultats[0]) accepter(resultats[0].rawValue);
              }
            } catch {
              /* image illisible : on continue */
            }
            if (actif) minuterie = window.setTimeout(() => void boucle(), 120);
          };
          void boucle();
        } else {
          // Lecteur « 1D » : EAN, UPC et Code 128, sans QR code ni formats 2D,
          // donc plus rapide sur un telephone modeste.
          const { BrowserMultiFormatOneDReader } = await import('@zxing/browser');
          if (!actif || !flux) return;
          const lecteur = new BrowserMultiFormatOneDReader(undefined, { delayBetweenScanAttempts: 120 });
          const controles = await lecteur.decodeFromStream(flux, v, (resultat) => {
            if (resultat) accepter(resultat.getText());
          });
          arretZxing = () => controles.stop();
          if (!actif) arretZxing();
        }
      } catch (e) {
        if (actif) {
          setErreur(messageCamera(e));
          setDemarrage(false);
        }
      }
    })();

    return () => {
      actif = false;
      window.clearTimeout(minuterie);
      arretZxing?.();
      flux?.getTracks().forEach((t) => t.stop());
      piste.current = null;
    };
  }, [ouvert]);

  // Echap ferme le scanner (utile sur ordinateur).
  useEffect(() => {
    if (!ouvert) return;
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') surFermer();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [ouvert, surFermer]);

  async function basculerLampe() {
    const track = piste.current;
    if (!track) return;
    const suivant = !lampe.allumee;
    try {
      await track.applyConstraints({ advanced: [{ torch: suivant } as MediaTrackConstraintSet] });
      setLampe({ dispo: true, allumee: suivant });
    } catch {
      setLampe({ dispo: false, allumee: false });
    }
  }

  if (!ouvert) return null;

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Scanner un code-barres">
      <video ref={video} className="scanner__video" playsInline muted />

      <div className="scanner__cadre" aria-hidden="true">
        <span className="scanner__ligne" />
      </div>

      <p className="scanner__aide" role="status">
        {erreur ?? (demarrage ? 'Demarrage de la camera…' : 'Placez le code-barres dans le cadre')}
      </p>

      <div className="scanner__actions">
        {lampe.dispo ? (
          <button type="button" className="scanner__bouton" onClick={() => void basculerLampe()} aria-pressed={lampe.allumee}>
            {lampe.allumee ? 'Eteindre la lampe' : 'Lampe'}
          </button>
        ) : null}
        <button type="button" className="scanner__bouton scanner__bouton--fermer" onClick={surFermer}>
          Fermer
        </button>
      </div>
    </div>
  );
}
