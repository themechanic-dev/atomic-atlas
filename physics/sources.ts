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
  bmw1971: {
    id: 'bmw1971',
    short: 'Bate, Mueller & White 1971',
    citation:
      'R. R. Bate, D. D. Mueller and J. E. White, Fundamentals of Astrodynamics. Dover Publications, 1971. Chapter 6, Ballistic Missile Trajectories.',
  },
  hotspot2013: {
    id: 'hotspot2013',
    short: 'HotSpot 3.0 User\'s Guide',
    citation:
      'S. G. Homann and F. Aluzzi, HotSpot Health Physics Codes Version 3.0 User\'s Guide. Lawrence Livermore National Laboratory, LLNL-SM-636474, 2013.',
    url: 'https://narac.llnl.gov/hotspot',
  },
  icrp119: {
    id: 'icrp119',
    short: 'ICRP Publication 119',
    citation:
      'ICRP, Compendium of Dose Coefficients based on ICRP Publication 60. ICRP Publication 119, Annals of the ICRP 41 (Suppl.), 2012.',
    url: 'https://www.icrp.org/publication.asp?id=ICRP%20Publication%20119',
  },
  fgr12: {
    id: 'fgr12',
    short: 'Federal Guidance Report 12',
    citation:
      'K. F. Eckerman and J. C. Ryman, External Exposure to Radionuclides in Air, Water, and Soil. Federal Guidance Report No. 12, U.S. Environmental Protection Agency, EPA-402-R-93-081, 1993.',
    url: 'https://www.epa.gov/radiation/federal-guidance-report-no-12-external-exposure-radionuclides-air-water-and-soil',
  },
  iaeaGsr7: {
    id: 'iaeaGsr7',
    short: 'IAEA GSR Part 7',
    citation:
      'IAEA, Preparedness and Response for a Nuclear or Radiological Emergency. IAEA Safety Standards Series No. GSR Part 7, 2015. Appendix II, Table II.2.',
    url: 'https://www.iaea.org/publications/10905/preparedness-and-response-for-a-nuclear-or-radiological-emergency',
  },
  unscear2008c: {
    id: 'unscear2008c',
    short: 'UNSCEAR 2008, Annex C',
    citation: 'UNSCEAR, Sources and Effects of Ionizing Radiation, 2008 Report, Volume II, Annex C: Radiation exposures in accidents. United Nations, 2011.',
    url: 'https://www.unscear.org/unscear/en/publications/2008_2.html',
  },
  unscear2008d: {
    id: 'unscear2008d',
    short: 'UNSCEAR 2008, Annex D',
    citation:
      'UNSCEAR, Sources and Effects of Ionizing Radiation, 2008 Report, Volume II, Annex D: Health effects due to radiation from the Chernobyl accident, Table A1. United Nations, 2011.',
    url: 'https://www.unscear.org/unscear/en/publications/2008_2.html',
  },
  unscear2013a: {
    id: 'unscear2013a',
    short: 'UNSCEAR 2013, Annex A',
    citation:
      'UNSCEAR, Sources, Effects and Risks of Ionizing Radiation, 2013 Report, Volume I, Annex A: Levels and effects of radiation exposure due to the nuclear accident after the 2011 great east-Japan earthquake and tsunami, Table B4. United Nations, 2014.',
    url: 'https://www.unscear.org/unscear/en/publications/2013_1.html',
  },
  nrpa2007: {
    id: 'nrpa2007',
    short: 'NRPA Bulletin 8/2007',
    citation: 'Norwegian Radiation Protection Authority, The Kyshtym accident, 29th September 1957. NRPA Bulletin 8, 2007, Table 1.',
    url: 'https://dsa.no/publikasjoner/straleverninfo-8-2007-the-kyshtym-accident-29th-september-1957/StralevernInfo_8_2007.pdf',
  },
  cem2002: {
    id: 'cem2002',
    short: 'Coastal Engineering Manual',
    citation:
      'U.S. Army Corps of Engineers, Coastal Engineering Manual, EM 1110-2-1100, Part II (Coastal Hydrodynamics), Chapters 1 and 4, 2002 (with later changes).',
    url: 'https://www.publications.usace.army.mil/USACE-Publications/Engineer-Manuals/',
  },
  froehlich1995: {
    id: 'froehlich1995',
    short: 'Froehlich 1995',
    citation: 'D. C. Froehlich, Peak outflow from breached embankment dam. Journal of Water Resources Planning and Management 121(1), 90–97, 1995.',
  },
  ackers2006: {
    id: 'ackers2006',
    short: 'Ackers, Pether & Tarrant 2006',
    citation:
      'J. C. Ackers, R. Pether and O. Tarrant, Reservoir hazard analysis and flood mapping for contingency planning. Improvements in Reservoirs, British Dam Society conference, 2006 (Paper 44).',
    url: 'https://britishdams.org/assets/documents/conferences/2006/papers/Paper%2044%20Ackers.PDF',
  },
  gdw2024: {
    id: 'gdw2024',
    short: 'Global Dam Watch 1.0',
    citation:
      'Lehner et al., The Global Dam Watch database of river barrier and reservoir information for large-scale applications. Scientific Data 11, 2024. Data: figshare, doi:10.6084/m9.figshare.25988293 (CC BY 4.0).',
    url: 'https://doi.org/10.6084/m9.figshare.25988293.v1',
  },
  aps2003: {
    id: 'aps2003',
    short: 'APS 2003',
    citation:
      'D. K. Barton et al., Report of the American Physical Society Study Group on Boost-Phase Intercept Systems for National Missile Defense. Reviews of Modern Physics 76, S1, 2004 (released July 2003).',
    url: 'https://doi.org/10.1103/RevModPhys.76.S1',
  },
  xia2022: {
    id: 'xia2022',
    short: 'Xia et al. 2022',
    citation:
      'L. Xia, A. Robock, K. Scherrer et al., Global food insecurity and famine from reduced crop, marine fishery and livestock production due to climate disruption from nuclear war soot injection. Nature Food 3, 586–596, 2022, Table 1.',
    url: 'https://doi.org/10.1038/s43016-022-00573-0',
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
  | 'height'
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
  | 'number'
  | 'activity'
  | 'effectiveDose'
  | 'flow'
  | 'volume';

export interface ExplanationValue {
  symbol: string;
  /** Key of the label in the translations (`quantity.<labelKey>`). */
  labelKey: string;
  value: number;
  quantity: Quantity;
}
