import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { friendlyDbError } from "./dbError";
import type { AccentId, AvatarShape } from "./profile";

export interface Conversation {
  other_id: string;
  gh_login: string;
  shown_name: string;
  avatar_url: string | null;
  accent: AccentId;
  avatar_shape: AvatarShape;
  last_body: string;
  last_at: string;
  last_from_me: boolean;
  unread: number;
  still_open: boolean;
  verified: boolean;
}

export interface Message {
  id: string;
  from_id: string;
  to_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
  reply_to: string | null;
}

export interface Person {
  other_id: string;
  gh_login: string;
  shown_name: string;
  avatar_url: string | null;
  accent: AccentId;
  avatar_shape: AvatarShape;
  verified: boolean;
}

export interface Blocked extends Person {
  at: string;
}

export interface Reaction {
  message_id: string;
  user_id: string;
  emoji: string;
}

export interface ChatLane {
  poke: () => void;
  hush: () => void;
  touch: () => void;
  leave: () => void;
}

export const REACTIONS = [
  "\u{1F44D}",
  "❤️",
  "\u{1F602}",
  "\u{1F62E}",
  "\u{1F622}",
  "\u{1F64F}",
] as const;

export const CHAT_THEMES = [
  { id: "plain", label: "Plain", swatch: "linear-gradient(135deg,#8253ea,#5621ca)" },
  { id: "love", label: "Love", swatch: "linear-gradient(135deg,#cc407a,#a3216b)" },
  { id: "game", label: "Arcade", swatch: "linear-gradient(135deg,#228191,#1d5fb0)" },
  { id: "money", label: "Money", swatch: "linear-gradient(135deg,#1f7f52,#14603f)" },
  { id: "forest", label: "Forest", swatch: "linear-gradient(135deg,#27855a,#1b6a52)" },
  { id: "sunset", label: "Sunset", swatch: "linear-gradient(135deg,#b65d2e,#c0246d)" },
  { id: "ocean", label: "Ocean", swatch: "linear-gradient(135deg,#3b76c5,#1f3f96)" },
  { id: "paper", label: "Daylight", swatch: "linear-gradient(135deg,#ece7dd,#c9c2b6)" },
  { id: "mono", label: "Quiet", swatch: "linear-gradient(135deg,#4a4a56,#2c2c36)" },
] as const;

export type ChatTheme = (typeof CHAT_THEMES)[number]["id"];

export async function loadConversations(): Promise<Conversation[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_conversations");
  if (error) return null;
  return (data as unknown as Conversation[]) ?? [];
}

export async function loadThread(
  otherId: string,
  limit = 200,
): Promise<Message[] | null> {
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const me = sessionData.session?.user.id;
  if (!me) return null;

  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, from_id, to_id, body, created_at, read_at, deleted_at, reply_to",
    )
    .or(
      `and(from_id.eq.${me},to_id.eq.${otherId}),and(from_id.eq.${otherId},to_id.eq.${me})`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return null;
  return ((data as unknown as Message[]) ?? []).reverse();
}

export async function sendMessage(
  toId: string,
  body: string,
  replyTo?: string | null,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { data: sessionData } = await supabase.auth.getSession();
  const me = sessionData.session?.user.id;
  if (!me) return "Sign in first.";

  const { error } = await supabase.from("messages").insert({
    from_id: me,
    to_id: toId,
    body: body.trim(),
    reply_to: replyTo ?? null,
  });
  return error ? friendlyDbError(error) : null;
}

export async function takeBack(id: string): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  return error ? friendlyDbError(error) : null;
}

export async function markRead(otherId: string): Promise<void> {
  if (!supabase) return;
  await supabase.rpc("mark_conversation_read", { other: otherId });
}

export async function reportMessage(
  id: string,
  why: string,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("report_message", {
    message: id,
    why: why.trim(),
  });
  return error ? friendlyDbError(error) : null;
}

export async function loadMutualPeople(): Promise<Person[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("mutual_people");
  if (error) return [];
  return (data as unknown as Person[]) ?? [];
}

export async function clearConversation(
  otherId: string,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("clear_conversation", { other: otherId });
  return error ? friendlyDbError(error) : null;
}

export async function blockPerson(otherId: string): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("block_person", { other: otherId });
  return error ? friendlyDbError(error) : null;
}

export async function unblockPerson(otherId: string): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("unblock_person", { other: otherId });
  return error ? friendlyDbError(error) : null;
}

export async function loadBlocks(): Promise<Blocked[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("my_blocks");
  if (error) return [];
  return (data as unknown as Blocked[]) ?? [];
}

export async function amIBlocking(otherId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("blocks")
    .select("blocked_id")
    .eq("blocked_id", otherId)
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

export async function loadReactions(ids: string[]): Promise<Reaction[]> {
  if (!supabase || ids.length === 0) return [];
  const { data, error } = await supabase
    .from("message_reactions")
    .select("message_id, user_id, emoji")
    .in("message_id", ids);
  if (error) return [];
  return (data as unknown as Reaction[]) ?? [];
}

export async function react(
  messageId: string,
  emoji: string | null,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { data: sessionData } = await supabase.auth.getSession();
  const me = sessionData.session?.user.id;
  if (!me) return "Sign in first.";

  const { data: standing } = await supabase
    .from("message_reactions")
    .select("emoji")
    .eq("message_id", messageId)
    .eq("user_id", me)
    .maybeSingle();

  if (emoji === null || standing?.emoji === emoji) {
    const { error } = await supabase
      .from("message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", me);
    return error ? friendlyDbError(error) : null;
  }

  if (standing) {
    const { error } = await supabase
      .from("message_reactions")
      .update({ emoji })
      .eq("message_id", messageId)
      .eq("user_id", me);
    return error ? friendlyDbError(error) : null;
  }

  const { error } = await supabase
    .from("message_reactions")
    .insert({ message_id: messageId, user_id: me, emoji });
  return error ? friendlyDbError(error) : null;
}

export async function loadChatThemes(): Promise<Record<string, ChatTheme>> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc("my_chat_themes");
  if (error) return {};
  const out: Record<string, ChatTheme> = {};
  for (const row of (data as { other_id: string; theme: ChatTheme }[]) ?? []) {
    out[row.other_id] = row.theme;
  }
  return out;
}

export async function setChatTheme(
  otherId: string,
  choice: ChatTheme,
): Promise<string | null> {
  if (!supabase) return "No connection.";
  const { error } = await supabase.rpc("set_chat_theme", {
    other: otherId,
    choice,
  });
  return error ? friendlyDbError(error) : null;
}

export async function friendsSince(otherId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("friends_since", {
    other: otherId,
  });
  if (error || typeof data !== "string") return null;
  return data;
}

export async function joinChat(
  otherId: string,
  onTyping: (on: boolean) => void,
  onTouch: () => void = () => {},
): Promise<ChatLane | null> {
  if (!supabase) return null;
  const client = supabase;

  const { data: key, error } = await client.rpc("chat_key", { other: otherId });
  if (error || typeof key !== "string") return null;

  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (token) await client.realtime.setAuth(token);

  const lane = client.channel(`chat-${key}`, {
    config: { broadcast: { self: false } },
  });

  const tag = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  let ready = false;

  lane
    .on("broadcast", { event: "typing" }, (msg) => {
      const note = (msg as { payload?: { tag?: string; on?: boolean } }).payload;
      if (note?.tag === tag) return;
      onTyping(note?.on !== false);
    })
    .on("broadcast", { event: "touch" }, (msg) => {
      const note = (msg as { payload?: { tag?: string } }).payload;
      if (note?.tag === tag) return;
      onTouch();
    })
    .subscribe((status) => {
      ready = status === "SUBSCRIBED";
    });

  let last = 0;
  return {
    poke() {
      const now = Date.now();
      if (!ready || now - last < 2200) return;
      last = now;
      void lane.send({
        type: "broadcast",
        event: "typing",
        payload: { tag, on: true },
      });
    },
    hush() {
      last = 0;
      if (!ready) return;
      void lane.send({
        type: "broadcast",
        event: "typing",
        payload: { tag, on: false },
      });
    },
    touch() {
      if (!ready) return;
      void lane.send({ type: "broadcast", event: "touch", payload: { tag } });
    },
    leave() {
      void client.removeChannel(lane);
    },
  };
}

export async function unreadTotal(): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("unread_mail");
  if (error) return 0;
  return typeof data === "number" ? data : 0;
}

export function watchMail(onPing: () => void): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  let channel: RealtimeChannel | null = null;
  let key: string | null = null;
  let dropped = false;
  let retiring = false;
  let attempt = 0;
  let retry: number | null = null;

  function schedule(): void {
    if (dropped || retry !== null) return;
    const wait = Math.min(20000, 1000 * 2 ** attempt);
    attempt += 1;
    retry = window.setTimeout(() => {
      retry = null;
      void connect();
    }, wait);
  }

  async function connect(): Promise<void> {
    if (dropped) return;
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    if (!key) {
      const { data: fetched } = await client.rpc("my_mail_key");
      key = typeof fetched === "string" ? fetched : null;
    }
    if (!key || dropped) return;

    await client.realtime.setAuth(token);
    if (dropped) return;

    if (channel) {
      retiring = true;
      void client.removeChannel(channel);
      channel = null;
    }

    channel = client
      .channel(`mail-${key}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mail_pings",
          filter: `key=eq.${key}`,
        },
        () => {
          attempt = 0;
          onPing();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          attempt = 0;
          retiring = false;
          if (retry !== null) {
            window.clearTimeout(retry);
            retry = null;
          }
          return;
        }
        if (status === "CLOSED" && retiring) {
          retiring = false;
          return;
        }
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          schedule();
        }
      });
  }

  function wakeUp(): void {
    if (dropped || document.visibilityState !== "visible") return;
    onPing();
    const state = channel?.state;
    if (state !== "joined" && state !== "joining") {
      attempt = 0;
      if (retry !== null) {
        window.clearTimeout(retry);
        retry = null;
      }
      void connect();
    }
  }

  document.addEventListener("visibilitychange", wakeUp);
  window.addEventListener("focus", wakeUp);
  window.addEventListener("online", wakeUp);

  const watcher = client.auth.onAuthStateChange((event, session) => {
    if (!session || dropped) return;
    if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
      void client.realtime.setAuth(session.access_token);
    }
  });

  void connect();

  return () => {
    dropped = true;
    if (retry !== null) window.clearTimeout(retry);
    document.removeEventListener("visibilitychange", wakeUp);
    window.removeEventListener("focus", wakeUp);
    window.removeEventListener("online", wakeUp);
    watcher.data.subscription.unsubscribe();
    if (channel) void client.removeChannel(channel);
  };
}

export async function canMessage(otherId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data: sessionData } = await supabase.auth.getSession();
  const me = sessionData.session?.user.id;
  if (!me || me === otherId) return false;

  const { data, error } = await supabase.rpc("follow_is_mutual", {
    one: me,
    two: otherId,
  });
  if (error) return false;
  return data === true;
}
