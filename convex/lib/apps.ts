// Drift Studio app registry. Single source of truth for app identity across Convex and the UI
// (src/lib/apps.ts re-exports it). Colors are the validated categorical slots 1-3.
export type AppSlug = "cortifree" | "cocorise" | "questirl";

export type StudioApp = {
  slug: AppSlug;
  name: string;
  storeName: string;
  appStoreId: string;
  bundleId: string;
  sku: string;
  colorSlot: 1 | 2 | 3;
};

export const APPS: StudioApp[] = [
  { slug: "cortifree", name: "CortiFree", storeName: "CortiFree: Reset your Stress", appStoreId: "6758314805", bundleId: "com.solstys.cortifree", sku: "CortiFreeIOS001", colorSlot: 1 },
  { slug: "cocorise", name: "Cocorise", storeName: "Cocorise: Anti-Snooze Alarm", appStoreId: "6760921524", bundleId: "com.wrap.cocorise", sku: "CocoriseIOS01", colorSlot: 2 },
  { slug: "questirl", name: "Quest IRL", storeName: "Quest IRL: Gamify Your Life", appStoreId: "6780277417", bundleId: "com.drift.lifequest", sku: "LifeQuest001", colorSlot: 3 },
];

export const APP_SLUGS = APPS.map((app) => app.slug);

export function appBySlug(slug: string): StudioApp | undefined {
  return APPS.find((app) => app.slug === slug);
}

export function appByAppleId(appleId: string): StudioApp | undefined {
  return APPS.find((app) => app.appStoreId === appleId);
}
