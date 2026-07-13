import type { ReactElement } from 'react';
import { avatarSkinTones, avatarHairColors, avatarAccessoryStroke, avatarMouthRed, avatarBoneTangerina, avatarBoneVerde, avatarEyeWhite } from '../theme/palette';

export interface AvatarOption {
  id: string;
  label: string;
  svg: ReactElement;
}

const S = 48;
const STROKE = avatarAccessoryStroke;
const MOUTH_RED = avatarMouthRed;
const EYE_WHITE = avatarEyeWhite;

function face(cx: number, skin: string, hair: ReactElement, eyes: ReactElement, mouth: ReactElement, accessory?: ReactElement) {
  return (
    <svg width={S} height={S} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {hair}
      <circle cx={cx} cy="26" r="14" fill={skin} />
      {eyes}
      {mouth}
      {accessory}
    </svg>
  );
}

const { clara: PELE_CLARA, media: PELE_MEDIA, escura: PELE_ESCURA, cravo: CRAVO, branco: BRANCO } = avatarSkinTones;
const { castanhoEscuro: CABELO_CASTA, castanhoMedio: CABELO_MED, castanhoClaro: CABELO_CLARO, preto: PRETO, muitoEscuro: MUITO_ESCURO, ruivo: RUIVO } = avatarHairColors;

const cabeloCurto = (cor: string) => (
  <ellipse cx="24" cy="18" rx="16" ry="10" fill={cor} />
);
const cabeloCacheado = (cor: string) => (
  <>
    <ellipse cx="24" cy="17" rx="16" ry="11" fill={cor} />
    <circle cx="14" cy="26" r="5" fill={cor} />
    <circle cx="33" cy="26" r="5" fill={cor} />
  </>
);
const cabeloLiso = (cor: string) => (
  <>
    <ellipse cx="24" cy="17" rx="16" ry="12" fill={cor} />
    <rect x="8" y="20" width="32" height="10" fill={cor} />
  </>
);
const cabeloRaspado = (cor: string) => (
  <ellipse cx="24" cy="18" rx="15" ry="7" fill={cor} />
);

const oculosRedondo = (
  <>
    <circle cx="17" cy="24" r="5" stroke={STROKE} strokeWidth="1.5" />
    <circle cx="31" cy="24" r="5" stroke={STROKE} strokeWidth="1.5" />
    <line x1="22" y1="24" x2="26" y2="24" stroke={STROKE} strokeWidth="1.5" />
  </>
);
const oculosQuadrado = (
  <>
    <rect x="11" y="20" width="12" height="9" rx="2" stroke={STROKE} strokeWidth="1.5" />
    <rect x="25" y="20" width="12" height="9" rx="2" stroke={STROKE} strokeWidth="1.5" />
    <line x1="23" y1="24" x2="25" y2="24" stroke={STROKE} strokeWidth="1.5" />
  </>
);

const olhosSimples = (
  <>
    <circle cx="17.5" cy="24" r="2" fill={STROKE} />
    <circle cx="30.5" cy="24" r="2" fill={STROKE} />
  </>
);
const olhosBrilho = (
  <>
    <circle cx="17.5" cy="24" r="2.5" fill={STROKE} />
    <circle cx="16.5" cy="23" r="0.9" fill={EYE_WHITE} />
    <circle cx="30.5" cy="24" r="2.5" fill={STROKE} />
    <circle cx="29.5" cy="23" r="0.9" fill={EYE_WHITE} />
  </>
);

const bocaSorrindo = <path d="M16 32 Q24 39 32 32" stroke={MOUTH_RED} fill="none" strokeWidth="1.8" strokeLinecap="round" />;
const bocaSerio = <line x1="18" y1="34" x2="30" y2="34" stroke={STROKE} strokeWidth="1.5" strokeLinecap="round" />;

const bone = (cor: string) => (
  <>
    <ellipse cx="26" cy="17" rx="18" ry="5" fill={cor} />
    <path d="M12 20 Q26 22 44 17 L44 14 Q26 19 12 17 Z" fill={cor} />
  </>
);

function avatar(cx: number, skin: string, hair: ReactElement, eyes: ReactElement, mouth: ReactElement, accessory?: ReactElement) {
  return face(cx, skin, hair, eyes, mouth, accessory);
}

export const avatarCatalog: AvatarOption[] = [
  { id: 'alegre-clara',   label: 'Alegre',   svg: avatar(24, PELE_CLARA, cabeloCurto(CABELO_CASTA), olhosBrilho, bocaSorrindo) },
  { id: 'serio-media',    label: 'Sereno',    svg: avatar(24, PELE_MEDIA, cabeloLiso(PRETO),  olhosSimples, bocaSerio) },
  { id: 'alegre-escura',  label: 'Radiante',  svg: avatar(24, PELE_ESCURA, cabeloCacheado(MUITO_ESCURO), olhosBrilho, bocaSorrindo) },
  { id: 'serio-clara',    label: 'Tranquilo', svg: avatar(24, PELE_CLARA, cabeloRaspado(CABELO_MED), olhosSimples, bocaSerio) },
  { id: 'bone-media',     label: 'Estiloso',  svg: avatar(24, PELE_MEDIA, cabeloCurto(CABELO_MED), olhosBrilho, bocaSorrindo, bone(avatarBoneTangerina)) },
  { id: 'oculos-clara',   label: 'Geek',      svg: avatar(24, PELE_CLARA, cabeloLiso(CABELO_CLARO), olhosSimples, bocaSorrindo, oculosRedondo) },
  { id: 'oculos-escura',  label: 'Esperto',   svg: avatar(24, CRAVO, cabeloCurto(MUITO_ESCURO), olhosSimples, bocaSorrindo, oculosQuadrado) },
  { id: 'cacheado-media', label: 'Solar',     svg: avatar(24, PELE_MEDIA, cabeloCacheado(MUITO_ESCURO), olhosBrilho, bocaSorrindo) },
  { id: 'serio-escura',   label: 'Focado',    svg: avatar(24, PELE_ESCURA, cabeloCurto(MUITO_ESCURO), olhosSimples, bocaSerio) },
  { id: 'bone-clara',     label: 'Aventureiro', svg: avatar(24, PELE_CLARA, cabeloRaspado(RUIVO), olhosBrilho, bocaSorrindo, bone(avatarBoneVerde)) },
  { id: 'liso-media',     label: 'Calmo',      svg: avatar(24, PELE_MEDIA, cabeloLiso(MUITO_ESCURO), olhosSimples, bocaSorrindo) },
  { id: 'raspado-escuro', label: 'Minimalista', svg: avatar(24, PELE_ESCURA, cabeloRaspado(MUITO_ESCURO), olhosBrilho, bocaSorrindo) },
];

export function getAvatarById(id: string): AvatarOption | undefined {
  return avatarCatalog.find((a) => a.id === id);
}
