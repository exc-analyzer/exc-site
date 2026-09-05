import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  amIBlocking,
  blockPerson,
  canMessage,
  CHAT_THEMES,
  clearConversation,
  friendsSince,
  joinChat,
  loadConversations,
  loadBlocks,
  loadChatThemes,
  loadMutualPeople,
  loadReactions,
  loadThread,
  react,
  REACTIONS,
  unblockPerson,
  markRead,
  reportMessage,
  sendMessage,
  setChatTheme,
  takeBack,
  type ChatLane,
  type Conversation,
  type Message,
  type Blocked,
  type ChatTheme,
  type Person,
  type Reaction,
} from "../../lib/messages";
import { supabase } from "../../lib/supabase";
import { accentColor, type AccentId, type AvatarShape } from "../../lib/profile";
import { relativeTime } from "../../engine/shared";
import { Blank, FeedSkeleton } from "../console/Chrome";
import { Avatar } from "../profile/ProfileEditor";
import { signInWithGitHub } from "../../lib/auth";
import Icon from "../Icon";
import Verified from "../Verified";

const GROUP_GAP = 5 * 60 * 1000;
const REPLY_PULL = 44;

interface Row {
  id: string;
  login: string;
  name: string;
  avatar: string | null;
  accent: AccentId;
  shape: AvatarShape;
  preview: string | null;
  when: string | null;
  fromMe: boolean;
  unread: number;
  verified: boolean;
}

function merge(chats: Conversation[], people: Person[]): Row[] {
  const seen = new Set<string>();
  const rows: Row[] = [];

  for (const c of chats) {
    seen.add(c.other_id);
    rows.push({
      id: c.other_id,
      login: c.gh_login,
      name: c.shown_name,
      avatar: c.avatar_url,
      accent: c.accent,
      shape: c.avatar_shape,
      preview: c.last_body,
      when: c.last_at,
      fromMe: c.last_from_me,
      unread: Number(c.unread) || 0,
      verified: c.verified,
    });
  }

  for (const p of people) {
    if (seen.has(p.other_id)) continue;
    rows.push({
      id: p.other_id,
      login: p.gh_login,
      name: p.shown_name,
      avatar: p.avatar_url,
      accent: p.accent,
      shape: p.avatar_shape,
      preview: null,
      when: null,
      fromMe: false,
      unread: 0,
      verified: p.verified,
    });
  }

  return rows;
}

function threadShape(rows: Message[] | null): string {
  return rows
    ? rows
        .map((r) => `${r.id}:${r.deleted_at ?? ""}:${r.read_at ? "s" : ""}`)
        .join(",")
    : "";
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayLabel(iso: string): string {
  const when = new Date(iso);
  const gap = Math.round(
    (startOfDay(new Date()) - startOfDay(when)) / 86400000,
  );
  if (gap === 0) return "Today";
  if (gap === 1) return "Yesterday";
  return when.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: gap > 300 ? "numeric" : undefined,
  });
}

function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Dots() {
  return (
    <span className="flex items-center gap-1 px-1 py-0.5">
      <span className="typing-dot size-1.5 rounded-full bg-[var(--color-muted)]" />
      <span className="typing-dot size-1.5 rounded-full bg-[var(--color-muted)]" />
      <span className="typing-dot size-1.5 rounded-full bg-[var(--color-muted)]" />
    </span>
  );
}

export default function Messages() {
  const [me, setMe] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [list, setList] = useState<Conversation[] | null>(null);
  const [openWith, setOpenWith] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("with"),
  );
  const [thread, setThread] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [typing, setTyping] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [missed, setMissed] = useState(false);
  const [reporting, setReporting] = useState<Message | null>(null);
  const [reason, setReason] = useState("");
  const [reportState, setReportState] = useState<"idle" | "sending" | "done">(
    "idle",
  );
  const [focused, setFocused] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [blockedList, setBlockedList] = useState<Blocked[]>([]);
  const [openBlocks, setOpenBlocks] = useState(false);
  const [themes, setThemes] = useState<Record<string, ChatTheme>>({});
  const [dressing, setDressing] = useState(false);
  const [since, setSince] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const swipe = useRef<{
    id: string;
    x: number;
    y: number;
    lock: "x" | "y" | null;
  } | null>(null);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<"clear" | "block" | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [hold, setHold] = useState<{
    message: Message;
    mine: boolean;
    cardTop: number;
    cardLeft: number;
    cardWidth: number;
    cardHeight: number;
    menuTop: number;
    menuLeft: number;
  } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const threadRef = useRef<Message[] | null>(null);
  const [tip, setTip] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);
  const [picker, setPicker] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);

  const box = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const openRef = useRef<string | null>(null);
  const shapeRef = useRef("");
  const pinnedRef = useRef(true);
  const lane = useRef<ChatLane | null>(null);
  const typingOff = useRef<number | null>(null);
  const scrollIdle = useRef<number | null>(null);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    void (async () => {
      const { data } = await supabase!.auth.getSession();
      setMe(data.session?.user.id ?? null);
      if (data.session) {
        const [chats, mutuals, blocks, dress] = await Promise.all([
          loadConversations(),
          loadMutualPeople(),
          loadBlocks(),
          loadChatThemes(),
        ]);
        setList(chats);
        setPeople(mutuals);
        setBlockedList(blocks);
        setThemes(dress);
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!openWith) return;
    let alive = true;
    void (async () => {
      setThread(null);
      setTyping(false);
      setPinned(true);
      pinnedRef.current = true;
      setMissed(false);
      const [rows, may] = await Promise.all([
        loadThread(openWith),
        canMessage(openWith),
      ]);
      if (!alive) return;
      setThread(rows);
      setAllowed(may);
      await markRead(openWith);
      setList(await loadConversations());
      window.dispatchEvent(new Event("exc:mail"));
    })();
    return () => {
      alive = false;
    };
  }, [openWith]);

  useEffect(() => {
    if (!openWith) {
      delete document.documentElement.dataset.chat;
      return;
    }
    document.documentElement.dataset.chat = "open";
    return () => {
      delete document.documentElement.dataset.chat;
    };
  }, [openWith]);

  useEffect(() => {
    const view = window.visualViewport;
    if (!openWith || !view) return;
    const root = document.documentElement;
    const apply = () => {
      const zoomed = view.scale > 1.01;
      const gap = window.innerHeight - view.height - view.offsetTop;
      const keyboard = zoomed || gap < 80 ? 0 : Math.min(gap, 480);
      root.style.setProperty("--kb", `${Math.round(keyboard)}px`);
      if (pinnedRef.current) toBottom();
    };
    view.addEventListener("resize", apply);
    view.addEventListener("scroll", apply);
    window.addEventListener("orientationchange", apply);
    apply();
    return () => {
      view.removeEventListener("resize", apply);
      view.removeEventListener("scroll", apply);
      window.removeEventListener("orientationchange", apply);
      root.style.removeProperty("--kb");
    };
  }, [openWith]);

  useEffect(() => {
    openRef.current = openWith;
    const intro = document.getElementById("messages-intro");
    if (intro) intro.hidden = openWith !== null;
  }, [openWith]);

  useEffect(() => {
    if (!openWith || !allowed) return;
    let alive = true;
    void (async () => {
      const joined = await joinChat(
        openWith,
        (on) => {
          if (typingOff.current) window.clearTimeout(typingOff.current);
          if (!on) {
            setTyping(false);
            return;
          }
          setTyping(true);
          typingOff.current = window.setTimeout(() => setTyping(false), 3600);
        },
        () => {
          const rows = shapeRef.current
            .split(",")
            .map((x) => x.split(":")[0])
            .filter(Boolean);
          void loadReactions(rows).then(setReactions);
        },
      );
      if (!alive) {
        joined?.leave();
        return;
      }
      lane.current = joined;
    })();
    return () => {
      alive = false;
      lane.current?.leave();
      lane.current = null;
      if (typingOff.current) window.clearTimeout(typingOff.current);
    };
  }, [openWith, allowed]);

  useEffect(() => {
    if (!me) return;
    const onPing = () => {
      void (async () => {
        const who = openRef.current;
        if (who) {
          const rows = await loadThread(who);
          if (rows && threadShape(rows) !== shapeRef.current) setThread(rows);
          await markRead(who);
        }
        setList(await loadConversations());
        window.dispatchEvent(new Event("exc:mail"));
      })();
    };
    window.addEventListener("exc:mail-ping", onPing);
    return () => window.removeEventListener("exc:mail-ping", onPing);
  }, [me]);

  useEffect(() => {
    threadRef.current = thread;
  }, [thread]);

  useEffect(() => {
    if (!openWith) return;
    if (window.matchMedia("(hover: hover)").matches) return;
    try {
      setTip(localStorage.getItem("exc.hold-tip") !== "seen");
    } catch {
      setTip(false);
    }
  }, [openWith]);

  function hideTip(): void {
    setTip(false);
    try {
      localStorage.setItem("exc.hold-tip", "seen");
    } catch {
      /* storage unavailable */
    }
  }

  useEffect(() => {
    shapeRef.current = threadShape(thread);
    if (!thread || thread.length === 0) {
      setReactions([]);
      return;
    }
    void loadReactions(thread.map((m) => m.id)).then(setReactions);
  }, [thread]);

  useEffect(() => {
    if (!picker) return;
    const shut = () => setPicker(null);
    window.addEventListener("click", shut);
    return () => window.removeEventListener("click", shut);
  }, [picker]);

  useEffect(() => {
    if (!hold) return;
    const view = window.visualViewport;
    if (!view) return;
    const settle = () => {
      setHold((was) => {
        if (!was) return was;
        const menuTall = 4 * 42 + 52;
        const gap = 10;
        const edge = 16;
        const seen = visibleBox();
        const block = was.cardHeight + gap + menuTall;
        const cardTop = Math.max(
          seen.top + edge,
          seen.top + Math.round((seen.height - block) / 2),
        );
        const rightEdge = seen.left + seen.width - edge;
        return {
          ...was,
          cardTop,
          cardLeft: was.mine
            ? Math.max(seen.left + edge, rightEdge - was.cardWidth)
            : seen.left + edge,
          menuTop: cardTop + was.cardHeight + gap,
          menuLeft: was.mine
            ? Math.max(seen.left + edge, rightEdge - 216)
            : seen.left + edge,
        };
      });
    };
    view.addEventListener("resize", settle);
    view.addEventListener("scroll", settle);
    return () => {
      view.removeEventListener("resize", settle);
      view.removeEventListener("scroll", settle);
    };
  }, [hold?.message.id]);

  useEffect(() => {
    if (!hold) return;
    const away = () => setHold(null);
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", away);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", away);
    };
  }, [hold]);

  useEffect(() => {
    if (!menu) return;
    const shut = () => {
      setMenu(false);
      setConfirm(null);
      setDressing(false);
    };
    window.addEventListener("click", shut);
    return () => window.removeEventListener("click", shut);
  }, [menu]);

  useEffect(() => {
    if (!openWith) return;
    setMenu(false);
    setConfirm(null);
    setDressing(false);
    setSince(null);
    setReplyTo(null);
    void amIBlocking(openWith).then(setBlocking);
    void friendsSince(openWith).then(setSince);
  }, [openWith]);

  useEffect(
    () => () => {
      if (scrollIdle.current) window.clearTimeout(scrollIdle.current);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!me || !openWith) return;
    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        const rows = await loadThread(openWith);
        if (!rows || threadShape(rows) === shapeRef.current) return;
        setThread(rows);
        await markRead(openWith);
        setList(await loadConversations());
        window.dispatchEvent(new Event("exc:mail"));
      })();
    }, 15000);
    return () => window.clearInterval(tick);
  }, [me, openWith]);

  function toBottom(smooth = false): void {
    const el = box.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }

  useEffect(() => {
    if (!thread || thread.length === 0) return;
    if (thread[thread.length - 1].from_id !== me) {
      if (typingOff.current) window.clearTimeout(typingOff.current);
      setTyping(false);
    }
  }, [thread, me]);

  useEffect(() => {
    if (thread === null) return;
    if (pinnedRef.current) {
      toBottom();
      setMissed(false);
    } else {
      setMissed(true);
    }
  }, [thread]);

  useEffect(() => {
    if (typing && pinnedRef.current) toBottom(true);
  }, [typing]);

  useEffect(() => {
    const field = box.current;
    if (!field || !openWith) return;

    let from: {
      id: string;
      x: number;
      y: number;
      lock: "x" | "y" | null;
      armed: boolean;
    } | null = null;
    let timer: number | null = null;

    const rowOf = (target: EventTarget | null): HTMLElement | null =>
      (target as HTMLElement | null)?.closest?.(".msg-row") ?? null;

    const findMessage = (row: HTMLElement | null): Message | null => {
      const id = row?.id?.replace("msg-", "");
      if (!id) return null;
      return threadRef.current?.find((m) => m.id === id) ?? null;
    };

    const stop = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const onStart = (ev: TouchEvent) => {
      const row = rowOf(ev.target);
      const m = findMessage(row);
      if (!row || !m) return;
      const t = ev.touches[0];
      from = {
        id: m.id,
        x: t.clientX,
        y: t.clientY,
        lock: null,
        armed: false,
      };
      if (m.deleted_at) return;
      const shape = row.getBoundingClientRect();
      timer = window.setTimeout(() => {
        timer = null;
        from = null;
        openHold(m, shape);
      }, 550);
    };

    const onMove = (ev: TouchEvent) => {
      if (!from) return;
      const row = rowOf(ev.target);
      if (!row) return;
      const t = ev.touches[0];
      const dx = t.clientX - from.x;
      const dy = Math.abs(t.clientY - from.y);
      if (from.lock === null) {
        if (Math.abs(dx) < 6 && dy < 6) return;
        stop();
        from.lock = dy > Math.abs(dx) ? "y" : "x";
      }
      if (from.lock === "y") return;

      const pull = Math.max(0, dx);
      const shift = Math.min(pull * 0.6, 64);
      const reach = Math.min(pull / REPLY_PULL, 1);

      row.setAttribute("data-swiping", "1");
      row.style.transform = `translateX(${shift}px)`;
      row.style.setProperty("--swipe", reach.toFixed(2));
      row.style.setProperty("--shift", `${shift.toFixed(1)}px`);

      if (reach >= 1 && !from.armed) {
        from.armed = true;
        row.setAttribute("data-armed", "1");
        if (navigator.vibrate) navigator.vibrate(8);
      } else if (reach < 1 && from.armed) {
        from.armed = false;
        row.removeAttribute("data-armed");
      }
    };

    const onEnd = (ev: TouchEvent) => {
      const row = rowOf(ev.target);
      stop();
      if (row) {
        row.removeAttribute("data-swiping");
        row.removeAttribute("data-armed");
        row.style.transform = "";
        row.style.setProperty("--swipe", "0");
        row.style.setProperty("--shift", "0px");
      }
      const started = from;
      from = null;
      if (!started || started.lock !== "x") return;
      const dx = (ev.changedTouches[0]?.clientX ?? started.x) - started.x;
      const m = threadRef.current?.find((x) => x.id === started.id) ?? null;
      if (dx > REPLY_PULL && m && !m.deleted_at) {
        setReplyTo(m);
        composer.current?.focus();
      }
    };

    const onCancel = () => {
      if (from?.lock) stop();
      if (from) {
        const row = document.getElementById(`msg-${from.id}`);
        if (row) {
          row.removeAttribute("data-swiping");
          row.removeAttribute("data-armed");
          row.style.transform = "";
          row.style.setProperty("--swipe", "0");
          row.style.setProperty("--shift", "0px");
        }
      }
      from = null;
    };

    const onMenu = (ev: MouseEvent) => {
      const row = rowOf(ev.target);
      const m = findMessage(row);
      if (!row || !m || m.deleted_at) return;
      if (window.matchMedia("(hover: hover)").matches) return;
      ev.preventDefault();
      stop();
      from = null;
      openHold(m, row.getBoundingClientRect());
    };

    field.addEventListener("touchstart", onStart, { passive: true });
    field.addEventListener("touchmove", onMove, { passive: true });
    field.addEventListener("touchend", onEnd, { passive: true });
    field.addEventListener("touchcancel", onCancel, { passive: true });
    field.addEventListener("contextmenu", onMenu);

    return () => {
      stop();
      field.removeEventListener("touchstart", onStart);
      field.removeEventListener("touchmove", onMove);
      field.removeEventListener("touchend", onEnd);
      field.removeEventListener("touchcancel", onCancel);
      field.removeEventListener("contextmenu", onMenu);
    };
  }, [openWith]);

  useEffect(() => {
    const inner = stack.current;
    if (!inner || typeof ResizeObserver === "undefined") return;
    const watcher = new ResizeObserver(() => {
      if (pinnedRef.current) toBottom();
    });
    watcher.observe(inner);
    return () => watcher.disconnect();
  }, [openWith]);

  function onScroll(): void {
    const el = box.current;
    if (!el) return;

    el.classList.add("is-scrolling");
    if (scrollIdle.current) window.clearTimeout(scrollIdle.current);
    scrollIdle.current = window.setTimeout(
      () => el.classList.remove("is-scrolling"),
      900,
    );

    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    pinnedRef.current = near;
    setPinned(near);
    if (near) setMissed(false);
  }

  function say(word: string): void {
    setFlash(word);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1800);
  }

  async function copyOut(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      say("Copied");
    } catch {
      say("Could not reach the clipboard");
    }
  }

  function visibleBox(): {
    top: number;
    left: number;
    width: number;
    height: number;
  } {
    const view = window.visualViewport;
    if (!view) {
      return {
        top: 0,
        left: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };
    }
    return {
      top: view.offsetTop,
      left: view.offsetLeft,
      width: view.width,
      height: view.height,
    };
  }

  function dropHold(): void {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }


  function openHold(m: Message, bubble: DOMRect): void {
    if (navigator.vibrate) navigator.vibrate(12);
    hideTip();

    const mine = m.from_id === me;
    const menuWide = 216;
    const menuTall = 4 * 42 + 52;
    const gap = 10;
    const edge = 16;
    const seen = visibleBox();

    const cardWidth = Math.min(bubble.width, seen.width - 2 * edge);
    const cardHeight = Math.min(bubble.height, seen.height * 0.34);
    const block = cardHeight + gap + menuTall;

    const cardTop = Math.max(
      seen.top + edge,
      seen.top + Math.round((seen.height - block) / 2),
    );
    const rightEdge = seen.left + seen.width - edge;
    const cardLeft = mine
      ? Math.max(seen.left + edge, rightEdge - cardWidth)
      : seen.left + edge;

    const menuTop = cardTop + cardHeight + gap;
    const menuLeft = mine
      ? Math.max(seen.left + edge, rightEdge - menuWide)
      : seen.left + edge;

    setHold({
      message: m,
      mine,
      cardTop,
      cardLeft,
      cardWidth,
      cardHeight,
      menuTop,
      menuLeft,
    });
  }

  function openPicker(id: string, anchor: HTMLElement): void {
    const spot = anchor.getBoundingClientRect();
    const wide = 216;
    const tall = 44;
    const seen = visibleBox();
    const above = spot.top - tall - 8;
    setPicker({
      id,
      top:
        above >= seen.top + 8
          ? above
          : Math.min(spot.bottom + 8, seen.top + seen.height - tall - 8),
      left: Math.max(
        seen.left + 8,
        Math.min(
          spot.left + spot.width / 2 - wide / 2,
          seen.left + seen.width - wide - 8,
        ),
      ),
    });
  }

  async function undoMessage(id: string): Promise<void> {
    const trouble = await takeBack(id);
    if (trouble) {
      say(trouble);
      return;
    }
    say("Taken back");
    if (!openWith) return;
    setThread(await loadThread(openWith));
    setList(await loadConversations());
    window.dispatchEvent(new Event("exc:mail"));
  }

  function quoted(id: string | null): Message | null {
    if (!id || !thread) return null;
    return thread.find((m) => m.id === id) ?? null;
  }

  function nudgeInto(id: string): void {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const bubble = el.querySelector<HTMLElement>("[data-bubble]") ?? el;
    bubble.animate(
      [
        { boxShadow: "0 0 0 3px rgba(163,145,224,0.55)" },
        { boxShadow: "0 0 0 3px rgba(163,145,224,0)" },
      ],
      { duration: 1100, easing: "ease-out" },
    );
  }

  function grow(): void {
    const el = composer.current;
    if (!el) return;
    el.style.height = "auto";
    const wanted = el.scrollHeight;
    el.style.height = `${Math.min(wanted, 160)}px`;
    el.style.overflowY = wanted > 160 ? "auto" : "hidden";
  }

  async function send(): Promise<void> {
    if (!openWith || !draft.trim() || busy) return;
    setBusy(true);
    setProblem(null);
    const trouble = await sendMessage(openWith, draft, replyTo?.id ?? null);
    setBusy(false);
    if (trouble) {
      setProblem(trouble);
      return;
    }
    setDraft("");
    setReplyTo(null);
    setTyping(false);
    lane.current?.hush();
    if (composer.current) {
      composer.current.style.height = "auto";
      composer.current.style.overflowY = "hidden";
    }
    pinnedRef.current = true;
    setPinned(true);
    setThread(await loadThread(openWith));
    setList(await loadConversations());
  }

  async function tapReaction(id: string, emoji: string): Promise<void> {
    const mineNow = reactions.find((r) => r.message_id === id && r.user_id === me);
    const next = mineNow?.emoji === emoji ? null : emoji;
    setPicker(null);
    const trouble = await react(id, next);
    if (trouble) {
      setProblem(trouble);
      return;
    }
    if (thread) setReactions(await loadReactions(thread.map((m) => m.id)));
    lane.current?.touch();
  }

  async function dropConversation(): Promise<void> {
    if (!openWith) return;
    const trouble = await clearConversation(openWith);
    if (trouble) {
      setProblem(trouble);
      return;
    }
    setMenu(false);
    setConfirm(null);
    setOpenWith(null);
    setThread(null);
    setList(await loadConversations());
    window.dispatchEvent(new Event("exc:mail"));
    window.history.replaceState(null, "", window.location.pathname);
  }

  async function toggleBlock(): Promise<void> {
    if (!openWith) return;
    const trouble = blocking
      ? await unblockPerson(openWith)
      : await blockPerson(openWith);
    if (trouble) {
      setProblem(trouble);
      return;
    }
    setMenu(false);
    setConfirm(null);
    if (blocking) {
      setBlocking(false);
      setAllowed(await canMessage(openWith));
      return;
    }
    setBlocking(true);
    setOpenWith(null);
    setThread(null);
    setList(await loadConversations());
    setPeople(await loadMutualPeople());
    window.dispatchEvent(new Event("exc:mail"));
    window.history.replaceState(null, "", window.location.pathname);
  }

  async function sendReport(): Promise<void> {
    if (!reporting) return;
    setReportState("sending");
    const trouble = await reportMessage(reporting.id, reason);
    if (trouble) {
      setReportState("idle");
      setProblem(trouble);
      return;
    }
    setReportState("done");
    say("Reported");
    window.setTimeout(() => setReporting(null), 2600);
  }

  if (!ready) return <FeedSkeleton rows={3} />;

  if (!me) {
    return (
      <Blank
        icon="reply"
        title="Messages are for people who follow each other"
        lead="Sign in, follow somebody, and once they follow you back you can write to each other."
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void signInWithGitHub()}
          >
            Sign in with GitHub
          </button>
        }
      />
    );
  }

  const chat = list?.find((c) => c.other_id === openWith) ?? null;
  const known = people.find((p) => p.other_id === openWith) ?? null;
  const partner = chat
    ? {
        login: chat.gh_login,
        name: chat.shown_name,
        avatar: chat.avatar_url,
        accent: chat.accent,
        shape: chat.avatar_shape,
        verified: chat.verified,
      }
    : known
      ? {
          login: known.gh_login,
          name: known.shown_name,
          avatar: known.avatar_url,
          accent: known.accent,
          shape: known.avatar_shape,
          verified: known.verified,
        }
      : null;

  if (openWith) {
    return (
      <div className="chat-screen space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="-ml-1 grid size-11 shrink-0 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[rgba(163,145,224,0.09)] hover:text-[var(--color-text)] active:bg-[rgba(163,145,224,0.16)] lg:size-9"
            onClick={() => {
              setOpenWith(null);
              setProblem(null);
              setReporting(null);
              window.history.replaceState(null, "", window.location.pathname);
            }}
            aria-label="Back to all conversations"
          >
            <Icon name="chevron" size={19} className="rotate-180" />
          </button>
          {partner && (
            <a
              href={`/app/people/${partner.login}/`}
              className="group flex min-w-0 items-center gap-2.5"
            >
              <Avatar
                src={partner.avatar}
                name={partner.name}
                size={34}
                accent={accentColor(partner.accent)}
                shape={partner.shape}
              />
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1">
                  <span className="truncate text-sm font-semibold group-hover:underline">
                    {partner.name}
                  </span>
                  {partner.verified && <Verified size={13} />}
                </span>
                <span className="block truncate text-2xs text-[var(--color-faint)]">
                  {typing ? "typing…" : `@${partner.login}`}
                </span>
              </span>
            </a>
          )}

          {partner && (
            <div
              className="relative ml-auto shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="grid size-8 place-items-center rounded-full text-[var(--color-faint)] transition hover:bg-[rgba(163,145,224,0.08)] hover:text-[var(--color-text)]"
                aria-label="Conversation options"
                aria-expanded={menu}
                onClick={() => {
                  setMenu((v) => !v);
                  setConfirm(null);
                  setDressing(false);
                }}
              >
                <Icon name="dots" size={17} />
              </button>

              {menu && (
                <div className="surface absolute right-0 top-9 z-20 w-60 overflow-hidden p-1 shadow-lg">
                  {dressing ? (
                    <div className="p-2">
                      <p className="px-1 pb-2 text-2xs font-semibold uppercase tracking-wider text-[var(--color-faint)]">
                        Look of this chat
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {CHAT_THEMES.map((entry) => {
                          const on = (themes[openWith] ?? "plain") === entry.id;
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              title={entry.label}
                              aria-label={entry.label}
                              aria-pressed={on}
                              className="group/chip flex flex-col items-center gap-1"
                              onClick={() => {
                                setThemes((was) => ({
                                  ...was,
                                  [openWith]: entry.id,
                                }));
                                void setChatTheme(openWith, entry.id).then(
                                  (trouble) => {
                                    if (trouble) setProblem(trouble);
                                  },
                                );
                              }}
                            >
                              <span
                                data-theme={
                                  entry.id === "plain" ? undefined : entry.id
                                }
                                className={`theme-chip relative grid h-11 w-full place-items-center overflow-hidden rounded-[var(--radius-control)] border transition ${
                                  on
                                    ? "border-[var(--color-line-active)] ring-1 ring-[var(--color-line-active)]"
                                    : "border-[var(--color-line)] group-hover/chip:border-[var(--color-line-strong)]"
                                }`}
                                style={{ background: "var(--chat-paper)" }}
                              >
                                <span
                                  className="relative z-[1] h-3.5 w-7 rounded-full shadow-sm"
                                  style={{
                                    backgroundImage: "var(--chat-mine)",
                                  }}
                                />
                                {on && (
                                  <span className="absolute right-1 top-1 z-[1] grid size-3.5 place-items-center rounded-full bg-[var(--color-primary)]">
                                    <Icon
                                      name="check"
                                      size={9}
                                      className="text-white"
                                    />
                                  </span>
                                )}
                              </span>
                              <span
                                className={`text-2xs leading-none ${
                                  on
                                    ? "font-semibold text-[var(--color-text)]"
                                    : "text-[var(--color-faint)]"
                                }`}
                              >
                                {entry.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm mt-2 w-full"
                        onClick={() => setDressing(false)}
                      >
                        Done
                      </button>
                    </div>
                  ) : confirm === null ? (
                    <>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm transition hover:bg-[rgba(163,145,224,0.08)]"
                        onClick={() => setDressing(true)}
                      >
                        <Icon name="palette" size={14} />
                        Change the look
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm transition hover:bg-[rgba(163,145,224,0.08)]"
                        onClick={() => setConfirm("clear")}
                      >
                        <Icon name="trash" size={14} />
                        Delete conversation
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-[var(--color-bad)] transition hover:bg-[rgba(242,85,90,0.1)]"
                        onClick={() => setConfirm("block")}
                      >
                        <Icon name="ban" size={14} />
                        {blocking ? "Unblock" : "Block"} {partner.name}
                      </button>
                    </>
                  ) : (
                    <div className="p-2">
                      <p className="text-xs leading-relaxed text-[var(--color-muted)]">
                        {confirm === "clear"
                          ? "This clears the conversation for you only. They keep their copy."
                          : blocking
                            ? "You will be able to follow each other and write again."
                            : "You both stop following each other, neither can write, and you disappear from each other feeds."}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setConfirm(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm bg-[var(--color-bad)] text-white"
                          onClick={() => {
                            if (confirm === "clear") void dropConversation();
                            else void toggleBlock();
                          }}
                        >
                          {confirm === "clear"
                            ? "Delete"
                            : blocking
                              ? "Unblock"
                              : "Block"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div
          className="chat-pane relative rounded-[var(--radius-card)] border border-[color:var(--chat-line)] bg-[color:var(--chat-paper)]"
          data-theme={openWith ? (themes[openWith] ?? "plain") : "plain"}
        >
          <div className="relative flex min-h-0 flex-1 flex-col">
          <section
            ref={box}
            onScroll={onScroll}
            className="quiet-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
          >
            <div className="flex min-h-full flex-col justify-end" ref={stack}>
            {thread === null ? (
              <FeedSkeleton rows={3} />
            ) : (
              <>
              {partner && (
                <div className="px-6 pb-6 pt-4 text-center">
                  <div className="flex justify-center">
                    <Avatar
                      src={partner.avatar}
                      name={partner.name}
                      size={72}
                      accent={accentColor(partner.accent)}
                      shape={partner.shape}
                    />
                  </div>
                  <p className="mt-3 text-lg font-semibold">{partner.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    @{partner.login}
                  </p>
                  <p className="mx-auto mt-3 max-w-[38ch] text-sm leading-relaxed text-[var(--color-muted)]">
                    {since
                      ? `You have followed each other since ${monthYear(since)}. Nobody else can read this.`
                      : "You follow each other, so you can write here. Nobody else can read it."}
                  </p>
                  <a
                    className="btn btn-ghost btn-sm mt-4"
                    href={`/app/people/${partner.login}/`}
                  >
                    Open profile
                  </a>
                </div>
              )}
              </>
            )}

            {thread !== null && (
              thread.map((m, i) => {
                const prev = i > 0 ? thread[i - 1] : null;
                const next = i + 1 < thread.length ? thread[i + 1] : null;
                const mine = m.from_id === me;
                const at = new Date(m.created_at).getTime();

                const newDay =
                  !prev ||
                  startOfDay(new Date(prev.created_at)) !==
                    startOfDay(new Date(m.created_at));
                const opens =
                  newDay ||
                  !prev ||
                  prev.from_id !== m.from_id ||
                  at - new Date(prev.created_at).getTime() > GROUP_GAP;
                const apart =
                  !next ||
                  new Date(next.created_at).getTime() - at > GROUP_GAP ||
                  startOfDay(new Date(next.created_at)) !==
                    startOfDay(new Date(m.created_at));
                const closes = apart || next.from_id !== m.from_id;

                const corner = mine
                  ? closes
                    ? "rounded-2xl rounded-br-md"
                    : "rounded-2xl"
                  : closes
                    ? "rounded-2xl rounded-bl-md"
                    : "rounded-2xl";

                const stampText = clock(m.created_at);

                const mood = Object.entries(
                  reactions
                    .filter((r) => r.message_id === m.id)
                    .reduce<Record<string, string[]>>((acc, r) => {
                      (acc[r.emoji] ??= []).push(r.user_id);
                      return acc;
                    }, {}),
                );

                return (
                  <div key={m.id}>
                    {newDay && (
                      <div className="my-4 flex items-center gap-3">
                        <span className="h-px flex-1 bg-[color:var(--chat-line)]" />
                        <span className="text-2xs font-medium uppercase tracking-wider text-[color:var(--chat-soft)]">
                          {dayLabel(m.created_at)}
                        </span>
                        <span className="h-px flex-1 bg-[color:var(--chat-line)]" />
                      </div>
                    )}

                    <div
                      id={`msg-${m.id}`}
                      className={`msg-row group relative flex items-end gap-1 sm:gap-1.5 ${
                        newDay ? "" : opens ? "mt-3.5" : "mt-1"
                      } ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <span
                        className="swipe-hint pointer-events-none absolute left-0 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-[var(--color-raised)] text-[var(--color-muted)]"
                        aria-hidden="true"
                      >
                        <Icon name="reply" size={15} />
                      </span>

                      {mine && !m.deleted_at && (
                        <span className="msg-act flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] p-0.5 shadow-sm">
                          <button
                            type="button"
                            className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--color-faint)] transition hover:bg-[rgba(242,85,90,0.12)] hover:text-[var(--color-bad)]"
                            title="Take it back"
                            aria-label="Take this message back"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void undoMessage(m.id);
                            }}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                          <button
                            type="button"
                            className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--color-faint)] transition hover:bg-[rgba(163,145,224,0.12)] hover:text-[var(--color-text)]"
                            aria-label="React"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openPicker(m.id, ev.currentTarget);
                            }}
                          >
                            <Icon name="heart" size={13} />
                          </button>
                          <button
                            type="button"
                            className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--color-faint)] transition hover:bg-[rgba(163,145,224,0.12)] hover:text-[var(--color-text)]"
                            aria-label="Reply"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setReplyTo(m);
                              composer.current?.focus();
                            }}
                          >
                            <Icon name="reply" size={13} />
                          </button>
                        </span>
                      )}

                      <div
                        data-bubble
                        className={`relative max-w-[80%] px-4 py-2.5 text-[15px] leading-[1.45] [overflow-wrap:anywhere] ${corner} ${
                          m.deleted_at
                            ? "border border-dashed border-[var(--color-line)] text-[var(--color-faint)]"
                            : mine
                              ? "bg-[image:var(--chat-mine)] text-[color:var(--chat-mine-ink)] shadow-[var(--chat-mine-glow)]"
                              : "border border-[color:var(--chat-line)] bg-[color:var(--chat-theirs)] text-[color:var(--chat-ink)]"
                        }`}
                      >
                        {quoted(m.reply_to) && (
                          <button
                            type="button"
                            className="msg-quote mb-1.5 block w-full pl-2 pr-1 text-left"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              nudgeInto(m.reply_to!);
                            }}
                          >
                            <span className="block text-2xs font-semibold">
                              {quoted(m.reply_to)!.from_id === me
                                ? "You"
                                : (partner?.name ?? "Them")}
                            </span>
                            <span className="block truncate text-2xs">
                              {quoted(m.reply_to)!.body}
                            </span>
                          </button>
                        )}
                        <p
                          className={
                            m.deleted_at ? "italic" : "whitespace-pre-wrap"
                          }
                        >
                          {m.body}
                          <span
                            className="inline-block"
                            style={{
                              width: `${stampText.length * 6.2 + (mine && !m.deleted_at ? 38 : 18)}px`,
                            }}
                            aria-hidden="true"
                          />
                        </p>
                        <span
                          className={`pointer-events-none absolute bottom-1.5 right-3 flex items-center gap-1 text-[10px] leading-none tabular-nums ${
                            mine && !m.deleted_at
                              ? "opacity-70"
                              : "text-[color:var(--chat-soft)]"
                          }`}
                        >
                          {stampText}
                          {mine && !m.deleted_at && (
                            <Icon
                              name="ticks"
                              size={14}
                              className={
                                m.read_at ? "text-[#53bdeb]" : "opacity-70"
                              }
                            />
                          )}
                        </span>
                      </div>

                      {!mine && !m.deleted_at && (
                        <span className="msg-act flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] p-0.5 shadow-sm">
                          <button
                            type="button"
                            className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--color-faint)] transition hover:bg-[rgba(163,145,224,0.12)] hover:text-[var(--color-text)]"
                            aria-label="Reply"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setReplyTo(m);
                              composer.current?.focus();
                            }}
                          >
                            <Icon name="reply" size={13} />
                          </button>
                          <button
                            type="button"
                            className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--color-faint)] transition hover:bg-[rgba(163,145,224,0.12)] hover:text-[var(--color-text)]"
                            aria-label="React"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openPicker(m.id, ev.currentTarget);
                            }}
                          >
                            <Icon name="heart" size={13} />
                          </button>
                          <button
                            type="button"
                            className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--color-faint)] transition hover:bg-[rgba(242,85,90,0.12)] hover:text-[var(--color-bad)]"
                            title="Report"
                            aria-label="Report this message"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setReporting(m);
                              setReason("");
                              setReportState("idle");
                              setProblem(null);
                            }}
                          >
                            <Icon name="flag" size={13} />
                          </button>
                        </span>
                      )}
                    </div>

                    {mood.length > 0 && (
                      <div
                        className={`mt-1 flex flex-wrap gap-1 ${
                          mine ? "justify-end" : "justify-start"
                        }`}
                      >
                        {mood.map(([emoji, who]) => (
                          <button
                            key={emoji}
                            type="button"
                            title={
                              who.includes(me)
                                ? "Take your reaction back"
                                : "React the same way"
                            }
                            className={`flex items-center gap-1 rounded-full border px-2 py-[3px] leading-none transition ${
                              who.includes(me)
                                ? "border-[var(--color-line-active)] bg-[var(--color-primary-soft)]"
                                : "border-[color:var(--chat-line)] bg-[color:var(--chat-theirs)] text-[color:var(--chat-ink)] hover:border-[var(--color-line-strong)]"
                            }`}
                            onClick={() => void tapReaction(m.id, emoji)}
                          >
                            <span className="text-[14px] leading-none">
                              {emoji}
                            </span>
                            {who.length > 1 && (
                              <span className="text-2xs font-medium text-[var(--color-muted)]">
                                {who.length}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {typing && thread !== null && (
              <div className="mt-3 flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-[var(--color-line)] bg-[var(--color-raised)] px-3 py-2">
                  <Dots />
                </div>
              </div>
            )}
            <div ref={bottom} />
            </div>
          </section>

          {!pinned && (
            <button
              type="button"
              aria-label={missed ? "New messages, jump to the latest" : "Jump to the latest"}
              className="scroll-down absolute bottom-3 right-3 z-20 grid size-10 place-items-center rounded-full border border-[var(--color-line-strong)] bg-[var(--color-raised)] text-[var(--color-muted)] shadow-lg transition hover:text-[var(--color-text)] active:scale-95"
              onClick={() => {
                pinnedRef.current = true;
                setPinned(true);
                setMissed(false);
                toBottom(true);
              }}
            >
              <Icon name="chevron" size={17} className="rotate-90" />
              {missed && (
                <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-[var(--color-raised)] bg-[var(--color-accent)]" />
              )}
            </button>
          )}
          </div>

        {reporting && (
          <section className="shrink-0 space-y-3 border-t border-[var(--color-line)] bg-[var(--color-sunken)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Report this message</p>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  Only this one message is passed on. The rest of your
                  conversation stays private.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-quiet btn-sm shrink-0"
                onClick={() => setReporting(null)}
              >
                Cancel
              </button>
            </div>

            <blockquote className="rounded-[var(--radius-control)] border-l-2 border-[var(--color-line-strong)] bg-[var(--color-sunken)] px-3 py-2 text-xs text-[var(--color-muted)] [overflow-wrap:anywhere]">
              {reporting.body}
            </blockquote>

            {reportState === "done" ? (
              <p className="text-xs text-[var(--color-good)]">
                Reported. Whoever is on moderation duty will look at it.
              </p>
            ) : (
              <div className="space-y-2">
                <label className="label" htmlFor="mail-report-reason">
                  What is wrong with it?
                </label>
                <input
                  id="mail-report-reason"
                  className="field"
                  value={reason}
                  maxLength={500}
                  autoFocus
                  placeholder="In a line: insult, threat, spam…"
                  onChange={(e) => setReason(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={reason.trim().length < 3 || reportState === "sending"}
                  onClick={() => void sendReport()}
                >
                  {reportState === "sending" ? "Sending…" : "Send report"}
                </button>
              </div>
            )}
          </section>
        )}

        {flash && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-50 flex justify-center">
            <span className="rounded-full border border-[var(--color-line-strong)] bg-[var(--color-raised)] px-3.5 py-1.5 text-xs shadow-lg">
              {flash}
            </span>
          </div>
        )}

        {tip && (
          <div className="flex shrink-0 items-center gap-2 border-t border-[var(--color-line)] bg-[var(--color-sunken)] px-3 py-2">
            <Icon
              name="info"
              size={14}
              className="shrink-0 text-[var(--color-faint)]"
            />
            <span className="min-w-0 flex-1 text-2xs leading-relaxed text-[var(--color-muted)]">
              Press and hold a message to reply, react or copy it. Swipe it right
              to reply straight away.
            </span>
            <button
              type="button"
              className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--color-faint)] hover:text-[var(--color-text)]"
              aria-label="Hide this tip"
              onClick={hideTip}
            >
              <Icon name="cross" size={13} />
            </button>
          </div>
        )}

        {allowed ? (
          <div className="shrink-0 border-t border-[var(--color-line)] p-2.5">
          {replyTo && (
            <div className="mb-2 flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-sunken)] px-3 py-2">
              <span className="msg-quote block min-w-0 flex-1 pl-2 text-left">
                <span className="block text-2xs font-semibold text-[var(--color-muted)]">
                  Replying to {replyTo.from_id === me ? "yourself" : (partner?.name ?? "them")}
                </span>
                <span className="block truncate text-xs text-[var(--color-muted)]">
                  {replyTo.body}
                </span>
              </span>
              <button
                type="button"
                className="grid size-6 shrink-0 place-items-center rounded-full text-[var(--color-faint)] hover:text-[var(--color-text)]"
                aria-label="Cancel reply"
                onClick={() => setReplyTo(null)}
              >
                <Icon name="cross" size={13} />
              </button>
            </div>
          )}
          <div className={`composer ${focused ? "composer-on" : ""}`}>
            <textarea
              ref={composer}
              rows={1}
              className="composer-field"
              value={draft}
              maxLength={2000}
              placeholder="Write something"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(e) => {
                setDraft(e.target.value);
                grow();
                lane.current?.poke();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            {draft.length > 1700 && (
              <span className="self-center pb-1 text-2xs tabular-nums text-[var(--color-faint)]">
                {2000 - draft.length}
              </span>
            )}
            <button
              type="button"
              className={`grid size-9 shrink-0 place-items-center rounded-full transition ${
                draft.trim() && !busy
                  ? "bg-[linear-gradient(135deg,var(--color-primary)_0%,var(--color-primary-deep)_100%)] text-white shadow-[0_4px_14px_-6px_rgba(130,83,234,0.9)] hover:-translate-y-px hover:shadow-[0_6px_18px_-6px_rgba(130,83,234,1)] active:translate-y-0"
                  : "cursor-not-allowed border border-[var(--color-line)] text-[var(--color-faint)]"
              }`}
              disabled={busy || !draft.trim()}
              onPointerDown={(ev) => ev.preventDefault()}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => {
                composer.current?.focus();
                void send();
              }}
              aria-label="Send message"
            >
              <Icon name="send" size={16} className={busy ? "opacity-50" : ""} />
            </button>
          </div>
          <p className="hidden px-2 pt-1.5 text-center text-2xs text-[var(--color-faint)] lg:block">
            Enter sends · Shift+Enter starts a new line
          </p>
          {problem && (
            <p className="px-2 pt-1.5 text-xs text-[var(--color-bad)]">
              {problem}
            </p>
          )}
          </div>
        ) : (
          <p className="shrink-0 border-t border-[var(--color-line)] px-4 py-3 text-sm text-[var(--color-muted)]">
            One of you has stopped following the other, so this conversation is
            closed. What was said stays here.
          </p>
        )}
        </div>

        {hold &&
          createPortal(
            <>
              <div
                className="lift-veil"
                onPointerDown={() => setHold(null)}
                onTouchStart={() => setHold(null)}
              />

              <div
                className="lift-card"
                data-theme={openWith ? (themes[openWith] ?? "plain") : "plain"}
                style={{
                  top: hold.cardTop,
                  left: hold.cardLeft,
                  width: hold.cardWidth,
                }}
              >
                <div
                  className={`px-4 py-2.5 text-[15px] leading-[1.45] [overflow-wrap:anywhere] ${
                    hold.mine
                      ? "rounded-2xl rounded-br-md bg-[image:var(--chat-mine)] text-[color:var(--chat-mine-ink)]"
                      : "rounded-2xl rounded-bl-md border border-[color:var(--chat-line)] bg-[color:var(--chat-theirs)] text-[color:var(--chat-ink)]"
                  }`}
                >
                  <p className="line-clamp-6 whitespace-pre-wrap">
                    {hold.message.body}
                  </p>
                </div>
              </div>

              <div
                className="lift-menu surface w-[216px] overflow-hidden p-1 shadow-lg"
                style={{ top: hold.menuTop, left: hold.menuLeft }}
                onPointerDown={(ev) => ev.stopPropagation()}
                onTouchStart={(ev) => ev.stopPropagation()}
              >
                <div className="mb-1 flex items-center justify-between gap-0.5 border-b border-[var(--color-line)] px-1 pb-1.5">
                  {REACTIONS.map((facePick) => (
                    <button
                      key={facePick}
                      type="button"
                      aria-label={`React with ${facePick}`}
                      className="grid size-8 place-items-center rounded-full text-lg transition active:scale-90 active:bg-[rgba(163,145,224,0.16)]"
                      onClick={() => {
                        const id = hold.message.id;
                        setHold(null);
                        void tapReaction(id, facePick);
                      }}
                    >
                      {facePick}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2.5 text-left text-sm transition hover:bg-[rgba(163,145,224,0.08)] active:bg-[rgba(163,145,224,0.16)]"
                  onClick={() => {
                    setReplyTo(hold.message);
                    setHold(null);
                    composer.current?.focus();
                  }}
                >
                  <Icon name="reply" size={15} />
                  Reply
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2.5 text-left text-sm transition hover:bg-[rgba(163,145,224,0.08)] active:bg-[rgba(163,145,224,0.16)]"
                  onClick={() => {
                    const text = hold.message.body;
                    setHold(null);
                    void copyOut(text);
                  }}
                >
                  <Icon name="copy" size={15} />
                  Copy
                </button>
                {hold.mine ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2.5 text-left text-sm text-[var(--color-bad)] transition hover:bg-[rgba(242,85,90,0.1)] active:bg-[rgba(242,85,90,0.2)]"
                    onClick={() => {
                      const id = hold.message.id;
                      setHold(null);
                      void undoMessage(id);
                    }}
                  >
                    <Icon name="trash" size={15} />
                    Take it back
                  </button>
                ) : (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2.5 text-left text-sm text-[var(--color-bad)] transition hover:bg-[rgba(242,85,90,0.1)] active:bg-[rgba(242,85,90,0.2)]"
                    onClick={() => {
                      setReporting(hold.message);
                      setReason("");
                      setReportState("idle");
                      setProblem(null);
                      setHold(null);
                    }}
                  >
                    <Icon name="flag" size={15} />
                    Report
                  </button>
                )}
              </div>
            </>,
            document.body,
          )}


        {picker !== null &&
          createPortal(
            <div
              className="surface fixed z-50 flex gap-0.5 p-1 shadow-lg"
              style={{ top: picker.top, left: picker.left }}
              onClick={(ev) => ev.stopPropagation()}
            >
              {REACTIONS.map((face) => (
                <button
                  key={face}
                  type="button"
                  className="grid size-8 place-items-center rounded-full text-base transition hover:bg-[rgba(163,145,224,0.12)]"
                  onClick={() => void tapReaction(picker.id, face)}
                >
                  {face}
                </button>
              ))}
            </div>,
            document.body,
          )}
      </div>
    );
  }

  if (list === null) return <FeedSkeleton rows={3} />;

  if (list.length === 0 && people.length === 0) {
    return (
      <Blank
        icon="reply"
        title="Nobody to write to yet"
        lead="You can write to anyone who follows you back. Open their page and press Message."
      />
    );
  }

  const rows = merge(list, people);

  return (
    <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[rgba(163,145,224,0.05)] sm:px-5"
            onClick={() => setOpenWith(r.id)}
          >
            <Avatar
              src={r.avatar}
              name={r.name}
              size={42}
              accent={accentColor(r.accent)}
              shape={r.shape}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1">
                  <span
                    className={`truncate text-sm ${
                      r.unread > 0 ? "font-semibold" : "font-medium"
                    }`}
                  >
                    {r.name}
                  </span>
                  {r.verified && <Verified size={12} />}
                </span>
                {r.when && (
                  <span className="shrink-0 text-2xs text-[var(--color-faint)]">
                    {relativeTime(r.when)}
                  </span>
                )}
              </span>
              <span
                className={`mt-0.5 block truncate text-xs ${
                  r.unread > 0
                    ? "text-[var(--color-text)]"
                    : "text-[var(--color-muted)]"
                }`}
              >
                {r.preview === null ? (
                  <span className="text-[var(--color-faint)]">
                    @{r.login} · you follow each other
                  </span>
                ) : (
                  <>
                    {r.fromMe && (
                      <span className="text-[var(--color-faint)]">You: </span>
                    )}
                    {r.preview}
                  </>
                )}
              </span>
            </span>
            {r.unread > 0 && (
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-2xs font-semibold text-[#0a0912]">
                {r.unread > 9 ? "9+" : r.unread}
              </span>
            )}
          </button>
        </li>
      ))}

      {blockedList.length > 0 && (
        <li>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-[var(--color-faint)] transition hover:text-[var(--color-muted)] sm:px-5"
            onClick={() => setOpenBlocks((v) => !v)}
          >
            <Icon
              name="chevron"
              size={12}
              className={openBlocks ? "rotate-90" : ""}
            />
            Blocked {blockedList.length}
          </button>

          {openBlocks && (
            <ul className="border-t border-[var(--color-line)]">
              {blockedList.map((b) => (
                <li
                  key={b.other_id}
                  className="flex items-center gap-3 px-4 py-2.5 sm:px-5"
                >
                  <Avatar
                    src={b.avatar_url}
                    name={b.shown_name}
                    size={30}
                    accent={accentColor(b.accent)}
                    shape={b.avatar_shape}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-muted)]">
                    {b.shown_name}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-2xs text-[var(--color-link)] hover:underline"
                    onClick={() => {
                      void unblockPerson(b.other_id).then(async () => {
                        const [blocks, mutuals] = await Promise.all([
                          loadBlocks(),
                          loadMutualPeople(),
                        ]);
                        setBlockedList(blocks);
                        setPeople(mutuals);
                      });
                    }}
                  >
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          )}
        </li>
      )}
    </ul>
  );
}
