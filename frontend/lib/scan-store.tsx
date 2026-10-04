/**
 * Shared scan state, lifted into React context with `localStorage` persistence
 * so back navigation between Home / Review / Results does not lose data.
 *
 * The store also exposes a `getApi()` helper that returns the same setters
 * without React - useful for callbacks that need to mutate state outside the
 * render tree (e.g. `DemoMenu`).
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Lang,
  Party,
  PartyRole,
  ProductFieldKey,
  ScanField,
  ScanResponse,
  VerifyResponse,
} from "./contract";
import { emptyField as makeEmptyField } from "./contract";

interface StoredSnapshot {
  scan: ScanResponse | null;
  parties: Party[];
  results: VerifyResponse | null;
  photoDataUrl: string | null;
}

interface StoreApi extends StoredSnapshot {
  lang: Lang;
  setLang: (lang: Lang) => void;
  setScan: (scan: ScanResponse, parties?: Party[], photoDataUrl?: string | null) => void;
  updateParty: (id: string, patch: Partial<Party>) => void;
  setPartyRole: (id: string, role: PartyRole) => void;
  addParty: (party: Party) => void;
  removeParty: (id: string) => void;
  setProductField: (key: ProductFieldKey, value: string | null) => void;
  setPartyField: (
    id: string,
    field: "unit_code" | "name" | "address" | "pincode" | "fssai" | "cin" | "gstin",
    value: string | null,
  ) => void;
  attachLicence: (licenceIndex: number, partyId: string) => void;
  setResults: (results: VerifyResponse) => void;
  reset: () => void;
  setPhoto: (photoDataUrl: string | null) => void;
}

const ScanContext = createContext<StoreApi | null>(null);

const STORAGE_KEY = "verifyit:v2";
const LANG_KEY = "verifyit:lang";

function readStored(): {
  snapshot: StoredSnapshot;
  lang: Lang;
} {
  const fallback: StoredSnapshot = {
    scan: null,
    parties: [],
    results: null,
    photoDataUrl: null,
  };
  if (typeof window === "undefined") return { snapshot: fallback, lang: "en" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const lang = (window.localStorage.getItem(LANG_KEY) as Lang) || "en";
    if (!raw) return { snapshot: fallback, lang };
    const parsed = JSON.parse(raw) as Partial<StoredSnapshot> & { lang?: Lang };
    return {
      snapshot: {
        scan: parsed.scan ?? null,
        parties: parsed.parties ?? [],
        results: parsed.results ?? null,
        photoDataUrl: parsed.photoDataUrl ?? null,
      },
      lang: (parsed.lang as Lang) || lang,
    };
  } catch {
    return { snapshot: fallback, lang: "en" };
  }
}

function writeStored(snapshot: StoredSnapshot, lang: Lang): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...snapshot, lang }),
    );
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* quota / private mode */
  }
}

/** Create a blank editable party the demo can add to the review screen. */
export function makeBlankParty(role: PartyRole = "manufacturer"): Party {
  return {
    id: `p-${Math.random().toString(36).slice(2, 10)}`,
    role,
    unit_code: makeEmptyField(),
    name: makeEmptyField(),
    address: makeEmptyField(),
    pincode: makeEmptyField(),
    fssai: makeEmptyField(),
    cin: makeEmptyField(),
    gstin: makeEmptyField(),
  };
}

function cloneParty(p: Party): Party {
  return {
    ...p,
    unit_code: { ...p.unit_code },
    name: { ...p.name },
    address: { ...p.address },
    pincode: { ...p.pincode },
    fssai: { ...p.fssai },
    cin: { ...p.cin },
    gstin: { ...p.gstin },
  };
}

export function ScanProvider({ children }: { children: ReactNode }) {
  const [{ snapshot, lang }] = useState(() => readStored());
  const [scan, setScanState] = useState<ScanResponse | null>(snapshot.scan);
  const [parties, setParties] = useState<Party[]>(snapshot.parties);
  const [results, setResultsState] = useState<VerifyResponse | null>(
    snapshot.results,
  );
  const [photoDataUrl, setPhotoState] = useState<string | null>(
    snapshot.photoDataUrl,
  );
  const [langState, setLangState] = useState<Lang>(lang);

  const persistRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistRef.current) clearTimeout(persistRef.current);
    persistRef.current = setTimeout(() => {
      writeStored({ scan, parties, results, photoDataUrl }, langState);
    }, 50);
    return () => {
      if (persistRef.current) clearTimeout(persistRef.current);
    };
  }, [scan, parties, results, photoDataUrl, langState]);

  const setScan = useCallback(
    (
      next: ScanResponse,
      nextParties?: Party[],
      nextPhotoDataUrl: string | null | undefined = null,
    ) => {
      setScanState(next);
      if (nextParties) setParties(nextParties);
      else setParties(next.fields.parties.map(cloneParty));
      setResultsState(null);
      if (nextPhotoDataUrl !== undefined) setPhotoState(nextPhotoDataUrl);
    },
    [],
  );

  const setResults = useCallback((r: VerifyResponse) => setResultsState(r), []);
  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const setPhoto = useCallback((p: string | null) => setPhotoState(p), []);

  const updateParty = useCallback((id: string, patch: Partial<Party>) => {
    setParties((curr) =>
      curr.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  }, []);

  const setPartyRole = useCallback((id: string, role: PartyRole) => {
    setParties((curr) =>
      curr.map((p) => (p.id === id ? { ...p, role } : p)),
    );
  }, []);

  const setPartyField = useCallback(
    (
      id: string,
      field: "unit_code" | "name" | "address" | "pincode" | "fssai" | "cin" | "gstin",
      value: string | null,
    ) => {
      setParties((curr) =>
        curr.map((p) =>
          p.id === id
            ? {
                ...p,
                [field]: {
                  ...p[field],
                  value,
                  uncertain: false,
                  source: "user" as const,
                },
              }
            : p,
        ),
      );
    },
    [],
  );

  const setProductField = useCallback(
    (key: ProductFieldKey, value: string | null) => {
      setScanState((curr) => {
        if (!curr) return curr;
        return {
          ...curr,
          fields: {
            ...curr.fields,
            product: {
              ...curr.fields.product,
              [key]: {
                value,
                confidence: 1,
                uncertain: false,
                source: "user" as const,
              } satisfies ScanField,
            },
          },
        };
      });
    },
    [],
  );

  const addParty = useCallback((party: Party) => {
    setParties((curr) => [...curr, party]);
  }, []);

  const removeParty = useCallback((id: string) => {
    setParties((curr) => curr.filter((p) => p.id !== id));
  }, []);

  const attachLicence = useCallback((licenceIndex: number, partyId: string) => {
    setScanState((curr) => {
      if (!curr) return curr;
      const licences = curr.fields.unassigned_licences;
      const licence = licences[licenceIndex];
      if (!licence) return curr;
      setParties((partiesCurr) =>
        partiesCurr.map((p) => {
          if (p.id !== partyId) return p;
          if (p.fssai.value) return p;
          return { ...p, fssai: { ...licence, source: "user" as const } };
        }),
      );
      return {
        ...curr,
        fields: {
          ...curr.fields,
          unassigned_licences: licences.filter((_, i) => i !== licenceIndex),
        },
      };
    });
  }, []);

  const reset = useCallback(() => {
    setScanState(null);
    setParties([]);
    setResultsState(null);
    setPhotoState(null);
  }, []);

  const api: StoreApi = useMemo(
    () => ({
      scan,
      parties,
      results,
      photoDataUrl,
      lang: langState,
      setLang,
      setScan,
      updateParty,
      setPartyRole,
      addParty,
      removeParty,
      setProductField,
      setPartyField,
      attachLicence,
      setResults,
      reset,
      setPhoto,
    }),
    [
      scan,
      parties,
      results,
      photoDataUrl,
      langState,
      setLang,
      setScan,
      updateParty,
      setPartyRole,
      addParty,
      removeParty,
      setProductField,
      setPartyField,
      attachLicence,
      setResults,
      reset,
      setPhoto,
    ],
  );

  useEffect(() => {
  _publishApi(api);
  return () => _publishApi(null);
}, [api]);

return <ScanContext.Provider value={api}>{children}</ScanContext.Provider>;
}

// Publish the same API on a module-level singleton so non-React callers can
// reach the setters (`DemoMenu`, etc.).
let currentApi: StoreApi | null = null;
function _publishApi(api: StoreApi | null) {
  currentApi = api;
}

export function useScan(): StoreApi {
  const ctx = useContext(ScanContext);
  if (!ctx) {
    throw new Error("useScan must be used inside <ScanProvider>");
  }
  return ctx;
}

/**
 * Imperative setter access. Use this in non-React callbacks (event
 * listeners, `DemoMenu`'s `onPick`) where you can't call hooks.
 */
export function getScanApi(): StoreApi {
  const ctx = currentApi;
  if (!ctx) {
    throw new Error("getScanApi must be called after <ScanProvider> has mounted");
  }
  return ctx;
}

/** Test helper - true once a `ScanProvider` has mounted. */
export function hasScanProvider(): boolean {
  return currentApi !== null;
}