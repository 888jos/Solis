// Quest IRL talking sketches (TikTok / Reels, 20-25 s), written 11/11/2026.
// Format: the heroes talk on camera (lip sync), no text added on screen: captions are the transcript of the voice.
// Every script ends on a spoken app plug by the level 6 hero (like a creator plugging their own merch).
// image = mediaAssets key (path relative to carousel-factory/content/heroes), or null when the shot still has to be made.

export type Speaker = "lipsync" | "voiceover" | "none";

export type Shot = {
  time: string;
  plan: string;
  image: string | null;
  /** What is missing when image is null, or a note on the image (crop, montage). */
  imageNote?: string;
  /** Who speaks, e.g. "Sylas L1". */
  who: string;
  speaker: Speaker;
  /** Spoken line (English, US) = the caption. Empty when nobody speaks. */
  line: string;
  sound: string;
  /** The final app plug. */
  promo?: boolean;
};

export type VideoScript = {
  id: string;
  hero: string;
  title: string;
  duration: string;
  hooks: string[];
  caption: string;
  shots: Shot[];
  missing: { fish: string[]; captures: string[]; montage: string[] };
  note?: string;
};

const V4 = "fish_out/v4";

export const SCRIPTS: VideoScript[] = [
  {
    id: "sylas_one_more_video",
    hero: "sylas",
    title: "Sylas — « just one more video »",
    duration: "~27 s",
    hooks: ["I'm sleeping early tonight. …Okay, it's 3am.", "My screen time report just roasted me."],
    caption: "Level 1 me vs the version that sleeps at 10:30.",
    shots: [
      { time: "0-3 s", plan: "Sylas L1 au lit dans le noir, visage éclairé par l'écran, il parle à son téléphone.", image: null, imageNote: "À générer : Sylas L1 au lit la nuit (reprendre la composition de 3AM-03).", who: "Sylas L1", speaker: "lipsync", line: "Okay, one more and then I'm going to bed. For real.", sound: "Ambiance chambre la nuit, scroll" },
      { time: "3-6 s", plan: "Même plan, zoom lent, yeux de plus en plus rouges ; le réveil de la table de nuit passe de 11:04 à 3:47.", image: null, imageNote: "Même image que le plan 1, réveil changé au montage.", who: "Sylas L1", speaker: "lipsync", line: "Wait… how is it 3:47?", sound: "Tic-tac accéléré puis silence" },
      { time: "6-8 s", plan: "Le téléphone lui tombe sur la figure.", image: null, imageNote: "Même image, secousse au montage.", who: "Sylas L1", speaker: "voiceover", line: "Ow. Right in the face.", sound: "« bonk »" },
      { time: "8-12 s", plan: "Midi : il recule devant le soleil comme un vampire.", image: `${V4}/keyframes/sylas_curtains/CURT-03_vampire.jpg`, who: "Sylas L1", speaker: "lipsync", line: "It's noon?? Why am I so tired?", sound: "Sizzle de vampire" },
      { time: "12-14 s", plan: "Sylas L6 est debout dans la chambre de L1, bras croisés, en contre-jour.", image: null, imageNote: "À générer : Sylas L6 dans la chambre en bazar de L1, à midi, rideaux ouverts.", who: "Sylas L6", speaker: "lipsync", line: "Maybe 'cause you watched a guy clean a rug for four hours, genius.", sound: "La musique coupe net" },
      { time: "14-16 s", plan: "Sylas L1 plisse les yeux, perdu.", image: `${V4}/keyframes/sylas_curtains/CURT-03_vampire.jpg`, imageNote: "Recadrer serré sur le visage.", who: "Sylas L1", speaker: "lipsync", line: "Uh… who are you?", sound: "Silence, un oiseau" },
      { time: "16-19 s", plan: "Sylas L6, calme, s'approche.", image: null, imageNote: "Même image que le plan 5, recadrée plus serré.", who: "Sylas L6", speaker: "lipsync", line: "I'm you in ten weeks. If you put the phone down at ten-thirty tonight.", sound: "Musique cosy" },
      { time: "19-21 s", plan: "Vraie capture : pop-up Sleep 8 Hours +12 PTS.", image: null, imageNote: "Capture app à faire (pop-up Sleep 8 Hours +12).", who: "Sylas L6", speaker: "voiceover", line: "Eight hours, twelve points. Crazy what sleep does, huh?", sound: "Jingle XP" },
      { time: "21-27 s", plan: "Promo : Sylas L6 pointe le téléphone qu'il tient, regard caméra.", image: `${V4}/cta/CTA_sylas_app.jpg`, who: "Sylas L6", speaker: "lipsync", line: "It's called Quest IRL. Your life, but as an RPG. And yeah, sleeping counts. It's free on the App Store. Now go to bed, gremlin.", sound: "Fin de la musique", promo: true },
    ],
    missing: { fish: ["Sylas L1 au lit la nuit, téléphone au-dessus du visage", "Sylas L6 dans la chambre de L1 à midi"], captures: ["Pop-up Sleep 8 Hours +12 PTS"], montage: ["Réveil 11:04 → 3:47"] },
  },
  {
    id: "aldric_monday",
    hero: "aldric",
    title: "Aldric — « je commence lundi »",
    duration: "~23 s",
    hooks: ["New week, new me. Starting Monday.", "I bought gym clothes. That counts, right?"],
    caption: "The trick was not waiting for Monday.",
    shots: [
      { time: "0-3 s", plan: "Aldric L1 au lit, il scrolle et parle au téléphone, très sûr de lui.", image: `${V4}/scenes/F2_aldric_L1_bed_3am.jpg`, imageNote: "Plan large : recadrer serré sur le visage pour le lip sync.", who: "Aldric L1", speaker: "lipsync", line: "Okay, Monday. I'm starting Monday. For real this time.", sound: "Musique épique" },
      { time: "3-5 s", plan: "Aldric L6 apparaît dans l'embrasure de la porte.", image: `${V4}/keyframes/aldric_3am/3AM-02_door.jpg`, who: "Aldric L6", speaker: "voiceover", line: "You said that last Monday, you clown. And the Monday before that.", sound: "La musique coupe net" },
      { time: "5-7 s", plan: "Le téléphone tombe sur Aldric L1, paniqué.", image: `${V4}/keyframes/aldric_3am/3AM-03_phone_falls.jpg`, who: "Aldric L1", speaker: "lipsync", line: "Bro, who even are you?", sound: "« bonk »" },
      { time: "7-10 s", plan: "L6 bras croisés au pied du lit.", image: `${V4}/keyframes/aldric_3am/3AM-04_knight_arms_crossed.jpg`, who: "Aldric L6", speaker: "lipsync", line: "I'm you in ten weeks. If you stop saying Monday. On the floor, now.", sound: "Silence gênant" },
      { time: "10-14 s", plan: "L1 fait des pompes, L6 compte au-dessus de lui.", image: `${V4}/keyframes/aldric_3am/3AM-06_pushup.jpg`, who: "Aldric L6 / L1", speaker: "voiceover", line: "One… two… come on, noodle arms… ten. / I'm literally gonna die.", sound: "Halètements" },
      { time: "14-17 s", plan: "Vraie capture : pop-up Skills gained +14 PTS, puis étincelles.", image: `${V4}/keyframes/aldric_3am/3AM-07_fade.jpg`, imageNote: "Avant : capture app_screens/06_popup_points_confetti.png (existe déjà).", who: "Aldric L1", speaker: "voiceover", line: "Wait, fourteen points? For ten push-ups?", sound: "Jingle XP" },
      { time: "17-23 s", plan: "Promo : Aldric L6 pointe le téléphone qu'il tient, regard caméra.", image: `${V4}/cta/CTA_aldric_app.jpg`, who: "Aldric L6", speaker: "lipsync", line: "Yep. On a Sunday. That's Quest IRL, your life but as an RPG. It's free on the App Store. Same time tomorrow, princess.", sound: "Fin du jingle", promo: true },
    ],
    missing: { fish: [], captures: [], montage: ["Rien d'autre"] },
  },
  {
    id: "lorian_call",
    hero: "lorian",
    title: "Lorian — « quand quelqu'un t'appelle au lieu d'écrire »",
    duration: "~27 s",
    hooks: ["My phone is ringing. Nobody warned me.", "Who raised you to call without texting first?"],
    caption: "Still not answering Jake. But I called my mom.",
    shots: [
      { time: "0-3 s", plan: "Lorian L1 sur le canapé, le téléphone sonne, il le fixe.", image: `${V4}/keyframes/lorian_mom/MOM-02B_notification.jpg`, imageNote: "Écran d'appel entrant « Jake » incrusté sur le téléphone au montage.", who: "Lorian L1", speaker: "lipsync", line: "Why is he calling me? Who even calls anymore?", sound: "Sonnerie trop forte" },
      { time: "3-5 s", plan: "Gros plan : le téléphone vibre dans sa main.", image: `${V4}/keyframes/lorian_mom/MOM-02_notification.jpg`, who: "Lorian L1", speaker: "voiceover", line: "Just text me like a normal person, psycho.", sound: "Vibrations, musique d'horreur" },
      { time: "5-7 s", plan: "Le téléphone est jeté face contre le coussin.", image: `${V4}/keyframes/lorian_mom/MOM-03_guilty.jpg`, who: "Lorian L1", speaker: "lipsync", line: "I'll text 'sorry, missed your call' in like forty minutes.", sound: "Sonnerie étouffée" },
      { time: "7-10 s", plan: "Plan large, seul dans le salon en bazar.", image: `${V4}/keyframes/lorian_mom/MOM-03C_guilty_sofa.jpg`, who: "Lorian L1", speaker: "voiceover", line: "Also, I haven't called my mom in like three weeks. Cool. Great.", sound: "Piano triste" },
      { time: "10-12 s", plan: "Lorian L6 débarque et attrape Lorian L1 par le col.", image: null, imageNote: "À générer : Lorian L6 qui attrape Lorian L1 par le col dans le salon en bazar.", who: "Lorian L6", speaker: "lipsync", line: "Three weeks?? You monster.", sound: "Porte qui claque, musique coupée" },
      { time: "12-14 s", plan: "Lorian L1, soulevé par le col, terrorisé.", image: null, imageNote: "Même image, recadrée sur L1.", who: "Lorian L1", speaker: "lipsync", line: "Wait, wait— who are you?", sound: "Silence" },
      { time: "14-17 s", plan: "Lorian L6, nez à nez avec lui.", image: null, imageNote: "Même image, recadrée sur L6.", who: "Lorian L6", speaker: "lipsync", line: "I'm you in ten weeks. If you call your mom. Tonight.", sound: "Note de luth" },
      { time: "17-19 s", plan: "Vraie capture : carte « Call Someone ».", image: null, imageNote: "Capture app à faire (carte Call Someone).", who: "Lorian L1", speaker: "voiceover", line: "Okay. One call. Just one.", sound: "Tap" },
      { time: "19-23 s", plan: "Il appelle, sous la lampe, il sourit.", image: `${V4}/keyframes/lorian_mom/MOM-04C_calls_lamp.jpg`, who: "Lorian L1", speaker: "lipsync", line: "Hey mom… no, no, nothing's wrong. I just wanted to hear your voice.", sound: "Musique cosy" },
      { time: "23-29 s", plan: "Promo : Lorian L6 pointe le téléphone qu'il tient, regard caméra.", image: `${V4}/cta/CTA_lorian_app.jpg`, who: "Lorian L6", speaker: "lipsync", line: "She cried. You leveled up. That's Quest IRL, your life but as an RPG. It's free on the App Store. Still dodging Jake though, coward.", sound: "Jingle level up", promo: true },
    ],
    missing: { fish: ["Lorian L6 qui attrape Lorian L1 par le col"], captures: ["Carte de quête Call Someone"], montage: ["Écran d'appel entrant « Jake »"] },
  },
  {
    id: "merion_books",
    hero: "merion",
    title: "Merion — « 14 livres achetés, 0 lus »",
    duration: "~27 s",
    hooks: ["I don't read books, I collect them.", "Buying a fifteenth book. That'll fix it."],
    caption: "10 pages a day. Book #1 is finally out of the plastic.",
    note: "Plans 3, 4 et 6 : les keyframes TABS montrent Merion L6 (robe violette) dans l'appart. 2 images en plus si on veut un L1 cohérent.",
    shots: [
      { time: "0-3 s", plan: "Merion L1 devant une tour de livres sous plastique, fier, face caméra.", image: null, imageNote: "À générer : Merion L1 (cheveux gris, manteau vert) + pile de livres sous blister dans son studio.", who: "Merion L1", speaker: "lipsync", line: "So this year I bought fourteen books. Read? Zero.", sound: "Froissement de plastique" },
      { time: "3-6 s", plan: "Même image, il tapote un livre emballé.", image: null, imageNote: "Même image, recadrée.", who: "Merion L1", speaker: "lipsync", line: "This one's about discipline. Still in the plastic. Kinda ironic.", sound: "Grillon" },
      { time: "6-9 s", plan: "Il scrolle au bureau la nuit.", image: `${V4}/keyframes/merion_47_tabs/TABS-03_scrolling.jpg`, imageNote: "Merion L6 sur l'image.", who: "Merion", speaker: "voiceover", line: "And now I'm watching a video on how to read more. Super productive. Genius.", sound: "Scroll" },
      { time: "9-11 s", plan: "Merion L6 surgit, lui prend le téléphone et le jette dans le tiroir.", image: `${V4}/keyframes/merion_47_tabs/TABS-05_phone_drawer.jpg`, who: "Merion L6", speaker: "lipsync", line: "Gimme that.", sound: "Tiroir qui claque" },
      { time: "11-13 s", plan: "Merion L1, outré, les mains vides.", image: null, imageNote: "Même image que le plan 1, recadrée sur Merion L1.", who: "Merion L1", speaker: "lipsync", line: "Hey! Who even are you?", sound: "Silence" },
      { time: "13-16 s", plan: "Merion L6 face à lui, sourcil levé.", image: `${V4}/cta/CLOSE_merion_app.jpg`, imageNote: "Recadrer sur le visage, téléphone hors champ.", who: "Merion L6", speaker: "lipsync", line: "I'm you in ten weeks. If you read ten pages a day.", sound: "Whoosh violet" },
      { time: "16-18 s", plan: "Vraie capture : « Read 10 Pages » dans Add a quest.", image: null, imageNote: "Capture existante : app_screens/02_add_quest.png.", who: "Merion", speaker: "voiceover", line: "Ten pages. Not three hundred, ten. Even I can do ten.", sound: "Tap" },
      { time: "18-22 s", plan: "Il lit au bureau sous la lampe (coupes = jours qui passent).", image: `${V4}/keyframes/merion_47_tabs/TABS-06_reading_timer.jpg`, who: "Merion", speaker: "voiceover", line: "Day one. Day two… day five?? Who even is this guy?", sound: "Page tournée à chaque jour" },
      { time: "22-24 s", plan: "Vraie capture : série de 5 jours.", image: null, imageNote: "Capture app à faire (série de 5 jours).", who: "Merion L6", speaker: "voiceover", line: "Five days straight. One book out of the plastic. Thirteen to go, bookworm.", sound: "Whoosh violet" },
      { time: "24-28 s", plan: "Promo : Merion L6 dans sa bibliothèque pointe le téléphone qu'il tient.", image: `${V4}/cta/CTA_merion_app.jpg`, who: "Merion L6", speaker: "lipsync", line: "That's Quest IRL. Your life but as an RPG. It's free on the App Store. Now shoo, I've got pages to read.", sound: "Jingle", promo: true },
    ],
    missing: { fish: ["Merion L1 devant la pile de livres sous plastique", "(option) Merion L1 qui scrolle + qui lit"], captures: ["Série de 5 jours"], montage: ["Rien d'autre"] },
  },
];
