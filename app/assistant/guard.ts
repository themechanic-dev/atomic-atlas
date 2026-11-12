// The topic filter of the assistant. Small local models have weak brakes of their own, so
// the app keeps the limits of ΣΧΕΔΙΟ §1 itself: questions about making or getting weapons,
// choosing targets, causing more harm or defeating a missile defence never reach the model.

const BLOCKED: RegExp[] = [
  // Making or obtaining weapons and materials.
  /\b(build|make|construct|assemble|design|manufacture|produce)\b.{0,50}\b(bomb|nuke|nuclear (weapon|device|warhead|bomb)|warhead|weapon|device)/i,
  /\b(enrich(ment|ing)?|centrifuges?|reprocess(ing)?|weapons?[- ]grade|critical mass|implosion (lens|design)|neutron initiator|fissile material|pit design|boost(ed|ing) gas)\b/i,
  /\b(get|obtain|buy|steal|acquire|smuggle)\b.{0,40}\b(uranium|plutonium|tritium|warhead|nuclear (weapon|material))/i,
  /(κατασκευ|φτιά[ξχ]|φτια[ξχ]|συναρμολογ|σχεδιά[σζ])\S*.{0,50}(βόμβ|βομβ|όπλ|οπλ|κεφαλ|μηχανισμ)/i,
  /(εμπλουτισμ|φυγοκεντρ|επανεπεξεργασ|κρίσιμη μάζα|κρισιμη μαζα|σχάσιμο υλικό|οπλικής ποιότητας)/i,
  /(αποκτ|αγορ|κλέψ|κλεψ|προμηθευ)\S*.{0,40}(ουράνι|πλουτώνι|τρίτι|κεφαλ|πυρηνικ)/i,
  // Choosing targets or causing more harm.
  /\b(which|what|best|ideal|optimal)\b.{0,40}\b(city|cities|target|targets|place|places|location|country)\b.{0,50}\b(attack|strike|hit|nuke|bomb|target|destroy|kill)/i,
  /\b(where|how)\b.{0,30}\b(should|would|could|to)\b.{0,20}\b(attack|strike|hit|nuke|bomb)\b/i,
  /\b(maximi[sz]e|most|more)\b.{0,20}\b(casualties|deaths|dead|damage|people killed|killed|harm|destruction)\b/i,
  /(ποι[αοε]ς?|καλύτερ|ιδανικ)\S*.{0,40}(πόλ|πολ|στόχ|στοχ|μέρ|τόπ|χώρ).{0,50}(χτυπ|βομβαρδ|επιτ[εί]θ|καταστρ|σκοτ|πλήξ|πληξ)/i,
  /(πού|που|πώς|πως)\s.{0,30}(να\s)?(χτυπ|βομβαρδ|επιτεθ|πλήξ|ρίξ|ριξ)/i,
  /(περισσότερ|μέγιστ|μεγιστ)\S*.{0,20}(νεκρ|θύματ|θυματ|ζημι|καταστροφ|απώλει)/i,
  // Defeating a missile defence.
  /\b(defeat|evade|bypass|penetrate|fool|spoof|overwhelm|beat|get (past|through))\b.{0,50}\b(missile defen[cs]es?|interceptors?|THAAD|Patriot|Aegis|SM-3|GMD|Iron Dome|Arrow|S-400|S-500|A-235|HQ-9)/i,
  /(ξεγελ|παρακάμ|παρακαμ|διαπερ|εξουδετερ|νικήσ|νικησ)\S*.{0,50}(αντιπυραυλ|αναχαιτ|THAAD|Patriot|Aegis|Iron Dome|S-400|S-500)/i,
];

/** True when a message asks for something outside what the app does. */
export function isOutOfBounds(text: string): boolean {
  return BLOCKED.some((pattern) => pattern.test(text));
}
