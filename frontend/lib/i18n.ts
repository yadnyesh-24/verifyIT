/**
 * English / Hindi copy for the whole interface.
 *
 * Every visible string lives here. The Hindi is written as Hindi, not as a
 * word-for-word transliteration of the English, because this screen is asking
 * someone to trust a verdict about something they are about to eat - stilted
 * machine Hindi undermines that more than a slightly longer sentence does.
 *
 * Flag text is the exception: it arrives from the API already in both
 * languages (`flag.en` / `flag.hi`) and is rendered straight through.
 */
import type { Lang, PartyRole } from "./types";

const en = {
  "app.name": "VerifyIT",
  "app.tagline": "Check an Indian packaged product against official records.",
  "app.scanLabel": "Scan a label",
  "app.uploadPhoto": "Upload photo",
  "app.retake": "Retake",
  "app.live": "Live",
  "app.demo": "Demo",
  "app.demoData": "Demo data",
  "app.langToggle": "Change language",

  "home.eyebrow": "For Indian packaged products",
  "home.headlineLead": "Is this product really from the",
  "home.headlineAccent": "company on the label",
  "home.headlineTail": "?",
  "home.subline":
    "Photograph the back of the pack. We read the licence numbers and check them against official Indian registers, then show you exactly what we could and could not confirm.",
  "home.trustCompany": "Checks MCA company records",
  "home.trustFormats": "FSSAI · GSTIN · BIS formats",
  "home.trustLangs": "Hindi & English",
  "home.dragHint": "or drag a photo anywhere on this page",
  "home.dropNow": "Drop the photo to start",
  "home.mockupVerdict": "Looks genuine",
  "home.mockupCompany": "Company found in MCA",
  "home.mockupLicence": "FSSAI format valid",
  "home.mockupLabel": "Label rules checked",
  "home.howItWorksTitle": "How it works",
  "home.step1Title": "Snap the label",
  "home.step1Body":
    "Hold the packet flat and photograph the back, where the licence numbers and the maker's address are printed.",
  "home.step2Title": "Confirm what we read",
  "home.step2Body":
    "We highlight anything we are unsure about. Fix it, add a missing detail, and tell us who made the product.",
  "home.step3Title": "See what checks out",
  "home.step3Body":
    "Get a trust score, a result for each check, and one-tap links to verify the numbers yourself on the official portals.",

  "preview.title": "Check the photo before we read it",
  "preview.tipFlat": "The pack is flat and fills most of the frame",
  "preview.tipSharp": "The small print is sharp, not blurred",
  "preview.tipLicence": "The FSSAI or BIS number is visible",
  "preview.tipGlare": "No glare or shadow across the text",
  "preview.readLabel": "Read label",

  "scanning.title": "Reading the label",
  "scanning.compressing": "Preparing the photo…",
  "scanning.reading": "Reading the label…",
  "scanning.records": "Checking official records…",
  "scanning.almost": "Almost there…",
  "scanning.retry": "Try again",
  "scanning.networkError": "We could not reach the server. Check your connection and try again.",
  "scanning.timeout": "That took too long. The server may be busy.",
  "scanning.unreadableTitle": "We couldn't read it",
  "scanning.unreadableBody":
    "No problem - fill in the details yourself and we will still run the checks.",
  "scanning.enterManually": "Fill in the details",

  "review.title": "Confirm the details",
  "review.subtitle":
    "We only check what you confirm here. Correct anything that is wrong, and leave blank what the pack does not print.",
  "review.productDetails": "Product details",
  "review.partiesTitle": "Who is behind this product",
  "review.addParty": "Add a company",
  "review.removeParty": "Remove this company",
  "review.changeRole": "Role",
  "review.unitSuffix": "Unit",
  "review.unassignedLicences": "Licences we could not place",
  "review.attachToParty": "Belongs to",
  "review.notFound": "Not found",
  "review.pleaseCheck": "Please check",
  "review.editValue": "Edit",
  "review.save": "Save",
  "review.verify": "Verify now",
  "review.noFields": "We have nothing to check yet. Add the details from the pack to continue.",
  "review.manualEntry": "Enter details manually",
  "review.showPhoto": "Show the photo",
  "review.hidePhoto": "Hide the photo",
  "review.sourceOcr": "OCR",
  "review.sourceLlm": "AI",
  "review.sourceBoth": "Both",
  "review.hintFssai": "An FSSAI number is 14 digits.",
  "review.hintPincode": "A pincode is 6 digits.",
  "review.hintGstin": "A GSTIN is 15 characters.",

  "results.title": "What we found",
  "results.company": "Company",
  "results.licence": "Licence",
  "results.labelRules": "Label rules",
  "results.scorePending": "Score pending",
  "results.trustScore": "Trust score",
  "results.basedOn": "Based on {ran} of 3 checks",
  "results.verdictLow": "Low risk in the checks we ran",
  "results.verdictMedium": "Check this carefully",
  "results.verdictHigh": "High risk found",
  "results.verdictPending":
    "Nothing could be checked yet, so there is no score - this is not a pass and not a failure.",
  "results.statusPass": "Confirmed",
  "results.statusWarn": "Needs attention",
  "results.statusPending": "Verification pending",
  "results.noFlags": "Nothing to report.",
  "results.flagsFor": "Flagged for",
  "results.general": "General",
  "results.officialTitle": "Verify yourself on official portals",
  "results.officialBody":
    "We copy the number for you. Paste it on the official page and solve their captcha - we never pre-fill anything.",
  "results.openPortal": "Copy & open",
  "results.numberCopied": "Number copied. Paste it on the official page.",
  "results.scanAnother": "Scan another",
  "results.editDetails": "Edit details",
  "results.disclaimer":
    "This score covers only the checks that ran. It is not proof that the product is authentic, legal or safe. Always confirm on the official portal before acting on it.",

  "common.loading": "Working…",
  "common.somethingWrong": "Something went wrong",
  "common.tryAgain": "Try again",
} as const;

export type TranslationKey = keyof typeof en;

const hi: Record<TranslationKey, string> = {
  "app.name": "VerifyIT",
  "app.tagline": "भारतीय पैकेज्ड उत्पाद को सरकारी रिकॉर्ड से जाँचें।",
  "app.scanLabel": "लेबल स्कैन करें",
  "app.uploadPhoto": "फ़ोटो अपलोड करें",
  "app.retake": "दोबारा लें",
  "app.live": "लाइव",
  "app.demo": "डेमो",
  "app.demoData": "डेमो डेटा",
  "app.langToggle": "भाषा बदलें",

  "home.eyebrow": "भारतीय पैकेज्ड उत्पादों के लिए",
  "home.headlineLead": "क्या यह उत्पाद सचमुच",
  "home.headlineAccent": "लेबल पर छपी कंपनी",
  "home.headlineTail": " का है?",
  "home.subline":
    "पैकेट के पिछले हिस्से की फ़ोटो लें। हम लाइसेंस नंबर पढ़कर उन्हें सरकारी रजिस्टर से मिलाते हैं, और साफ़-साफ़ बताते हैं कि क्या पुष्टि हो पाई और क्या नहीं।",
  "home.trustCompany": "MCA कंपनी रिकॉर्ड जाँचता है",
  "home.trustFormats": "FSSAI · GSTIN · BIS फ़ॉर्मैट",
  "home.trustLangs": "हिंदी और अंग्रेज़ी",
  "home.dragHint": "या फ़ोटो को इस पेज पर कहीं भी खींचकर छोड़ें",
  "home.dropNow": "शुरू करने के लिए फ़ोटो छोड़ें",
  "home.mockupVerdict": "असली लगता है",
  "home.mockupCompany": "कंपनी MCA में मिली",
  "home.mockupLicence": "FSSAI फ़ॉर्मैट सही",
  "home.mockupLabel": "लेबल नियम जाँचे गए",
  "home.howItWorksTitle": "यह कैसे काम करता है",
  "home.step1Title": "लेबल की फ़ोटो लें",
  "home.step1Body":
    "पैकेट को सीधा पकड़ें और पिछला हिस्सा लें, जहाँ लाइसेंस नंबर और निर्माता का पता छपा होता है।",
  "home.step2Title": "पढ़ी गई जानकारी की पुष्टि करें",
  "home.step2Body":
    "जिस जानकारी पर हमें संदेह है, उसे हम अलग दिखाते हैं। उसे सुधारें, छूटी बात जोड़ें, और बताएँ कि उत्पाद किसने बनाया।",
  "home.step3Title": "देखें क्या पुष्टि हुई",
  "home.step3Body":
    "ट्रस्ट स्कोर, हर जाँच का नतीजा, और सरकारी पोर्टल पर खुद जाँचने के लिए सीधे लिंक पाएँ।",

  "preview.title": "पढ़ने से पहले फ़ोटो जाँच लें",
  "preview.tipFlat": "पैकेट सीधा है और फ़्रेम में पूरा आ रहा है",
  "preview.tipSharp": "छोटे अक्षर साफ़ हैं, धुंधले नहीं",
  "preview.tipLicence": "FSSAI या BIS नंबर दिख रहा है",
  "preview.tipGlare": "अक्षरों पर चमक या परछाईं नहीं है",
  "preview.readLabel": "लेबल पढ़ें",

  "scanning.title": "लेबल पढ़ा जा रहा है",
  "scanning.compressing": "फ़ोटो तैयार की जा रही है…",
  "scanning.reading": "लेबल पढ़ा जा रहा है…",
  "scanning.records": "सरकारी रिकॉर्ड जाँचे जा रहे हैं…",
  "scanning.almost": "बस थोड़ा और…",
  "scanning.retry": "दोबारा कोशिश करें",
  "scanning.networkError": "सर्वर से संपर्क नहीं हो सका। कनेक्शन जाँचकर दोबारा कोशिश करें।",
  "scanning.timeout": "इसमें बहुत समय लग गया। सर्वर व्यस्त हो सकता है।",
  "scanning.unreadableTitle": "हम इसे पढ़ नहीं पाए",
  "scanning.unreadableBody":
    "कोई बात नहीं - जानकारी खुद भर दें, हम फिर भी सारी जाँच करेंगे।",
  "scanning.enterManually": "जानकारी भरें",

  "review.title": "जानकारी की पुष्टि करें",
  "review.subtitle":
    "हम वही जाँचते हैं जिसकी आप यहाँ पुष्टि करते हैं। जो ग़लत हो उसे सुधारें, और जो पैकेट पर छपा ही नहीं है उसे खाली छोड़ दें।",
  "review.productDetails": "उत्पाद की जानकारी",
  "review.partiesTitle": "इस उत्पाद के पीछे कौन है",
  "review.addParty": "कंपनी जोड़ें",
  "review.removeParty": "इस कंपनी को हटाएँ",
  "review.changeRole": "भूमिका",
  "review.unitSuffix": "यूनिट",
  "review.unassignedLicences": "जिन लाइसेंसों की कंपनी तय नहीं हुई",
  "review.attachToParty": "किसका है",
  "review.notFound": "नहीं मिला",
  "review.pleaseCheck": "जाँच लें",
  "review.editValue": "बदलें",
  "review.save": "सहेजें",
  "review.verify": "अभी जाँचें",
  "review.noFields": "जाँचने के लिए अभी कुछ नहीं है। आगे बढ़ने के लिए पैकेट की जानकारी जोड़ें।",
  "review.manualEntry": "जानकारी खुद भरें",
  "review.showPhoto": "फ़ोटो दिखाएँ",
  "review.hidePhoto": "फ़ोटो छिपाएँ",
  "review.sourceOcr": "OCR",
  "review.sourceLlm": "AI",
  "review.sourceBoth": "दोनों",
  "review.hintFssai": "FSSAI नंबर 14 अंकों का होता है।",
  "review.hintPincode": "पिनकोड 6 अंकों का होता है।",
  "review.hintGstin": "GSTIN 15 अक्षरों का होता है।",

  "results.title": "हमें क्या मिला",
  "results.company": "कंपनी",
  "results.licence": "लाइसेंस",
  "results.labelRules": "लेबल नियम",
  "results.scorePending": "स्कोर लंबित",
  "results.trustScore": "ट्रस्ट स्कोर",
  "results.basedOn": "3 में से {ran} जाँचों पर आधारित",
  "results.verdictLow": "जो जाँचें हुईं उनमें ख़तरा कम",
  "results.verdictMedium": "इसे ध्यान से जाँचें",
  "results.verdictHigh": "गंभीर ख़तरा मिला",
  "results.verdictPending":
    "अभी कोई जाँच पूरी नहीं हो सकी, इसलिए कोई स्कोर नहीं है - यह न पास है, न फ़ेल।",
  "results.statusPass": "पुष्टि हुई",
  "results.statusWarn": "ध्यान देने की ज़रूरत",
  "results.statusPending": "जाँच लंबित",
  "results.noFlags": "कुछ आपत्तिजनक नहीं मिला।",
  "results.flagsFor": "किसके लिए चिह्नित",
  "results.general": "सामान्य",
  "results.officialTitle": "सरकारी पोर्टल पर खुद जाँचें",
  "results.officialBody":
    "हम नंबर कॉपी कर देते हैं। उसे सरकारी पेज पर पेस्ट करें और उनका कैप्चा भरें - हम कुछ भी पहले से नहीं भरते।",
  "results.openPortal": "कॉपी करके खोलें",
  "results.numberCopied": "नंबर कॉपी हो गया। इसे सरकारी पेज पर पेस्ट करें।",
  "results.scanAnother": "दूसरा स्कैन करें",
  "results.editDetails": "जानकारी बदलें",
  "results.disclaimer":
    "यह स्कोर केवल उन्हीं जाँचों पर आधारित है जो पूरी हो सकीं। यह इस बात का प्रमाण नहीं है कि उत्पाद असली, वैध या सुरक्षित है। कोई भी निर्णय लेने से पहले सरकारी पोर्टल पर पुष्टि ज़रूर करें।",

  "common.loading": "काम चल रहा है…",
  "common.somethingWrong": "कुछ गड़बड़ हो गई",
  "common.tryAgain": "दोबारा कोशिश करें",
};

const DICTIONARIES: Record<Lang, Record<TranslationKey, string>> = { en, hi };

/**
 * Look a string up.
 *
 * `vars` fills `{name}` placeholders - only `results.basedOn` uses one today,
 * but interpolating here keeps sentence structure inside the dictionary, where
 * Hindi can put the number in a different position from English.
 */
export function t(
  lang: Lang,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const value = DICTIONARIES[lang]?.[key] ?? en[key] ?? key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

const ROLE_LABELS: Record<PartyRole, Record<Lang, string>> = {
  manufacturer: { en: "Manufacturer", hi: "निर्माता" },
  marketer: { en: "Marketed by", hi: "विपणनकर्ता" },
  packer: { en: "Packed by", hi: "पैक करने वाला" },
  importer: { en: "Imported by", hi: "आयातकर्ता" },
};

export function tRole(lang: Lang, role: PartyRole): string {
  return ROLE_LABELS[role]?.[lang] ?? role;
}

/** The `lang` attribute to put on `<html>`, so the Devanagari font applies. */
export function htmlLang(lang: Lang): string {
  return lang === "hi" ? "hi" : "en";
}
