import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users, workspaceMemberships } from "@/db/schema";
import { now } from "@/server/backend/http";
import { ensureWorkspace } from "@/server/backend/workspaces";

export const DEFAULT_WORKSPACE_ID = "drift-studio";
export const LOCAL_USER = {
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
  user: typeof LOCAL_USER;
  workspaceId: string;
};

export async function getOrCreateLocalSession(): Promise<LocalSession> {
  const db = await getDb();
  const timestamp = now();
  await ensureWorkspace(db, DEFAULT_WORKSPACE_ID);

  const [existingUser] = await db.select().from(users).where(eq(users.id, LOCAL_USER.id)).limit(1);
  if (existingUser) {
    await db.update(users).set({ email: LOCAL_USER.email, lastSeenAt: timestamp, name: LOCAL_USER.name, updatedAt: timestamp }).where(eq(users.id, LOCAL_USER.id));
  } else {
    await db.insert(users).values({
      ...LOCAL_USER,
      avatarUrl: null,
      createdAt: timestamp,
      lastSeenAt: timestamp,
      updatedAt: timestamp,
    });
  }

  const [membership] = await db
    .select()
    .from(workspaceMemberships)
    .where(and(eq(workspaceMemberships.workspaceId, DEFAULT_WORKSPACE_ID), eq(workspaceMemberships.userId, LOCAL_USER.id)))
    .limit(1);
  if (!membership) {
    await db.insert(workspaceMemberships).values({
      id: crypto.randomUUID(),
      createdAt: timestamp,
      role: "owner",
      updatedAt: timestamp,
      userId: LOCAL_USER.id,
      workspaceId: DEFAULT_WORKSPACE_ID,
    });
  }

  const cookieStore = await cookies();
  const cookieSessionId = cookieStore.get(SESSION_COOKIE)?.value;
  const [storedSession] = cookieSessionId
    ? await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, cookieSessionId), gt(sessions.expiresAt, timestamp)))
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
      userId: LOCAL_USER.id,
      workspaceId: DEFAULT_WORKSPACE_ID,
    });
  }

  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
    path: "/",
    sameSite: "lax",
    secure: false,
  });

  return { id: sessionId, user: LOCAL_USER, workspaceId: DEFAULT_WORKSPACE_ID };
}

export function requestWorkspaceId(request: Request, fallback = DEFAULT_WORKSPACE_ID) {
  const { searchParams } = new URL(request.url);
  return searchParams.get("workspaceId") || fallback;
}
