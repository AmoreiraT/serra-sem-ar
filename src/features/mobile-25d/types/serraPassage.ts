export type MortalityTone = 'low' | 'warning' | 'critical' | 'mourning';

export interface PassageLayerAsset {
  readonly id: string;
  readonly src: string;
  readonly avifSrc: string;
  readonly fallbackSrc?: string;
  readonly fallbackAvifSrc?: string;
  readonly alt: string;
  readonly depth: number;
  readonly opacity: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
}

export interface SerraPassage {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly dateRangeLabel: string;
  readonly casesLabel: string;
  readonly deathsLabel: string;
  readonly mortalityTone: MortalityTone;
  readonly progressStart: number;
  readonly progressEnd: number;
  readonly layers: readonly PassageLayerAsset[];
}
