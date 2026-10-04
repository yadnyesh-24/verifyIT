/**
 * Single-source i18n dictionary for VerifyIT.
 *
 * Every user-visible string lives here, in both English (default) and Hindi.
 * `next/font` swaps Noto Sans Devanagari onto the <html> when `lang === "hi"`
 * and the same `t(lang, key)` helper used by every component picks the text.
 *
 * To add a string: append the key to both `en` and `hi`. The helper falls back
 * to English when a Hindi translation is missing so the UI never breaks.
 */
import type { Lang } from "./contract";

export type Dict = {
  brand: { productName: string };
  nav: { stepScan: string; stepReview: string; stepResult: string };
  status: { live: string; demo: string };
  hero: {
    headline: string;
    subline: string;
    tip: string;
    takePhoto: string;
    uploadGallery: string;
    dragDrop: string;
    useThisPhoto: string;
    retake: string;
    photoAlt: string;
  };
  how: { title: string; steps: { title: string; body: string }[] };
  scanning: {
    readingLabel: string;
    findingLicences: string;
    checkingRecords: string;
    timeoutTitle: string;
    timeoutBody: string;
    retry: string;
    cancel: string;
    unreadableTitle: string;
    unreadableBody: string;
    fillYourself: string;
  };
  review: {
    title: string;
    productDetails: string;
    partiesTitle: string;
    addParty: string;
    removeParty: string;
    noFieldsTitle: string;
    noFieldsBody: string;
    manualEntry: string;
    verifyNow: string;
    editDetails: string;
    pleaseCheck: string;
    notFound: string;
    unassignedLicencesTitle: string;
    whichCompany: string;
    noParty: string;
    photoZoomHint: string;
    showPhoto: string;
    hidePhoto: string;
    validation: {
      fssaiHint: string;
      fssaiInvalid: string;
      pincodeHint: string;
      pincodeInvalid: string;
    };
    source: { ocr: string; ai: string; both: string };
    unitSuffix: string;
    roleLabel: Record<"manufacturer" | "marketer" | "packer" | "importer", string>;
  };
  results: {
    title: string;
    scoreLabel: string;
    scorePending: string;
    verdictLooksGenuine: string;
    verdictCheckCarefully: string;
    verdictHighRisk: string;
    verdictPending: string;
    basedOn: string;
    checksTitle: string;
    company: string;
    licence: string;
    labelRules: string;
    flagFor: string;
    flagsFor: string;
    flagsGeneral: string;
    scanAnother: string;
    editDetails: string;
    openPortal: string;
    portalHint: string;
    numberCopied: string;
    disclaimer: string;
    badges: {
      confirmed: string;
      needsAttention: string;
      pending: string;
      passLabel: string;
      warnLabel: string;
      failLabel: string;
    };
  };
  common: {
    back: string;
    loading: string;
    error: string;
    tryAgain: string;
    startAgain: string;
    retry: string;
    yes: string;
    no: string;
    or: string;
    saved: string;
  };
  errors: {
    networkTitle: string;
    networkBody: string;
    fallbackToast: string;
  };
  demo: {
    buttonLabel: string;
    menuTitle: string;
    menuHint: string;
    genuine: string;
    multi: string;
    fake: string;
    genuineDesc: string;
    multiDesc: string;
    fakeDesc: string;
  };
};

const dictionaries: Record<Lang, Dict | null> = { en: null as unknown as Dict, hi: null };

const en: Dict = {
  brand: { productName: "VerifyIT" },
  nav: { stepScan: "Scan", stepReview: "Review", stepResult: "Result" },
  status: { live: "Live", demo: "Demo data" },
  hero: {
    headline: "Is this product really from the company on the label?",
    subline:
      "Scan the back of any packet. We check the company, the licence and the label rules against public records.",
    tip: "Back of the pack, flat, good light, licence numbers visible.",
    takePhoto: "Take photo",
    uploadGallery: "Upload from gallery",
    dragDrop: "or drop an image here",
    useThisPhoto: "Use this photo",
    retake: "Retake",
    photoAlt: "Captured label",
  },
  how: {
    title: "How it works",
    steps: [
      {
        title: "Snap the back of the pack",
        body: "Good light, flat surface, the licence block clearly visible.",
      },
      {
        title: "Confirm what we read",
        body: "Fix any names or numbers that look off before we verify.",
      },
      {
        title: "See the verdict",
        body: "A Trust Score, the open checks, and links to the official portals.",
      },
    ],
  },
  scanning: {
    readingLabel: "Reading the label...",
    findingLicences: "Finding licence numbers...",
    checkingRecords: "Checking public records...",
    timeoutTitle: "Taking a little too long",
    timeoutBody:
      "Our reader has been at it for 30 seconds. Check your connection and try again, or fill the details yourself.",
    retry: "Try again",
    cancel: "Cancel",
    unreadableTitle: "We couldn't read this label",
    unreadableBody:
      "Try a clearer photo, or skip the scan and fill the details yourself.",
    fillYourself: "Fill details myself",
  },
  review: {
    title: "Confirm what we read",
    productDetails: "Product details",
    partiesTitle: "Companies on the label",
    addParty: "Add company",
    removeParty: "Remove",
    noFieldsTitle: "Nothing was found",
    noFieldsBody:
      "We couldn't read anything from the photo. Fill the details yourself to continue.",
    manualEntry: "Enter details manually",
    verifyNow: "Verify now",
    editDetails: "Edit details",
    pleaseCheck: "Please check",
    notFound: "Not found",
    unassignedLicencesTitle: "Licences without a company",
    whichCompany: "Which company is this for?",
    noParty: "Pick a company",
    photoZoomHint: "Tap to zoom",
    showPhoto: "Show photo",
    hidePhoto: "Hide photo",
    validation: {
      fssaiHint: "FSSAI is 14 digits",
      fssaiInvalid: "FSSAI must be 14 digits",
      pincodeHint: "6 digits",
      pincodeInvalid: "Pincode must be 6 digits",
    },
    source: { ocr: "OCR", ai: "AI", both: "OCR + AI" },
    unitSuffix: "Unit",
    roleLabel: {
      manufacturer: "Manufactured by",
      marketer: "Marketed by",
      packer: "Packed by",
      importer: "Imported by",
    },
  },
  results: {
    title: "Verification result",
    scoreLabel: "Trust Score",
    scorePending: "Score pending",
    verdictLooksGenuine: "Looks genuine",
    verdictCheckCarefully: "Check carefully",
    verdictHighRisk: "High risk",
    verdictPending: "Verification pending",
    basedOn: "Based on {done} of {total} checks",
    checksTitle: "Checks",
    company: "Company",
    licence: "Licence",
    labelRules: "Label rules",
    flagFor: "Flag for",
    flagsFor: "Flags for",
    flagsGeneral: "General flags",
    scanAnother: "Scan another",
    editDetails: "Edit details",
    openPortal: "Open",
    portalHint: "Copies the number, then opens the official portal.",
    numberCopied: "Number copied. Paste it on the official page.",
    disclaimer:
      "VerifyIT gives guidance from public records. Confirm on the official portal.",
    badges: {
      confirmed: "Confirmed",
      needsAttention: "Needs attention",
      pending: "Verification pending",
      passLabel: "Pass",
      warnLabel: "Caution",
      failLabel: "Fail",
    },
  },
  common: {
    back: "Back",
    loading: "Loading...",
    error: "Something went wrong.",
    tryAgain: "Try again",
    startAgain: "Start again",
    retry: "Retry",
    yes: "Yes",
    no: "No",
    or: "or",
    saved: "Saved",
  },
  errors: {
    networkTitle: "We could not reach VerifyIT",
    networkBody:
      "Check your connection and try again. We've also loaded demo data so you can keep going.",
    fallbackToast: "Backend unreachable - showing demo data.",
  },
  demo: {
    buttonLabel: "Demo",
    menuTitle: "Demo presets",
    menuHint: "Pick a canned label to see the verdict flow.",
    genuine: "Genuine",
    multi: "Multi-party",
    fake: "Fake",
    genuineDesc: "One company, all green",
    multiDesc: "Marketer + 2 units, state mismatch",
    fakeDesc: "Company not found, FSSAI invalid",
  },
};

const hi: Dict = {
  brand: { productName: "वेरिफ़ाई-IT" },
  nav: { stepScan: "स्कैन", stepReview: "समीक्षा", stepResult: "नतीजा" },
  status: { live: "लाइव", demo: "डेमो डेटा" },
  hero: {
    headline: "क्या यह उत्पाद वाक़ई लेबल पर लिखी कंपनी का है?",
    subline:
      "पैकेट का पिछला हिस्सा स्कैन करें। हम कंपनी, लाइसेंस और लेबल के नियमों को सार्वजनिक रिकॉर्ड से मिलाते हैं।",
    tip: "पैकेट का पिछला हिस्सा, सीधा, रोशनी में, लाइसेंस नंबर दिखे हों।",
    takePhoto: "फ़ोटो लें",
    uploadGallery: "गैलरी से अपलोड करें",
    dragDrop: "या यहाँ फ़ोटो खींचकर छोड़ें",
    useThisPhoto: "इस फ़ोटो का उपयोग करें",
    retake: "फिर से लें",
    photoAlt: "ली गई फ़ोटो",
  },
  how: {
    title: "यह कैसे काम करता है",
    steps: [
      { title: "पैकेट का पिछला हिस्सा खींचें", body: "अच्छी रोशनी, सीधी सतह, लाइसेंस साफ़ दिखें।" },
      { title: "जाँचें कि हमने क्या पढ़ा", body: "जाँच से पहले ग़लत लगने वाले नाम या नंबर ठीक करें।" },
      { title: "नतीजा देखें", body: "ट्रस्ट स्कोर, हर जाँच का परिणाम, और सरकारी पोर्टल के लिंक।" },
    ],
  },
  scanning: {
    readingLabel: "लेबल पढ़ा जा रहा है...",
    findingLicences: "लाइसेंस नंबर खोजे जा रहे हैं...",
    checkingRecords: "सरकारी रिकॉर्ड देखे जा रहे हैं...",
    timeoutTitle: "थोड़ा ज़्यादा समय लग रहा है",
    timeoutBody:
      "हमारा रीडर 30 सेकंड से कोशिश कर रहा है। कनेक्शन जाँचें और फिर से कोशिश करें, या ख़ुद भरें।",
    retry: "फिर से कोशिश करें",
    cancel: "रद्द करें",
    unreadableTitle: "यह लेबल पढ़ा नहीं जा सका",
    unreadableBody: "बेहतर फ़ोटो लें, या स्कैन छोड़कर ख़ुद भरें।",
    fillYourself: "ख़ुद भरें",
  },
  review: {
    title: "पढ़ी गई जानकारी जाँचें",
    productDetails: "उत्पाद की जानकारी",
    partiesTitle: "लेबल पर कंपनियाँ",
    addParty: "कंपनी जोड़ें",
    removeParty: "हटाएँ",
    noFieldsTitle: "कुछ नहीं मिला",
    noFieldsBody: "फ़ोटो से कुछ पढ़ा नहीं जा सका। आगे बढ़ने के लिए ख़ुद भरें।",
    manualEntry: "ख़ुद भरें",
    verifyNow: "अभी जाँचें",
    editDetails: "बदलाव करें",
    pleaseCheck: "कृपया जाँचें",
    notFound: "नहीं मिला",
    unassignedLicencesTitle: "बिना कंपनी वाले लाइसेंस",
    whichCompany: "ये किस कंपनी के हैं?",
    noParty: "कंपनी चुनें",
    photoZoomHint: "बड़ा करने के लिए टैप करें",
    showPhoto: "फ़ोटो दिखाएँ",
    hidePhoto: "फ़ोटो छिपाएँ",
    validation: {
      fssaiHint: "FSSAI में 14 अंक होते हैं",
      fssaiInvalid: "FSSAI में 14 अंक होने चाहिए",
      pincodeHint: "6 अंक",
      pincodeInvalid: "पिनकोड 6 अंकों का होना चाहिए",
    },
    source: { ocr: "OCR", ai: "AI", both: "OCR + AI" },
    unitSuffix: "यूनिट",
    roleLabel: {
      manufacturer: "निर्माता",
      marketer: "विपणनकर्ता",
      packer: "पैककर्ता",
      importer: "आयातक",
    },
  },
  results: {
    title: "जाँच का नतीजा",
    scoreLabel: "ट्रस्ट स्कोर",
    scorePending: "स्कोर लंबित",
    verdictLooksGenuine: "असली लगता है",
    verdictCheckCarefully: "ध्यान से जाँचें",
    verdictHighRisk: "जोखिम अधिक है",
    verdictPending: "जाँच लंबित है",
    basedOn: "{total} में से {done} जाँचों के आधार पर",
    checksTitle: "जाँचें",
    company: "कंपनी",
    licence: "लाइसेंस",
    labelRules: "लेबल नियम",
    flagFor: "झंडा:",
    flagsFor: "झंडे:",
    flagsGeneral: "सामान्य झंडे",
    scanAnother: "फिर से स्कैन करें",
    editDetails: "बदलाव करें",
    openPortal: "खोलें",
    portalHint: "नंबर कॉपी करके सरकारी पोर्टल खोलता है।",
    numberCopied: "नंबर कॉपी हो गया। सरकारी पेज पर पेस्ट करें।",
    disclaimer:
      "VerifyIT सार्वजनिक रिकॉर्ड से मार्गदर्शन देता है। सरकारी पोर्टल पर पुष्टि ज़रूर करें।",
    badges: {
      confirmed: "पुष्ट",
      needsAttention: "ध्यान ज़रूरी",
      pending: "जाँच लंबित",
      passLabel: "सही",
      warnLabel: "सावधानी",
      failLabel: "ग़लत",
    },
  },
  common: {
    back: "वापस",
    loading: "लोड हो रहा है...",
    error: "कुछ गड़बड़ हो गई।",
    tryAgain: "फिर से कोशिश करें",
    startAgain: "फिर से शुरू करें",
    retry: "फिर से कोशिश करें",
    yes: "हाँ",
    no: "नहीं",
    or: "या",
    saved: "सहेजा गया",
  },
  errors: {
    networkTitle: "VerifyIT तक नहीं पहुँच पाए",
    networkBody: "कनेक्शन जाँचें और फिर से कोशिश करें। तब तक डेमो डेटा दिखा रहे हैं।",
    fallbackToast: "बैकएंड उपलब्ध नहीं - डेमो डेटा दिखाया जा रहा है।",
  },
  demo: {
    buttonLabel: "डेमो",
    menuTitle: "डेमो उदाहरण",
    menuHint: "नतीजा देखने के लिए एक तैयार लेबल चुनें।",
    genuine: "असली",
    multi: "कई कंपनियाँ",
    fake: "नकली",
    genuineDesc: "एक कंपनी, सब हरा",
    multiDesc: "विपणनकर्ता + 2 यूनिट, राज्य का अंतर",
    fakeDesc: "कंपनी नहीं मिली, FSSAI ग़लत",
  },
};

dictionaries.en = en;
dictionaries.hi = hi;

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Translate a key like `"hero.headline"`, with `{done}`-style interpolation.
 * Falls back to English, then the key itself, so a missing Hindi translation
 * never breaks the UI.
 */
export function t(
  lang: Lang,
  key: string,
  vars: Record<string, string | number> = {},
): string {
  const dict = dictionaries[lang];
  let raw: unknown = dict ? get(dict, key) : undefined;
  if (typeof raw !== "string") raw = get(dictionaries.en, key);
  if (typeof raw !== "string") raw = key;
  let out = String(raw);
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

/** Translate a role label. */
export function tRole(
  lang: Lang,
  role: "manufacturer" | "marketer" | "packer" | "importer",
): string {
  return t(lang, `review.roleLabel.${role}`);
}