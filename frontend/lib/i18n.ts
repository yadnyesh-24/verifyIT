/**
 * The single English + Hindi dictionary.
 *
 * Every user-visible string lives here. `t(lang, key)` falls back to English when
 * a Hindi string is missing, and supports `{name}` placeholders through the
 * optional third argument.
 *
 * Reconstructed from the keys the app uses (the original module was not
 * committed).
 */

import type { Lang, PartyRole } from "./types";

type Dict = Record<string, { en: string; hi: string }>;

export const dictionary: Dict = {
  "app.productName": { en: "VerifyIT", hi: "VerifyIT" },
  "app.tagline": {
    en: "Scan a packet. Know if it is real.",
    hi: "पैकेट स्कैन करें। पता करें कि यह असली है या नहीं।",
  },
  "app.scanLabel": { en: "Scan label", hi: "लेबल स्कैन करें" },
  "app.uploadPhoto": { en: "Upload photo", hi: "फ़ोटो अपलोड करें" },
  "app.retake": { en: "Retake", hi: "दोबारा लें" },
  "app.howItWorksTitle": { en: "How it works", hi: "यह कैसे काम करता है" },

  "common.languageToggle": { en: "हिंदी", hi: "English" },
  "common.loading": { en: "Loading…", hi: "लोड हो रहा है…" },

  "scanning.compressing": {
    en: "Preparing the photo…",
    hi: "फ़ोटो तैयार की जा रही है…",
  },
  "scanning.readingLabel": {
    en: "Reading the label…",
    hi: "लेबल पढ़ा जा रहा है…",
  },
  "scanning.checkingRecords": {
    en: "Checking public records…",
    hi: "सार्वजनिक रिकॉर्ड जाँचे जा रहे हैं…",
  },
  "scanning.unreadableError": {
    en: "We could not read this photo. Try again in better light.",
    hi: "यह फ़ोटो पढ़ी नहीं जा सकी। अच्छी रोशनी में दोबारा कोशिश करें।",
  },
  "scanning.networkError": {
    en: "Could not reach the server. Check your connection and retry.",
    hi: "सर्वर से संपर्क नहीं हो सका। कनेक्शन जाँचें और दोबारा कोशिश करें।",
  },
  "scanning.retry": { en: "Retry", hi: "दोबारा कोशिश करें" },

  "review.title": { en: "Check what we read", hi: "जो पढ़ा गया है उसे जाँचें" },
  "review.noFields": {
    en: "Nothing has been scanned yet.",
    hi: "अभी कुछ भी स्कैन नहीं हुआ।",
  },
  "review.manualEntry": {
    en: "Enter details manually",
    hi: "जानकारी खुद भरें",
  },
  "review.productDetails": { en: "Product details", hi: "उत्पाद विवरण" },
  "review.partiesTitle": { en: "Parties on the label", hi: "लेबल पर दिए पक्ष" },
  "review.addParty": { en: "Add party", hi: "पक्ष जोड़ें" },
  "review.attachToParty": { en: "Attach to party", hi: "पक्ष से जोड़ें" },
  "review.changeRolePrompt": { en: "Role", hi: "भूमिका" },
  "review.editValue": { en: "Edit", hi: "बदलें" },
  "review.notFound": { en: "Not found", hi: "नहीं मिला" },
  "review.pleaseCheck": { en: "Please check", hi: "जाँच लें" },
  "review.removeParty": { en: "Remove party", hi: "पक्ष हटाएँ" },
  "review.unassignedLicences": {
    en: "Licences we could not assign",
    hi: "ऐसे लाइसेंस जो किसी पक्ष से नहीं जुड़े",
  },
  "review.unitSuffix": { en: "Unit", hi: "यूनिट" },
  "review.verify": { en: "Verify", hi: "जाँचें" },

  "results.title": { en: "Result", hi: "परिणाम" },
  "results.company": { en: "Company", hi: "कंपनी" },
  "results.licence": { en: "Licence", hi: "लाइसेंस" },
  "results.labelRules": { en: "Label rules", hi: "लेबल नियम" },
  "results.flagsFor": { en: "Issues for", hi: "समस्याएँ" },
  "results.numberCopied": {
    en: "Number copied — paste it on the portal",
    hi: "नंबर कॉपी हो गया — इसे पोर्टल पर पेस्ट करें",
  },
  "results.openPortal": { en: "Open portal", hi: "पोर्टल खोलें" },
  "results.scanAnother": { en: "Scan another", hi: "दूसरा स्कैन करें" },
  "results.scoreLabel": { en: "Trust Score", hi: "ट्रस्ट स्कोर" },
  "results.verdictPending": {
    en: "Verification pending",
    hi: "जाँच लंबित",
  },
  // The verdict labels are keyed off the backend's `verdict`, not off the score.
  // "Low risk in completed checks" is deliberately qualified: a clean result only
  // covers the checks that could actually run.
  "results.verdictLow": {
    en: "Low risk in completed checks",
    hi: "पूरी हुई जाँचों में कम जोखिम",
  },
  "results.verdictMedium": {
    en: "Check carefully",
    hi: "ध्यान से जाँचें",
  },
  "results.verdictHigh": { en: "High risk found", hi: "उच्च जोखिम मिला" },
  "results.basedOnChecks": {
    en: "Based on {n} of 3 checks",
    hi: "3 में से {n} जाँच के आधार पर",
  },
  "results.incompleteChecks": {
    en: "Not every check could run yet — the cards below show which.",
    hi: "अभी सभी जाँचें नहीं हो सकीं — नीचे के कार्ड बताते हैं कौन-सी।",
  },
  "results.disclaimer": {
    en: "VerifyIT compares the label with public records only. The score covers the checks that could be run — it is not proof that the product is authentic or safe.",
    hi: "VerifyIT केवल लेबल की सार्वजनिक रिकॉर्ड से तुलना करता है। स्कोर उन्हीं जाँचों का सार है जो हो सकीं — यह उत्पाद के असली या सुरक्षित होने का प्रमाण नहीं है।",
  },
};

const ROLE_LABELS: Record<PartyRole, { en: string; hi: string }> = {
  manufacturer: { en: "Manufacturer", hi: "निर्माता" },
  marketer: { en: "Marketer", hi: "विपणक" },
  packer: { en: "Packer", hi: "पैकर" },
  importer: { en: "Importer", hi: "आयातक" },
};

/** Look up a string, substituting `{name}` placeholders. English is the fallback. */
export function t(
  lang: Lang,
  key: string,
  params?: Record<string, string | number>,
): string {
  const entry = dictionary[key];
  let text = entry ? entry[lang] || entry.en : key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/** Look up a party role's label. */
export function tRole(lang: Lang, role: PartyRole): string {
  const entry = ROLE_LABELS[role];
  if (!entry) return role;
  return entry[lang] || entry.en;
}
