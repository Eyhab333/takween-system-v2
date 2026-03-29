"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import type { RequestRecipientKey } from "@/lib/internal-requests/recipients";

export type Role =
  | "employee"
  | "hr"
  | "chairman"
  | "ceo"
  | "admin"
  | "superadmin";

type ClaimsState = {
  loading: boolean;
  uid: string | null;
  email: string | null;
  role: Role | null;
  requestRecipientKey: RequestRecipientKey | null;
  requestRecipientLabel: string | null;
  requestRecipientNumber: number | null;
};

export default function useClaimsRole(): ClaimsState {
  const [state, setState] = useState<ClaimsState>({
    loading: true,
    uid: null,
    email: null,
    role: null,
    requestRecipientKey: null,
    requestRecipientLabel: null,
    requestRecipientNumber: null,
  });

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        setState({
          loading: false,
          uid: null,
          email: null,
          role: null,
          requestRecipientKey: null,
          requestRecipientLabel: null,
          requestRecipientNumber: null,
        });
        return;
      }

      try {
        const token = await u.getIdTokenResult(true);

        const role = (token.claims?.role as Role | undefined) ?? null;
        const requestRecipientKey =
          (token.claims?.requestRecipientKey as RequestRecipientKey | undefined) ?? null;
        const requestRecipientLabel =
          (token.claims?.requestRecipientLabel as string | undefined) ?? null;

        const rawNum = token.claims?.requestRecipientNumber;
        const requestRecipientNumber =
          typeof rawNum === "number" ? rawNum : rawNum ? Number(rawNum) : null;

        setState({
          loading: false,
          uid: u.uid,
          email: u.email ?? null,
          role,
          requestRecipientKey,
          requestRecipientLabel,
          requestRecipientNumber,
        });
      } catch {
        setState({
          loading: false,
          uid: u.uid,
          email: u.email ?? null,
          role: null,
          requestRecipientKey: null,
          requestRecipientLabel: null,
          requestRecipientNumber: null,
        });
      }
    });

    return () => unsub();
  }, []);

  return state;
}