// French labels for the ids tracked by the Cocorise app (Firestore analytics_events).
// Order of the onboarding steps = order of the screens in the app (same as the old local dashboard).

export const SUMMARY_STEPS = ["chat_intro", "mission_selection", "mission_intro_demo", "wake_time_target", "alarm_sound_selection", "where_heard_about_us", "quote", "pre_paywall", "auth", "paywall", "completed"];

export const ALL_STEPS = [
  "chat_intro", "age_question", "snoozing_time", "time_after_waking", "reassurance_screen", "goals_selection", "great_morning_vision",
  "goal_showcase_screen", "number_of_alarms", "what_keeps_in_bed", "first_thought", "turn_off_and_sleep", "feeling_at_night",
  "feeling_after_waking", "time_to_feel_awake", "mission_selection", "mission_intro_demo", "usual_wake_time", "ideal_wake_time",
  "wake_time_target", "alarm_sound_selection", "days_selection", "history_card_selection", "where_heard_about_us", "quote",
  "are_you_ready", "commitment", "creation_plan", "pre_paywall", "auth", "paywall", "completed",
];

const STEP_LABELS: Record<string, string> = {
  chat_intro: "Intro chat",
  age_question: "Âge",
  snoozing_time: "Temps de snooze",
  time_after_waking: "Après le réveil",
  reassurance_screen: "Réassurance",
  goals_selection: "Objectifs",
  great_morning_vision: "Matin idéal",
  goal_showcase_screen: "Vitrine des objectifs",
  number_of_alarms: "Nombre d'alarmes",
  what_keeps_in_bed: "Ce qui retient au lit",
  first_thought: "Première pensée",
  turn_off_and_sleep: "Éteint et se rendort",
  feeling_at_night: "Ressenti le soir",
  feeling_after_waking: "Ressenti au réveil",
  time_to_feel_awake: "Temps pour être réveillé",
  mission_selection: "Choix de la mission",
  mission_intro_demo: "Démo de la mission",
  usual_wake_time: "Heure de réveil actuelle",
  ideal_wake_time: "Heure de réveil visée",
  wake_time_target: "Récap de l'objectif",
  alarm_sound_selection: "Choix du son",
  days_selection: "Choix des jours",
  history_card_selection: "Carte historique",
  where_heard_about_us: "Source d'acquisition",
  quote: "Citation",
  are_you_ready: "Prêt pour demain",
  commitment: "Engagement",
  creation_plan: "Création du plan",
  pre_paywall: "Pré-paywall",
  auth: "Connexion",
  paywall: "Paywall",
  completed: "Onboarding terminé",
};

export const stepLabel = (id: string) => STEP_LABELS[id] ?? id;

export const SOURCE_LABELS: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  app_store: "App Store",
  friend: "Un ami",
  other: "Autre",
};

export const FREE_FUNNEL_LABELS: Record<string, string> = {
  soft_paywall_seen: "Soft paywall vu",
  continued_free: "Ont continué en gratuit",
  completed_free: "Ont fini au moins 1 réveil",
  limit_reached: "Limite atteinte",
  premium_unlocked: "Sont passés premium",
};

export const PROVIDER_LABELS: Record<string, string> = {
  anonymous: "Anonyme",
  apple: "Apple",
  google: "Google",
  email: "E-mail",
  password: "E-mail",
};
