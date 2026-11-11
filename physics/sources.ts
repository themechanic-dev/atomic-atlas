// Every model in physics/ points at the published, unclassified source it comes from.
// The UI shows these under "How was this calculated?".

export interface Source {
  id: string;
  /** Short label for inline use, e.g. "Glasstone & Dolan 1977". */
  short: string;
  /** Full citation. */
  citation: string;
  url?: string;
}

export const SOURCES = {
  gd1977: {
    id: 'gd1977',
    short: 'Glasstone & Dolan 1977',
    citation:
      'S. Glasstone and P. J. Dolan (eds.), The Effects of Nuclear Weapons, 3rd edition. U.S. Department of Defense and U.S. Department of Energy, 1977.',
    url: 'https://www.osti.gov/biblio/6852629',
  },
  brode1986: {
    id: 'brode1986',
    short: 'Brode 1986',
    citation:
      'H. L. Brode, Airblast From Nuclear Bursts: Analytic Approximations. Pacific-Sierra Research Corporation, Report 1419-3, 1986.',
  },
  hanifen1980: {
    id: 'hanifen1980',
    short: 'WSEG-10 (Hanifen 1980)',
    citation:
      'D. W. Hanifen, Documentation and Analysis of the WSEG-10 Fallout Prediction Model. Thesis, Air Force Institute of Technology, 1980.',
  },
  ota1979: {
    id: 'ota1979',
    short: 'OTA 1979',
    citation: 'U.S. Congress, Office of Technology Assessment, The Effects of Nuclear War. OTA-NS-89, 1979.',
    url: 'https://ota.fas.org/reports/7906.pdf',
  },
  ghspop: {
    id: 'ghspop',
    short: 'GHS-POP R2023A',
    citation:
      'M. Schiavina, S. Freire, A. Carioli and K. MacManus, GHS-POP R2023A: GHS population grid multitemporal (1975-2030). European Commission, Joint Research Centre, 2023. doi:10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE',
    url: 'https://human-settlement.emergency.copernicus.eu/ghs_pop2023.php',
  },
  openmeteo: {
    id: 'openmeteo',
    short: 'Open-Meteo',
    citation: 'Open-Meteo.com weather API: wind speed and direction at 10 m and at the 850, 500 and 250 hPa levels.',
    url: 'https://open-meteo.com',
  },
  glasstoneLib: {
    id: 'glasstoneLib',
    short: 'glasstone library',
    citation:
      'glasstone: Python library for modelling nuclear weapons effects (GOFAI/glasstone, MIT licence). Source of the digitised initial-radiation curves.',
    url: 'https://github.com/GOFAI/glasstone',
  },
} as const satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;

/**
 * One step of an explanation: which formula, with which inputs, from which source.
 * Text shown to the user lives in app/i18n under `how.<id>.*`; the physics layer stays language-free.
 */
export interface Explanation {
  /** Key of the explanation text in the translations. */
  id: string;
  /** The formula in plain notation, language independent. */
  formula: string;
  /** Named inputs with SI values; the UI formats them in the user's units. */
  inputs: ExplanationValue[];
  /** The result(s) of this step. */
  outputs: ExplanationValue[];
  sources: SourceId[];
  /** Where exactly in the source (section, equation, figure, table). */
  where: string;
  /** Uncertainty stated by the source or measured against it. */
  uncertainty?: string;
}

export type Quantity =
  | 'length'
  | 'area'
  | 'pressure'
  | 'energyDensity'
  | 'yield'
  | 'speed'
  | 'dose'
  | 'doseRate'
  | 'time'
  | 'angle'
  | 'fraction'
  | 'count'
  | 'number';

export interface ExplanationValue {
  symbol: string;
  /** Key of the label in the translations (`quantity.<labelKey>`). */
  labelKey: string;
  value: number;
  quantity: Quantity;
}
