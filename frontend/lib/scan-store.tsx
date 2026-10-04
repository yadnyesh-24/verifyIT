/**
 * The one piece of shared client state: the photo, the draft being reviewed,
 * the result, and the chosen language.
 *
 * It is deliberately in memory rather than in a URL or in storage. The photo is
 * a `File` and the draft holds half-confirmed readings - resuming either of
 * those after a refresh would show someone a verdict assembled from details
 * they never actually confirmed. A refresh therefore starts over, and the
 * screens handle "nothing here" as a normal state.
 *
 * The language is the exception: it is a preference, not evidence, so it does
 * persist.
 */
"use client";

import * as React from "react";
import {
  draftFromScan,
  emptyDraft,
  makeBlankParty,
  resolveLive,
} from "./api";
import type {
  LabelDraft,
  Lang,
  Party,
  PartyFieldKey,
  PartyRole,
  ProductFieldKey,
  ScanResponse,
  VerifyResponse,
} from "./types";
import { userField } from "./types";

const LANG_KEY = "verifyit:lang";

interface ScanContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;

  /** `null` until the health probe answers; then true for live, false for fixtures. */
  live: boolean | null;

  photo: File | null;
  photoUrl: string | null;
  setPhoto: (file: File | null) => void;

  draft: LabelDraft | null;
  setDraftFromScan: (scan: ScanResponse) => void;
  startEmptyDraft: () => void;

  results: VerifyResponse | null;
  setResults: (results: VerifyResponse | null) => void;

  setProductField: (key: ProductFieldKey, value: string | null) => void;
  setPartyField: (id: string, key: PartyFieldKey, value: string | null) => void;
  setPartyRole: (id: string, role: PartyRole) => void;
  addParty: (role?: PartyRole) => void;
  removeParty: (id: string) => void;
  attachLicence: (licenceIndex: number, partyId: string) => void;

  reset: () => void;
}

const ScanContext = React.createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>("en");
  const [live, setLive] = React.useState<boolean | null>(null);
  const [photo, setPhotoState] = React.useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<LabelDraft | null>(null);
  const [results, setResults] = React.useState<VerifyResponse | null>(null);

  // Restore the saved language after mount, never during render: reading
  // localStorage on the server would not match the first client paint.
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANG_KEY);
      if (saved === "hi" || saved === "en") setLangState(saved);
    } catch {
      /* storage blocked - English is a fine default */
    }
  }, []);

  // Keep `<html lang>` in step with the choice. This is what switches the font
  // stack to Devanagari (via the `:lang(hi)` rule) and what tells a screen
  // reader to change voice, so it has to be a real attribute, not a class.
  React.useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  React.useEffect(() => {
    let cancelled = false;
    resolveLive().then((value) => {
      if (!cancelled) setLive(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLang = React.useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      /* storage blocked - the choice still applies for this session */
    }
  }, []);

  // Object URLs are revoked as soon as they are replaced, so a long session of
  // retakes does not pin every photo taken in it to memory.
  const setPhoto = React.useCallback((file: File | null) => {
    setPhotoState(file);
    setPhotoUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : null;
    });
  }, []);

  const setDraftFromScan = React.useCallback((scan: ScanResponse) => {
    const next = draftFromScan(scan);
    // The review screen needs somewhere to type even when nothing was read.
    if (next.parties.length === 0) next.parties = [makeBlankParty("manufacturer")];
    setDraft(next);
  }, []);

  const startEmptyDraft = React.useCallback(() => {
    const next = emptyDraft();
    next.parties = [makeBlankParty("manufacturer")];
    setDraft(next);
  }, []);

  const updateParty = React.useCallback(
    (id: string, change: (party: Party) => Party) => {
      setDraft((current) =>
        current
          ? {
              ...current,
              parties: current.parties.map((p) => (p.id === id ? change(p) : p)),
            }
          : current,
      );
    },
    [],
  );

  const setProductField = React.useCallback(
    (key: ProductFieldKey, value: string | null) => {
      setDraft((current) =>
        current
          ? { ...current, product: { ...current.product, [key]: userField(value) } }
          : current,
      );
    },
    [],
  );

  const setPartyField = React.useCallback(
    (id: string, key: PartyFieldKey, value: string | null) => {
      updateParty(id, (party) => ({ ...party, [key]: userField(value) }));
    },
    [updateParty],
  );

  const setPartyRole = React.useCallback(
    (id: string, role: PartyRole) => {
      updateParty(id, (party) => ({ ...party, role }));
    },
    [updateParty],
  );

  const addParty = React.useCallback((role: PartyRole = "manufacturer") => {
    setDraft((current) =>
      current ? { ...current, parties: [...current.parties, makeBlankParty(role)] } : current,
    );
  }, []);

  const removeParty = React.useCallback((id: string) => {
    setDraft((current) =>
      current
        ? { ...current, parties: current.parties.filter((p) => p.id !== id) }
        : current,
    );
  }, []);

  /**
   * Move an unplaced licence onto a party.
   *
   * The licence leaves the unplaced list either way, so the user is never asked
   * about it twice - but it only overwrites a blank slot, because a number they
   * already confirmed on that party outranks one we could not place.
   */
  const attachLicence = React.useCallback((licenceIndex: number, partyId: string) => {
    setDraft((current) => {
      if (!current) return current;
      const licence = current.unassigned_licences[licenceIndex];
      if (!licence) return current;
      return {
        ...current,
        parties: current.parties.map((party) =>
          party.id === partyId && !party.fssai.value
            ? { ...party, fssai: licence.field }
            : party,
        ),
        unassigned_licences: current.unassigned_licences.filter(
          (_, i) => i !== licenceIndex,
        ),
      };
    });
  }, []);

  const reset = React.useCallback(() => {
    setPhoto(null);
    setDraft(null);
    setResults(null);
  }, [setPhoto]);

  const value = React.useMemo<ScanContextValue>(
    () => ({
      lang,
      setLang,
      live,
      photo,
      photoUrl,
      setPhoto,
      draft,
      setDraftFromScan,
      startEmptyDraft,
      results,
      setResults,
      setProductField,
      setPartyField,
      setPartyRole,
      addParty,
      removeParty,
      attachLicence,
      reset,
    }),
    [
      lang,
      setLang,
      live,
      photo,
      photoUrl,
      setPhoto,
      draft,
      setDraftFromScan,
      startEmptyDraft,
      results,
      setProductField,
      setPartyField,
      setPartyRole,
      addParty,
      removeParty,
      attachLicence,
      reset,
    ],
  );

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan(): ScanContextValue {
  const ctx = React.useContext(ScanContext);
  if (!ctx) throw new Error("useScan must be used inside <ScanProvider>");
  return ctx;
}

export { makeBlankParty };
