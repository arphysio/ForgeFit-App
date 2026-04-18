"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import {
  notificationPermission,
  notificationsSupported,
  requestNotificationPermission,
  showMessageNotification,
} from "@/lib/messageNotifications";

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function MessagesPage() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState("");
  const [notifUi, setNotifUi] = useState("default");
  const listRef = useRef(null);
  const supabaseRef = useRef(null);
  const messageIdsSeededRef = useRef(false);
  const previousMessageIdsRef = useRef(new Set());

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const loadMessages = useCallback(async (client, userId) => {
    const { data, error: qErr } = await client
      .from("patient_messages")
      .select("id, sender, body, created_at")
      .eq("patient_id", userId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (qErr) throw qErr;
    setRows(data ?? []);
    requestAnimationFrame(scrollToBottom);
  }, [scrollToBottom]);

  useEffect(() => {
    let alive = true;
    let pollId = null;
    let channel = null;
    const client = createClient();
    supabaseRef.current = client;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const {
          data: { user },
        } = await client.auth.getUser();
        if (!alive) return;
        if (!user) {
          setError("Not signed in.");
          setLoading(false);
          return;
        }
        setUserEmail(user.email ?? "");
        await loadMessages(client, user.id);
        if (!alive) return;

        channel = client
          .channel(`patient_messages:${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "patient_messages",
              filter: `patient_id=eq.${user.id}`,
            },
            (payload) => {
              const row = payload.new;
              if (!row?.id) return;
              setRows((prev) => {
                if (prev.some((r) => r.id === row.id)) return prev;
                return [...prev, { id: row.id, sender: row.sender, body: row.body, created_at: row.created_at }];
              });
              requestAnimationFrame(scrollToBottom);
            }
          )
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              console.warn("Realtime messaging unavailable; using refresh.");
            }
          });

        pollId = window.setInterval(() => {
          if (!alive) return;
          loadMessages(client, user.id).catch(() => {});
        }, 12000);

        setLoading(false);
      } catch (e) {
        if (alive) {
          setError(e?.message || "Could not load messages.");
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
      if (pollId != null) window.clearInterval(pollId);
      if (channel) client.removeChannel(channel);
    };
  }, [loadMessages, scrollToBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [rows, scrollToBottom]);

  useEffect(() => {
    setNotifUi(notificationPermission());
  }, []);

  useEffect(() => {
    if (rows.length === 0) return;
    if (!messageIdsSeededRef.current) {
      messageIdsSeededRef.current = true;
      previousMessageIdsRef.current = new Set(rows.map((r) => r.id));
      return;
    }
    const prev = previousMessageIdsRef.current;
    const newcomers = rows.filter((r) => !prev.has(r.id));
    previousMessageIdsRef.current = new Set(rows.map((r) => r.id));
    for (const m of newcomers) {
      if (m.sender === "clinician") {
        showMessageNotification({
          title: "ForgeFit — Message from your clinician",
          body: m.body,
          tag: `forgefit-in-${m.id}`,
        });
      }
    }
  }, [rows]);

  async function handleEnableNotifications() {
    const result = await requestNotificationPermission();
    setNotifUi(result === "granted" ? "granted" : result === "denied" ? "denied" : "default");
  }

  async function handleSend(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    const client = supabaseRef.current || createClient();
    setSending(true);
    setError("");
    try {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) {
        setError("Not signed in.");
        return;
      }
      const { data, error: insErr } = await client
        .from("patient_messages")
        .insert({ patient_id: user.id, sender: "patient", body: text })
        .select("id, sender, body, created_at")
        .single();
      if (insErr) throw insErr;
      setDraft("");
      setRows((prev) => [...prev, data]);
      requestAnimationFrame(scrollToBottom);
    } catch (e) {
      setError(e?.message || "Send failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 px-4 py-3 flex items-center gap-4 shrink-0">
        <Link href="/patient" className="text-emerald-400 text-sm font-medium hover:text-emerald-300">
          ← My care
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Messages</h1>
        <span className="text-slate-500 text-sm truncate ml-auto">{userEmail}</span>
      </header>

      <div className="flex-1 flex flex-col max-w-lg w-full mx-auto p-4 min-h-0">
        {loading ? (
          <p className="text-slate-400 text-sm">Loading…</p>
        ) : error && rows.length === 0 ? (
          <p className="text-rose-400 text-sm">{error}</p>
        ) : (
          <>
            {error ? <p className="text-amber-400/90 text-xs mb-2">{error}</p> : null}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-3 min-h-[280px] mb-3"
            >
              {rows.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No messages yet. Your clinician will appear here.</p>
              ) : (
                rows.map((m) => {
                  const fromClinician = m.sender === "clinician";
                  return (
                    <div key={m.id} className={`flex flex-col ${fromClinician ? "items-start" : "items-end"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                          fromClinician
                            ? "bg-slate-800 text-slate-100 rounded-bl-md"
                            : "bg-emerald-700 text-white rounded-br-md"
                        }`}
                      >
                        {m.body}
                      </div>
                      <span className="text-[10px] text-slate-500 mt-0.5 px-1">{formatTime(m.created_at)}</span>
                    </div>
                  );
                })
              )}
            </div>

            {notificationsSupported() ? (
              <div className="flex flex-wrap items-center gap-2 mb-2 text-xs text-slate-400">
                <span>Desktop alerts for new clinician messages:</span>
                {notifUi === "granted" ? (
                  <span className="text-emerald-400/90 font-medium">On</span>
                ) : notifUi === "denied" ? (
                  <span className="text-amber-400/90">Blocked in browser — enable notifications for this site in browser settings.</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleEnableNotifications}
                    className="rounded-md border border-slate-600 bg-slate-800 px-2.5 py-1 text-slate-200 hover:bg-slate-700"
                  >
                    Turn on
                  </button>
                )}
              </div>
            ) : null}

            <form onSubmit={handleSend} className="flex gap-2 shrink-0">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a message…"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                maxLength={8000}
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-4 py-2 text-sm font-semibold"
              >
                {sending ? "…" : "Send"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
