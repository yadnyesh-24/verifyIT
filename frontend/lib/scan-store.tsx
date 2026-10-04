/**
 * Scan session store.
 *
 * One React context carries everything the flow needs across routes: the chosen
 * language, the scan response, the editable party list, and the verify result.
 * Next's App Router keeps no state between pages, so this is what survives the
 * `/` -> `/scanning` -> `/review` -> `/results` journey.
 *
 * Language is the only thing persisted (localStorage); everything else stays in
 * memory, so a reload starts a clean session instead of resurfacing a stale
 * verdict.
 */

"use client";

import * as React from "react";
import type {
  Lang,
  Party,
  PartyRole,
  ScanField,
  ScanResponse,
  VerifyResponse,
} from "./types";

/** A party's editable fields (everything except its identity and role). */
export type PartyField = keyof Omit<Party, "id" | "role">;

const LANG_STORAGE_KEY = "verifyit:lang";

let partySeq = 0;

/** A fresh, empty party for `role`. */
export function makeBlankParty(role: PartyRole): Party {
  partySeq += 1;
  const empty = (): ScanField => ({
    value: null,
    confidence: null,
    uncertain: false,
    source: null,
  });
  return {
    id: `${role}-${Date.now().toString(36)}-${partySeq}`,
    role,
    unit_code: empty(),
    name: empty(),
    address: empty(),
    pincode: empty(),
    fssai: empty(),
    cin: empty(),
    gstin: empty(),
  };
}

/** Make a user-edited field: full confidence, never flagged as uncertain. */
function edited(value: string | null): ScanField {
  return { value, confidence: 1, uncertain: false, source: "user" };
}

export interface ScanContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  scan: ScanResponse | null;
  /** Replace the scan. Pass the party list to keep it in sync with edits. */
  setScan: (scan: ScanResponse, parties?: Party[]) => void;
  parties: Party[];
  setPartyRole: (id: string, role: PartyRole) => void;
  setFieldOnParty: (id: string, field: PartyField, value: string | null) => void;
  removeParty: (id: string) => void;
  addParty: (party: Party) => void;
  /** Move `unassigned_licences[index]` onto a party's FSSAI field. */
  attachLicence: (index: number, partyId: string) => void;
  results: VerifyResponse | null;
  setResults: (results: VerifyResponse) => void;
  reset: () => void;
}

const ScanContext = React.createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>("en");
  const [scan, setScanState] = React.useState<ScanResponse | null>(null);
  const [parties, setParties] = React.useState<Party[]>([]);
  const [results, setResults] = React.useState<VerifyResponse | null>(null);

  // Read the stored language after mount: reading it during render would make the
  // server and client markup disagree.
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
      if (stored === "en" || stored === "hi") setLangState(stored);
    } catch {
      /* localStorage unavailable - stay on English */
    }
  }, []);

  const setLang = React.useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const setScan = React.useCallback(
    (next: ScanResponse, nextParties?: Party[]) => {
      setScanState(next);
      setParties(nextParties ?? next.fields.parties ?? []);
    },
    [],
  );

  const setPartyRole = React.useCallback((id: string, role: PartyRole) => {
    setParties((current) => current.map((p) => (p.id === id ? { ...p, role } : p)));
  }, []);

  const setFieldOnParty = React.useCallback(
    (id: string, field: PartyField, value: string | null) => {
      setParties((current) =>
        current.map((p) => (p.id === id ? { ...p, [field]: edited(value) } : p)),
      );
    },
    [],
  );

  const removeParty = React.useCallback((id: string) => {
    setParties((current) => current.filter((p) => p.id !== id));
  }, []);

  const addParty = React.useCallback((party: Party) => {
    setParties((current) => [...current, party]);
  }, []);

  const attachLicence = React.useCallback(
    (index: number, partyId: string) => {
      if (!scan) return;
      const licence = scan.fields.unassigned_licences[index];
      if (!licence) return;
      setScanState({
        ...scan,
        fields: {
          ...scan.fields,
          unassigned_licences: scan.fields.unassigned_licences.filter(
            (_, i) => i !== index,
          ),
        },
      });
      setParties((current) =>
        current.map((p) =>
          p.id === partyId
            ? { ...p, fssai: { ...licence, source: "user" as const } }
            : p,
        ),
      );
    },
    [scan],
  );

  const reset = React.useCallback(() => {
    setScanState(null);
    setParties([]);
    setResults(null);
    try {
      delete (window as unknown as { __pendingFile?: File }).__pendingFile;
    } catch {
      /* ignore */
    }
  }, []);

  const value = React.useMemo<ScanContextValue>(
    () => ({
      lang,
      setLang,
      scan,
      setScan,
      parties,
      setPartyRole,
      setFieldOnParty,
      removeParty,
      addParty,
      attachLicence,
      results,
      setResults,
      reset,
    }),
    [
      lang,
      setLang,
      scan,
      setScan,
      parties,
      setPartyRole,
      setFieldOnParty,
      removeParty,
      addParty,
      attachLicence,
      results,
      reset,
    ],
  );

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan(): ScanContextValue {
  const value = React.useContext(ScanContext);
  if (!value) {
    throw new Error("useScan must be used inside a <ScanProvider>");
  }
  return value;
}