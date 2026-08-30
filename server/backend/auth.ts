import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { sessions, users, workspaceMemberships } from "@/db/schema";
import { now } from "@/server/backend/http";
import { ensureWorkspace } from "@/server/backend/workspaces";

export const DEFAULT_WORKSPACE_ID = "drift-studio";
export type SessionUser = {
  email: string;
  id: string;
  name: string;
};

export const LOCAL_USER: SessionUser = {
  email: "contact@driftstudio.app",
  id: "local-user-josselin",
  name: "Josselin Biot",
};

const SESSION_COOKIE = "driftos_session";
const SESSION_DAYS = 365;

function expiresFrom(date: Date) {
  const expiresAt = new Date(date);
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);
  return expiresAt;
}

export type LocalSession = {
  id: string;
  user: SessionUser;
  workspaceId: string;
};

async function resolveSessionUser(): Promise<SessionUser> {
  const chatGPTUser = await getChatGPTUser().catch(() => null);
  if (!chatGPTUser?.email) return LOCAL_USER;

  const email = chatGPTUser.email.trim().toLowerCase();
  return {
    email,
    id: userIdFromEmail(email),
    name: chatGPTUser.fullName?.trim() || chatGPTUser.displayName?.trim() || email,
  };
}

function userIdFromEmail(email: string) {
  const slug = email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `user-${slug || "authenticated"}`;
}

export async function getOrCreateLocalSession(): Promise<LocalSession> {
  const db = await getDb();
  const timestamp = now();
  const sessionUser = await resolveSessionUser();
  await ensureWorkspace(db, DEFAULT_WORKSPACE_ID);

  const [existingUser] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  if (existingUser) {
    await db.update(users).set({ email: sessionUser.email, lastSeenAt: timestamp, name: sessionUser.name, updatedAt: timestamp }).where(eq(users.id, sessionUser.id));
  } else {
    await db.insert(users).values({
      ...sessionUser,
      avatarUrl: null,
      createdAt: timestamp,
      lastSeenAt: timestamp,
      updatedAt: timestamp,
    });
  }

  const [membership] = await db
    .select()
    .from(workspaceMemberships)
    .where(and(eq(workspaceMemberships.workspaceId, DEFAULT_WORKSPACE_ID), eq(workspaceMemberships.userId, sessionUser.id)))
    .limit(1);
  if (!membership) {
    await db.insert(workspaceMemberships).values({
      id: crypto.randomUUID(),
      createdAt: timestamp,
      role: "owner",
      updatedAt: timestamp,
      userId: sessionUser.id,
      workspaceId: DEFAULT_WORKSPACE_ID,
    });
  }

  const cookieStore = await cookies();
  const cookieSessionId = cookieStore.get(SESSION_COOKIE)?.value;
  const [storedSession] = cookieSessionId
    ? await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, cookieSessionId), eq(sessions.userId, sessionUser.id), gt(sessions.expiresAt, timestamp)))
      .limit(1)
    : [];

  const sessionId = storedSession?.id ?? crypto.randomUUID();
  const expiresAt = expiresFrom(timestamp);
  if (storedSession) {
    await db.update(sessions).set({ expiresAt, lastSeenAt: timestamp, updatedAt: timestamp }).where(eq(sessions.id, storedSession.id));
  } else {
    await db.insert(sessions).values({
      id: sessionId,
      createdAt: timestamp,
      expiresAt,
      lastSeenAt: timestamp,
      updatedAt: timestamp,
      userId: sessionUser.id,
      workspaceId: DEFAULT_WORKSPACE_ID,
    });
  }

  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return { id: sessionId, user: sessionUser, workspaceId: DEFAULT_WORKSPACE_ID };
}

export function requestWorkspaceId(request: Request, fallback = DEFAULT_WORKSPACE_ID) {
  const { searchParams } = new URL(request.url);
  return searchParams.get("workspaceId") || fallback;
}
