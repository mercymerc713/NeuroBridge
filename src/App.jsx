import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";

// ─── Theme ───────────────────────────────────────────────────────────────────
// Color palette tuned for neurodivergent eyes: warm cream bg (dyslexia-friendly,
// low glare), bold saturated accent colors with strong contrast, pastel glows
// that still pop without being harsh.
const lightTheme = {
  bg: "#FFF8F0", surface: "#FFFFFF", text: "#2B2520", soft: "#8B8275",
  primary: "#FF5722", primaryGlow: "#FFEDE5",
  blue: "#2563EB", blueGlow: "#DCE7FF",
  purple: "#7C3AED", purpleGlow: "#EDE1FF",
  green: "#10B981", greenGlow: "#D1FBE7",
  yellow: "#F59E0B", yellowGlow: "#FFF0CC",
  pink: "#EC4899", pinkGlow: "#FFDCEB",
  teal: "#06B6D4", tealGlow: "#CFF4FA",
  border: "#F0EBE3", shadow: "0 4px 20px rgba(43,37,32,0.08)",
  radius: 22, font: "'Baloo 2', cursive", fontAlt: "'Atkinson Hyperlegible', sans-serif",
};
const darkTheme = {
  bg: "#14142B", surface: "#1E1E3F", text: "#F0F0F5", soft: "#9B93B8",
  primary: "#FF6B3D", primaryGlow: "#3A1E15",
  blue: "#5B8CFF", blueGlow: "#192545",
  purple: "#A78BFA", purpleGlow: "#231A3E",
  green: "#34D399", greenGlow: "#152A23",
  yellow: "#FBBF24", yellowGlow: "#2E2415",
  pink: "#F472B6", pinkGlow: "#2E1A28",
  teal: "#22D3EE", tealGlow: "#14262E",
  border: "#2D2D52", shadow: "0 4px 20px rgba(0,0,0,0.4)",
  radius: 22, font: "'Baloo 2', cursive", fontAlt: "'Atkinson Hyperlegible', sans-serif",
};
let T = lightTheme;

// ─── Persistent Storage ──────────────────────────────────────────────────────
// Profile-scoped keys live under `nb_${profileId}_${key}` so multi-child
// profiles can share a device without stepping on each other. The active
// profile prefix is set once at module load by ensureProfileState().
let _profilePrefix = "";
function loadState(key, fallback) {
  try { const v = localStorage.getItem(`nb_${_profilePrefix}${key}`); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveState(key, value) {
  try { localStorage.setItem(`nb_${_profilePrefix}${key}`, JSON.stringify(value)); } catch {}
}
// Global (device-wide) keys bypass the profile prefix: profile list itself,
// active profile pointer, anything meant to be shared across profiles.
function loadGlobalState(key, fallback) {
  try { const v = localStorage.getItem(`nbg_${key}`); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveGlobalState(key, value) {
  try { localStorage.setItem(`nbg_${key}`, JSON.stringify(value)); } catch {}
}
function genId() { return `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

// Establish a profile prefix before any useState initializer runs.
// Migrates pre-multi-profile data (unprefixed nb_foo) into the first profile.
function ensureProfileState() {
  let state = loadGlobalState("profileState", null);
  if (state && state.profiles?.length && state.activeId) {
    _profilePrefix = `${state.activeId}_`;
    return state;
  }
  // First-run — either fresh install or existing data from before profiles shipped.
  const legacyKeys = ["settings", "progress", "habits", "boardView", "customWords", "parentLessons"];
  const firstId = genId();
  const hasLegacy = legacyKeys.some(k => localStorage.getItem(`nb_${k}`) != null);
  if (hasLegacy) {
    // Rename legacy keys into the first profile namespace.
    legacyKeys.forEach(k => {
      const raw = localStorage.getItem(`nb_${k}`);
      if (raw != null) {
        localStorage.setItem(`nb_${firstId}_${k}`, raw);
        localStorage.removeItem(`nb_${k}`);
      }
    });
  }
  state = {
    profiles: [{ id: firstId, name: "Me", emoji: "😊", color: "#6BA3F5" }],
    activeId: firstId,
  };
  saveGlobalState("profileState", state);
  _profilePrefix = `${firstId}_`;
  return state;
}
if (typeof window !== "undefined") { ensureProfileState(); }

// ─── App Context ─────────────────────────────────────────────────────────────
const defaultSettings = {
  ageRange: null,
  kidsMode: false,
  gameTimerMinutes: 0,
  parentPin: "",
  voiceId: "default",
  voiceRate: 0.85,
  voicePitch: 1.0,
  fontSize: "medium",
  fontFamily: "default",
  highContrast: false,
  hapticFeedback: true,
  soundEffects: true,
  voiceGuidance: true,
  reduceMotion: false,
  darkMode: false,
};

// ─── Runtime A11y flags (synced from settings in App.jsx) ────────────────────
// These module-level flags let helpers like speak()/playSfx()/hapticTap()
// respect user preferences without every call site having to know the context.
const a11y = {
  soundEffects: true,
  voiceGuidance: true,
  reduceMotion: false,
  hapticFeedback: true,
};
function syncA11y(s) {
  a11y.soundEffects = s.soundEffects !== false;
  a11y.voiceGuidance = s.voiceGuidance !== false;
  a11y.reduceMotion = !!s.reduceMotion;
  a11y.hapticFeedback = s.hapticFeedback !== false;
}
function hapticTap(ms = 10) {
  if (!a11y.hapticFeedback) return;
  try { navigator.vibrate && navigator.vibrate(ms); } catch {}
}

const defaultProgress = {
  totalStars: 0,
  gamesPlayed: 0,
  wordsSpoken: 0,
  routinesCompleted: 0,
  breathingMinutes: 0,
  focusMinutes: 0,
  streak: 0,
  lastActiveDate: null,
  badges: [],
  dailyLog: {},
};

const badgeDefs = [
  { id: "first_game", emoji: "🎮", label: "First Game", desc: "Play your first game", check: p => p.gamesPlayed >= 1 },
  { id: "five_games", emoji: "🏆", label: "Game Pro", desc: "Play 5 games", check: p => p.gamesPlayed >= 5 },
  { id: "twenty_games", emoji: "👑", label: "Game Master", desc: "Play 20 games", check: p => p.gamesPlayed >= 20 },
  { id: "first_word", emoji: "💬", label: "First Words", desc: "Use the soundboard", check: p => p.wordsSpoken >= 1 },
  { id: "chatty", emoji: "🗣️", label: "Chatty", desc: "Speak 50 words", check: p => p.wordsSpoken >= 50 },
  { id: "ten_stars", emoji: "⭐", label: "Star Collector", desc: "Earn 10 stars", check: p => p.totalStars >= 10 },
  { id: "fifty_stars", emoji: "🌟", label: "Superstar", desc: "Earn 50 stars", check: p => p.totalStars >= 50 },
  { id: "routine_done", emoji: "✅", label: "Routine Hero", desc: "Complete a full routine", check: p => p.routinesCompleted >= 1 },
  { id: "calm_breath", emoji: "🫁", label: "Calm Breather", desc: "Use breathing exercises", check: p => p.breathingMinutes >= 1 },
  { id: "focus_champ", emoji: "🎯", label: "Focus Champ", desc: "Focus for 10+ minutes", check: p => p.focusMinutes >= 10 },
  { id: "streak_3", emoji: "🔥", label: "On Fire", desc: "3 day streak", check: p => p.streak >= 3 },
  { id: "streak_7", emoji: "💎", label: "Diamond Streak", desc: "7 day streak", check: p => p.streak >= 7 },
];

const AppContext = createContext();
function useApp() { return useContext(AppContext); }

// ─── Age-Adaptive Helpers ────────────────────────────────────────────────────
// Kept for backward-compat where callers still ask for a ceiling value.
function getMaxLevel(ageRange) {
  if (ageRange === "child") return 1;
  if (ageRange === "teen") return 2;
  if (ageRange === "young_adult") return 3;
  return 4; // adult
}
// Exact lesson tier per age group — each age gets its own content band.
function getLessonLevel(ageRange) {
  if (ageRange === "child") return 1;
  if (ageRange === "teen") return 2;
  if (ageRange === "young_adult") return 3;
  return 4; // adult
}
// Pick entries at the target level. If none exist at that exact level
// (e.g. a game only has 3 tiers), fall back to the nearest lower tier that
// does exist, so every age group still gets playable content.
function lessonsFor(arr, ageRange) {
  const target = getLessonLevel(ageRange);
  let tier = target;
  while (tier >= 1) {
    const subset = arr.filter(x => x.level === tier);
    if (subset.length) return subset;
    tier -= 1;
  }
  return arr;
}
function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function getFontScale(settings) {
  const base = settings.fontSize === "small" ? 0.85 : settings.fontSize === "large" ? 1.18 : 1;
  return base;
}
function getButtonScale(ageRange) {
  return ageRange === "child" ? 1.15 : 1;
}

// ─── Age Range Config ────────────────────────────────────────────────────────
const ageRanges = [
  { id: "child", label: "Child", ages: "4-10", emoji: "🧒", color: T.primary, desc: "Simple words, big buttons, fun sounds" },
  { id: "teen", label: "Teen", ages: "11-17", emoji: "🧑", color: T.blue, desc: "More vocabulary, social tools, study aids" },
  { id: "young_adult", label: "Young Adult", ages: "18-25", emoji: "🧑‍🎓", color: T.purple, desc: "Life skills, work communication, independence" },
  { id: "adult", label: "Adult", ages: "26+", emoji: "🧑‍💼", color: T.green, desc: "Full tools, professional communication, routines" },
];

// ─── AAC Soundboard Data ─────────────────────────────────────────────────────
const aacCategories = [
  {
    id: "feelings", label: "Feelings", emoji: "💛", color: T.yellow, glow: T.yellowGlow,
    items: [
      { label: "Happy", emoji: "😊", speech: "I feel happy" },
      { label: "Sad", emoji: "😢", speech: "I feel sad" },
      { label: "Angry", emoji: "😠", speech: "I feel angry" },
      { label: "Scared", emoji: "😨", speech: "I feel scared" },
      { label: "Tired", emoji: "😴", speech: "I feel tired" },
      { label: "Excited", emoji: "🤩", speech: "I feel excited" },
      { label: "Calm", emoji: "😌", speech: "I feel calm" },
      { label: "Sick", emoji: "🤒", speech: "I don't feel well" },
      { label: "Confused", emoji: "😕", speech: "I feel confused" },
      { label: "Loved", emoji: "🥰", speech: "I feel loved" },
      { label: "Frustrated", emoji: "😤", speech: "I feel frustrated" },
      { label: "Proud", emoji: "😊", speech: "I feel proud of myself" },
      { label: "Nervous", emoji: "😬", speech: "I feel nervous" },
      { label: "Lonely", emoji: "😞", speech: "I feel lonely" },
      { label: "Bored", emoji: "😐", speech: "I feel bored" },
      { label: "Worried", emoji: "😟", speech: "I feel worried" },
      { label: "Silly", emoji: "🤪", speech: "I feel silly" },
      { label: "Brave", emoji: "💪", speech: "I feel brave" },
      { label: "Grateful", emoji: "🙏", speech: "I feel grateful" },
      { label: "Overwhelmed", emoji: "😩", speech: "I feel overwhelmed" },
    ],
  },
  {
    id: "needs", label: "I Need", emoji: "🙋", color: T.primary, glow: T.primaryGlow,
    items: [
      { label: "Help", emoji: "🤝", speech: "I need help please" },
      { label: "Water", emoji: "💧", speech: "I want water please" },
      { label: "Food", emoji: "🍎", speech: "I am hungry" },
      { label: "Bathroom", emoji: "🚻", speech: "I need to use the bathroom" },
      { label: "Break", emoji: "⏸️", speech: "I need a break please" },
      { label: "Hug", emoji: "🤗", speech: "I want a hug" },
      { label: "Space", emoji: "🧘", speech: "I need some space please" },
      { label: "Quiet", emoji: "🤫", speech: "It's too loud. I need quiet" },
      { label: "Medicine", emoji: "💊", speech: "I need my medicine" },
      { label: "Sleep", emoji: "😴", speech: "I want to sleep" },
      { label: "Outside", emoji: "🌳", speech: "I want to go outside" },
      { label: "Home", emoji: "🏠", speech: "I want to go home" },
      { label: "Phone", emoji: "📱", speech: "I need my phone" },
      { label: "Jacket", emoji: "🧥", speech: "I need my jacket" },
      { label: "Shoes", emoji: "👟", speech: "I need my shoes" },
      { label: "Charger", emoji: "🔌", speech: "I need a charger" },
      { label: "Tissue", emoji: "🤧", speech: "I need a tissue" },
      { label: "Snack", emoji: "🍪", speech: "I want a snack please" },
    ],
  },
  {
    id: "responses", label: "Answers", emoji: "💬", color: T.blue, glow: T.blueGlow,
    items: [
      { label: "Yes", emoji: "✅", speech: "Yes" },
      { label: "No", emoji: "❌", speech: "No" },
      { label: "Maybe", emoji: "🤔", speech: "Maybe" },
      { label: "Please", emoji: "🙏", speech: "Please" },
      { label: "Thank You", emoji: "💖", speech: "Thank you" },
      { label: "Sorry", emoji: "😔", speech: "I'm sorry" },
      { label: "Wait", emoji: "✋", speech: "Please wait" },
      { label: "Again", emoji: "🔄", speech: "Again please" },
      { label: "Stop", emoji: "🛑", speech: "Stop please" },
      { label: "More", emoji: "➕", speech: "I want more please" },
      { label: "All Done", emoji: "✨", speech: "I'm all done" },
      { label: "I Don't Know", emoji: "🤷", speech: "I don't know" },
      { label: "OK", emoji: "👌", speech: "Okay" },
      { label: "Not Yet", emoji: "⏳", speech: "Not yet" },
      { label: "Of Course", emoji: "💯", speech: "Of course" },
      { label: "No Thanks", emoji: "🙅", speech: "No thank you" },
      { label: "Excuse Me", emoji: "🙇", speech: "Excuse me" },
      { label: "I Agree", emoji: "🤝", speech: "I agree" },
    ],
  },
  {
    id: "social", label: "Social", emoji: "👋", color: T.green, glow: T.greenGlow,
    items: [
      { label: "Hello", emoji: "👋", speech: "Hello! How are you?" },
      { label: "Goodbye", emoji: "👋", speech: "Goodbye! See you later" },
      { label: "My Name", emoji: "🏷️", speech: "My name is" },
      { label: "Friend", emoji: "🤝", speech: "Will you be my friend?" },
      { label: "Play", emoji: "🎮", speech: "Do you want to play?" },
      { label: "Share", emoji: "🤲", speech: "Do you want to share?" },
      { label: "Good Job", emoji: "⭐", speech: "Good job!" },
      { label: "I Love You", emoji: "❤️", speech: "I love you" },
      { label: "Look", emoji: "👀", speech: "Look at this!" },
      { label: "Funny", emoji: "😂", speech: "That's funny!" },
      { label: "Come Here", emoji: "🫶", speech: "Come here please" },
      { label: "My Turn", emoji: "☝️", speech: "It's my turn" },
      { label: "Your Turn", emoji: "👉", speech: "It's your turn" },
      { label: "Nice To Meet", emoji: "😄", speech: "Nice to meet you" },
      { label: "How Are You", emoji: "💬", speech: "How are you doing?" },
      { label: "Miss You", emoji: "💕", speech: "I miss you" },
      { label: "High Five", emoji: "🖐️", speech: "High five!" },
      { label: "Great Work", emoji: "🏆", speech: "Great work!" },
    ],
  },
  {
    id: "questions", label: "Questions", emoji: "❓", color: T.pink, glow: T.pinkGlow,
    items: [
      { label: "What", emoji: "❓", speech: "What is that?" },
      { label: "Where", emoji: "📍", speech: "Where is it?" },
      { label: "When", emoji: "🕐", speech: "When?" },
      { label: "Who", emoji: "🧑", speech: "Who is that?" },
      { label: "Why", emoji: "🤔", speech: "Why?" },
      { label: "How", emoji: "💭", speech: "How do I do this?" },
      { label: "How Much", emoji: "💰", speech: "How much does it cost?" },
      { label: "Can I", emoji: "🙋", speech: "Can I do that?" },
      { label: "What Time", emoji: "⏰", speech: "What time is it?" },
      { label: "Where Going", emoji: "🚗", speech: "Where are we going?" },
      { label: "What's Next", emoji: "➡️", speech: "What are we doing next?" },
      { label: "Can You Help", emoji: "🤝", speech: "Can you help me?" },
      { label: "What's Wrong", emoji: "😟", speech: "What's wrong?" },
      { label: "Are You OK", emoji: "💛", speech: "Are you okay?" },
      { label: "How Long", emoji: "⏳", speech: "How much longer?" },
      { label: "Why Not", emoji: "🤷", speech: "Why not?" },
    ],
  },
  {
    id: "food", label: "Food & Drink", emoji: "🍕", color: T.primary, glow: T.primaryGlow,
    items: [
      { label: "Water", emoji: "💧", speech: "water" },
      { label: "Juice", emoji: "🧃", speech: "juice" },
      { label: "Milk", emoji: "🥛", speech: "milk" },
      { label: "Apple", emoji: "🍎", speech: "apple" },
      { label: "Banana", emoji: "🍌", speech: "banana" },
      { label: "Pizza", emoji: "🍕", speech: "pizza" },
      { label: "Chicken", emoji: "🍗", speech: "chicken" },
      { label: "Rice", emoji: "🍚", speech: "rice" },
      { label: "Bread", emoji: "🍞", speech: "bread" },
      { label: "Cheese", emoji: "🧀", speech: "cheese" },
      { label: "Pasta", emoji: "🍝", speech: "pasta" },
      { label: "Soup", emoji: "🍲", speech: "soup" },
      { label: "Cookie", emoji: "🍪", speech: "cookie" },
      { label: "Ice Cream", emoji: "🍦", speech: "ice cream" },
      { label: "Cereal", emoji: "🥣", speech: "cereal" },
      { label: "Sandwich", emoji: "🥪", speech: "sandwich" },
      { label: "Fries", emoji: "🍟", speech: "french fries" },
      { label: "Egg", emoji: "🥚", speech: "egg" },
      { label: "Yogurt", emoji: "🥄", speech: "yogurt" },
      { label: "Grapes", emoji: "🍇", speech: "grapes" },
    ],
  },
  {
    id: "places", label: "Places", emoji: "📍", color: T.purple, glow: T.purpleGlow,
    items: [
      { label: "School", emoji: "🏫", speech: "I want to go to school" },
      { label: "Park", emoji: "🌲", speech: "I want to go to the park" },
      { label: "Store", emoji: "🛒", speech: "I want to go to the store" },
      { label: "Doctor", emoji: "🏥", speech: "I need to see the doctor" },
      { label: "Car", emoji: "🚗", speech: "I want to go in the car" },
      { label: "Bedroom", emoji: "🛏️", speech: "I want to go to my room" },
      { label: "Kitchen", emoji: "🍳", speech: "I want to go to the kitchen" },
      { label: "Library", emoji: "📚", speech: "I want to go to the library" },
      { label: "Bathroom", emoji: "🚿", speech: "I need the bathroom" },
      { label: "Playground", emoji: "🎡", speech: "I want to go to the playground" },
      { label: "Restaurant", emoji: "🍽️", speech: "I want to go to a restaurant" },
      { label: "Beach", emoji: "🏖️", speech: "I want to go to the beach" },
      { label: "Pool", emoji: "🏊", speech: "I want to go to the pool" },
      { label: "Church", emoji: "⛪", speech: "I want to go to church" },
      { label: "Grandma's", emoji: "👵", speech: "I want to go to grandma's house" },
      { label: "Work", emoji: "🏢", speech: "I need to go to work" },
    ],
  },
  {
    id: "actions", label: "Actions", emoji: "🏃", color: T.blue, glow: T.blueGlow,
    items: [
      { label: "Eat", emoji: "🍽️", speech: "eat" },
      { label: "Drink", emoji: "🥤", speech: "drink" },
      { label: "Go", emoji: "🚶", speech: "go" },
      { label: "Come", emoji: "🫳", speech: "come" },
      { label: "Sit", emoji: "🪑", speech: "sit down" },
      { label: "Stand", emoji: "🧍", speech: "stand up" },
      { label: "Read", emoji: "📖", speech: "read" },
      { label: "Write", emoji: "✏️", speech: "write" },
      { label: "Listen", emoji: "👂", speech: "listen" },
      { label: "Watch", emoji: "👁️", speech: "watch" },
      { label: "Open", emoji: "📂", speech: "open" },
      { label: "Close", emoji: "📁", speech: "close" },
      { label: "Play", emoji: "🎮", speech: "play" },
      { label: "Stop", emoji: "✋", speech: "stop" },
      { label: "Walk", emoji: "🚶", speech: "walk" },
      { label: "Run", emoji: "🏃", speech: "run" },
      { label: "Jump", emoji: "🤸", speech: "jump" },
      { label: "Sleep", emoji: "😴", speech: "sleep" },
      { label: "Clean", emoji: "🧹", speech: "clean up" },
      { label: "Give", emoji: "🤲", speech: "give" },
      { label: "Take", emoji: "🫴", speech: "take" },
      { label: "Push", emoji: "👐", speech: "push" },
      { label: "Pull", emoji: "🤏", speech: "pull" },
      { label: "Turn On", emoji: "💡", speech: "turn on" },
      { label: "Turn Off", emoji: "🔌", speech: "turn off" },
      { label: "Put On", emoji: "👕", speech: "put on" },
      { label: "Take Off", emoji: "🧤", speech: "take off" },
      { label: "Draw", emoji: "🎨", speech: "draw" },
    ],
  },
  {
    id: "people", label: "People", emoji: "👥", color: T.green, glow: T.greenGlow,
    items: [
      { label: "I", emoji: "🙋", speech: "I" },
      { label: "You", emoji: "👉", speech: "you" },
      { label: "Mom", emoji: "👩", speech: "mom" },
      { label: "Dad", emoji: "👨", speech: "dad" },
      { label: "Teacher", emoji: "🧑‍🏫", speech: "teacher" },
      { label: "Friend", emoji: "🧑‍🤝‍🧑", speech: "my friend" },
      { label: "Brother", emoji: "👦", speech: "brother" },
      { label: "Sister", emoji: "👧", speech: "sister" },
      { label: "Doctor", emoji: "👨‍⚕️", speech: "doctor" },
      { label: "We", emoji: "👫", speech: "we" },
      { label: "They", emoji: "👥", speech: "they" },
      { label: "Everyone", emoji: "🌍", speech: "everyone" },
      { label: "Baby", emoji: "👶", speech: "baby" },
      { label: "Grandma", emoji: "👵", speech: "grandma" },
      { label: "Grandpa", emoji: "👴", speech: "grandpa" },
      { label: "Pet", emoji: "🐾", speech: "my pet" },
      { label: "Neighbor", emoji: "🏘️", speech: "neighbor" },
      { label: "He", emoji: "👦", speech: "he" },
      { label: "She", emoji: "👧", speech: "she" },
      { label: "Helper", emoji: "🦸", speech: "my helper" },
    ],
  },
  {
    id: "body", label: "My Body", emoji: "🫀", color: T.pink, glow: T.pinkGlow,
    items: [
      { label: "Head", emoji: "😶", speech: "my head" },
      { label: "Tummy", emoji: "🫃", speech: "my tummy" },
      { label: "Hand", emoji: "✋", speech: "my hand" },
      { label: "Foot", emoji: "🦶", speech: "my foot" },
      { label: "Eye", emoji: "👁️", speech: "my eye" },
      { label: "Ear", emoji: "👂", speech: "my ear" },
      { label: "Mouth", emoji: "👄", speech: "my mouth" },
      { label: "Nose", emoji: "👃", speech: "my nose" },
      { label: "Back", emoji: "🔙", speech: "my back" },
      { label: "Teeth", emoji: "🦷", speech: "my teeth" },
      { label: "Hurts", emoji: "🩹", speech: "it hurts here" },
      { label: "Itchy", emoji: "😣", speech: "it's itchy" },
    ],
  },
  {
    id: "descriptors", label: "Describing", emoji: "🌈", color: T.yellow, glow: T.yellowGlow,
    items: [
      { label: "Big", emoji: "🐘", speech: "big" },
      { label: "Small", emoji: "🐜", speech: "small" },
      { label: "Hot", emoji: "🔥", speech: "hot" },
      { label: "Cold", emoji: "🥶", speech: "cold" },
      { label: "Good", emoji: "👍", speech: "good" },
      { label: "Bad", emoji: "👎", speech: "bad" },
      { label: "Fast", emoji: "⚡", speech: "fast" },
      { label: "Slow", emoji: "🐌", speech: "slow" },
      { label: "New", emoji: "✨", speech: "new" },
      { label: "Old", emoji: "📜", speech: "old" },
      { label: "Same", emoji: "🟰", speech: "same" },
      { label: "Different", emoji: "🔀", speech: "different" },
      { label: "Pretty", emoji: "🌸", speech: "pretty" },
      { label: "Loud", emoji: "🔊", speech: "loud" },
      { label: "Quiet", emoji: "🔇", speech: "quiet" },
      { label: "Heavy", emoji: "🏋️", speech: "heavy" },
      { label: "Light", emoji: "🪶", speech: "light" },
      { label: "Soft", emoji: "🧸", speech: "soft" },
      { label: "Hard", emoji: "🪨", speech: "hard" },
      { label: "Yummy", emoji: "😋", speech: "yummy" },
      { label: "Yucky", emoji: "🤢", speech: "yucky" },
      { label: "Wet", emoji: "💦", speech: "wet" },
      { label: "Dry", emoji: "☀️", speech: "dry" },
      { label: "Full", emoji: "😊", speech: "full" },
      { label: "Empty", emoji: "📭", speech: "empty" },
      { label: "Scary", emoji: "👻", speech: "scary" },
      { label: "Fun", emoji: "🎉", speech: "fun" },
      { label: "Easy", emoji: "✅", speech: "easy" },
    ],
  },
  {
    id: "time", label: "Time", emoji: "🕐", color: T.purple, glow: T.purpleGlow,
    items: [
      { label: "Now", emoji: "⏰", speech: "now" },
      { label: "Later", emoji: "🔜", speech: "later" },
      { label: "Today", emoji: "📅", speech: "today" },
      { label: "Tomorrow", emoji: "🌅", speech: "tomorrow" },
      { label: "Yesterday", emoji: "⏪", speech: "yesterday" },
      { label: "Morning", emoji: "🌤️", speech: "in the morning" },
      { label: "Night", emoji: "🌙", speech: "at night" },
      { label: "Soon", emoji: "⏳", speech: "soon" },
      { label: "Always", emoji: "♾️", speech: "always" },
      { label: "Never", emoji: "🚫", speech: "never" },
      { label: "Before", emoji: "⬅️", speech: "before" },
      { label: "After", emoji: "➡️", speech: "after" },
      { label: "Lunch Time", emoji: "🍽️", speech: "lunch time" },
      { label: "Bed Time", emoji: "🛌", speech: "bed time" },
      { label: "Weekend", emoji: "🎉", speech: "on the weekend" },
      { label: "First", emoji: "1️⃣", speech: "first" },
      { label: "Then", emoji: "2️⃣", speech: "then" },
      { label: "Last", emoji: "🏁", speech: "last" },
    ],
  },
  {
    id: "weather", label: "Weather", emoji: "🌤️", color: T.blue, glow: T.blueGlow,
    items: [
      { label: "Sunny", emoji: "☀️", speech: "It is sunny" },
      { label: "Rainy", emoji: "🌧️", speech: "It is raining" },
      { label: "Snowy", emoji: "❄️", speech: "It is snowing" },
      { label: "Windy", emoji: "💨", speech: "It is windy" },
      { label: "Cloudy", emoji: "☁️", speech: "It is cloudy" },
      { label: "Hot Out", emoji: "🥵", speech: "It is hot outside" },
      { label: "Cold Out", emoji: "🥶", speech: "It is cold outside" },
      { label: "Storm", emoji: "⛈️", speech: "There is a storm" },
      { label: "Rainbow", emoji: "🌈", speech: "I see a rainbow" },
      { label: "Night Sky", emoji: "🌙", speech: "The stars are out" },
    ],
  },
  {
    id: "manners", label: "Manners", emoji: "🌟", color: T.green, glow: T.greenGlow,
    items: [
      { label: "Please", emoji: "🙏", speech: "please" },
      { label: "Thank You", emoji: "💖", speech: "thank you" },
      { label: "You're Welcome", emoji: "😊", speech: "you're welcome" },
      { label: "Excuse Me", emoji: "🙇", speech: "excuse me" },
      { label: "I'm Sorry", emoji: "😔", speech: "I'm sorry" },
      { label: "Bless You", emoji: "🤧", speech: "bless you" },
      { label: "Good Morning", emoji: "🌅", speech: "good morning" },
      { label: "Good Night", emoji: "🌙", speech: "good night" },
      { label: "May I", emoji: "🙋", speech: "may I please" },
      { label: "After You", emoji: "🚪", speech: "after you" },
      { label: "Pardon Me", emoji: "🫡", speech: "pardon me" },
      { label: "Nice Job", emoji: "⭐", speech: "nice job" },
    ],
  },
];

// ─── Learning Games Data ─────────────────────────────────────────────────────
const wordGames = [
  { image: "🐱", word: "CAT", choices: ["CAT", "BAT", "HAT", "RAT"], hint: "A furry pet that purrs", level: 1 },
  { image: "☀️", word: "SUN", choices: ["BUN", "SUN", "FUN", "RUN"], hint: "Bright in the sky", level: 1 },
  { image: "🐕", word: "DOG", choices: ["LOG", "FOG", "DOG", "HOG"], hint: "A pet that barks", level: 1 },
  { image: "🐟", word: "FISH", choices: ["DISH", "FISH", "WISH", "SWISH"], hint: "Swims in water", level: 1 },
  { image: "🌳", word: "TREE", choices: ["FREE", "THREE", "TREE", "SEE"], hint: "Tall with leaves", level: 1 },
  { image: "🐸", word: "FROG", choices: ["FROG", "BLOG", "CLOG", "JROG"], hint: "Green and hops", level: 1 },
  { image: "🌹", word: "ROSE", choices: ["NOSE", "ROSE", "HOSE", "POSE"], hint: "A pretty flower", level: 1 },
  { image: "🐝", word: "BEE", choices: ["BEE", "SEE", "TEE", "FEE"], hint: "Makes honey and buzzes", level: 1 },
  { image: "🌙", word: "MOON", choices: ["MOON", "NOON", "SOON", "SPOON"], hint: "In the night sky", level: 2 },
  { image: "⭐", word: "STAR", choices: ["CAR", "STAR", "FAR", "BAR"], hint: "Twinkles at night", level: 2 },
  { image: "🏠", word: "HOME", choices: ["DOME", "HOME", "SOME", "COME"], hint: "Where you live", level: 2 },
  { image: "🎵", word: "SONG", choices: ["LONG", "SONG", "GONG", "BONG"], hint: "Music you sing", level: 2 },
  { image: "🦋", word: "FLY", choices: ["FLY", "TRY", "CRY", "SKY"], hint: "Wings help you do this", level: 2 },
  { image: "🐢", word: "TURTLE", choices: ["TURTLE", "PURPLE", "HURTLE", "MYRTLE"], hint: "Slow with a shell", level: 2 },
  { image: "🦁", word: "LION", choices: ["LION", "IRON", "NION", "BION"], hint: "King of the jungle", level: 2 },
  { image: "🍕", word: "PIZZA", choices: ["PIZZA", "PLAZA", "PIAZZA", "PINTA"], hint: "Cheesy round food", level: 2 },
  { image: "🌊", word: "OCEAN", choices: ["OCEAN", "MOTION", "POTION", "LOTION"], hint: "Big body of salt water", level: 3 },
  { image: "🏔️", word: "MOUNTAIN", choices: ["FOUNTAIN", "MOUNTAIN", "CAPTAIN", "CURTAIN"], hint: "Very tall land formation", level: 3 },
  { image: "🦅", word: "EAGLE", choices: ["EAGLE", "BEAGLE", "LEGAL", "REGAL"], hint: "A big bird of prey", level: 3 },
  { image: "🌋", word: "VOLCANO", choices: ["VOLCANO", "TORNADO", "AVOCADO", "BUFFALO"], hint: "Erupts with lava", level: 3 },
  { image: "🦕", word: "DINOSAUR", choices: ["DINOSAUR", "DISCOVER", "DISORDER", "DINGASOR"], hint: "Extinct giant reptile", level: 3 },
  { image: "🏰", word: "CASTLE", choices: ["CASTLE", "HASSLE", "TASSEL", "VASSAL"], hint: "Where kings and queens live", level: 3 },
  // Level 4 — Adult vocabulary
  { image: "🏛️", word: "ARCHITECTURE", choices: ["ARCHITECTURE", "AGRICULTURE", "ARCHIPELAGO", "ARCHEOLOGY"], hint: "The art of designing buildings", level: 4 },
  { image: "🔬", word: "MICROSCOPE", choices: ["MICROSCOPE", "TELESCOPE", "PERISCOPE", "STETHOSCOPE"], hint: "Tool for viewing tiny things", level: 4 },
  { image: "⚖️", word: "JUSTICE", choices: ["JUSTICE", "JUNCTION", "JUVENILE", "JUBILANT"], hint: "Fairness under the law", level: 4 },
  { image: "🧬", word: "GENETICS", choices: ["GENETICS", "GEOMETRY", "GEOLOGY", "GENEROSITY"], hint: "Study of inherited traits", level: 4 },
  { image: "🌌", word: "UNIVERSE", choices: ["UNIVERSE", "UNIFORM", "UNIVERSAL", "UTENSIL"], hint: "All of space and time", level: 4 },
  { image: "💼", word: "ENTREPRENEUR", choices: ["ENTREPRENEUR", "ENGINEER", "EMPLOYEE", "EXECUTIVE"], hint: "Someone who starts a business", level: 4 },
  { image: "🏥", word: "PHYSICIAN", choices: ["PHYSICIAN", "MUSICIAN", "POLITICIAN", "TECHNICIAN"], hint: "A medical doctor", level: 4 },
  { image: "📊", word: "ANALYTICS", choices: ["ANALYTICS", "ATHLETICS", "ANTARCTIC", "AUTHENTIC"], hint: "The study of data", level: 4 },
];

const colorMatchGame = [
  { color: "#FF4444", name: "RED", emoji: "🔴" },
  { color: "#4488FF", name: "BLUE", emoji: "🔵" },
  { color: "#44BB44", name: "GREEN", emoji: "🟢" },
  { color: "#FFBB33", name: "YELLOW", emoji: "🟡" },
  { color: "#BB44FF", name: "PURPLE", emoji: "🟣" },
  { color: "#FF8844", name: "ORANGE", emoji: "🟠" },
  { color: "#FF69B4", name: "PINK", emoji: "💗" },
  { color: "#8B4513", name: "BROWN", emoji: "🤎" },
  { color: "#000000", name: "BLACK", emoji: "⚫" },
  { color: "#BBBBBB", name: "GRAY", emoji: "🩶" },
];

const patternData = [
  { pattern: ["🔴", "🔵", "🔴", "🔵", "?"], answer: "🔴", choices: ["🔴", "🟢", "🔵"], level: 1 },
  { pattern: ["⭐", "⭐", "🌙", "⭐", "⭐", "?"], answer: "🌙", choices: ["⭐", "🌙", "☀️"], level: 1 },
  { pattern: ["🐱", "🐕", "🐱", "🐕", "?"], answer: "🐱", choices: ["🐟", "🐱", "🐕"], level: 1 },
  { pattern: ["🍎", "🍎", "🍌", "🍎", "🍎", "?"], answer: "🍌", choices: ["🍎", "🍌", "🍇"], level: 1 },
  { pattern: ["😊", "😢", "😊", "😢", "?"], answer: "😊", choices: ["😊", "😢", "😠"], level: 1 },
  { pattern: ["1", "2", "3", "4", "?"], answer: "5", choices: ["5", "6", "3"], level: 2 },
  { pattern: ["🍎", "🍌", "🍎", "🍌", "🍎", "?"], answer: "🍌", choices: ["🍎", "🍌", "🍇"], level: 2 },
  { pattern: ["△", "○", "□", "△", "○", "?"], answer: "□", choices: ["△", "○", "□"], level: 2 },
  { pattern: ["A", "B", "C", "D", "?"], answer: "E", choices: ["E", "F", "B"], level: 2 },
  { pattern: ["🔵", "🔵", "🔴", "🔵", "🔵", "?"], answer: "🔴", choices: ["🔵", "🔴", "🟢"], level: 2 },
  { pattern: ["2", "4", "6", "8", "?"], answer: "10", choices: ["9", "10", "12"], level: 3 },
  { pattern: ["🔴", "🔵", "🟢", "🔴", "🔵", "?"], answer: "🟢", choices: ["🔴", "🔵", "🟢"], level: 3 },
  { pattern: ["1", "1", "2", "3", "5", "?"], answer: "8", choices: ["7", "8", "6"], level: 3 },
  { pattern: ["△", "□", "⬠", "△", "□", "?"], answer: "⬠", choices: ["△", "□", "⬠"], level: 3 },
  // Level 4 — Adult: prime numbers, squares, fibonacci variations, letter skips
  { pattern: ["2", "3", "5", "7", "11", "?"], answer: "13", choices: ["12", "13", "15"], level: 4 },
  { pattern: ["1", "4", "9", "16", "25", "?"], answer: "36", choices: ["30", "36", "49"], level: 4 },
  { pattern: ["3", "6", "12", "24", "?"], answer: "48", choices: ["36", "48", "60"], level: 4 },
  { pattern: ["A", "C", "E", "G", "I", "?"], answer: "K", choices: ["J", "K", "L"], level: 4 },
  { pattern: ["Z", "Y", "X", "W", "?"], answer: "V", choices: ["V", "U", "T"], level: 4 },
  { pattern: ["100", "81", "64", "49", "?"], answer: "36", choices: ["36", "42", "25"], level: 4 },
  { pattern: ["2", "6", "12", "20", "30", "?"], answer: "42", choices: ["40", "42", "44"], level: 4 },
];

const mathProblems = [
  { q: "1 + 1", a: 2, choices: [1, 2, 3], level: 1 },
  { q: "2 + 3", a: 5, choices: [4, 5, 6], level: 1 },
  { q: "5 - 2", a: 3, choices: [2, 3, 4], level: 1 },
  { q: "1 + 3", a: 4, choices: [3, 4, 5], level: 1 },
  { q: "4 - 1", a: 3, choices: [2, 3, 4], level: 1 },
  { q: "2 + 2", a: 4, choices: [3, 4, 5], level: 1 },
  { q: "3 + 4", a: 7, choices: [6, 7, 8], level: 2 },
  { q: "6 - 1", a: 5, choices: [4, 5, 6], level: 2 },
  { q: "4 + 4", a: 8, choices: [7, 8, 9], level: 2 },
  { q: "10 - 3", a: 7, choices: [6, 7, 8], level: 2 },
  { q: "2 + 6", a: 8, choices: [7, 8, 9], level: 2 },
  { q: "9 - 4", a: 5, choices: [4, 5, 6], level: 2 },
  { q: "5 + 7", a: 12, choices: [11, 12, 13], level: 2 },
  { q: "7 × 3", a: 21, choices: [18, 21, 24], level: 3 },
  { q: "15 - 8", a: 7, choices: [6, 7, 8], level: 3 },
  { q: "12 ÷ 4", a: 3, choices: [2, 3, 4], level: 3 },
  { q: "9 × 6", a: 54, choices: [48, 54, 56], level: 3 },
  { q: "8 × 7", a: 56, choices: [54, 56, 58], level: 3 },
  { q: "100 ÷ 5", a: 20, choices: [15, 20, 25], level: 3 },
  { q: "13 + 19", a: 32, choices: [31, 32, 33], level: 3 },
  // Level 4 — Adult: multi-digit, percentages, squares, order of operations
  { q: "144 ÷ 12", a: 12, choices: [11, 12, 14], level: 4 },
  { q: "25 × 8", a: 200, choices: [180, 200, 250], level: 4 },
  { q: "15% of 200", a: 30, choices: [25, 30, 45], level: 4 },
  { q: "17 × 13", a: 221, choices: [211, 221, 231], level: 4 },
  { q: "√169", a: 13, choices: [12, 13, 14], level: 4 },
  { q: "2³ + 5²", a: 33, choices: [30, 33, 36], level: 4 },
  { q: "256 ÷ 16", a: 16, choices: [14, 16, 18], level: 4 },
  { q: "7 × 9 + 4", a: 67, choices: [63, 67, 70], level: 4 },
  { q: "45 + 38 − 17", a: 66, choices: [64, 66, 68], level: 4 },
  { q: "20% of 150", a: 30, choices: [25, 30, 35], level: 4 },
];

// Memory game pairs
const memoryCards = [
  { id: "cat", emoji: "🐱", label: "Cat" }, { id: "dog", emoji: "🐕", label: "Dog" },
  { id: "fish", emoji: "🐟", label: "Fish" }, { id: "bird", emoji: "🐦", label: "Bird" },
  { id: "star", emoji: "⭐", label: "Star" }, { id: "heart", emoji: "❤️", label: "Heart" },
  { id: "sun", emoji: "☀️", label: "Sun" }, { id: "moon", emoji: "🌙", label: "Moon" },
  { id: "flower", emoji: "🌸", label: "Flower" }, { id: "tree", emoji: "🌳", label: "Tree" },
  { id: "apple", emoji: "🍎", label: "Apple" }, { id: "car", emoji: "🚗", label: "Car" },
];

// Rhyming game data
const rhymingData = [
  { word: "CAT", emoji: "🐱", answer: "HAT", choices: ["HAT", "DOG", "SUN", "CUP"], level: 1 },
  { word: "DOG", emoji: "🐕", answer: "LOG", choices: ["LOG", "CAT", "BIG", "RUN"], level: 1 },
  { word: "SUN", emoji: "☀️", answer: "FUN", choices: ["FUN", "SAD", "HOT", "BIG"], level: 1 },
  { word: "BALL", emoji: "⚽", answer: "TALL", choices: ["TALL", "SMALL", "BIG", "RUN"], level: 1 },
  { word: "BEE", emoji: "🐝", answer: "TREE", choices: ["TREE", "BIRD", "BUZZ", "FLY"], level: 1 },
  { word: "CAKE", emoji: "🎂", answer: "LAKE", choices: ["LAKE", "MOON", "FISH", "PIE"], level: 2 },
  { word: "LIGHT", emoji: "💡", answer: "NIGHT", choices: ["NIGHT", "DARK", "LAMP", "SUN"], level: 2 },
  { word: "BEAR", emoji: "🐻", answer: "CHAIR", choices: ["CHAIR", "LION", "CAVE", "FUR"], level: 2 },
  { word: "TRAIN", emoji: "🚂", answer: "RAIN", choices: ["RAIN", "TRACK", "FAST", "BUS"], level: 2 },
  { word: "HOUSE", emoji: "🏠", answer: "MOUSE", choices: ["MOUSE", "HOME", "DOOR", "ROOF"], level: 2 },
  { word: "DREAM", emoji: "💭", answer: "STREAM", choices: ["STREAM", "SLEEP", "CLOUD", "WISH"], level: 3 },
  { word: "PHONE", emoji: "📱", answer: "BONE", choices: ["BONE", "CALL", "RING", "TEXT"], level: 3 },
  { word: "FLOWER", emoji: "🌸", answer: "TOWER", choices: ["TOWER", "GARDEN", "PETAL", "SEED"], level: 3 },
  { word: "BRIGHT", emoji: "✨", answer: "FLIGHT", choices: ["FLIGHT", "DARK", "SHINE", "GLOW"], level: 3 },
  // Level 4 — Adult multisyllabic rhymes
  { word: "ACQUIRE", emoji: "🎯", answer: "INSPIRE", choices: ["INSPIRE", "OBTAIN", "REQUIRE", "DESIRE"], level: 4 },
  { word: "COMMOTION", emoji: "🌪️", answer: "DEVOTION", choices: ["DEVOTION", "QUIET", "MOVEMENT", "CHAOS"], level: 4 },
  { word: "INVENTION", emoji: "💡", answer: "DIMENSION", choices: ["DIMENSION", "IDEA", "CREATION", "NOTION"], level: 4 },
  { word: "CELEBRATE", emoji: "🎉", answer: "DEMONSTRATE", choices: ["DEMONSTRATE", "CHEER", "PARTY", "REJOICE"], level: 4 },
  { word: "MYSTERIOUS", emoji: "🕵️", answer: "VICTORIOUS", choices: ["VICTORIOUS", "STRANGE", "CRYPTIC", "SECRET"], level: 4 },
  { word: "HORIZON", emoji: "🌅", answer: "BISON", choices: ["BISON", "SKYLINE", "SUNSET", "DISTANCE"], level: 4 },
];

// Shape sorting data
const shapeSortData = [
  { shape: "Circle", emoji: "🔵", items: ["⚽", "🍊", "🌙", "🪙"], answer: "🌙", wrongLabel: "Not round", level: 1 },
  { shape: "Square", emoji: "🟧", items: ["📦", "📺", "🔵", "🖼️"], answer: "🔵", wrongLabel: "Not square", level: 1 },
  { shape: "Triangle", emoji: "🔺", items: ["📐", "⚠️", "🍕", "⬜"], answer: "⬜", wrongLabel: "Not triangle", level: 1 },
  { shape: "Red Things", emoji: "🔴", items: ["🍎", "🚗", "🌿", "❤️"], answer: "🌿", wrongLabel: "Not red", level: 2 },
  { shape: "Animals", emoji: "🐾", items: ["🐱", "🌳", "🐕", "🐟"], answer: "🌳", wrongLabel: "Not an animal", level: 2 },
  { shape: "Fruits", emoji: "🍎", items: ["🍌", "🍇", "🥕", "🍊"], answer: "🥕", wrongLabel: "Not a fruit", level: 2 },
  { shape: "Things That Fly", emoji: "🦅", items: ["🐦", "✈️", "🚗", "🦋"], answer: "🚗", wrongLabel: "Doesn't fly", level: 3 },
  { shape: "Cold Things", emoji: "❄️", items: ["🍦", "🧊", "🔥", "⛄"], answer: "🔥", wrongLabel: "Not cold", level: 3 },
  { shape: "Musical", emoji: "🎵", items: ["🎸", "🥁", "📚", "🎹"], answer: "📚", wrongLabel: "Not musical", level: 3 },
  { shape: "School Items", emoji: "🏫", items: ["📚", "✏️", "🍕", "📐"], answer: "🍕", wrongLabel: "Not for school", level: 3 },
  // Level 4 — Adult: abstract categories
  { shape: "Office Tools", emoji: "💼", items: ["💻", "📎", "🎪", "📊"], answer: "🎪", wrongLabel: "Not office gear", level: 4 },
  { shape: "Financial", emoji: "💰", items: ["💳", "🏦", "🎸", "📈"], answer: "🎸", wrongLabel: "Not financial", level: 4 },
  { shape: "Scientific", emoji: "🔬", items: ["🧪", "🔭", "🍔", "🧬"], answer: "🍔", wrongLabel: "Not scientific", level: 4 },
  { shape: "Legal Items", emoji: "⚖️", items: ["📜", "⚖️", "🍉", "🏛️"], answer: "🍉", wrongLabel: "Not legal", level: 4 },
  { shape: "Medical", emoji: "⚕️", items: ["💊", "🩺", "🎮", "🏥"], answer: "🎮", wrongLabel: "Not medical", level: 4 },
  { shape: "Renewable Energy", emoji: "♻️", items: ["☀️", "💨", "🛢️", "🌊"], answer: "🛢️", wrongLabel: "Not renewable", level: 4 },
];

// ─── Spelling Bee Data ──────────────────────────────────────────────────────
const spellingWords = [
  { word: "cat", hint: "🐱 A furry pet", level: 1 },
  { word: "dog", hint: "🐕 It barks", level: 1 },
  { word: "sun", hint: "☀️ In the sky", level: 1 },
  { word: "hat", hint: "🎩 Goes on your head", level: 1 },
  { word: "red", hint: "🔴 A color", level: 1 },
  { word: "cup", hint: "🥤 You drink from it", level: 1 },
  { word: "bed", hint: "🛏️ Where you sleep", level: 1 },
  { word: "fish", hint: "🐟 Swims in water", level: 2 },
  { word: "tree", hint: "🌳 Has leaves", level: 2 },
  { word: "star", hint: "⭐ Twinkles at night", level: 2 },
  { word: "jump", hint: "🤸 Leap in the air", level: 2 },
  { word: "play", hint: "🎮 Have fun", level: 2 },
  { word: "blue", hint: "🔵 Color of the sky", level: 2 },
  { word: "happy", hint: "😊 Feeling good", level: 3 },
  { word: "water", hint: "💧 You drink it", level: 3 },
  { word: "house", hint: "🏠 Where you live", level: 3 },
  { word: "friend", hint: "🤝 Someone you like", level: 3 },
  { word: "school", hint: "🏫 Where you learn", level: 3 },
  { word: "dragon", hint: "🐉 Breathes fire", level: 3 },
  // Level 4 — Adult vocabulary
  { word: "rhythm", hint: "🥁 The beat of music", level: 4 },
  { word: "ancient", hint: "🏛️ Very, very old", level: 4 },
  { word: "journey", hint: "🗺️ A long trip", level: 4 },
  { word: "pharmacy", hint: "💊 Where you get medicine", level: 4 },
  { word: "knowledge", hint: "📚 What you learn", level: 4 },
  { word: "horizon", hint: "🌅 Where sky meets earth", level: 4 },
  { word: "curious", hint: "🤔 Wanting to know more", level: 4 },
  { word: "genuine", hint: "✅ Real and true", level: 4 },
];

// ─── Opposite Match Data ────────────────────────────────────────────────────
const oppositeData = [
  { word: "Hot", emoji: "🔥", answer: "Cold", choices: ["Cold", "Warm", "Wet"], level: 1 },
  { word: "Big", emoji: "🐘", answer: "Small", choices: ["Small", "Tall", "Wide"], level: 1 },
  { word: "Happy", emoji: "😊", answer: "Sad", choices: ["Sad", "Mad", "Glad"], level: 1 },
  { word: "Up", emoji: "⬆️", answer: "Down", choices: ["Down", "Left", "Right"], level: 1 },
  { word: "Fast", emoji: "⚡", answer: "Slow", choices: ["Slow", "Quick", "Quiet"], level: 1 },
  { word: "Day", emoji: "☀️", answer: "Night", choices: ["Night", "Dark", "Moon"], level: 1 },
  { word: "Open", emoji: "📂", answer: "Close", choices: ["Close", "Shut", "Lock"], level: 2 },
  { word: "Full", emoji: "🥛", answer: "Empty", choices: ["Empty", "Half", "Spill"], level: 2 },
  { word: "Loud", emoji: "🔊", answer: "Quiet", choices: ["Quiet", "Silent", "Soft"], level: 2 },
  { word: "Light", emoji: "💡", answer: "Dark", choices: ["Dark", "Dim", "Black"], level: 2 },
  { word: "Hard", emoji: "🪨", answer: "Soft", choices: ["Soft", "Easy", "Light"], level: 2 },
  { word: "Push", emoji: "👐", answer: "Pull", choices: ["Pull", "Drag", "Lift"], level: 2 },
  { word: "Ancient", emoji: "🏛️", answer: "Modern", choices: ["Modern", "Recent", "Fresh"], level: 3 },
  { word: "Brave", emoji: "🦁", answer: "Scared", choices: ["Scared", "Shy", "Weak"], level: 3 },
  { word: "Generous", emoji: "🎁", answer: "Selfish", choices: ["Selfish", "Greedy", "Mean"], level: 3 },
  { word: "Remember", emoji: "🧠", answer: "Forget", choices: ["Forget", "Lose", "Miss"], level: 3 },
  // Level 4 — Adult nuanced opposites
  { word: "Abundant", emoji: "🌾", answer: "Scarce", choices: ["Scarce", "Rare", "Few"], level: 4 },
  { word: "Optimistic", emoji: "😊", answer: "Pessimistic", choices: ["Pessimistic", "Sad", "Gloomy"], level: 4 },
  { word: "Transparent", emoji: "🪟", answer: "Opaque", choices: ["Opaque", "Clear", "Solid"], level: 4 },
  { word: "Frugal", emoji: "💰", answer: "Extravagant", choices: ["Extravagant", "Wealthy", "Cheap"], level: 4 },
  { word: "Voluntary", emoji: "✋", answer: "Mandatory", choices: ["Mandatory", "Optional", "Forced"], level: 4 },
  { word: "Coherent", emoji: "🧩", answer: "Incoherent", choices: ["Incoherent", "Broken", "Confused"], level: 4 },
  { word: "Temporary", emoji: "⏳", answer: "Permanent", choices: ["Permanent", "Lasting", "Stable"], level: 4 },
];

// ─── Counting Data ──────────────────────────────────────────────────────────
const countingData = [
  { items: ["🍎", "🍎", "🍎"], answer: 3, choices: [2, 3, 4], level: 1 },
  { items: ["⭐", "⭐", "⭐", "⭐", "⭐"], answer: 5, choices: [4, 5, 6], level: 1 },
  { items: ["🐟", "🐟"], answer: 2, choices: [1, 2, 3], level: 1 },
  { items: ["🎈", "🎈", "🎈", "🎈"], answer: 4, choices: [3, 4, 5], level: 1 },
  { items: ["🌸"], answer: 1, choices: [1, 2, 3], level: 1 },
  { items: ["🐱", "🐱", "🐱", "🐱", "🐱", "🐱"], answer: 6, choices: [5, 6, 7], level: 1 },
  { items: ["🍪", "🍪", "🍪", "🍪", "🍪", "🍪", "🍪"], answer: 7, choices: [6, 7, 8], level: 2 },
  { items: ["🦋", "🦋", "🦋", "🦋", "🦋", "🦋", "🦋", "🦋", "🦋"], answer: 9, choices: [8, 9, 10], level: 2 },
  { items: ["🌙", "🌙", "🌙", "🌙", "🌙", "🌙", "🌙", "🌙"], answer: 8, choices: [7, 8, 9], level: 2 },
  { items: ["🔵", "🔵", "🔵", "🔵", "🔵", "🔵", "🔵", "🔵", "🔵", "🔵"], answer: 10, choices: [9, 10, 11], level: 2 },
  { items: ["🍎", "🍎", "🍎", "🍎", "🍎", "🍎", "🍎", "🍎", "🍎", "🍎", "🍎", "🍎"], answer: 12, choices: [11, 12, 13], level: 3 },
  { items: ["⭐", "⭐", "⭐", "⭐", "⭐", "⭐", "⭐", "⭐", "⭐", "⭐", "⭐", "⭐", "⭐", "⭐", "⭐"], answer: 15, choices: [14, 15, 16], level: 3 },
];

// ─── Size Sorting Data ──────────────────────────────────────────────────────
const sizeSortData = [
  { items: [{ emoji: "🐘", label: "Elephant", size: 3 }, { emoji: "🐱", label: "Cat", size: 2 }, { emoji: "🐜", label: "Ant", size: 1 }], level: 1 },
  { items: [{ emoji: "🌳", label: "Tree", size: 3 }, { emoji: "🌻", label: "Flower", size: 2 }, { emoji: "🌱", label: "Sprout", size: 1 }], level: 1 },
  { items: [{ emoji: "🏠", label: "House", size: 3 }, { emoji: "🚗", label: "Car", size: 2 }, { emoji: "📱", label: "Phone", size: 1 }], level: 1 },
  { items: [{ emoji: "🌊", label: "Ocean", size: 4 }, { emoji: "🏔️", label: "Mountain", size: 3 }, { emoji: "🏠", label: "House", size: 2 }, { emoji: "🧸", label: "Teddy", size: 1 }], level: 2 },
  { items: [{ emoji: "🐋", label: "Whale", size: 4 }, { emoji: "🐕", label: "Dog", size: 3 }, { emoji: "🐸", label: "Frog", size: 2 }, { emoji: "🐛", label: "Bug", size: 1 }], level: 2 },
  { items: [{ emoji: "🌍", label: "Earth", size: 5 }, { emoji: "🏔️", label: "Mountain", size: 4 }, { emoji: "🏢", label: "Building", size: 3 }, { emoji: "🧑", label: "Person", size: 2 }, { emoji: "🐜", label: "Ant", size: 1 }], level: 3 },
];

// ─── Clock Data ─────────────────────────────────────────────────────────────
const clockData = [
  { hour: 3, minute: 0, display: "3:00", choices: ["3:00", "6:00", "9:00"], level: 1 },
  { hour: 6, minute: 0, display: "6:00", choices: ["6:00", "12:00", "3:00"], level: 1 },
  { hour: 12, minute: 0, display: "12:00", choices: ["12:00", "6:00", "9:00"], level: 1 },
  { hour: 9, minute: 0, display: "9:00", choices: ["9:00", "3:00", "6:00"], level: 1 },
  { hour: 2, minute: 30, display: "2:30", choices: ["2:30", "3:00", "6:30"], level: 2 },
  { hour: 7, minute: 30, display: "7:30", choices: ["7:30", "8:30", "7:00"], level: 2 },
  { hour: 10, minute: 30, display: "10:30", choices: ["10:30", "11:30", "10:00"], level: 2 },
  { hour: 4, minute: 15, display: "4:15", choices: ["4:15", "3:15", "4:45"], level: 3 },
  { hour: 8, minute: 45, display: "8:45", choices: ["8:45", "9:45", "8:15"], level: 3 },
  { hour: 11, minute: 20, display: "11:20", choices: ["11:20", "4:55", "11:40"], level: 3 },
  // Level 4 — Adult: minute-precise times
  { hour: 1, minute: 47, display: "1:47", choices: ["1:47", "1:43", "2:47"], level: 4 },
  { hour: 5, minute: 52, display: "5:52", choices: ["5:52", "6:08", "5:08"], level: 4 },
  { hour: 9, minute: 38, display: "9:38", choices: ["9:38", "9:22", "10:38"], level: 4 },
  { hour: 12, minute: 14, display: "12:14", choices: ["12:14", "12:46", "1:14"], level: 4 },
  { hour: 6, minute: 3, display: "6:03", choices: ["6:03", "5:57", "6:33"], level: 4 },
];

// ─── Money Data ─────────────────────────────────────────────────────────────
const moneyData = [
  { coins: ["25¢"], total: 25, display: "$0.25", choices: ["$0.25", "$0.50", "$0.10"], level: 1 },
  { coins: ["10¢", "10¢"], total: 20, display: "$0.20", choices: ["$0.20", "$0.10", "$0.30"], level: 1 },
  { coins: ["25¢", "25¢"], total: 50, display: "$0.50", choices: ["$0.50", "$0.25", "$0.75"], level: 1 },
  { coins: ["5¢", "5¢", "5¢"], total: 15, display: "$0.15", choices: ["$0.15", "$0.10", "$0.20"], level: 1 },
  { coins: ["25¢", "10¢", "5¢"], total: 40, display: "$0.40", choices: ["$0.40", "$0.35", "$0.45"], level: 2 },
  { coins: ["25¢", "25¢", "10¢"], total: 60, display: "$0.60", choices: ["$0.60", "$0.50", "$0.70"], level: 2 },
  { coins: ["25¢", "10¢", "10¢", "5¢"], total: 50, display: "$0.50", choices: ["$0.50", "$0.45", "$0.55"], level: 2 },
  { coins: ["$1", "25¢", "10¢"], total: 135, display: "$1.35", choices: ["$1.35", "$1.25", "$1.45"], level: 3 },
  { coins: ["$1", "$1", "25¢", "10¢", "5¢"], total: 240, display: "$2.40", choices: ["$2.40", "$2.35", "$2.50"], level: 3 },
  { coins: ["$5", "$1", "25¢", "25¢", "10¢"], total: 660, display: "$6.60", choices: ["$6.60", "$5.60", "$6.50"], level: 3 },
  // Level 4 — Adult: budgeting amounts, mixed bills/coins
  { coins: ["$10", "$5", "$1", "$1", "25¢"], total: 1725, display: "$17.25", choices: ["$17.25", "$16.25", "$17.75"], level: 4 },
  { coins: ["$20", "$5", "$1", "25¢", "10¢", "5¢"], total: 2640, display: "$26.40", choices: ["$26.40", "$25.40", "$26.50"], level: 4 },
  { coins: ["$20", "$20", "$10", "$5"], total: 5500, display: "$55.00", choices: ["$55.00", "$50.00", "$60.00"], level: 4 },
  { coins: ["$50", "$10", "$5", "$1", "$1"], total: 6700, display: "$67.00", choices: ["$67.00", "$66.00", "$70.00"], level: 4 },
  { coins: ["$100", "$20", "$5", "25¢", "25¢"], total: 12550, display: "$125.50", choices: ["$125.50", "$125.00", "$130.50"], level: 4 },
];

// ─── Emotion Match Data ─────────────────────────────────────────────────────
const emotionMatchData = [
  { face: "😊", answer: "Happy", choices: ["Happy", "Sad", "Angry"], level: 1 },
  { face: "😢", answer: "Sad", choices: ["Happy", "Sad", "Scared"], level: 1 },
  { face: "😠", answer: "Angry", choices: ["Angry", "Happy", "Tired"], level: 1 },
  { face: "😨", answer: "Scared", choices: ["Scared", "Excited", "Bored"], level: 1 },
  { face: "😴", answer: "Tired", choices: ["Tired", "Sad", "Calm"], level: 1 },
  { face: "🤩", answer: "Excited", choices: ["Excited", "Happy", "Surprised"], level: 1 },
  { face: "😕", answer: "Confused", choices: ["Confused", "Worried", "Bored"], level: 2 },
  { face: "😤", answer: "Frustrated", choices: ["Frustrated", "Angry", "Annoyed"], level: 2 },
  { face: "🥰", answer: "Loved", choices: ["Loved", "Happy", "Grateful"], level: 2 },
  { face: "😬", answer: "Nervous", choices: ["Nervous", "Scared", "Worried"], level: 2 },
  { face: "😞", answer: "Disappointed", choices: ["Disappointed", "Sad", "Bored"], level: 3 },
  { face: "🤗", answer: "Affectionate", choices: ["Affectionate", "Happy", "Grateful"], level: 3 },
  { face: "😏", answer: "Smug", choices: ["Smug", "Happy", "Confident"], level: 3 },
  { face: "🫣", answer: "Embarrassed", choices: ["Embarrassed", "Shy", "Nervous"], level: 3 },
  // Level 4 — Adult: complex emotional states
  { face: "😮‍💨", answer: "Relieved", choices: ["Relieved", "Tired", "Bored"], level: 4 },
  { face: "🙄", answer: "Unimpressed", choices: ["Unimpressed", "Annoyed", "Distracted"], level: 4 },
  { face: "😔", answer: "Remorseful", choices: ["Remorseful", "Sad", "Tired"], level: 4 },
  { face: "🤨", answer: "Skeptical", choices: ["Skeptical", "Confused", "Curious"], level: 4 },
  { face: "😩", answer: "Overwhelmed", choices: ["Overwhelmed", "Exhausted", "Frustrated"], level: 4 },
  { face: "🥲", answer: "Bittersweet", choices: ["Bittersweet", "Happy", "Sad"], level: 4 },
  { face: "😶", answer: "Speechless", choices: ["Speechless", "Bored", "Calm"], level: 4 },
];

// ─── What's Missing Data ────────────────────────────────────────────────────
const missingData = [
  { items: ["🍎", "🍌", "🍇", "🍊"], missing: "🍌", choices: ["🍌", "🍕", "🥕"], level: 1 },
  { items: ["🐱", "🐕", "🐟", "🐦"], missing: "🐟", choices: ["🐟", "🐸", "🐍"], level: 1 },
  { items: ["⭐", "🌙", "☀️", "🌈"], missing: "☀️", choices: ["☀️", "💧", "⚡"], level: 1 },
  { items: ["🚗", "🚌", "✈️", "🚢"], missing: "✈️", choices: ["✈️", "🚲", "🛹"], level: 1 },
  { items: ["❤️", "💛", "💚", "💙", "💜"], missing: "💚", choices: ["💚", "🧡", "🤍"], level: 2 },
  { items: ["🎸", "🥁", "🎹", "🎺", "🎻"], missing: "🎹", choices: ["🎹", "📻", "🔔"], level: 2 },
  { items: ["1", "2", "3", "4", "5", "6"], missing: "4", choices: ["4", "7", "9"], level: 2 },
  { items: ["A", "B", "C", "D", "E", "F"], missing: "D", choices: ["D", "G", "H"], level: 3 },
  { items: ["🌑", "🌒", "🌓", "🌔", "🌕"], missing: "🌓", choices: ["🌓", "🌙", "⭐"], level: 3 },
  { items: ["👶", "🧒", "🧑", "🧓"], missing: "🧑", choices: ["🧑", "👦", "👴"], level: 3 },
  // Level 4 — Adult: roman numerals, chemistry, geography, sequences
  { items: ["I", "II", "III", "IV", "V", "VI"], missing: "IV", choices: ["IV", "VII", "IX"], level: 4 },
  { items: ["Mercury", "Venus", "Earth", "Mars", "Jupiter"], missing: "Mars", choices: ["Mars", "Pluto", "Saturn"], level: 4 },
  { items: ["Spring", "Summer", "Autumn", "Winter"], missing: "Autumn", choices: ["Autumn", "Rainy", "Dry"], level: 4 },
  { items: ["2", "4", "8", "16", "32"], missing: "8", choices: ["8", "6", "12"], level: 4 },
  { items: ["Red", "Orange", "Yellow", "Green", "Blue", "Indigo", "Violet"], missing: "Indigo", choices: ["Indigo", "Pink", "Brown"], level: 4 },
  { items: ["H", "He", "Li", "Be", "B", "C"], missing: "Be", choices: ["Be", "Na", "Fe"], level: 4 },
];

// ─── Story Builder (Mad Libs) Templates ─────────────────────────────────────
const storyTemplates = [
  {
    id: "adventure", title: "The Adventure", emoji: "🗺️",
    template: "One day, a {adjective} {animal} went to the {place}. It found a {adjective2} {thing} and felt very {feeling}!",
    blanks: [
      { key: "adjective", label: "Describe it", choices: ["silly", "brave", "tiny", "magical", "sneaky", "sparkly"] },
      { key: "animal", label: "Pick an animal", choices: ["cat", "dragon", "penguin", "unicorn", "puppy", "bear"] },
      { key: "place", label: "Pick a place", choices: ["moon", "castle", "jungle", "ocean", "candy shop", "cloud"] },
      { key: "adjective2", label: "Describe it", choices: ["golden", "glowing", "giant", "invisible", "rainbow", "fluffy"] },
      { key: "thing", label: "Pick a thing", choices: ["treasure", "sandwich", "spaceship", "crown", "magic wand", "pizza"] },
      { key: "feeling", label: "Pick a feeling", choices: ["happy", "excited", "surprised", "proud", "giggly", "amazed"] },
    ],
  },
  {
    id: "school", title: "School Day", emoji: "🏫",
    template: "At school, my {adjective} teacher said we would learn about {topic}. I used my {color} {supply} and made a {adjective2} {creation}. Everyone said {exclamation}!",
    blanks: [
      { key: "adjective", label: "Describe teacher", choices: ["funny", "kind", "tall", "smart", "silly", "cool"] },
      { key: "topic", label: "What to learn", choices: ["dinosaurs", "space", "robots", "animals", "magic", "cooking"] },
      { key: "color", label: "Pick a color", choices: ["red", "blue", "purple", "rainbow", "gold", "green"] },
      { key: "supply", label: "School supply", choices: ["pencil", "crayon", "glitter", "paintbrush", "marker", "chalk"] },
      { key: "adjective2", label: "Describe it", choices: ["amazing", "huge", "sparkly", "wiggly", "beautiful", "funny"] },
      { key: "creation", label: "What you made", choices: ["robot", "picture", "volcano", "rocket", "monster", "cake"] },
      { key: "exclamation", label: "They said", choices: ["Wow!", "Amazing!", "Cool!", "Awesome!", "Incredible!", "Yay!"] },
    ],
  },
  {
    id: "pet", title: "My Pet", emoji: "🐾",
    template: "I have a pet {animal}. Its name is {name} and it loves to {action}. It eats {food} every day. My pet is very {adjective} and makes me feel {feeling}.",
    blanks: [
      { key: "animal", label: "Pick a pet", choices: ["dinosaur", "cloud", "robot", "dragon", "unicorn", "alien"] },
      { key: "name", label: "Name your pet", choices: ["Sparkle", "Zoom", "Bubbles", "Captain", "Noodle", "Pickle"] },
      { key: "action", label: "What it does", choices: ["dance", "fly", "sing", "surf", "paint", "skateboard"] },
      { key: "food", label: "What it eats", choices: ["pizza", "rainbows", "stars", "cookies", "clouds", "tacos"] },
      { key: "adjective", label: "Describe it", choices: ["fluffy", "sparkly", "bouncy", "giggly", "cuddly", "wild"] },
      { key: "feeling", label: "How you feel", choices: ["happy", "lucky", "loved", "proud", "giggly", "warm"] },
    ],
  },
];

// ─── Maze Data ──────────────────────────────────────────────────────────────
// Simple grid mazes: 0=wall, 1=path, 2=start, 3=end
const mazeData = [
  { level: 1, rows: 5, cols: 5, grid: [
    [2,1,0,0,0],
    [0,1,1,1,0],
    [0,0,0,1,0],
    [0,1,1,1,0],
    [0,1,0,0,3],
  ]},
  { level: 1, rows: 5, cols: 5, grid: [
    [2,1,1,0,0],
    [0,0,1,0,0],
    [0,0,1,1,0],
    [0,0,0,1,0],
    [0,0,0,1,3],
  ]},
  { level: 2, rows: 7, cols: 7, grid: [
    [2,1,0,0,0,0,0],
    [0,1,1,1,0,0,0],
    [0,0,0,1,0,0,0],
    [0,1,1,1,1,1,0],
    [0,1,0,0,0,1,0],
    [0,1,1,1,0,1,0],
    [0,0,0,1,0,1,3],
  ]},
  { level: 2, rows: 7, cols: 7, grid: [
    [2,1,1,1,1,0,0],
    [0,0,0,0,1,0,0],
    [0,1,1,0,1,1,0],
    [0,1,0,0,0,1,0],
    [0,1,0,1,1,1,0],
    [0,1,0,1,0,0,0],
    [0,1,1,1,0,0,3],
  ]},
  { level: 3, rows: 9, cols: 9, grid: [
    [2,1,0,0,0,0,0,0,0],
    [0,1,1,1,0,1,1,1,0],
    [0,0,0,1,0,1,0,1,0],
    [0,1,1,1,1,1,0,1,0],
    [0,1,0,0,0,0,0,1,0],
    [0,1,0,1,1,1,1,1,0],
    [0,1,0,1,0,0,0,0,0],
    [0,1,1,1,0,1,1,1,0],
    [0,0,0,0,0,1,0,1,3],
  ]},
  // Level 4 — Adult: larger serpentine mazes
  { level: 4, rows: 11, cols: 11, grid: [
    [2,1,1,1,1,1,1,1,1,1,0],
    [0,0,0,0,0,0,0,0,0,1,0],
    [0,1,1,1,1,1,1,1,0,1,0],
    [0,1,0,0,0,0,0,1,0,1,0],
    [0,1,0,1,1,1,0,1,0,1,0],
    [0,1,0,1,0,1,0,1,0,1,0],
    [0,1,0,1,0,1,0,1,0,1,0],
    [0,1,0,1,0,1,0,1,0,1,0],
    [0,1,0,1,0,1,0,1,0,1,0],
    [0,1,0,1,0,1,0,1,0,1,0],
    [0,1,0,0,0,0,0,0,0,1,3],
  ]},
  { level: 4, rows: 9, cols: 11, grid: [
    [2,1,1,1,1,1,1,1,1,1,1],
    [0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,0,1],
    [1,0,0,0,0,0,0,0,1,0,1],
    [1,0,1,1,1,1,1,0,1,0,1],
    [1,0,1,0,0,0,1,0,1,0,1],
    [1,0,1,0,1,1,1,0,1,0,1],
    [1,0,1,0,0,0,0,0,1,0,1],
    [0,0,1,1,1,1,1,1,1,0,3],
  ]},
];

// ─── Social Stories ─────────────────────────────────────────────────────────
const socialStories = [
  {
    id: "doctor", title: "Going to the Doctor", emoji: "🏥", color: "#4E8AE6",
    pages: [
      { text: "Today I am going to the doctor.", emoji: "🏥" },
      { text: "The waiting room might have other people. That's okay.", emoji: "🪑" },
      { text: "A nurse might check my temperature or weigh me.", emoji: "🌡️" },
      { text: "The doctor will ask me questions about how I feel.", emoji: "👨‍⚕️" },
      { text: "The doctor might look in my ears, eyes, and mouth. It doesn't hurt.", emoji: "👁️" },
      { text: "When it's done, I can feel proud that I was brave!", emoji: "⭐" },
    ],
  },
  {
    id: "school", title: "First Day of School", emoji: "🏫", color: "#8B6CF6",
    pages: [
      { text: "Today is a new day at school. It's okay to feel nervous.", emoji: "🏫" },
      { text: "I will meet my teacher. They are there to help me.", emoji: "🧑‍🏫" },
      { text: "There will be other kids. Some might become my friends.", emoji: "👦" },
      { text: "I will learn new things. Learning can be fun!", emoji: "📚" },
      { text: "If I need help, I can raise my hand or ask the teacher.", emoji: "🙋" },
      { text: "At the end of the day, someone will pick me up. I did it!", emoji: "🎉" },
    ],
  },
  {
    id: "grocery", title: "Going to the Store", emoji: "🛒", color: "#3EBB6E",
    pages: [
      { text: "Today we are going to the store to get things we need.", emoji: "🛒" },
      { text: "The store might be bright and noisy. I can take deep breaths.", emoji: "💨" },
      { text: "We will walk through the aisles and pick out food.", emoji: "🍎" },
      { text: "I can help by putting things in the cart.", emoji: "🤲" },
      { text: "At the checkout, we wait in line. Waiting is hard but I can do it.", emoji: "⏳" },
      { text: "Then we go home! I was a great helper.", emoji: "🏠" },
    ],
  },
  {
    id: "haircut", title: "Getting a Haircut", emoji: "💇", color: "#E84E8A",
    pages: [
      { text: "Today I am getting a haircut. My hair is getting long!", emoji: "💇" },
      { text: "I will sit in a special chair. It might go up and down.", emoji: "💺" },
      { text: "The hairdresser will put a cape on me to keep me clean.", emoji: "🧥" },
      { text: "I might hear buzzing or snipping. These are normal sounds.", emoji: "✂️" },
      { text: "I can sit very still. If I need a break, I can ask.", emoji: "✋" },
      { text: "When it's done, I will look great! I was so brave.", emoji: "🌟" },
    ],
  },
  {
    id: "restaurant", title: "Eating at a Restaurant", emoji: "🍽️", color: "#F7B731",
    pages: [
      { text: "Today we are eating at a restaurant. How exciting!", emoji: "🍽️" },
      { text: "We will sit at a table and look at the menu.", emoji: "📋" },
      { text: "I can choose what I want to eat. It's okay to take my time.", emoji: "🤔" },
      { text: "A waiter will bring our food. I can say please and thank you.", emoji: "🙏" },
      { text: "I will use my inside voice because other people are eating too.", emoji: "🤫" },
      { text: "When we're done, we go home with full tummies!", emoji: "😊" },
    ],
  },
  {
    id: "feelings", title: "When I Feel Angry", emoji: "😠", color: "#FF6B3D",
    pages: [
      { text: "Sometimes I feel angry. Everybody feels angry sometimes.", emoji: "😠" },
      { text: "My body might feel hot. My hands might squeeze tight.", emoji: "✊" },
      { text: "When I feel angry, I can stop and take a deep breath.", emoji: "🫁" },
      { text: "I can count to ten slowly. 1... 2... 3... 4... 5...", emoji: "🔢" },
      { text: "I can tell someone how I feel. 'I feel angry because...'", emoji: "💬" },
      { text: "The angry feeling will pass. I can handle big feelings!", emoji: "💪" },
    ],
  },
  {
    id: "sleepover", title: "Sleeping at Someone's House", emoji: "🏠", color: "#8B6CF6",
    pages: [
      { text: "Tonight I am sleeping at someone else's house.", emoji: "🏠" },
      { text: "I packed my bag with my pajamas and toothbrush.", emoji: "🎒" },
      { text: "Their house might look different from mine. That's okay.", emoji: "👀" },
      { text: "We might play games, watch a movie, or have snacks.", emoji: "🎮" },
      { text: "When it's bedtime, I can use my own pillow or stuffed animal.", emoji: "🧸" },
      { text: "In the morning, someone will come get me. I had fun!", emoji: "🌅" },
    ],
  },
  {
    id: "new_friend", title: "Making a New Friend", emoji: "🤝", color: "#3EBB6E",
    pages: [
      { text: "I see someone I want to be friends with.", emoji: "👋" },
      { text: "I can walk up to them and say 'Hi, my name is...'", emoji: "🗣️" },
      { text: "I can ask them what they like to do.", emoji: "❓" },
      { text: "If they want to play, great! If not, that's okay too.", emoji: "🎮" },
      { text: "Friends share, take turns, and are kind to each other.", emoji: "🤲" },
      { text: "Making friends takes time. I'm doing a great job!", emoji: "⭐" },
    ],
  },
  {
    id: "dentist", title: "Going to the Dentist", emoji: "🦷", color: "#06B6D4",
    pages: [
      { text: "Today I am going to the dentist. The dentist helps keep my teeth healthy.", emoji: "🦷" },
      { text: "I will sit in a big chair that leans back. It is shiny and soft.", emoji: "💺" },
      { text: "The dentist will wear a mask and gloves. This keeps everyone safe.", emoji: "😷" },
      { text: "They will count my teeth and look at them with a little mirror.", emoji: "🪞" },
      { text: "Sometimes there is a buzzing sound. That's the tooth cleaner.", emoji: "🔊" },
      { text: "When it's done, I get to pick a sticker or a new toothbrush!", emoji: "⭐" },
    ],
  },
  {
    id: "airplane", title: "Flying on an Airplane", emoji: "✈️", color: "#2563EB",
    pages: [
      { text: "Today we are flying on an airplane. We will go through the airport first.", emoji: "🛫" },
      { text: "We will go through security. I need to put my bag on the belt.", emoji: "🎒" },
      { text: "The airport might be busy and loud. I can wear headphones if I want.", emoji: "🎧" },
      { text: "When we board the plane, I will sit in my seat and buckle my seatbelt.", emoji: "💺" },
      { text: "Takeoff can feel bumpy. My ears might pop. I can chew gum to help.", emoji: "🫧" },
      { text: "When we land, we are in a new place. It was a big adventure!", emoji: "🌍" },
    ],
  },
  {
    id: "birthday", title: "A Birthday Party", emoji: "🎂", color: "#EC4899",
    pages: [
      { text: "I am going to a birthday party. There will be lots of kids there.", emoji: "🎉" },
      { text: "It might be loud with people singing and laughing. That's normal.", emoji: "🎵" },
      { text: "I can bring a gift for the birthday person. Giving feels good.", emoji: "🎁" },
      { text: "We might play games, eat cake, and sing 'Happy Birthday'.", emoji: "🎂" },
      { text: "If I need a quiet break, I can ask a grown-up to help me find one.", emoji: "😌" },
      { text: "Parties can be fun. I don't have to do everything—only what feels okay.", emoji: "🥳" },
    ],
  },
  {
    id: "sharing", title: "Sharing and Taking Turns", emoji: "🤲", color: "#F59E0B",
    pages: [
      { text: "Sometimes I want to play with a toy, but someone else is using it.", emoji: "🧸" },
      { text: "I can wait my turn. Waiting is hard, but I can do it.", emoji: "⏳" },
      { text: "I can say, 'Can I have a turn when you're done, please?'", emoji: "🗣️" },
      { text: "When it's my turn, I get to play with the toy too.", emoji: "😊" },
      { text: "Sharing makes playing more fun for everyone.", emoji: "🤝" },
      { text: "I am a good friend when I share and take turns.", emoji: "⭐" },
    ],
  },
  {
    id: "losing_game", title: "When I Lose a Game", emoji: "🎲", color: "#7C3AED",
    pages: [
      { text: "Sometimes I play a game and I don't win. That's part of playing.", emoji: "🎲" },
      { text: "Losing can make me feel sad, mad, or frustrated. Those feelings are okay.", emoji: "😠" },
      { text: "I can take a deep breath and remind myself it is just a game.", emoji: "🫁" },
      { text: "I can say 'good game' to the person who won. That is being a good sport.", emoji: "🤝" },
      { text: "The more I practice, the better I get. Trying is what matters.", emoji: "💪" },
      { text: "There will be more games. Next time I might win!", emoji: "🌟" },
    ],
  },
  {
    id: "asking_help", title: "Asking for Help", emoji: "🙋", color: "#10B981",
    pages: [
      { text: "Sometimes things feel hard and I don't know what to do.", emoji: "🤔" },
      { text: "It's okay to ask for help. Everyone needs help sometimes.", emoji: "💡" },
      { text: "I can find a safe grown-up like a parent, teacher, or friend.", emoji: "👨‍👩‍👧" },
      { text: "I can say, 'Excuse me, I need help with ___.'", emoji: "🗣️" },
      { text: "Asking for help is brave and smart. It is not a bad thing.", emoji: "💪" },
      { text: "When I get help, I can say 'thank you' to show I appreciate it.", emoji: "🙏" },
    ],
  },
  {
    id: "fire_drill", title: "A Fire Drill at School", emoji: "🚨", color: "#DC2626",
    pages: [
      { text: "Sometimes at school we practice what to do if there is a fire.", emoji: "🚨" },
      { text: "A loud alarm will ring. It can be startling. I can cover my ears.", emoji: "🔔" },
      { text: "My teacher will ask everyone to line up quietly and calmly.", emoji: "🧑‍🏫" },
      { text: "We will walk outside together to a safe spot.", emoji: "🚶" },
      { text: "The teacher will check that everyone is there. I stay with my class.", emoji: "📋" },
      { text: "When it's safe, we walk back inside. A drill keeps us ready and safe.", emoji: "✅" },
    ],
  },
  {
    id: "public_bathroom", title: "Using a Public Bathroom", emoji: "🚻", color: "#06B6D4",
    pages: [
      { text: "Sometimes when I'm out, I need to use a public bathroom.", emoji: "🚻" },
      { text: "Public bathrooms might echo or have loud hand dryers. That's normal.", emoji: "🔊" },
      { text: "The toilet might flush by itself. It can be surprising but it's safe.", emoji: "🚽" },
      { text: "I can wash my hands with soap and warm water after.", emoji: "🧼" },
      { text: "If the dryer is too loud, I can use paper towels or shake my hands dry.", emoji: "🖐️" },
      { text: "I did a great job taking care of myself!", emoji: "⭐" },
    ],
  },
  {
    id: "morning", title: "My Morning Routine", emoji: "🌅", color: "#F59E0B",
    pages: [
      { text: "Every morning, I start my day by waking up.", emoji: "⏰" },
      { text: "First, I use the bathroom and wash my face.", emoji: "🚿" },
      { text: "Then I brush my teeth so they stay clean and healthy.", emoji: "🪥" },
      { text: "I put on clothes that feel good on my body.", emoji: "👕" },
      { text: "I eat breakfast to give my body energy for the day.", emoji: "🥣" },
      { text: "Now I am ready for a great day!", emoji: "🌞" },
    ],
  },
  {
    id: "bad_day", title: "When I Have a Hard Day", emoji: "🌧️", color: "#8B5CF6",
    pages: [
      { text: "Some days are hard. Things don't go the way I want them to.", emoji: "😔" },
      { text: "It's okay to feel upset. My feelings are real and important.", emoji: "💭" },
      { text: "I can take slow, deep breaths to help my body feel calmer.", emoji: "🫁" },
      { text: "I can do something that makes me feel better, like a walk or a hug.", emoji: "🚶" },
      { text: "Hard days don't last forever. Tomorrow is a new day.", emoji: "🌅" },
      { text: "I am strong, and I can get through this.", emoji: "💪" },
    ],
  },
  {
    id: "new_place", title: "Visiting a New Place", emoji: "🗺️", color: "#10B981",
    pages: [
      { text: "Today I am going somewhere I haven't been before.", emoji: "🗺️" },
      { text: "New places can feel exciting or a little scary. Both feelings are okay.", emoji: "🤔" },
      { text: "I can look around and notice new sights, sounds, and smells.", emoji: "👀" },
      { text: "If I feel worried, I can hold something from home, like a stuffed toy.", emoji: "🧸" },
      { text: "I can ask questions if I want to know what will happen.", emoji: "❓" },
      { text: "Every new place is an adventure. I am brave for trying it.", emoji: "🌟" },
    ],
  },
];

// ─── Reading Practice Data ──────────────────────────────────────────────────
const sightWords = {
  level1: [
    "the", "and", "is", "it", "to", "in", "I", "a", "my", "we", "go", "no", "so", "he", "me", "be", "do", "up", "at", "on",
    "if", "as", "an", "by", "or", "us", "am", "of", "for", "see",
    "red", "big", "can", "run", "sit", "top", "bed", "dog", "cat", "sun",
    "has", "had", "but", "not", "yes", "one", "two", "ten", "mom", "dad",
  ],
  level2: [
    "said", "have", "with", "they", "this", "from", "that", "what", "were", "when",
    "your", "each", "make", "like", "just", "over", "such", "take", "than", "them",
    "been", "into", "more", "some", "time", "will", "many", "then", "most", "know",
    "well", "find", "here", "good", "year", "work", "back", "also", "after", "came",
    "want", "give", "play", "keep", "help", "show", "read", "name", "long", "made",
  ],
  level3: [
    "about", "could", "would", "there", "their", "which", "other", "because", "through", "before",
    "should", "between", "people", "different", "important", "another", "together", "something", "sometimes", "everything",
    "around", "really", "should", "under", "every", "think", "still", "first", "water", "world",
    "while", "until", "above", "below", "began", "almost", "country", "example", "several", "without",
    "always", "never", "school", "family", "friend", "house", "happy", "story", "place", "thought",
  ],
  level4: [
    "although", "however", "therefore", "nevertheless", "consequently", "furthermore", "specifically", "generally", "particularly", "essentially",
    "significantly", "previously", "immediately", "approximately", "effectively", "independently", "additionally", "ultimately", "eventually", "occasionally",
    "regardless", "meanwhile", "accordingly", "subsequently", "alternatively", "predominantly", "exclusively", "relatively", "undoubtedly", "frequently",
    "acknowledge", "demonstrate", "establish", "investigate", "analyze", "determine", "influence", "recognize", "maintain", "achieve",
    "experience", "opportunity", "environment", "technology", "community", "education", "government", "responsibility", "relationship", "development",
  ],
};

const readingStories = [
  {
    id: "cat_story", title: "The Cat", emoji: "🐱", level: 1,
    text: "I see a cat. The cat is big. The cat is on my bed. I like the cat. The cat is my friend.",
    questions: [{ q: "Where is the cat?", choices: ["On the bed", "In the car", "At school"], a: "On the bed" }],
  },
  {
    id: "park_story", title: "At the Park", emoji: "🌲", level: 1,
    text: "We go to the park. I see a dog. The dog can run fast. I like to play at the park. It is fun.",
    questions: [{ q: "What did you see?", choices: ["A cat", "A dog", "A bird"], a: "A dog" }],
  },
  {
    id: "red_ball", title: "My Red Ball", emoji: "⚽", level: 1,
    text: "I have a red ball. The ball is round. I kick the ball. The ball rolls far. I run to get my red ball.",
    questions: [{ q: "What color is the ball?", choices: ["Blue", "Red", "Green"], a: "Red" }],
  },
  {
    id: "apple_tree", title: "The Apple Tree", emoji: "🍎", level: 1,
    text: "There is a tree in my yard. The tree has apples. The apples are red. I pick one apple. The apple is yummy.",
    questions: [{ q: "What is on the tree?", choices: ["Apples", "Leaves only", "Birds"], a: "Apples" }],
  },
  {
    id: "my_dog", title: "My Dog Max", emoji: "🐕", level: 1,
    text: "Max is my dog. Max is brown. Max likes to play. I throw a stick. Max runs fast and brings it back.",
    questions: [{ q: "What color is Max?", choices: ["Black", "Brown", "White"], a: "Brown" }],
  },
  {
    id: "rain_story", title: "Rainy Day", emoji: "🌧️", level: 2,
    text: "Today it is raining outside. I put on my rain boots and my jacket. I like to jump in puddles. The rain makes everything smell fresh. When I go inside, I have hot chocolate.",
    questions: [{ q: "What does the rain make?", choices: ["Everything wet", "Everything smell fresh", "Everything cold"], a: "Everything smell fresh" }],
  },
  {
    id: "space_story", title: "Space Adventure", emoji: "🚀", level: 2,
    text: "I dream about going to space. There are many stars and planets. The moon is very far away. Astronauts are very brave. Maybe one day I can visit the stars.",
    questions: [{ q: "Who is brave?", choices: ["Teachers", "Astronauts", "Doctors"], a: "Astronauts" }],
  },
  {
    id: "garden_story", title: "Grandma's Garden", emoji: "🌻", level: 2,
    text: "My grandma has a big garden behind her house. She grows tomatoes, carrots, and sunflowers. The sunflowers are taller than me! Grandma lets me help water the plants. I love visiting her garden in the summer.",
    questions: [{ q: "What is taller than the child?", choices: ["Tomatoes", "Sunflowers", "Carrots"], a: "Sunflowers" }],
  },
  {
    id: "library_story", title: "The Library", emoji: "📚", level: 2,
    text: "Every Saturday, I go to the library with my mom. The library has thousands of books on tall shelves. I love finding new stories to read. The librarian helps me pick a good one. I can borrow books and take them home for two weeks.",
    questions: [{ q: "How long can you borrow a book?", choices: ["One week", "Two weeks", "One month"], a: "Two weeks" }],
  },
  {
    id: "snow_day", title: "The First Snow", emoji: "⛄", level: 2,
    text: "I woke up and looked out my window. Everything was white! The first snow of winter had come. I put on my warm coat, gloves, and boots. My sister and I built a snowman with a carrot nose. We laughed and played until our cheeks turned pink.",
    questions: [{ q: "What did they use for the snowman's nose?", choices: ["A button", "A carrot", "A stick"], a: "A carrot" }],
  },
  {
    id: "ocean_story", title: "Under the Sea", emoji: "🌊", level: 3,
    text: "The ocean is full of amazing creatures. Dolphins swim together in groups called pods. Octopuses have eight arms and are very smart. The coral reef is like an underwater city where thousands of fish live. Scientists are working to protect these beautiful places for the future.",
    questions: [{ q: "What are groups of dolphins called?", choices: ["Herds", "Pods", "Schools"], a: "Pods" }],
  },
  {
    id: "rainforest_story", title: "The Rainforest", emoji: "🌴", level: 3,
    text: "Rainforests are some of the most incredible places on Earth. They are home to more than half of all the plant and animal species in the world. Colorful parrots fly through the trees while monkeys swing from branch to branch. The rainforest receives huge amounts of rain, which helps the plants grow thick and tall. Protecting rainforests is important because they help keep our planet healthy.",
    questions: [{ q: "What fraction of species live in rainforests?", choices: ["One third", "More than half", "All of them"], a: "More than half" }],
  },
  {
    id: "invention_story", title: "The Lightbulb", emoji: "💡", level: 3,
    text: "Before the lightbulb was invented, people used candles and oil lamps to see at night. Thomas Edison worked for many years to create a safe, long-lasting electric light. He tried thousands of materials before he found one that worked. When his invention finally succeeded, it changed the world. Now we can light our homes, streets, and schools at the flip of a switch.",
    questions: [{ q: "Who invented the lightbulb?", choices: ["Albert Einstein", "Thomas Edison", "Isaac Newton"], a: "Thomas Edison" }],
  },
  {
    id: "volcano_story", title: "How Volcanoes Work", emoji: "🌋", level: 3,
    text: "Deep inside the Earth, there is a layer of hot, melted rock called magma. Sometimes this magma finds a way to push up through cracks in the ground. When it reaches the surface, it becomes lava and a volcano erupts. Volcanoes can be dangerous, but they also create new land and rich soil that is great for growing plants. Scientists study volcanoes to keep people safe.",
    questions: [{ q: "What is magma called when it reaches the surface?", choices: ["Ash", "Lava", "Steam"], a: "Lava" }],
  },
  // Level 4 — Adult reading
  {
    id: "climate", title: "A Changing Climate", emoji: "🌍", level: 4,
    text: "Climate change is one of the most significant challenges facing humanity today. Scientists have observed rising global temperatures over the past century, primarily driven by greenhouse gas emissions from burning fossil fuels. The consequences include melting ice caps, rising sea levels, and more extreme weather events. However, renewable energy sources like solar and wind power offer promising solutions, and many countries are now investing heavily in sustainable technologies.",
    questions: [{ q: "What primarily drives global temperature rise?", choices: ["Ocean currents", "Greenhouse gas emissions", "Volcanic activity"], a: "Greenhouse gas emissions" }],
  },
  {
    id: "ai_story", title: "The Rise of Artificial Intelligence", emoji: "🤖", level: 4,
    text: "Artificial intelligence has transformed the way we work, communicate, and make decisions. Machine learning algorithms can analyze enormous datasets, identify patterns that humans might miss, and generate insights that accelerate scientific discovery. Yet these capabilities raise important ethical questions about privacy, employment, and accountability. Responsible development requires collaboration between engineers, policymakers, and ordinary citizens to ensure the technology benefits everyone.",
    questions: [{ q: "What do machine learning algorithms analyze?", choices: ["Only text", "Enormous datasets", "Physical objects"], a: "Enormous datasets" }],
  },
  {
    id: "history_story", title: "Ancient Civilizations", emoji: "🏛️", level: 4,
    text: "Throughout history, civilizations have risen and fallen, leaving behind remarkable achievements in architecture, art, and governance. The ancient Egyptians built monumental pyramids that still stand thousands of years later. The Greeks developed philosophy, democracy, and theater that continue to influence modern society. Each civilization contributed ideas and innovations that shape how we live today, reminding us that progress is built upon the foundations of those who came before.",
    questions: [{ q: "What did the ancient Greeks develop?", choices: ["Only pyramids", "Philosophy and democracy", "Space travel"], a: "Philosophy and democracy" }],
  },
];

// ─── Coping Strategy Cards ──────────────────────────────────────────────────
const copingCards = [
  { emoji: "🫁", label: "Deep Breaths", desc: "Breathe in for 4, hold for 4, out for 4", color: "#4E8AE6" },
  { emoji: "🧊", label: "Hold Ice", desc: "Hold something cold to ground yourself", color: "#5B9BF0" },
  { emoji: "🎵", label: "Listen to Music", desc: "Put on your favorite song", color: "#8B6CF6" },
  { emoji: "🏃", label: "Move Your Body", desc: "Jump, stretch, or go for a walk", color: "#3EBB6E" },
  { emoji: "🧸", label: "Hug Something Soft", desc: "Squeeze a stuffed animal or pillow", color: "#E84E8A" },
  { emoji: "🔢", label: "Count to 10", desc: "Slowly count numbers to calm down", color: "#F7B731" },
  { emoji: "🎨", label: "Draw It Out", desc: "Draw how you're feeling", color: "#FF6B3D" },
  { emoji: "💬", label: "Talk to Someone", desc: "Tell a trusted person how you feel", color: "#4E8AE6" },
  { emoji: "🌿", label: "Go Outside", desc: "Fresh air can help you feel better", color: "#3EBB6E" },
  { emoji: "📖", label: "Read a Story", desc: "Lose yourself in a good book", color: "#8B6CF6" },
  { emoji: "✍️", label: "Write It Down", desc: "Journal your thoughts and feelings", color: "#E84E8A" },
  { emoji: "🫧", label: "Blow Bubbles", desc: "Pretend to blow bubbles slowly", color: "#5B9BF0" },
];

// ─── Speech ──────────────────────────────────────────────────────────────────
function getVoices() {
  return window.speechSynthesis?.getVoices() || [];
}

function findBestVoice(voices) {
  // Only consider clear English voices (US, UK, AU)
  const enVoices = voices.filter(v => /^en[-_](US|GB|AU)/i.test(v.lang));

  // Priority 1: Google's high-quality US English voices
  const googleUS = enVoices.find(v => /google\s+us\s+english/i.test(v.name));
  if (googleUS) return googleUS;

  // Priority 2: Any neural/natural/enhanced voice
  const neural = enVoices.find(v => /natural|neural|premium|enhanced|online/i.test(v.name));
  if (neural) return neural;

  // Priority 3: Well-known clear voices by name
  const known = enVoices.find(v => /samantha|alex|zira|david|google|microsoft.*online/i.test(v.name));
  if (known) return known;

  // Priority 4: Any US English voice
  const anyUS = voices.find(v => /^en[-_]US/i.test(v.lang));
  if (anyUS) return anyUS;

  // Priority 5: Any UK English voice
  const anyUK = voices.find(v => /^en[-_]GB/i.test(v.lang));
  if (anyUK) return anyUK;

  // Priority 6: Any English voice at all
  const anyEn = voices.find(v => v.lang.startsWith("en"));
  if (anyEn) return anyEn;

  return null;
}

function speak(text, settings = {}) {
  if (!a11y.voiceGuidance) return;
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  // Slightly slower and warmer pitch sounds less robotic on most engines
  u.rate = settings.voiceRate ?? 0.92;
  u.pitch = settings.voicePitch ?? 1.05;
  u.volume = 1;
  const voices = getVoices();
  if (settings.voiceId && settings.voiceId !== "default") {
    const v = voices.find(v => v.voiceURI === settings.voiceId);
    if (v) u.voice = v;
  } else {
    const best = findBestVoice(voices);
    if (best) u.voice = best;
  }
  window.speechSynthesis.speak(u);
}

// ─── Sound effects (non-speech feedback) ─────────────────────────────────────
let _sfxCtx = null;
function sfxCtx() {
  if (typeof window === "undefined") return null;
  if (!_sfxCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) _sfxCtx = new AC();
  }
  if (_sfxCtx && _sfxCtx.state === "suspended") { try { _sfxCtx.resume(); } catch (e) { /* ignore */ } }
  return _sfxCtx;
}

function playTone(freq, start, dur, { type = "sine", gain = 0.18 } = {}) {
  const ctx = sfxCtx(); if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// kind: "correct" | "wrong" | "tap" | "win"
function playSfx(kind) {
  if (!a11y.soundEffects) return;
  // Light haptic cue piggybacks on SFX so every game gets it for free
  if (kind === "correct") hapticTap(18);
  else if (kind === "wrong") hapticTap(40);
  else if (kind === "tap") hapticTap(8);
  else if (kind === "win") hapticTap(60);
  const ctx = sfxCtx(); if (!ctx) return;
  if (kind === "correct") {
    // warm two-note chime: C5 → E5
    playTone(523.25, 0,    0.22, { type: "sine",     gain: 0.2 });
    playTone(659.25, 0.09, 0.28, { type: "triangle", gain: 0.18 });
  } else if (kind === "wrong") {
    // gentle low "nope" — two soft low tones, nothing harsh
    playTone(196.0, 0,    0.16, { type: "sine", gain: 0.16 });
    playTone(174.6, 0.1,  0.22, { type: "sine", gain: 0.14 });
  } else if (kind === "tap") {
    playTone(880, 0, 0.08, { type: "sine", gain: 0.12 });
  } else if (kind === "win") {
    // ascending arpeggio C-E-G-C
    playTone(523.25, 0,    0.18, { type: "triangle", gain: 0.2 });
    playTone(659.25, 0.12, 0.18, { type: "triangle", gain: 0.2 });
    playTone(783.99, 0.24, 0.2,  { type: "triangle", gain: 0.2 });
    playTone(1046.5, 0.36, 0.45, { type: "triangle", gain: 0.22 });
  }
}

// ─── Shared UI ───────────────────────────────────────────────────────────────
function Btn({ children, color = T.primary, style, onClick, size = "md", disabled }) {
  const sizes = { sm: { padding: "8px 16px", fontSize: 14 }, md: { padding: "14px 28px", fontSize: 16 }, lg: { padding: "18px 36px", fontSize: 18 } };
  return (
    <button disabled={disabled} onClick={onClick} style={{
      ...sizes[size], borderRadius: 50, border: "none",
      background: disabled ? T.border : color, color: "#fff",
      fontFamily: T.font, fontWeight: 700, cursor: disabled ? "default" : "pointer",
      boxShadow: disabled ? "none" : `0 4px 16px ${color}40`,
      transition: "all 0.15s ease", opacity: disabled ? 0.5 : 1, ...style,
    }}>{children}</button>
  );
}

function Card({ children, style, onClick }) {
  const rm = a11y.reduceMotion;
  return (
    <div onClick={onClick} style={{
      background: T.surface, borderRadius: T.radius, padding: 20,
      boxShadow: T.shadow, border: `1.5px solid ${T.border}`,
      cursor: onClick ? "pointer" : "default",
      transition: rm ? "none" : "transform 0.12s ease", ...style,
    }}
      onPointerDown={e => { if (!onClick || rm) return; e.currentTarget.style.transform = "scale(0.97)"; }}
      onPointerUp={e => { if (!onClick || rm) return; e.currentTarget.style.transform = "scale(1)"; }}
      onPointerLeave={e => { if (!onClick || rm) return; e.currentTarget.style.transform = "scale(1)"; }}
    >{children}</div>
  );
}

function Header({ title, onBack, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, minHeight: 40 }}>
      {onBack && (
        <button aria-label="Go back" onClick={onBack} style={{
          width: 40, height: 40, borderRadius: 14, border: `1.5px solid ${T.border}`,
          background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.text} strokeWidth="2.5" strokeLinecap="round"><path d="M15 19l-7-7 7-7"/></svg>
        </button>
      )}
      <h1 style={{ fontFamily: T.font, fontSize: 24, fontWeight: 800, color: T.text, margin: 0, flex: 1 }}>{title}</h1>
      {right}
    </div>
  );
}

function ProgressBar({ value, max, color = T.primary, h = 10 }) {
  return (
    <div style={{ width: "100%", height: h, background: T.border, borderRadius: h, overflow: "hidden" }}>
      <div style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, height: "100%", background: color, borderRadius: h, transition: "width 0.4s ease" }} />
    </div>
  );
}

function Confetti({ active }) {
  if (!active) return null;
  if (a11y.reduceMotion) return null;
  const colors = [T.primary, T.blue, T.purple, T.green, T.yellow, T.pink];
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 999, overflow: "hidden" }}>
      {Array.from({ length: 40 }).map((_, i) => (
        <div key={i} style={{
          position: "absolute", left: `${Math.random() * 100}%`, top: -20,
          width: Math.random() * 10 + 6, height: Math.random() * 10 + 6,
          background: colors[Math.floor(Math.random() * colors.length)],
          borderRadius: Math.random() > 0.5 ? "50%" : "2px",
          animation: `confFall ${1.5 + Math.random() * 2}s ease-in forwards`,
          animationDelay: `${Math.random() * 0.5}s`,
        }} />
      ))}
      <style>{`@keyframes confFall { 0% { transform: translateY(0) rotate(0deg); opacity:1; } 100% { transform: translateY(100vh) rotate(720deg); opacity:0; } }`}</style>
    </div>
  );
}

// Lookup from screen key to { key, label } so GameComplete can auto-record
// session history without every game having to pass its own identifier.
const GAME_META = {
  game_words:    { key: "words",     label: "🔤 Word Match" },
  game_colors:   { key: "colors",    label: "🎨 Color Match" },
  game_patterns: { key: "patterns",  label: "🔷 Pattern Finder" },
  game_math:     { key: "math",      label: "🔢 Number Fun" },
  game_memory:   { key: "memory",    label: "🧠 Memory Match" },
  game_rhyming:  { key: "rhyming",   label: "🎤 Rhyme Time" },
  game_shapes:   { key: "shapes",    label: "🧩 Odd One Out" },
  game_spelling: { key: "spelling",  label: "🐝 Spelling Bee" },
  game_opposites:{ key: "opposites", label: "↔️ Opposite Match" },
  game_counting: { key: "counting",  label: "🔢 Counting" },
  game_sizes:    { key: "sizes",     label: "📏 Size Sort" },
  game_clock:    { key: "clock",     label: "🕐 Clock Reader" },
  game_money:    { key: "money",     label: "💰 Money Match" },
  game_emotions: { key: "emotions",  label: "🙂 Emotion Match" },
  game_missing:  { key: "missing",   label: "🔍 What's Missing" },
  game_story:    { key: "story",     label: "📖 Story Builder" },
  game_maze:     { key: "maze",      label: "🏁 Maze Runner" },
  game_music:    { key: "music",     label: "🎹 Music Maker" },
};

function GameComplete({ score, total, onPlayAgain, onExit, title = "You Did It!" }) {
  const { currentScreen, addProgress } = useApp();
  const recordedRef = useRef(false);
  useEffect(() => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    const meta = GAME_META[currentScreen];
    if (meta) {
      addProgress({
        gamesPlayed: 1,
        session: { key: meta.key, label: meta.label, score, total, ts: Date.now() },
      });
    }
  }, []);
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const stars = pct >= 90 ? 3 : pct >= 60 ? 2 : 1;
  return (
    <div style={{ padding: "24px 20px 120px", textAlign: "center" }}>
      <Confetti active={true} />
      <div style={{ fontSize: 90, marginTop: 20, marginBottom: 8 }}>🏆</div>
      <h2 style={{ fontFamily: T.font, fontSize: 30, fontWeight: 800, color: T.text, margin: "0 0 6px" }}>{title}</h2>
      <p style={{ fontFamily: T.fontAlt, fontSize: 16, color: T.soft, margin: "0 0 18px" }}>Great job finishing the round!</p>
      <div style={{ fontSize: 44, marginBottom: 12, letterSpacing: 4 }}>
        {"⭐".repeat(stars)}{"☆".repeat(3 - stars)}
      </div>
      <Card style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontFamily: T.font, fontSize: 36, fontWeight: 800, color: T.primary }}>{score} / {total}</div>
        <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, marginTop: 4 }}>{pct}% correct</div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button onClick={onExit} style={{
          padding: 16, borderRadius: 16, border: `2px solid ${T.border}`, background: T.surface,
          fontFamily: T.font, fontSize: 15, fontWeight: 800, color: T.soft, cursor: "pointer",
        }}>← Back to Games</button>
        <button onClick={onPlayAgain} style={{
          padding: 16, borderRadius: 16, border: "none", background: T.primary,
          fontFamily: T.font, fontSize: 15, fontWeight: 800, color: "#fff", cursor: "pointer",
        }}>Play Again ↻</button>
      </div>
    </div>
  );
}

function PinEntry({ onSuccess, onCancel }) {
  const { settings } = useApp();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  function handleSubmit() {
    if (pin === settings.parentPin) { onSuccess(); }
    else { setError(true); setPin(""); setTimeout(() => setError(false), 1500); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Card style={{ maxWidth: 320, width: "100%", textAlign: "center", padding: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h2 style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text, margin: "0 0 8px" }}>Parent PIN Required</h2>
        <p style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, margin: "0 0 20px" }}>Enter your 4-digit PIN to access settings</p>
        <input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
          style={{
            width: "100%", padding: 16, fontSize: 28, textAlign: "center", letterSpacing: 12,
            border: `2.5px solid ${error ? T.primary : T.border}`, borderRadius: 16,
            fontFamily: T.font, fontWeight: 700, outline: "none", boxSizing: "border-box",
            background: error ? T.primaryGlow : T.surface,
          }}
          placeholder="• • • •" autoFocus
        />
        {error && <p style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.primary, margin: "10px 0 0" }}>Incorrect PIN. Try again.</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <Btn color={T.soft} onClick={onCancel} style={{ flex: 1 }}>Cancel</Btn>
          <Btn color={T.primary} onClick={handleSubmit} disabled={pin.length < 4} style={{ flex: 1 }}>Enter</Btn>
        </div>
      </Card>
    </div>
  );
}

// ─── ONBOARDING ──────────────────────────────────────────────────────────────
function OnboardingScreen() {
  const { updateSettings } = useApp();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(null);

  function finish(ageRange) {
    updateSettings({ ageRange, kidsMode: ageRange === "child" });
  }

  if (step === 0) {
    return (
      <div style={{ padding: "40px 20px", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 72, marginBottom: 16 }}>🧠</div>
          <h1 style={{ fontFamily: T.font, fontSize: 34, fontWeight: 800, color: T.text, margin: "0 0 12px", lineHeight: 1.2 }}>
            Welcome to<br />NeuroBridge
          </h1>
          <p style={{ fontFamily: T.fontAlt, fontSize: 16, color: T.soft, lineHeight: 1.6, maxWidth: 300, margin: "0 auto" }}>
            Learning tools built for the way <em>your</em> brain works.
          </p>
        </div>
        <Btn color={T.primary} size="lg" onClick={() => setStep(1)} style={{ width: "100%", maxWidth: 300, margin: "0 auto" }}>
          Get Started
        </Btn>
        <p style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.soft, textAlign: "center", marginTop: 16, lineHeight: 1.6 }}>
          Designed for dyslexia, ADHD, autism & all neurodivergent minds
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px 20px 40px" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h1 style={{ fontFamily: T.font, fontSize: 26, fontWeight: 800, color: T.text, margin: "0 0 8px" }}>Who is this for?</h1>
        <p style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.soft, lineHeight: 1.5 }}>
          Choose an age range to customize the experience
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 400, margin: "0 auto" }}>
        {ageRanges.map(ar => (
          <Card key={ar.id} onClick={() => setSelected(ar.id)}
            style={{
              display: "flex", alignItems: "center", gap: 16, padding: 20,
              background: selected === ar.id ? `${ar.color}12` : T.surface,
              border: `2.5px solid ${selected === ar.id ? ar.color : T.border}`,
              transition: "all 0.15s ease",
            }}>
            <div style={{
              width: 60, height: 60, borderRadius: 20, background: `${ar.color}15`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, flexShrink: 0,
            }}>{ar.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text }}>{ar.label} <span style={{ fontSize: 14, color: T.soft, fontWeight: 500 }}>({ar.ages})</span></div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.soft, marginTop: 4, lineHeight: 1.4 }}>{ar.desc}</div>
            </div>
            {selected === ar.id && (
              <div style={{ width: 28, height: 28, borderRadius: 14, background: ar.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M5 13l4 4L19 7"/></svg>
              </div>
            )}
          </Card>
        ))}
      </div>
      <div style={{ marginTop: 28, maxWidth: 400, margin: "28px auto 0" }}>
        <Btn color={T.primary} size="lg" onClick={() => finish(selected)} disabled={!selected} style={{ width: "100%" }}>
          Continue
        </Btn>
        <p style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft, textAlign: "center", marginTop: 12 }}>
          You can change this anytime in Settings
        </p>
      </div>
    </div>
  );
}

// ─── ONBOARDING TOUR (shown once after age selection) ────────────────────────
const tourSlides = [
  { emoji: "💬", title: "Talk", desc: "Use the Soundboard to build sentences and communicate. Tap words to speak, build favorites, and customize with your own vocabulary.", bg: "linear-gradient(135deg, #2563EB 0%, #60A5FA 100%)" },
  { emoji: "🎮", title: "Learn", desc: "18 learning games — spelling, math, patterns, memory and more. Content adjusts to your age level and tracks progress over time.", bg: "linear-gradient(135deg, #7C3AED 0%, #C084FC 100%)" },
  { emoji: "🌡️", title: "Feel", desc: "Check in with your emotions, explore coping tools, try breathing exercises, and find calm with sensory activities.", bg: "linear-gradient(135deg, #EC4899 0%, #F9A8D4 100%)" },
  { emoji: "🏆", title: "Grow", desc: "Earn stars and badges as you play. Parents can view progress, set time limits, create custom lessons, and manage profiles.", bg: "linear-gradient(135deg, #F59E0B 0%, #FCD34D 100%)" },
];

function OnboardingTour({ onComplete }) {
  const [slide, setSlide] = useState(0);
  const s = tourSlides[slide];
  const isLast = slide === tourSlides.length - 1;

  return (
    <div style={{
      padding: "40px 20px", minHeight: "100vh", display: "flex", flexDirection: "column",
      justifyContent: "center", alignItems: "center",
    }}>
      <div style={{
        width: "100%", maxWidth: 380, borderRadius: 28, padding: "48px 28px 36px",
        background: s.bg, color: "#fff", textAlign: "center", position: "relative",
        boxShadow: "0 12px 40px rgba(0,0,0,0.2)", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -20, right: -10, fontSize: 120, opacity: 0.12 }}>{s.emoji}</div>
        <div style={{ fontSize: 72, marginBottom: 16, position: "relative", zIndex: 1 }}>{s.emoji}</div>
        <h2 style={{ fontFamily: T.font, fontSize: 30, fontWeight: 800, margin: "0 0 12px", position: "relative", zIndex: 1 }}>{s.title}</h2>
        <p style={{ fontFamily: T.fontAlt, fontSize: 15, lineHeight: 1.6, opacity: 0.9, margin: 0, position: "relative", zIndex: 1 }}>{s.desc}</p>
      </div>

      {/* Dots */}
      <div style={{ display: "flex", gap: 8, marginTop: 28 }}>
        {tourSlides.map((_, i) => (
          <div key={i} style={{
            width: i === slide ? 24 : 8, height: 8, borderRadius: 4,
            background: i === slide ? T.primary : T.border,
            transition: "all 0.2s ease",
          }} />
        ))}
      </div>

      {/* Nav buttons */}
      <div style={{ display: "flex", gap: 12, marginTop: 24, width: "100%", maxWidth: 380 }}>
        <button onClick={onComplete} style={{
          flex: isLast ? 0 : 1, padding: "14px 20px", borderRadius: 50,
          border: `2px solid ${T.border}`, background: T.surface,
          fontFamily: T.font, fontSize: 15, fontWeight: 700, color: T.soft, cursor: "pointer",
          display: isLast ? "none" : "block",
        }}>Skip</button>
        <Btn color={T.primary} size="md" onClick={() => {
          if (isLast) onComplete();
          else setSlide(s => s + 1);
        }} style={{ flex: 1 }}>
          {isLast ? "Let's Go!" : "Next"}
        </Btn>
      </div>
    </div>
  );
}

// ─── HOME ────────────────────────────────────────────────────────────────────
function HomeScreen({ setScreen }) {
  const { settings, updateSettings } = useApp();
  const ageInfo = ageRanges.find(a => a.id === settings.ageRange);
  const tips = [
    "Every step forward counts! 🌟", "Your brain is amazing! 🧠",
    "Take breaks when you need them! 💛", "You're doing great! ⭐",
    "Progress, not perfection! 🌈", "Be kind to yourself today! 💜",
  ];
  const [tip] = useState(tips[Math.floor(Math.random() * tips.length)]);
  const [showAgePicker, setShowAgePicker] = useState(false);

  const { progress } = useApp();
  const menuItems = [
    { emoji: "💬", title: "Soundboard", desc: "Build sentences & communicate", color: T.blue, glow: T.blueGlow, screen: "soundboard", gradient: "linear-gradient(135deg, #2563EB 0%, #60A5FA 100%)" },
    { emoji: "🎮", title: "Learning Games", desc: "18 games: words, memory & more", color: T.purple, glow: T.purpleGlow, screen: "games", gradient: "linear-gradient(135deg, #7C3AED 0%, #C084FC 100%)" },
    { emoji: "📖", title: "Social Stories", desc: "Prepare for new experiences", color: T.primary, glow: T.primaryGlow, screen: "stories", gradient: "linear-gradient(135deg, #FF5722 0%, #FF8A5B 100%)" },
    { emoji: "📚", title: "Reading Practice", desc: "Sight words & read-along stories", color: T.teal, glow: T.tealGlow, screen: "reading", gradient: "linear-gradient(135deg, #06B6D4 0%, #67E8F9 100%)" },
    { emoji: "🌡️", title: "How I Feel", desc: "Emotion check-in & coping tools", color: T.pink, glow: T.pinkGlow, screen: "emotions", gradient: "linear-gradient(135deg, #EC4899 0%, #F9A8D4 100%)" },
    { emoji: "🎯", title: "Focus Timer", desc: "Stay on track with reminders", color: T.green, glow: T.greenGlow, screen: "focus", gradient: "linear-gradient(135deg, #10B981 0%, #6EE7B7 100%)" },
    { emoji: "🫧", title: "Calm Corner", desc: "Breathing & grounding exercises", color: T.purple, glow: T.purpleGlow, screen: "calm", gradient: "linear-gradient(135deg, #7C3AED 0%, #C084FC 100%)" },
    { emoji: "🧸", title: "Sensory Tools", desc: "Pop-it, spinner, color mixer", color: T.pink, glow: T.pinkGlow, screen: "fidget", gradient: "linear-gradient(135deg, #EC4899 0%, #F9A8D4 100%)" },
    { emoji: "✅", title: "My Routines", desc: "Daily schedules & checklists", color: T.yellow, glow: T.yellowGlow, screen: "habits", gradient: "linear-gradient(135deg, #F59E0B 0%, #FCD34D 100%)" },
    { emoji: "🏆", title: "My Rewards", desc: `${progress.totalStars} stars · ${badgeDefs.filter(b => b.check(progress)).length} badges`, color: T.yellow, glow: T.yellowGlow, screen: "rewards", gradient: "linear-gradient(135deg, #F59E0B 0%, #FCD34D 100%)" },
  ];

  return (
    <div style={{ padding: "20px 16px 120px" }}>
      {/* Hero Banner */}
      <div style={{
        background: "linear-gradient(135deg, #FF5722 0%, #FF7A45 40%, #FFA26B 100%)",
        borderRadius: 28, padding: "26px 22px 22px", marginBottom: 20, color: "#fff", position: "relative", overflow: "hidden",
        boxShadow: "0 8px 32px rgba(255,87,34,0.35)",
      }}>
        <div style={{ position: "absolute", top: -30, right: -10, fontSize: 120, opacity: 0.12, transform: "rotate(15deg)" }}>🧠</div>
        <div style={{ position: "absolute", bottom: -20, left: -10, fontSize: 80, opacity: 0.08 }}>✨</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", position: "relative", zIndex: 1 }}>
          <div>
            <h1 style={{ fontFamily: T.font, fontSize: 32, fontWeight: 800, margin: 0, lineHeight: 1.1, textShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>NeuroBridge</h1>
            <p style={{ fontFamily: T.fontAlt, fontSize: 14, margin: "6px 0 0", opacity: 0.9, lineHeight: 1.4 }}>
              Tools built for the way <em>your</em> brain works
            </p>
          </div>
          <button aria-label="Open settings" onClick={() => setScreen("settings")} style={{
            width: 42, height: 42, borderRadius: 14, background: "rgba(255,255,255,0.25)",
            border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            backdropFilter: "blur(10px)",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", position: "relative", zIndex: 1 }}>
          {ageInfo && (
            <button onClick={() => setShowAgePicker(!showAgePicker)} style={{
              background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.3)",
              display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 50,
              fontSize: 13, fontFamily: T.font, fontWeight: 600, color: "#fff", cursor: "pointer",
              backdropFilter: "blur(10px)",
            }}>
              {ageInfo.emoji} {ageInfo.label} Mode <span style={{ fontSize: 10, opacity: 0.8 }}>▼</span>
            </button>
          )}
          <div style={{
            background: "rgba(255,255,255,0.2)", display: "inline-flex", padding: "6px 14px",
            borderRadius: 50, fontSize: 13, fontFamily: T.font, fontWeight: 600, color: "#fff",
          }}>
            {tip}
          </div>
        </div>
      </div>

      {/* Age Picker Dropdown */}
      {showAgePicker && (
        <Card style={{ marginBottom: 16, padding: 14, animation: "scaleIn 0.2s ease-out" }}>
          <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 700, color: T.soft, marginBottom: 10 }}>Switch Mode:</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {ageRanges.map(ar => (
              <button key={ar.id} onClick={() => { updateSettings({ ageRange: ar.id }); setShowAgePicker(false); }} style={{
                padding: "12px 10px", borderRadius: 14,
                border: `2.5px solid ${settings.ageRange === ar.id ? ar.color : T.border}`,
                background: settings.ageRange === ar.id ? `${ar.color}15` : T.surface,
                cursor: "pointer", textAlign: "center", transition: "all 0.15s ease",
              }}>
                <div style={{ fontSize: 24 }}>{ar.emoji}</div>
                <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 700, color: settings.ageRange === ar.id ? ar.color : T.text }}>{ar.label}</div>
                <div style={{ fontFamily: T.fontAlt, fontSize: 10, color: T.soft }}>{ar.ages}</div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Jump back in: most-played games */}
      {(() => {
        const sessions = progress.sessions || [];
        if (sessions.length === 0) return null;
        const counts = {};
        for (const s of sessions) {
          counts[s.key] = (counts[s.key] || 0) + 1;
        }
        const topKeys = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0]);
        const items = topKeys.map(k => {
          const meta = GAME_META[`game_${k}`];
          return meta ? { key: k, screen: `game_${k}`, label: meta.label } : null;
        }).filter(Boolean);
        if (items.length === 0) return null;
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 700, color: T.soft, marginBottom: 8 }}>🔄 Jump Back In</div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
              {items.map(g => (
                <button key={g.key} onClick={() => setScreen(g.screen)} style={{
                  flexShrink: 0, padding: "12px 18px", borderRadius: 16,
                  border: `2px solid ${T.primary}25`, background: T.primaryGlow,
                  fontFamily: T.font, fontSize: 13, fontWeight: 700, color: T.primary,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}>{g.label}</button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Feature Cards - Grid layout for top 4, then stack */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {menuItems.slice(0, 4).map(item => (
          <Card key={item.screen} onClick={() => setScreen(item.screen)}
            style={{
              padding: 0, overflow: "hidden", border: "none",
              boxShadow: `0 6px 24px ${item.color}25`,
            }}>
            <div style={{
              background: item.gradient, padding: "22px 16px 18px", color: "#fff",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: -8, right: -8, fontSize: 50, opacity: 0.2 }}>{item.emoji}</div>
              <div style={{ fontSize: 36, marginBottom: 8, position: "relative", zIndex: 1 }}>{item.emoji}</div>
              <div style={{ fontFamily: T.font, fontSize: 17, fontWeight: 700, position: "relative", zIndex: 1 }}>{item.title}</div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 11, opacity: 0.85, marginTop: 4, lineHeight: 1.3, position: "relative", zIndex: 1 }}>{item.desc}</div>
            </div>
          </Card>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {menuItems.slice(4).map(item => (
          <Card key={item.screen} onClick={() => setScreen(item.screen)}
            style={{
              display: "flex", alignItems: "center", gap: 14, padding: 16,
              background: T.surface, border: `1.5px solid ${item.color}20`,
              boxShadow: `0 4px 16px ${item.color}12`,
            }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16, background: item.gradient,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0,
              boxShadow: `0 4px 12px ${item.color}30`,
            }}>{item.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.font, fontSize: 17, fontWeight: 700, color: T.text }}>{item.title}</div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft, marginTop: 2 }}>{item.desc}</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={item.color} strokeWidth="2.5" strokeLinecap="round"><path d="M9 5l7 7-7 7"/></svg>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
function SettingsScreen({ setScreen }) {
  const { settings, updateSettings } = useApp();
  const [showPin, setShowPin] = useState(false);
  const [newPin, setNewPin] = useState(settings.parentPin || "");
  const [voices, setVoices] = useState([]);
  const [testText, setTestText] = useState("Hello! I am NeuroBridge.");

  useEffect(() => {
    function loadVoices() {
      const v = getVoices().filter(v => v.lang.startsWith("en"));
      // Sort: US English first, then neural/natural voices, then alphabetical
      v.sort((a, b) => {
        const aUS = /en[-_]US/i.test(a.lang) ? 0 : 1;
        const bUS = /en[-_]US/i.test(b.lang) ? 0 : 1;
        if (aUS !== bUS) return aUS - bUS;
        const aNat = /natural|neural|premium|enhanced|google/i.test(a.name) ? 0 : 1;
        const bNat = /natural|neural|premium|enhanced|google/i.test(b.name) ? 0 : 1;
        if (aNat !== bNat) return aNat - bNat;
        return a.name.localeCompare(b.name);
      });
      setVoices(v);
    }
    loadVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const ageInfo = ageRanges.find(a => a.id === settings.ageRange);
  const profileState = loadGlobalState("profileState", { profiles: [], activeId: null });
  const activeProfile = profileState.profiles.find(p => p.id === profileState.activeId);

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="⚙️ Settings" onBack={() => setScreen("home")} />

      {/* Active profile + switcher */}
      <Card onClick={() => setScreen("manage_profiles")} style={{
        marginBottom: 16, padding: 14, display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
        border: `2px solid ${activeProfile?.color || T.border}`,
        background: activeProfile ? `${activeProfile.color}10` : T.surface,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 16, background: `${activeProfile?.color || T.soft}20`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
        }}>{activeProfile?.emoji || "👤"}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text }}>{activeProfile?.name || "Profile"}</div>
          <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>
            {profileState.profiles.length} profile{profileState.profiles.length === 1 ? "" : "s"} · Tap to manage
          </div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.soft} strokeWidth="2.5" strokeLinecap="round"><path d="M9 5l7 7-7 7"/></svg>
      </Card>

      {/* Profile */}
      <Card style={{ marginBottom: 16, background: ageInfo ? `${ageInfo.color}08` : T.surface }}>
        <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 14 }}>👤 Age & Content Level</div>
        <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, marginBottom: 10 }}>Age Range</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {ageRanges.map(ar => (
            <button key={ar.id} onClick={() => updateSettings({ ageRange: ar.id })} style={{
              padding: "10px 8px", borderRadius: 14,
              border: `2px solid ${settings.ageRange === ar.id ? ar.color : T.border}`,
              background: settings.ageRange === ar.id ? `${ar.color}15` : T.surface,
              cursor: "pointer", textAlign: "center", transition: "all 0.15s ease",
            }}>
              <div style={{ fontSize: 20 }}>{ar.emoji}</div>
              <div style={{ fontFamily: T.font, fontSize: 12, fontWeight: 700, color: settings.ageRange === ar.id ? ar.color : T.text }}>{ar.label}</div>
            </button>
          ))}
        </div>
      </Card>

      {/* Voice Settings */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 14 }}>🎤 Voice</div>
        <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, marginBottom: 8 }}>Voice Style</div>
        <select value={settings.voiceId} onChange={e => updateSettings({ voiceId: e.target.value })}
          style={{
            width: "100%", padding: 12, borderRadius: 12, border: `1.5px solid ${T.border}`,
            fontFamily: T.fontAlt, fontSize: 14, color: T.text, background: T.surface, marginBottom: 12,
            appearance: "auto", cursor: "pointer",
          }}>
          <option value="default">Auto (Clearest US English)</option>
          {voices.map(v => {
            const isNatural = /natural|neural|premium|enhanced/i.test(v.name);
            const isGoogle = /google/i.test(v.name);
            const isUS = /en[-_]US/i.test(v.lang);
            const tag = isNatural ? " ⭐ Natural" : isGoogle ? " ⭐ Clear" : isUS ? " 🇺🇸" : " 🇬🇧";
            return (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}{tag}
              </option>
            );
          })}
        </select>

        <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.soft, marginBottom: 6 }}>Speed: {settings.voiceRate.toFixed(1)}x</div>
            <input type="range" min="0.5" max="1.5" step="0.1" value={settings.voiceRate}
              onChange={e => updateSettings({ voiceRate: parseFloat(e.target.value) })}
              style={{ width: "100%" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.soft, marginBottom: 6 }}>Pitch: {settings.voicePitch.toFixed(1)}</div>
            <input type="range" min="0.5" max="1.5" step="0.1" value={settings.voicePitch}
              onChange={e => updateSettings({ voicePitch: parseFloat(e.target.value) })}
              style={{ width: "100%" }} />
          </div>
        </div>
        <Btn color={T.blue} size="sm" onClick={() => speak(testText, settings)}>🔊 Test Voice</Btn>
      </Card>

      {/* Kids Mode / Parental Controls */}
      <Card style={{ marginBottom: 16, background: settings.kidsMode ? T.greenGlow : T.surface, border: `1.5px solid ${settings.kidsMode ? T.green + "30" : T.border}` }}>
        <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 14 }}>👶 Kids Mode & Parental Controls</div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>Kids Mode</div>
            <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>Simplified UI, locked settings</div>
          </div>
          <button role="switch" aria-checked={settings.kidsMode} aria-label="Kids Mode" onClick={() => updateSettings({ kidsMode: !settings.kidsMode })} style={{
            width: 52, height: 30, borderRadius: 15, border: "none", cursor: "pointer",
            background: settings.kidsMode ? T.green : T.border, position: "relative", transition: "all 0.2s ease",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, background: "#fff", position: "absolute", top: 3,
              left: settings.kidsMode ? 25 : 3, transition: "left 0.2s ease", boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>

        <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, marginBottom: 8 }}>Game Time Limit</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[0, 15, 30, 45, 60].map(mins => (
            <button key={mins} onClick={() => updateSettings({ gameTimerMinutes: mins })} style={{
              flex: 1, padding: "10px 4px", borderRadius: 12,
              border: `2px solid ${settings.gameTimerMinutes === mins ? T.primary : T.border}`,
              background: settings.gameTimerMinutes === mins ? T.primaryGlow : T.surface,
              fontFamily: T.font, fontSize: 13, fontWeight: 700, cursor: "pointer",
              color: settings.gameTimerMinutes === mins ? T.primary : T.text,
            }}>{mins === 0 ? "None" : `${mins}m`}</button>
          ))}
        </div>

        <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, marginBottom: 8 }}>Parent PIN {settings.parentPin ? "(set)" : "(not set)"}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="password" inputMode="numeric" maxLength={4} value={newPin}
            onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))}
            placeholder="4-digit PIN"
            style={{
              flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${T.border}`,
              fontFamily: T.font, fontSize: 16, letterSpacing: 6, textAlign: "center",
            }}
          />
          <Btn color={T.green} size="sm" onClick={() => { updateSettings({ parentPin: newPin }); }} disabled={newPin.length < 4}>Save</Btn>
        </div>
      </Card>

      {/* Accessibility */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 14 }}>♿ Accessibility</div>

        <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, marginBottom: 8 }}>Font Size</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {["small", "medium", "large"].map(size => (
            <button key={size} onClick={() => updateSettings({ fontSize: size })} style={{
              flex: 1, padding: "10px 8px", borderRadius: 12,
              border: `2px solid ${settings.fontSize === size ? T.blue : T.border}`,
              background: settings.fontSize === size ? T.blueGlow : T.surface,
              fontFamily: T.font, fontSize: size === "small" ? 13 : size === "medium" ? 15 : 18,
              fontWeight: 700, cursor: "pointer", color: settings.fontSize === size ? T.blue : T.text,
              textTransform: "capitalize",
            }}>{size}</button>
          ))}
        </div>

        <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, marginBottom: 8 }}>Font Style</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[{ id: "default", label: "Standard" }, { id: "dyslexic", label: "Dyslexia-Friendly" }].map(f => (
            <button key={f.id} onClick={() => updateSettings({ fontFamily: f.id })} style={{
              flex: 1, padding: "10px 8px", borderRadius: 12,
              border: `2px solid ${(settings.fontFamily || "default") === f.id ? T.blue : T.border}`,
              background: (settings.fontFamily || "default") === f.id ? T.blueGlow : T.surface,
              fontFamily: f.id === "dyslexic" ? "'Open Dyslexic', sans-serif" : T.font,
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              color: (settings.fontFamily || "default") === f.id ? T.blue : T.text,
            }}>{f.label}</button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>High Contrast</div>
            <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>Bolder colors & borders</div>
          </div>
          <button role="switch" aria-checked={settings.highContrast} aria-label="High Contrast" onClick={() => updateSettings({ highContrast: !settings.highContrast })} style={{
            width: 52, height: 30, borderRadius: 15, border: "none", cursor: "pointer",
            background: settings.highContrast ? T.blue : T.border, position: "relative", transition: "all 0.2s ease",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, background: "#fff", position: "absolute", top: 3,
              left: settings.highContrast ? 25 : 3, transition: "left 0.2s ease", boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>🌙 Dark Mode</div>
            <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>Easier on sensitive eyes</div>
          </div>
          <button role="switch" aria-checked={settings.darkMode} aria-label="Dark Mode" onClick={() => updateSettings({ darkMode: !settings.darkMode })} style={{
            width: 52, height: 30, borderRadius: 15, border: "none", cursor: "pointer",
            background: settings.darkMode ? T.purple : T.border, position: "relative", transition: "all 0.2s ease",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, background: "#fff", position: "absolute", top: 3,
              left: settings.darkMode ? 25 : 3, transition: "left 0.2s ease", boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>🌀 Reduce Motion</div>
            <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>Skip confetti & animations</div>
          </div>
          <button role="switch" aria-checked={settings.reduceMotion} aria-label="Reduce Motion" onClick={() => updateSettings({ reduceMotion: !settings.reduceMotion })} style={{
            width: 52, height: 30, borderRadius: 15, border: "none", cursor: "pointer",
            background: settings.reduceMotion ? T.blue : T.border, position: "relative", transition: "all 0.2s ease",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, background: "#fff", position: "absolute", top: 3,
              left: settings.reduceMotion ? 25 : 3, transition: "left 0.2s ease", boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>🔊 Sound Effects</div>
            <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>Chimes for taps & correct/wrong</div>
          </div>
          <button role="switch" aria-checked={settings.soundEffects !== false} aria-label="Sound Effects" onClick={() => updateSettings({ soundEffects: !(settings.soundEffects !== false) })} style={{
            width: 52, height: 30, borderRadius: 15, border: "none", cursor: "pointer",
            background: settings.soundEffects !== false ? T.green : T.border, position: "relative", transition: "all 0.2s ease",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, background: "#fff", position: "absolute", top: 3,
              left: settings.soundEffects !== false ? 25 : 3, transition: "left 0.2s ease", boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>🗣️ Voice Guidance</div>
            <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>Spoken words & instructions</div>
          </div>
          <button role="switch" aria-checked={settings.voiceGuidance !== false} aria-label="Voice Guidance" onClick={() => updateSettings({ voiceGuidance: !(settings.voiceGuidance !== false) })} style={{
            width: 52, height: 30, borderRadius: 15, border: "none", cursor: "pointer",
            background: settings.voiceGuidance !== false ? T.primary : T.border, position: "relative", transition: "all 0.2s ease",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, background: "#fff", position: "absolute", top: 3,
              left: settings.voiceGuidance !== false ? 25 : 3, transition: "left 0.2s ease", boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>📳 Haptic Feedback</div>
            <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>Vibrate on taps (phones/tablets)</div>
          </div>
          <button role="switch" aria-checked={settings.hapticFeedback} aria-label="Haptic Feedback" onClick={() => { updateSettings({ hapticFeedback: !settings.hapticFeedback }); try { navigator.vibrate && navigator.vibrate(20); } catch {} }} style={{
            width: 52, height: 30, borderRadius: 15, border: "none", cursor: "pointer",
            background: settings.hapticFeedback ? T.pink : T.border, position: "relative", transition: "all 0.2s ease",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, background: "#fff", position: "absolute", top: 3,
              left: settings.hapticFeedback ? 25 : 3, transition: "left 0.2s ease", boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>
      </Card>

      {/* Parent Dashboard Link */}
      <Card onClick={() => setScreen("parent_dash")} style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", padding: 18 }}>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: T.blueGlow, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>👨‍👩‍👧</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text }}>Parent Dashboard</div>
          <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>View progress, stats & badges</div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.soft} strokeWidth="2.5" strokeLinecap="round"><path d="M9 5l7 7-7 7"/></svg>
      </Card>
    </div>
  );
}

// ─── SOUNDBOARD (AAC Board + Category Views) ───────────────────────────────
// Board columns for sentence-building layout
const boardColumns = [
  {
    id: "starters", label: "I", color: "#F7B731", items: [
      { label: "I", speech: "I" }, { label: "I want", speech: "I want" }, { label: "I need", speech: "I need" },
      { label: "I like", speech: "I like" }, { label: "I feel", speech: "I feel" }, { label: "I am", speech: "I am" },
      { label: "I don't", speech: "I don't" }, { label: "I can", speech: "I can" }, { label: "I can't", speech: "I can't" },
      { label: "Can I", speech: "Can I" }, { label: "I see", speech: "I see" }, { label: "I hear", speech: "I hear" },
      { label: "I have", speech: "I have" }, { label: "I know", speech: "I know" }, { label: "I think", speech: "I think" },
      { label: "I love", speech: "I love" }, { label: "I miss", speech: "I miss" }, { label: "I will", speech: "I will" },
      { label: "You", speech: "you" }, { label: "We", speech: "we" }, { label: "He", speech: "he" },
      { label: "She", speech: "she" }, { label: "They", speech: "they" }, { label: "It", speech: "it" },
    ],
  },
  {
    id: "verbs", label: "Do", color: "#3EBB6E", items: [
      { label: "want", speech: "want" }, { label: "need", speech: "need" }, { label: "like", speech: "like" },
      { label: "go", speech: "go" }, { label: "eat", speech: "eat" }, { label: "drink", speech: "drink" },
      { label: "play", speech: "play" }, { label: "help", speech: "help" }, { label: "see", speech: "see" },
      { label: "have", speech: "have" }, { label: "make", speech: "make" }, { label: "read", speech: "read" },
      { label: "stop", speech: "stop" }, { label: "give", speech: "give" }, { label: "put", speech: "put" },
      { label: "take", speech: "take" }, { label: "come", speech: "come" }, { label: "sit", speech: "sit" },
      { label: "stand", speech: "stand" }, { label: "walk", speech: "walk" }, { label: "run", speech: "run" },
      { label: "look", speech: "look" }, { label: "get", speech: "get" }, { label: "open", speech: "open" },
      { label: "close", speech: "close" }, { label: "turn on", speech: "turn on" }, { label: "turn off", speech: "turn off" },
      { label: "sleep", speech: "sleep" }, { label: "wake up", speech: "wake up" }, { label: "listen", speech: "listen" },
      { label: "say", speech: "say" }, { label: "try", speech: "try" },
    ],
  },
  {
    id: "describers", label: "Kind", color: "#8B6CF6", items: [
      { label: "more", speech: "more" }, { label: "less", speech: "less" }, { label: "big", speech: "big" },
      { label: "little", speech: "little" }, { label: "good", speech: "good" }, { label: "bad", speech: "bad" },
      { label: "hot", speech: "hot" }, { label: "cold", speech: "cold" }, { label: "warm", speech: "warm" },
      { label: "new", speech: "new" }, { label: "old", speech: "old" }, { label: "different", speech: "different" },
      { label: "same", speech: "same" }, { label: "all", speech: "all" }, { label: "my", speech: "my" },
      { label: "your", speech: "your" }, { label: "this", speech: "this" }, { label: "that", speech: "that" },
      { label: "happy", speech: "happy" }, { label: "sad", speech: "sad" }, { label: "tired", speech: "tired" },
      { label: "scared", speech: "scared" }, { label: "angry", speech: "angry" }, { label: "calm", speech: "calm" },
      { label: "excited", speech: "excited" }, { label: "yummy", speech: "yummy" }, { label: "favorite", speech: "favorite" },
      { label: "soft", speech: "soft" }, { label: "loud", speech: "loud" }, { label: "quiet", speech: "quiet" },
      { label: "some", speech: "some" }, { label: "the", speech: "the" }, { label: "a", speech: "a" },
    ],
  },
  {
    id: "things", label: "Thing", color: "#4E8AE6", items: [
      { label: "water", speech: "water" }, { label: "food", speech: "food" }, { label: "snack", speech: "snack" },
      { label: "juice", speech: "juice" }, { label: "milk", speech: "milk" }, { label: "coffee", speech: "coffee" },
      { label: "book", speech: "book" }, { label: "phone", speech: "phone" }, { label: "tablet", speech: "tablet" },
      { label: "toy", speech: "toy" }, { label: "movie", speech: "movie" }, { label: "TV", speech: "TV" },
      { label: "game", speech: "game" }, { label: "music", speech: "music" }, { label: "shoes", speech: "shoes" },
      { label: "jacket", speech: "jacket" }, { label: "ball", speech: "ball" }, { label: "blanket", speech: "blanket" },
      { label: "pillow", speech: "pillow" }, { label: "medicine", speech: "medicine" }, { label: "bath", speech: "bath" },
      { label: "bed", speech: "bed" }, { label: "breakfast", speech: "breakfast" }, { label: "lunch", speech: "lunch" },
      { label: "dinner", speech: "dinner" }, { label: "pizza", speech: "pizza" }, { label: "chicken", speech: "chicken" },
      { label: "fruit", speech: "fruit" }, { label: "cookie", speech: "cookie" }, { label: "ice cream", speech: "ice cream" },
      { label: "hug", speech: "a hug" }, { label: "break", speech: "a break" },
    ],
  },
  {
    id: "places", label: "Where", color: "#E84E8A", items: [
      { label: "here", speech: "here" }, { label: "there", speech: "there" }, { label: "home", speech: "home" },
      { label: "school", speech: "school" }, { label: "work", speech: "work" }, { label: "outside", speech: "outside" },
      { label: "inside", speech: "inside" }, { label: "bathroom", speech: "the bathroom" }, { label: "bedroom", speech: "my room" },
      { label: "kitchen", speech: "the kitchen" }, { label: "car", speech: "the car" }, { label: "bus", speech: "the bus" },
      { label: "park", speech: "the park" }, { label: "store", speech: "the store" }, { label: "doctor", speech: "the doctor" },
      { label: "library", speech: "the library" }, { label: "playground", speech: "the playground" }, { label: "up", speech: "up" },
      { label: "down", speech: "down" }, { label: "in", speech: "in" }, { label: "out", speech: "out" },
      { label: "on", speech: "on" }, { label: "off", speech: "off" }, { label: "to", speech: "to" },
      { label: "from", speech: "from" }, { label: "with", speech: "with" }, { label: "away", speech: "away" },
    ],
  },
  {
    id: "social", label: "Chat", color: "#FF6B3D", items: [
      { label: "yes", speech: "yes" }, { label: "no", speech: "no" }, { label: "maybe", speech: "maybe" },
      { label: "please", speech: "please" }, { label: "thank you", speech: "thank you" }, { label: "you're welcome", speech: "you're welcome" },
      { label: "sorry", speech: "sorry" }, { label: "hi", speech: "hi" }, { label: "hello", speech: "hello" },
      { label: "bye", speech: "bye" }, { label: "see you", speech: "see you later" }, { label: "OK", speech: "okay" },
      { label: "help", speech: "help me" }, { label: "wait", speech: "wait" }, { label: "stop", speech: "stop" },
      { label: "again", speech: "again" }, { label: "all done", speech: "all done" }, { label: "not yet", speech: "not yet" },
      { label: "excuse me", speech: "excuse me" }, { label: "I love you", speech: "I love you" }, { label: "my turn", speech: "my turn" },
      { label: "your turn", speech: "your turn" }, { label: "good job", speech: "good job" }, { label: "I'm ready", speech: "I'm ready" },
      { label: "I don't know", speech: "I don't know" }, { label: "now", speech: "now" }, { label: "later", speech: "later" },
      { label: "and", speech: "and" }, { label: "but", speech: "but" }, { label: "because", speech: "because" },
    ],
  },
];

function SoundboardScreen({ setScreen }) {
  const { settings, addProgress } = useApp();
  const [sentence, setSentence] = useState([]);
  const [lastSpoken, setLastSpoken] = useState(null);
  const [viewMode, setViewMode] = useState(() => loadState("boardView", "board")); // "board" | "categories"
  const [cat, setCat] = useState(null);
  const [customWords, setCustomWords] = useState(() => loadState("customWords", []));
  const [showAddWord, setShowAddWord] = useState(false);
  const [newWordLabel, setNewWordLabel] = useState("");
  const [newWordEmoji, setNewWordEmoji] = useState("🗣️");
  const [newWordSpeech, setNewWordSpeech] = useState("");
  const [newWordCat, setNewWordCat] = useState("custom");
  const [tapCounts, setTapCounts] = useState(() => loadState("boardTapCounts", {}));
  const [recentTaps, setRecentTaps] = useState(() => loadState("boardRecent", []));
  const [copiedMsg, setCopiedMsg] = useState(false);

  // Index every tappable item (built-in board, built-in categories, custom)
  // so favorites/recent can resolve a speech key back to a full item.
  const itemIndex = {};
  for (const col of boardColumns) for (const it of col.items) if (!itemIndex[it.speech]) itemIndex[it.speech] = { ...it, _color: col.color };
  for (const c of aacCategories) for (const it of c.items) if (!itemIndex[it.speech]) itemIndex[it.speech] = { ...it, _color: c.color };
  for (const it of customWords) if (!itemIndex[it.speech]) itemIndex[it.speech] = { ...it, _color: T.primary };

  // Derived quick-access rows
  const favorites = Object.entries(tapCounts)
    .filter(([speech]) => itemIndex[speech])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([speech]) => itemIndex[speech]);
  const recent = recentTaps
    .filter(speech => itemIndex[speech])
    .slice(0, 10)
    .map(speech => itemIndex[speech]);

  function tapItem(item) {
    speak(item.speech, settings);
    setLastSpoken(item.label);
    setSentence(prev => [...prev, item]);
    addProgress({ wordsSpoken: 1 });
    // Bump usage count so favorites row stays current
    setTapCounts(prev => {
      const next = { ...prev, [item.speech]: (prev[item.speech] || 0) + 1 };
      saveState("boardTapCounts", next);
      return next;
    });
    // Move this item to the front of recent (dedupe)
    setRecentTaps(prev => {
      const next = [item.speech, ...prev.filter(s => s !== item.speech)].slice(0, 24);
      saveState("boardRecent", next);
      return next;
    });
    setTimeout(() => setLastSpoken(null), 600);
  }

  function speakSentence() {
    if (sentence.length > 0) {
      const text = sentence.map(s => s.speech).join(" ");
      speak(text, settings);
    }
  }

  function copySentence() {
    if (sentence.length === 0) return;
    const text = sentence.map(s => s.speech).join(" ");
    try {
      navigator.clipboard?.writeText(text);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 1400);
    } catch {}
  }

  function removeWord(index) {
    setSentence(prev => prev.filter((_, i) => i !== index));
  }

  function addCustomWord() {
    if (!newWordLabel.trim() || !newWordSpeech.trim()) return;
    const word = { label: newWordLabel.trim(), emoji: newWordEmoji, speech: newWordSpeech.trim(), custom: true, catId: newWordCat };
    const updated = [...customWords, word];
    setCustomWords(updated);
    saveState("customWords", updated);
    setNewWordLabel(""); setNewWordSpeech(""); setNewWordEmoji("🗣️"); setShowAddWord(false);
  }

  function removeCustomWord(index) {
    const updated = customWords.filter((_, i) => i !== index);
    setCustomWords(updated);
    saveState("customWords", updated);
  }

  function switchView(v) {
    setViewMode(v);
    saveState("boardView", v);
    setCat(null);
  }

  const customCategory = customWords.length > 0 ? {
    id: "custom", label: "My Words", emoji: "⭐", color: T.primary, glow: T.primaryGlow,
    items: customWords.filter(w => w.catId === "custom"),
  } : null;
  const allCategories = customCategory ? [customCategory, ...aacCategories] : aacCategories;
  function getCatItems(catId) {
    const builtIn = aacCategories.find(c => c.id === catId);
    const builtInItems = builtIn ? builtIn.items : [];
    const customInCat = customWords.filter(w => w.catId === catId);
    return [...builtInItems, ...customInCat];
  }

  return (
    <div style={{ padding: "16px 12px 120px" }}>
      <Header title="💬 Soundboard" onBack={() => setScreen("home")}
        right={
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setShowAddWord(!showAddWord)} style={{
              padding: "5px 10px", borderRadius: 10, border: `1.5px solid ${T.primary}40`,
              background: T.primaryGlow, fontFamily: T.font, fontSize: 11, fontWeight: 700,
              color: T.primary, cursor: "pointer",
            }}>+ Add</button>
          </div>
        }
      />

      {/* View Toggle */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10, background: T.border, borderRadius: 12, padding: 3 }}>
        <button onClick={() => switchView("board")} style={{
          flex: 1, padding: "7px 0", borderRadius: 10, border: "none", cursor: "pointer",
          background: viewMode === "board" ? T.surface : "transparent",
          fontFamily: T.font, fontSize: 12, fontWeight: 700,
          color: viewMode === "board" ? T.text : T.soft,
          boxShadow: viewMode === "board" ? T.shadow : "none",
        }}>Board View</button>
        <button onClick={() => switchView("categories")} style={{
          flex: 1, padding: "7px 0", borderRadius: 10, border: "none", cursor: "pointer",
          background: viewMode === "categories" ? T.surface : "transparent",
          fontFamily: T.font, fontSize: 12, fontWeight: 700,
          color: viewMode === "categories" ? T.text : T.soft,
          boxShadow: viewMode === "categories" ? T.shadow : "none",
        }}>Categories</button>
      </div>

      {/* Add Word Panel */}
      {showAddWord && (
        <Card style={{ marginBottom: 12, padding: 16, border: `2px solid ${T.primary}30`, animation: "scaleIn 0.2s ease-out" }}>
          <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 10 }}>⭐ Add Custom Word</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={newWordEmoji} onChange={e => setNewWordEmoji(e.target.value)}
              style={{ width: 44, padding: 8, borderRadius: 10, border: `1.5px solid ${T.border}`, fontSize: 22, textAlign: "center" }} placeholder="😊" />
            <input value={newWordLabel} onChange={e => setNewWordLabel(e.target.value)}
              style={{ flex: 1, padding: 8, borderRadius: 10, border: `1.5px solid ${T.border}`, fontFamily: T.fontAlt, fontSize: 13 }} placeholder="Label (e.g. Juice)" />
          </div>
          <input value={newWordSpeech} onChange={e => setNewWordSpeech(e.target.value)}
            style={{ width: "100%", padding: 8, borderRadius: 10, border: `1.5px solid ${T.border}`, fontFamily: T.fontAlt, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
            placeholder="Speech (e.g. I want juice please)" />
          <div style={{ display: "flex", gap: 6 }}>
            <Btn color={T.soft} size="sm" onClick={() => setShowAddWord(false)}>Cancel</Btn>
            <Btn color={T.primary} size="sm" onClick={addCustomWord} disabled={!newWordLabel.trim() || !newWordSpeech.trim()}>Add</Btn>
          </div>
        </Card>
      )}

      {/* Sentence Builder */}
      <div style={{
        background: T.surface, borderRadius: 16, padding: 12, marginBottom: 8,
        border: `2px solid ${T.blue}30`, minHeight: 48,
        display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", boxShadow: T.shadow,
      }}>
        {sentence.length === 0 ? (
          <span style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.soft }}>Tap words to build a sentence...</span>
        ) : sentence.map((s, i) => (
          <button key={i} aria-label={`Remove ${s.label} from sentence`} onClick={() => removeWord(i)} style={{
            background: T.blueGlow, padding: "4px 8px", borderRadius: 8, border: `1px solid ${T.blue}30`,
            fontFamily: T.font, fontSize: 12, fontWeight: 600, color: T.blue, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 3,
          }}>
            {s.label} <span style={{ fontSize: 9, opacity: 0.5 }}>✕</span>
          </button>
        ))}
      </div>

      {sentence.length > 0 && (
        <div style={{
          fontFamily: T.fontAlt, fontSize: 13, color: T.text, padding: "6px 12px",
          background: T.yellowGlow, borderRadius: 10, marginBottom: 8, fontStyle: "italic",
          border: `1px solid ${T.yellow}30`,
        }}>"{sentence.map(s => s.speech).join(" ")}"</div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <Btn color={T.blue} onClick={speakSentence} style={{ flex: 1 }} disabled={sentence.length === 0} size="sm">🔊 Speak</Btn>
        <Btn color={T.green} onClick={copySentence} disabled={sentence.length === 0} size="sm">{copiedMsg ? "✓ Copied" : "📋 Copy"}</Btn>
        <Btn color={T.soft} onClick={() => setSentence([])} disabled={sentence.length === 0} size="sm">Clear</Btn>
      </div>

      {/* Favorites & Recent quick-access rows */}
      {(favorites.length > 0 || recent.length > 0) && (
        <div style={{ marginBottom: 12 }}>
          {favorites.length > 0 && (
            <div style={{ marginBottom: recent.length > 0 ? 8 : 0 }}>
              <div style={{ fontFamily: T.font, fontSize: 11, fontWeight: 700, color: T.soft, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, paddingLeft: 2 }}>⭐ Favorites</div>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                {favorites.map((item, i) => {
                  const isActive = lastSpoken === item.label;
                  return (
                    <button key={`f-${i}`} onClick={() => tapItem(item)} style={{
                      flexShrink: 0, padding: "10px 14px", borderRadius: 12, border: `1.5px solid ${item._color}40`,
                      background: isActive ? item._color : T.surface, cursor: "pointer",
                      fontFamily: T.font, fontSize: 13, fontWeight: 700,
                      color: isActive ? "#fff" : T.text,
                      boxShadow: isActive ? `0 3px 10px ${item._color}50` : "0 1px 3px rgba(0,0,0,0.06)",
                      whiteSpace: "nowrap",
                    }}>{item.label}</button>
                  );
                })}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div>
              <div style={{ fontFamily: T.font, fontSize: 11, fontWeight: 700, color: T.soft, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, paddingLeft: 2 }}>🕐 Recent</div>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                {recent.map((item, i) => {
                  const isActive = lastSpoken === item.label;
                  return (
                    <button key={`r-${i}`} onClick={() => tapItem(item)} style={{
                      flexShrink: 0, padding: "10px 14px", borderRadius: 12, border: `1.5px dashed ${item._color}40`,
                      background: isActive ? item._color : T.surface, cursor: "pointer",
                      fontFamily: T.font, fontSize: 13, fontWeight: 600,
                      color: isActive ? "#fff" : T.text,
                      whiteSpace: "nowrap",
                    }}>{item.label}</button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── BOARD VIEW ─── */}
      {viewMode === "board" && (
        <div style={{ paddingBottom: 8 }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${boardColumns.length}, minmax(0, 1fr))`,
            gap: 8,
          }}>
            {boardColumns.map(col => (
              <div key={col.id} style={{ minWidth: 0 }}>
                {/* Column Header */}
                <div style={{
                  background: col.color, color: "#fff", borderRadius: "14px 14px 0 0",
                  padding: "10px 6px", textAlign: "center",
                  fontFamily: T.font, fontSize: 15, fontWeight: 800, letterSpacing: 0.3,
                }}>
                  {col.label}
                </div>
                {/* Column Words */}
                <div style={{
                  background: `${col.color}10`, border: `1.5px solid ${col.color}25`,
                  borderTop: "none", borderRadius: "0 0 14px 14px",
                  display: "flex", flexDirection: "column", gap: 4, padding: 5,
                }}>
                  {col.items.map((item, i) => {
                    const isActive = lastSpoken === item.label;
                    return (
                      <button key={i} onClick={() => tapItem(item)} style={{
                        padding: "12px 6px", borderRadius: 10, border: "none", cursor: "pointer",
                        background: isActive ? col.color : T.surface,
                        fontFamily: T.font, fontSize: 14, fontWeight: 700, textAlign: "center",
                        color: isActive ? "#fff" : T.text,
                        transition: "all 0.12s ease",
                        boxShadow: isActive ? `0 3px 12px ${col.color}50` : "0 1px 3px rgba(0,0,0,0.06)",
                        minHeight: 44,
                        wordBreak: "break-word",
                      }}>{item.label}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── CATEGORIES VIEW ─── */}
      {viewMode === "categories" && (
        <>
          {cat === null ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {allCategories.map(c => {
                const itemCount = c.id === "custom" ? c.items.length : getCatItems(c.id).length;
                return (
                  <Card key={c.id} onClick={() => setCat(c.id)}
                    style={{ textAlign: "center", padding: 14, background: c.glow, border: `1.5px solid ${c.color}25` }}>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>{c.emoji}</div>
                    <div style={{ fontFamily: T.font, fontSize: 12, fontWeight: 700, color: c.color }}>{c.label}</div>
                    <div style={{ fontFamily: T.fontAlt, fontSize: 10, color: T.soft, marginTop: 2 }}>{itemCount}</div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <>
              <button onClick={() => setCat(null)} style={{
                fontFamily: T.font, fontSize: 14, fontWeight: 600, color: T.soft,
                background: "none", border: "none", cursor: "pointer", marginBottom: 12,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 19l-7-7 7-7"/></svg>
                All Categories
              </button>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {getCatItems(cat).map((item, i) => {
                  const catData = allCategories.find(c => c.id === cat) || { color: T.primary };
                  const isActive = lastSpoken === item.label;
                  return (
                    <button key={i} onClick={() => tapItem(item)}
                      style={{
                        background: isActive ? catData.color : T.surface,
                        border: `2px solid ${isActive ? catData.color : catData.color + "30"}`,
                        borderRadius: 16, padding: "12px 6px", cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        transition: "all 0.15s ease", position: "relative",
                        transform: isActive ? "scale(1.05)" : "scale(1)",
                        boxShadow: isActive ? `0 4px 20px ${catData.color}40` : "none",
                      }}>
                      {item.custom && (
                        <button onClick={e => { e.stopPropagation(); removeCustomWord(customWords.indexOf(item)); }} style={{
                          position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 9,
                          background: T.primary, border: "none", color: "#fff", fontSize: 10, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
                        }}>✕</button>
                      )}
                      <span style={{ fontSize: 28 }}>{item.emoji}</span>
                      <span style={{
                        fontFamily: T.font, fontSize: 11, fontWeight: 700,
                        color: isActive ? "#fff" : T.text, lineHeight: 1.2, textAlign: "center",
                      }}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── GAME TIMER (rendered by App, persists across game screens) ──────────────
function GameTimerOverlay({ onGoHome }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: T.bg, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: 80, marginBottom: 20 }}>⏰</div>
        <h1 style={{ fontFamily: T.font, fontSize: 28, fontWeight: 800, color: T.text, margin: "0 0 12px" }}>Game Time is Up!</h1>
        <p style={{ fontFamily: T.fontAlt, fontSize: 16, color: T.soft, lineHeight: 1.6, marginBottom: 24 }}>
          Great job playing! Time to take a break and do something else.
        </p>
        <Btn color={T.primary} onClick={onGoHome}>Go Home</Btn>
      </div>
    </div>
  );
}

function GameTimerBadge({ timeLeft }) {
  if (timeLeft <= 0) return null;
  const warn = timeLeft < 60;
  return (
    <div style={{
      position: "fixed", top: 10, right: 10, zIndex: 999,
      padding: "6px 12px", borderRadius: 20,
      background: warn ? T.primaryGlow : T.surface,
      border: `2px solid ${warn ? T.primary : T.border}`,
      fontFamily: T.font, fontSize: 13, fontWeight: 700,
      color: warn ? T.primary : T.soft,
      boxShadow: T.shadow,
    }}>
      ⏱️ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
    </div>
  );
}

// ─── GAMES HUB ───────────────────────────────────────────────────────────────
function GamesScreen({ setScreen }) {
  const { settings } = useApp();

  const games = [
    { id: "words", emoji: "🔤", title: "Word Match", desc: "Match pictures to words", color: T.primary, glow: T.primaryGlow },
    { id: "colors", emoji: "🎨", title: "Color Match", desc: "Learn your colors", color: T.blue, glow: T.blueGlow },
    { id: "patterns", emoji: "🔷", title: "Pattern Finder", desc: "What comes next?", color: T.purple, glow: T.purpleGlow },
    { id: "math", emoji: "🔢", title: "Number Fun", desc: "Adding, subtracting & more", color: T.green, glow: T.greenGlow },
    { id: "memory", emoji: "🧠", title: "Memory Match", desc: "Find the matching pairs", color: T.pink, glow: T.pinkGlow },
    { id: "rhyming", emoji: "🎤", title: "Rhyme Time", desc: "Which word rhymes?", color: T.yellow, glow: T.yellowGlow },
    { id: "shapes", emoji: "🧩", title: "Odd One Out", desc: "Which doesn't belong?", color: T.primary, glow: T.primaryGlow },
    { id: "spelling", emoji: "🐝", title: "Spelling Bee", desc: "Spell the word", color: T.yellow, glow: T.yellowGlow },
    { id: "opposites", emoji: "↔️", title: "Opposite Match", desc: "Find the opposite", color: T.purple, glow: T.purpleGlow },
    { id: "counting", emoji: "🔢", title: "Counting", desc: "Count the objects", color: T.blue, glow: T.blueGlow },
    { id: "sizes", emoji: "📏", title: "Size Sort", desc: "Smallest to biggest", color: T.pink, glow: T.pinkGlow },
    { id: "clock", emoji: "🕐", title: "Clock Reader", desc: "What time is it?", color: T.blue, glow: T.blueGlow },
    { id: "money", emoji: "💰", title: "Money Match", desc: "Count the coins", color: T.green, glow: T.greenGlow },
    { id: "emotions", emoji: "🙂", title: "Emotion Match", desc: "Name the feeling", color: T.pink, glow: T.pinkGlow },
    { id: "missing", emoji: "🔍", title: "What's Missing?", desc: "Memory puzzle", color: T.purple, glow: T.purpleGlow },
    { id: "story", emoji: "📖", title: "Story Builder", desc: "Make a silly story", color: T.yellow, glow: T.yellowGlow },
    { id: "maze", emoji: "🏁", title: "Maze Runner", desc: "Find the way out", color: T.green, glow: T.greenGlow },
    { id: "music", emoji: "🎹", title: "Music Maker", desc: "Tap notes & make songs", color: T.pink, glow: T.pinkGlow },
  ];

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="🎮 Learning Games" onBack={() => setScreen("home")} />
      <p style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.soft, margin: "0 0 20px", lineHeight: 1.6 }}>Pick a game! Take your time — no rush.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {games.map(g => (
          <Card key={g.id} onClick={() => setScreen(`game_${g.id}`)}
            style={{ display: "flex", alignItems: "center", gap: 16, padding: 20, background: g.glow, border: `1.5px solid ${g.color}20` }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20, background: `${g.color}15`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, flexShrink: 0,
            }}>{g.emoji}</div>
            <div>
              <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text }}>{g.title}</div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, marginTop: 4 }}>{g.desc}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── WORD GAME ───────────────────────────────────────────────────────────────
function WordGameScreen({ setScreen }) {
  const { settings } = useApp();
  const [items, setItems] = useState(() => shuffleArr(lessonsFor(wordGames, settings.ageRange)));
  const [idx, setIdx] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [done, setDone] = useState(false);
  const game = items[idx];

  function restart() {
    setItems(shuffleArr(lessonsFor(wordGames, settings.ageRange)));
    setIdx(0); setFeedback(""); setScore(0); setShowHint(false); setDone(false);
  }
  if (done) return <GameComplete score={score} total={items.length} onPlayAgain={restart} onExit={() => setScreen("games")} />;

  function pick(choice) {
    if (feedback) return;
    if (choice === game.word) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      playSfx("correct");
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => {
        setFeedback(""); setShowHint(false);
        if (idx + 1 >= items.length) setDone(true);
        else setIdx(i => i + 1);
      }, 1800);
    } else {
      setFeedback("wrong"); playSfx("wrong");
      setTimeout(() => setFeedback(""), 1000);
    }
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🔤 Word Match" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <ProgressBar value={idx + 1} max={items.length} color={T.primary} h={6} />
      <Card style={{ textAlign: "center", padding: 32, marginBottom: 20, marginTop: 16 }}>
        <div style={{ fontSize: 80, marginBottom: 12 }}>{game.image}</div>
        <p style={{ fontFamily: T.fontAlt, fontSize: 16, color: T.soft, margin: 0 }}>What word matches this picture?</p>
        {showHint && <p style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.blue, margin: "10px 0 0", fontStyle: "italic" }}>💡 {game.hint}</p>}
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {game.choices.map(c => {
          let bg = T.surface, border = T.border, col = T.text;
          if (feedback === "correct" && c === game.word) { bg = T.greenGlow; border = T.green; col = T.green; }
          return (
            <button key={c} onClick={() => pick(c)} style={{
              padding: 20, borderRadius: 18, border: `2.5px solid ${border}`, background: bg, cursor: "pointer",
              fontFamily: T.font, fontSize: 22, fontWeight: 800, color: col, letterSpacing: 3, transition: "all 0.15s ease",
            }}>{c}</button>
          );
        })}
      </div>
      {!showHint && !feedback && (
        <button onClick={() => setShowHint(true)} style={{
          width: "100%", padding: 12, background: "none", border: `1.5px dashed ${T.border}`,
          borderRadius: 14, fontFamily: T.font, fontSize: 14, color: T.soft, cursor: "pointer",
        }}>💡 Show Hint</button>
      )}
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 Awesome!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Hmm, try again! 💪</div>}
    </div>
  );
}

// ─── COLOR GAME ──────────────────────────────────────────────────────────────
function ColorGameScreen({ setScreen }) {
  const { settings } = useApp();
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [choices, setChoices] = useState([]);
  const [target, setTarget] = useState(null);

  const newRound = useCallback(() => {
    const t = colorMatchGame[Math.floor(Math.random() * colorMatchGame.length)];
    const others = colorMatchGame.filter(c => c.name !== t.name).sort(() => Math.random() - 0.5).slice(0, 2);
    setTarget(t); setChoices([t, ...others].sort(() => Math.random() - 0.5)); setFeedback("");
  }, []);

  useEffect(() => { newRound(); }, [newRound]);

  function pick(name) {
    if (feedback) return;
    if (name === target.name) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      playSfx("correct"); speak(target.name, settings);
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(newRound, 1500);
    } else { setFeedback("wrong"); playSfx("wrong"); setTimeout(() => setFeedback(""), 800); }
  }

  if (!target) return null;
  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🎨 Color Match" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <Card style={{ textAlign: "center", padding: 32, marginBottom: 24 }}>
        <div style={{ width: 120, height: 120, borderRadius: 30, background: target.color, margin: "0 auto 16px", boxShadow: `0 8px 30px ${target.color}40` }} />
        <p style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text, margin: 0 }}>What color is this?</p>
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {choices.map(c => (
          <button key={c.name} onClick={() => pick(c.name)} style={{
            padding: 18, borderRadius: 18, border: `2.5px solid ${T.border}`,
            background: feedback === "correct" && c.name === target.name ? T.greenGlow : T.surface,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 14,
            fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text, transition: "all 0.15s ease",
          }}><span style={{ fontSize: 28 }}>{c.emoji}</span> {c.name}</button>
        ))}
      </div>
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 Perfect!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Almost! Try again! 💪</div>}
    </div>
  );
}

// ─── PATTERN GAME ────────────────────────────────────────────────────────────
function PatternGameScreen({ setScreen }) {
  const { settings } = useApp();
  const [items, setItems] = useState(() => shuffleArr(lessonsFor(patternData, settings.ageRange)));
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [done, setDone] = useState(false);
  const p = items[idx];
  const filtered = items;

  function restart() {
    setItems(shuffleArr(lessonsFor(patternData, settings.ageRange)));
    setIdx(0); setFeedback(""); setScore(0); setDone(false);
  }
  if (done) return <GameComplete score={score} total={items.length} onPlayAgain={restart} onExit={() => setScreen("games")} />;

  function pick(val) {
    if (feedback) return;
    if (val === p.answer) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      playSfx("correct");
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => {
        setFeedback("");
        if (idx + 1 >= items.length) setDone(true);
        else setIdx(i => i + 1);
      }, 1500);
    } else { setFeedback("wrong"); playSfx("wrong"); setTimeout(() => setFeedback(""), 800); }
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🔷 Pattern Finder" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <ProgressBar value={idx + 1} max={filtered.length} color={T.purple} h={6} />
      <Card style={{ textAlign: "center", padding: 28, marginBottom: 24, marginTop: 16 }}>
        <p style={{ fontFamily: T.font, fontSize: 16, color: T.soft, margin: "0 0 16px" }}>What comes next?</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          {p.pattern.map((item, i) => (
            <div key={i} style={{
              width: 50, height: 50, borderRadius: 14,
              background: item === "?" ? `${T.purple}15` : T.surface,
              border: item === "?" ? `2.5px dashed ${T.purple}` : `2px solid ${T.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: T.font, fontSize: item === "?" ? 24 : 20, fontWeight: 700, color: item === "?" ? T.purple : T.text,
            }}>{item}</div>
          ))}
        </div>
      </Card>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        {p.choices.map(c => (
          <button key={c} onClick={() => pick(c)} style={{
            width: 80, height: 80, borderRadius: 20, border: `2.5px solid ${T.border}`,
            background: feedback === "correct" && c === p.answer ? T.greenGlow : T.surface,
            cursor: "pointer", fontFamily: T.font, fontSize: 28, fontWeight: 700, transition: "all 0.15s ease",
          }}>{c}</button>
        ))}
      </div>
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 You got it!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Look closely! 👀</div>}
    </div>
  );
}

// ─── MATH GAME ───────────────────────────────────────────────────────────────
function MathGameScreen({ setScreen }) {
  const { settings } = useApp();
  const [items, setItems] = useState(() => shuffleArr(lessonsFor(mathProblems, settings.ageRange)));
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [done, setDone] = useState(false);
  const prob = items[idx];
  const filtered = items;

  function restart() {
    setItems(shuffleArr(lessonsFor(mathProblems, settings.ageRange)));
    setIdx(0); setScore(0); setFeedback(""); setDone(false);
  }
  if (done) return <GameComplete score={score} total={items.length} onPlayAgain={restart} onExit={() => setScreen("games")} />;

  function pick(val) {
    if (feedback) return;
    if (val === prob.a) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      playSfx("correct"); speak(`${prob.q} equals ${prob.a}`, settings);
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => {
        setFeedback("");
        if (idx + 1 >= items.length) setDone(true);
        else setIdx(i => i + 1);
      }, 1500);
    } else { setFeedback("wrong"); playSfx("wrong"); setTimeout(() => setFeedback(""), 800); }
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🔢 Number Fun" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <ProgressBar value={idx + 1} max={filtered.length} color={T.green} h={6} />
      <Card style={{ textAlign: "center", padding: 36, marginBottom: 24, marginTop: 16 }}>
        <div style={{ fontFamily: T.font, fontSize: 56, fontWeight: 800, color: T.text, letterSpacing: 4 }}>{prob.q}</div>
        <div style={{ fontFamily: T.font, fontSize: 20, color: T.soft, marginTop: 8 }}>= ?</div>
      </Card>
      <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
        {prob.choices.map(c => (
          <button key={c} onClick={() => pick(c)} style={{
            width: 88, height: 88, borderRadius: 22, border: `3px solid ${T.border}`,
            background: feedback === "correct" && c === prob.a ? T.greenGlow : T.surface,
            cursor: "pointer", fontFamily: T.font, fontSize: 32, fontWeight: 800, color: T.text,
            boxShadow: T.shadow, transition: "all 0.15s ease",
          }}>{c}</button>
        ))}
      </div>
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 Correct!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Try again! 💪</div>}
    </div>
  );
}

// ─── MEMORY GAME ────────────────────────────────────────────────────────────
function MemoryGameScreen({ setScreen }) {
  const { settings } = useApp();
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState([]);
  const [moves, setMoves] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const lockRef = useRef(false);

  const pairCount = settings.ageRange === "child" ? 4 : settings.ageRange === "teen" ? 6 : 8;

  useEffect(() => {
    const picked = [...memoryCards].sort(() => Math.random() - 0.5).slice(0, pairCount);
    const deck = [...picked, ...picked].map((c, i) => ({ ...c, uid: i })).sort(() => Math.random() - 0.5);
    setCards(deck); setFlipped([]); setMatched([]); setMoves(0);
  }, []);

  function flipCard(uid) {
    if (lockRef.current || flipped.includes(uid) || matched.includes(uid)) return;
    const next = [...flipped, uid];
    setFlipped(next);
    if (next.length === 2) {
      lockRef.current = true;
      setMoves(m => m + 1);
      const [a, b] = next.map(u => cards.find(c => c.uid === u));
      if (a.id === b.id) {
        const newMatched = [...matched, next[0], next[1]];
        setMatched(newMatched);
        setFlipped([]);
        lockRef.current = false;
        playSfx("correct");
        if (newMatched.length === cards.length) {
          setShowConfetti(true);
          playSfx("win");
          setTimeout(() => setShowConfetti(false), 3000);
        }
      } else {
        setTimeout(() => { setFlipped([]); lockRef.current = false; }, 900);
      }
    }
  }

  const cols = pairCount <= 4 ? 4 : 4;
  const won = matched.length === cards.length && cards.length > 0;

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🧠 Memory Match" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 14, color: T.soft, fontWeight: 700 }}>Moves: {moves}</span>} />
      <ProgressBar value={matched.length} max={cards.length} color={T.pink} h={6} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10, marginTop: 16 }}>
        {cards.map(c => {
          const isFlipped = flipped.includes(c.uid) || matched.includes(c.uid);
          return (
            <button key={c.uid} onClick={() => flipCard(c.uid)} style={{
              aspectRatio: "1", borderRadius: 16, border: `2.5px solid ${matched.includes(c.uid) ? T.green : T.border}`,
              background: isFlipped ? (matched.includes(c.uid) ? T.greenGlow : T.blueGlow) : `linear-gradient(135deg, ${T.purple} 0%, #A78BFA 100%)`,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: isFlipped ? 32 : 24, transition: "all 0.25s ease",
              transform: isFlipped ? "rotateY(0deg)" : "rotateY(0deg)",
              boxShadow: matched.includes(c.uid) ? `0 4px 12px ${T.green}30` : "none",
            }}>
              {isFlipped ? c.emoji : "❓"}
            </button>
          );
        })}
      </div>
      {won && (
        <div style={{ textAlign: "center", padding: 20, marginTop: 16 }}>
          <div style={{ fontFamily: T.font, fontSize: 24, fontWeight: 800, color: T.green }}>🎉 You Won!</div>
          <div style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.soft, marginTop: 8 }}>Completed in {moves} moves</div>
          <Btn color={T.purple} onClick={() => { const picked = [...memoryCards].sort(() => Math.random() - 0.5).slice(0, pairCount); const deck = [...picked, ...picked].map((c, i) => ({ ...c, uid: i })).sort(() => Math.random() - 0.5); setCards(deck); setFlipped([]); setMatched([]); setMoves(0); }} style={{ marginTop: 16 }}>Play Again</Btn>
        </div>
      )}
    </div>
  );
}

// ─── RHYMING GAME ───────────────────────────────────────────────────────────
function RhymingGameScreen({ setScreen }) {
  const { settings } = useApp();
  const [items, setItems] = useState(() => shuffleArr(lessonsFor(rhymingData, settings.ageRange)));
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [done, setDone] = useState(false);
  const item = items[idx];
  const filtered = items;

  function restart() {
    setItems(shuffleArr(lessonsFor(rhymingData, settings.ageRange)));
    setIdx(0); setScore(0); setFeedback(""); setDone(false);
  }
  if (done) return <GameComplete score={score} total={items.length} onPlayAgain={restart} onExit={() => setScreen("games")} />;

  function pick(choice) {
    if (feedback) return;
    if (choice === item.answer) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      playSfx("correct"); speak(`${item.word} rhymes with ${item.answer}`, settings);
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => {
        setFeedback("");
        if (idx + 1 >= items.length) setDone(true);
        else setIdx(i => i + 1);
      }, 1500);
    } else {
      setFeedback("wrong"); playSfx("wrong");
      setTimeout(() => setFeedback(""), 800);
    }
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🎤 Rhyme Time" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <ProgressBar value={idx + 1} max={filtered.length} color={T.pink} h={6} />
      <Card style={{ textAlign: "center", padding: 32, marginBottom: 20, marginTop: 16 }}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>{item.emoji}</div>
        <div style={{ fontFamily: T.font, fontSize: 36, fontWeight: 800, color: T.text, letterSpacing: 4 }}>{item.word}</div>
        <p style={{ fontFamily: T.fontAlt, fontSize: 16, color: T.soft, margin: "12px 0 0" }}>What rhymes with this?</p>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {item.choices.map(c => {
          let bg = T.surface, border = T.border, col = T.text;
          if (feedback === "correct" && c === item.answer) { bg = T.greenGlow; border = T.green; col = T.green; }
          return (
            <button key={c} onClick={() => pick(c)} style={{
              padding: 18, borderRadius: 18, border: `2.5px solid ${border}`, background: bg,
              cursor: "pointer", fontFamily: T.font, fontSize: 20, fontWeight: 800,
              color: col, letterSpacing: 2, transition: "all 0.15s ease",
            }}>{c}</button>
          );
        })}
      </div>
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 They rhyme!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Not quite! Try again! 💪</div>}
    </div>
  );
}

// ─── SHAPE SORTING GAME ─────────────────────────────────────────────────────
function ShapeSortScreen({ setScreen }) {
  const { settings } = useApp();
  const [items, setItems] = useState(() => shuffleArr(lessonsFor(shapeSortData, settings.ageRange)));
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [done, setDone] = useState(false);
  const item = items[idx];
  const filtered = items;

  function restart() {
    setItems(shuffleArr(lessonsFor(shapeSortData, settings.ageRange)));
    setIdx(0); setScore(0); setFeedback(""); setDone(false);
  }
  if (done) return <GameComplete score={score} total={items.length} onPlayAgain={restart} onExit={() => setScreen("games")} />;

  function pick(emoji) {
    if (feedback) return;
    if (emoji === item.answer) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      playSfx("correct");
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => {
        setFeedback("");
        if (idx + 1 >= items.length) setDone(true);
        else setIdx(i => i + 1);
      }, 1500);
    } else {
      setFeedback("wrong"); playSfx("wrong");
      setTimeout(() => setFeedback(""), 800);
    }
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🧩 Odd One Out" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <ProgressBar value={idx + 1} max={filtered.length} color={T.yellow} h={6} />
      <Card style={{ textAlign: "center", padding: 28, marginBottom: 20, marginTop: 16 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{item.emoji}</div>
        <div style={{ fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.text }}>{item.shape}</div>
        <p style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.soft, margin: "10px 0 0" }}>Which one does NOT belong?</p>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 300, margin: "0 auto" }}>
        {item.items.map((emoji, i) => {
          let bg = T.surface, border = T.border;
          if (feedback === "correct" && emoji === item.answer) { bg = T.greenGlow; border = T.green; }
          return (
            <button key={i} onClick={() => pick(emoji)} style={{
              aspectRatio: "1", borderRadius: 22, border: `3px solid ${border}`, background: bg,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 44, transition: "all 0.15s ease", boxShadow: T.shadow,
            }}>{emoji}</button>
          );
        })}
      </div>
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 20, fontWeight: 800, color: T.green }}>🎉 {item.wrongLabel}!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>That one fits! Try again! 👀</div>}
    </div>
  );
}

// ─── SPELLING BEE ────────────────────────────────────────────────────────────
function SpellingBeeScreen({ setScreen }) {
  const { settings, addProgress } = useApp();
  const [items, setItems] = useState(() => shuffleArr(lessonsFor(spellingWords, settings.ageRange)));
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const current = items[idx];

  function restart() {
    setItems(shuffleArr(lessonsFor(spellingWords, settings.ageRange)));
    setIdx(0); setTyped(""); setFeedback(""); setScore(0); setRevealed(false); setDone(false);
  }

  if (done) return <GameComplete score={score} total={items.length} onPlayAgain={restart} onExit={() => setScreen("games")} />;

  function addLetter(l) {
    if (feedback) return;
    if (typed.length >= current.word.length) return;
    setTyped(t => t + l);
  }
  function backspace() { if (!feedback) setTyped(t => t.slice(0, -1)); }
  function clearAll() { if (!feedback) setTyped(""); }

  function check() {
    if (feedback || !typed) return;
    if (typed.toLowerCase() === current.word.toLowerCase()) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      playSfx("correct"); speak(current.word, settings);
      addProgress({ stars: 1, wordsSpoken: 1 });
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => {
        setFeedback(""); setTyped(""); setRevealed(false);
        if (idx + 1 >= items.length) setDone(true);
        else setIdx(i => i + 1);
      }, 1800);
    } else {
      setFeedback("wrong"); playSfx("wrong");
      setTimeout(() => { setFeedback(""); }, 900);
    }
  }

  function sayWord() { speak(current.word, settings); }

  const letters = "abcdefghijklmnopqrstuvwxyz".split("");

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🐝 Spelling Bee" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <ProgressBar value={idx + 1} max={items.length} color={T.yellow} h={6} />
      <Card style={{ textAlign: "center", padding: 24, marginTop: 16, marginBottom: 16 }}>
        <p style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, margin: "0 0 10px" }}>Spell the word!</p>
        <div style={{ fontSize: 32, marginBottom: 10 }}>{current.hint}</div>
        <button onClick={sayWord} style={{
          padding: "10px 18px", border: `2px solid ${T.primary}`, background: T.primaryGlow,
          borderRadius: 14, fontFamily: T.font, fontSize: 14, fontWeight: 700, color: T.primary, cursor: "pointer",
        }}>🔊 Hear it</button>
        {revealed && <div style={{ marginTop: 12, fontFamily: T.font, fontSize: 18, color: T.blue, letterSpacing: 3 }}>{current.word}</div>}
      </Card>
      <div style={{
        display: "flex", justifyContent: "center", gap: 8, marginBottom: 16, minHeight: 60, alignItems: "center",
      }}>
        {Array.from({ length: current.word.length }).map((_, i) => {
          const ch = typed[i] || "";
          const isCorrect = feedback === "correct";
          const isWrong = feedback === "wrong";
          return (
            <div key={i} style={{
              width: 40, height: 52, borderRadius: 12,
              border: `2.5px solid ${isCorrect ? T.green : isWrong ? T.primary : T.border}`,
              background: isCorrect ? T.greenGlow : isWrong ? T.primaryGlow : T.surface,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: T.font, fontSize: 24, fontWeight: 800,
              color: isCorrect ? T.green : isWrong ? T.primary : T.text,
              textTransform: "uppercase",
            }}>{ch}</div>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 12 }}>
        {letters.map(l => (
          <button key={l} onClick={() => addLetter(l)} style={{
            padding: "12px 0", border: `1.5px solid ${T.border}`, background: T.surface,
            borderRadius: 10, fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text,
            cursor: "pointer", textTransform: "uppercase",
          }}>{l}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        <button onClick={backspace} style={{
          padding: 12, border: `1.5px solid ${T.border}`, background: T.surface,
          borderRadius: 12, fontFamily: T.font, fontSize: 14, fontWeight: 700, color: T.soft, cursor: "pointer",
        }}>⌫ Back</button>
        <button onClick={clearAll} style={{
          padding: 12, border: `1.5px solid ${T.border}`, background: T.surface,
          borderRadius: 12, fontFamily: T.font, fontSize: 14, fontWeight: 700, color: T.soft, cursor: "pointer",
        }}>Clear</button>
        <button onClick={check} disabled={!typed} style={{
          padding: 12, border: "none", background: typed ? T.green : T.border,
          borderRadius: 12, fontFamily: T.font, fontSize: 14, fontWeight: 800, color: "#fff",
          cursor: typed ? "pointer" : "default",
        }}>Check ✓</button>
      </div>
      {!revealed && !feedback && (
        <button onClick={() => setRevealed(true)} style={{
          width: "100%", padding: 10, background: "none", border: `1.5px dashed ${T.border}`,
          borderRadius: 14, fontFamily: T.font, fontSize: 13, color: T.soft, cursor: "pointer",
        }}>💡 Show Answer</button>
      )}
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 14, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 Perfect!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 14, fontFamily: T.font, fontSize: 16, color: T.primary }}>Not quite! 💪</div>}
    </div>
  );
}

// ─── OPPOSITE MATCH ──────────────────────────────────────────────────────────
function OppositeMatchScreen({ setScreen }) {
  const { settings, addProgress } = useApp();
  const [items, setItems] = useState(() => shuffleArr(lessonsFor(oppositeData, settings.ageRange)));
  const [idx, setIdx] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [shuffled, setShuffled] = useState([]);
  const [done, setDone] = useState(false);
  const current = items[idx];
  const filtered = items;

  useEffect(() => {
    if (current) setShuffled([...current.choices].sort(() => Math.random() - 0.5));
  }, [idx, current]);

  function restart() {
    setItems(shuffleArr(lessonsFor(oppositeData, settings.ageRange)));
    setIdx(0); setScore(0); setFeedback(""); setDone(false);
  }
  if (done) return <GameComplete score={score} total={items.length} onPlayAgain={restart} onExit={() => setScreen("games")} />;

  function pick(choice) {
    if (feedback) return;
    if (choice === current.answer) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      playSfx("correct"); speak(`${current.word} and ${current.answer}`, settings);
      addProgress({ stars: 1, wordsSpoken: 1 });
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => {
        setFeedback("");
        if (idx + 1 >= items.length) setDone(true);
        else setIdx(i => i + 1);
      }, 1800);
    } else {
      setFeedback("wrong"); playSfx("wrong");
      setTimeout(() => setFeedback(""), 900);
    }
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="↔️ Opposite Match" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <ProgressBar value={idx + 1} max={filtered.length} color={T.purple} h={6} />
      <Card style={{ textAlign: "center", padding: 32, marginTop: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 70, marginBottom: 8 }}>{current.emoji}</div>
        <div style={{ fontFamily: T.font, fontSize: 32, fontWeight: 800, color: T.text, marginBottom: 8 }}>{current.word}</div>
        <p style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.soft, margin: 0 }}>What's the opposite?</p>
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {shuffled.map(c => {
          let bg = T.surface, border = T.border, col = T.text;
          if (feedback === "correct" && c === current.answer) { bg = T.greenGlow; border = T.green; col = T.green; }
          if (feedback === "wrong" && c === current.answer) { bg = T.greenGlow; border = T.green; col = T.green; }
          return (
            <button key={c} onClick={() => pick(c)} style={{
              padding: 20, borderRadius: 18, border: `2.5px solid ${border}`, background: bg, cursor: "pointer",
              fontFamily: T.font, fontSize: 22, fontWeight: 800, color: col, transition: "all 0.15s ease",
            }}>{c}</button>
          );
        })}
      </div>
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 Opposites!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Hmm, not quite! 💪</div>}
    </div>
  );
}

// ─── COUNTING GAME ───────────────────────────────────────────────────────────
function CountingGameScreen({ setScreen }) {
  const { settings, addProgress } = useApp();
  const [items, setItems] = useState(() => shuffleArr(lessonsFor(countingData, settings.ageRange)));
  const [idx, setIdx] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [done, setDone] = useState(false);
  const current = items[idx];
  const filtered = items;

  function restart() {
    setItems(shuffleArr(lessonsFor(countingData, settings.ageRange)));
    setIdx(0); setScore(0); setFeedback(""); setDone(false);
  }
  if (done) return <GameComplete score={score} total={items.length} onPlayAgain={restart} onExit={() => setScreen("games")} />;

  function pick(n) {
    if (feedback) return;
    if (n === current.answer) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      playSfx("correct"); speak(String(current.answer), settings);
      addProgress({ stars: 1 });
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => {
        setFeedback("");
        if (idx + 1 >= items.length) setDone(true);
        else setIdx(i => i + 1);
      }, 1800);
    } else {
      setFeedback("wrong"); playSfx("wrong");
      setTimeout(() => setFeedback(""), 900);
    }
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🔢 Counting" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <ProgressBar value={idx + 1} max={filtered.length} color={T.blue} h={6} />
      <Card style={{ textAlign: "center", padding: 24, marginTop: 16, marginBottom: 20 }}>
        <p style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.soft, margin: "0 0 14px" }}>How many do you see?</p>
        <div style={{
          display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, fontSize: 36, lineHeight: 1.2,
        }}>
          {current.items.map((it, i) => <span key={i}>{it}</span>)}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {current.choices.map(n => {
          let bg = T.surface, border = T.border, col = T.text;
          if (feedback === "correct" && n === current.answer) { bg = T.greenGlow; border = T.green; col = T.green; }
          return (
            <button key={n} onClick={() => pick(n)} style={{
              padding: "24px 0", borderRadius: 18, border: `2.5px solid ${border}`, background: bg, cursor: "pointer",
              fontFamily: T.font, fontSize: 32, fontWeight: 800, color: col,
            }}>{n}</button>
          );
        })}
      </div>
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 Right!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Count again! 💪</div>}
    </div>
  );
}

// ─── SIZE SORTING ────────────────────────────────────────────────────────────
function SizeSortScreen({ setScreen }) {
  const { settings, addProgress } = useApp();
  const [items, setItems] = useState(() => shuffleArr(lessonsFor(sizeSortData, settings.ageRange)));
  const [idx, setIdx] = useState(0);
  const [order, setOrder] = useState([]);
  const [available, setAvailable] = useState([]);
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [done, setDone] = useState(false);
  const current = items[idx];
  const filtered = items;

  useEffect(() => {
    if (current) {
      setOrder([]);
      setAvailable([...current.items].sort(() => Math.random() - 0.5));
      setFeedback("");
    }
  }, [idx, current]);

  function restart() {
    setItems(shuffleArr(lessonsFor(sizeSortData, settings.ageRange)));
    setIdx(0); setScore(0); setFeedback(""); setOrder([]); setDone(false);
  }
  if (done) return <GameComplete score={score} total={items.length} onPlayAgain={restart} onExit={() => setScreen("games")} />;

  function pickItem(item) {
    if (feedback) return;
    setAvailable(a => a.filter(i => i.label !== item.label));
    const next = [...order, item];
    setOrder(next);
    if (next.length === current.items.length) {
      // check ascending (smallest to biggest)
      const correct = next.every((it, i) => it.size === i + 1);
      if (correct) {
        setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
        playSfx("correct");
        addProgress({ stars: 1 });
        setTimeout(() => setShowConfetti(false), 2000);
        setTimeout(() => {
          if (idx + 1 >= items.length) setDone(true);
          else setIdx(i => i + 1);
        }, 1800);
      } else {
        setFeedback("wrong"); playSfx("wrong");
        setTimeout(() => {
          setOrder([]);
          setAvailable([...current.items].sort(() => Math.random() - 0.5));
          setFeedback("");
        }, 1200);
      }
    }
  }

  if (!current) return null;
  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="📏 Size Sort" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <ProgressBar value={idx + 1} max={filtered.length} color={T.pink} h={6} />
      <Card style={{ textAlign: "center", padding: 20, marginTop: 16, marginBottom: 16 }}>
        <p style={{ fontFamily: T.font, fontSize: 17, fontWeight: 700, color: T.text, margin: 0 }}>Tap in order: smallest → biggest</p>
      </Card>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.soft, margin: "0 0 8px" }}>Your order:</p>
        <div style={{
          display: "flex", gap: 8, minHeight: 80, padding: 12,
          border: `2px dashed ${feedback === "correct" ? T.green : feedback === "wrong" ? T.primary : T.border}`,
          borderRadius: 16, background: T.surface, alignItems: "center", justifyContent: "center",
        }}>
          {order.length === 0 ? (
            <span style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.soft }}>Tap items below</span>
          ) : order.map((it, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 36 }}>{it.emoji}</div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 11, color: T.soft }}>{i + 1}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
        {available.map(it => (
          <button key={it.label} onClick={() => pickItem(it)} style={{
            padding: "12px 14px", borderRadius: 16, border: `2px solid ${T.border}`, background: T.surface,
            cursor: "pointer", textAlign: "center",
          }}>
            <div style={{ fontSize: 40 }}>{it.emoji}</div>
            <div style={{ fontFamily: T.font, fontSize: 12, color: T.text, fontWeight: 700 }}>{it.label}</div>
          </button>
        ))}
      </div>
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 Perfect!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Try again! 💪</div>}
    </div>
  );
}

// ─── CLOCK READER ────────────────────────────────────────────────────────────
function ClockReaderScreen({ setScreen }) {
  const { settings, addProgress } = useApp();
  const [items, setItems] = useState(() => shuffleArr(lessonsFor(clockData, settings.ageRange)));
  const [idx, setIdx] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [shuffled, setShuffled] = useState([]);
  const [done, setDone] = useState(false);
  const current = items[idx];
  const filtered = items;

  useEffect(() => {
    if (current) setShuffled([...current.choices].sort(() => Math.random() - 0.5));
  }, [idx, current]);

  function restart() {
    setItems(shuffleArr(lessonsFor(clockData, settings.ageRange)));
    setIdx(0); setScore(0); setFeedback(""); setDone(false);
  }
  if (done) return <GameComplete score={score} total={items.length} onPlayAgain={restart} onExit={() => setScreen("games")} />;

  function pick(c) {
    if (feedback) return;
    if (c === current.display) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      playSfx("correct"); speak(current.display, settings);
      addProgress({ stars: 1 });
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => {
        setFeedback("");
        if (idx + 1 >= items.length) setDone(true);
        else setIdx(i => i + 1);
      }, 1800);
    } else {
      setFeedback("wrong"); playSfx("wrong");
      setTimeout(() => setFeedback(""), 900);
    }
  }

  // hand angles
  const hourDeg = ((current.hour % 12) * 30) + (current.minute * 0.5) - 90;
  const minDeg = (current.minute * 6) - 90;
  const R = 110;

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🕐 Clock Reader" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <ProgressBar value={idx + 1} max={filtered.length} color={T.blue} h={6} />
      <Card style={{ textAlign: "center", padding: 24, marginTop: 16, marginBottom: 20 }}>
        <p style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.soft, margin: "0 0 14px" }}>What time is it?</p>
        <svg width={R * 2 + 20} height={R * 2 + 20} style={{ display: "block", margin: "0 auto" }}>
          <circle cx={R + 10} cy={R + 10} r={R} fill={T.surface} stroke={T.primary} strokeWidth={4} />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * 30 - 90) * Math.PI / 180;
            const x = R + 10 + Math.cos(a) * (R - 18);
            const y = R + 10 + Math.sin(a) * (R - 18) + 5;
            return <text key={i} x={x} y={y} textAnchor="middle" fontFamily={T.font} fontSize={16} fontWeight={800} fill={T.text}>{i === 0 ? 12 : i}</text>;
          })}
          {/* hour hand */}
          <line x1={R + 10} y1={R + 10}
            x2={R + 10 + Math.cos(hourDeg * Math.PI / 180) * (R - 45)}
            y2={R + 10 + Math.sin(hourDeg * Math.PI / 180) * (R - 45)}
            stroke={T.text} strokeWidth={6} strokeLinecap="round" />
          {/* minute hand */}
          <line x1={R + 10} y1={R + 10}
            x2={R + 10 + Math.cos(minDeg * Math.PI / 180) * (R - 25)}
            y2={R + 10 + Math.sin(minDeg * Math.PI / 180) * (R - 25)}
            stroke={T.primary} strokeWidth={4} strokeLinecap="round" />
          <circle cx={R + 10} cy={R + 10} r={6} fill={T.primary} />
        </svg>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {shuffled.map(c => {
          let bg = T.surface, border = T.border, col = T.text;
          if (feedback === "correct" && c === current.display) { bg = T.greenGlow; border = T.green; col = T.green; }
          return (
            <button key={c} onClick={() => pick(c)} style={{
              padding: "18px 0", borderRadius: 16, border: `2.5px solid ${border}`, background: bg, cursor: "pointer",
              fontFamily: T.font, fontSize: 20, fontWeight: 800, color: col,
            }}>{c}</button>
          );
        })}
      </div>
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 Right!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Look again! 💪</div>}
    </div>
  );
}

// ─── MONEY MATCH ─────────────────────────────────────────────────────────────
function MoneyMatchScreen({ setScreen }) {
  const { settings, addProgress } = useApp();
  const [items, setItems] = useState(() => shuffleArr(lessonsFor(moneyData, settings.ageRange)));
  const [idx, setIdx] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [shuffled, setShuffled] = useState([]);
  const [done, setDone] = useState(false);
  const current = items[idx];
  const filtered = items;

  useEffect(() => {
    if (current) setShuffled([...current.choices].sort(() => Math.random() - 0.5));
  }, [idx, current]);

  function restart() {
    setItems(shuffleArr(lessonsFor(moneyData, settings.ageRange)));
    setIdx(0); setScore(0); setFeedback(""); setDone(false);
  }
  if (done) return <GameComplete score={score} total={items.length} onPlayAgain={restart} onExit={() => setScreen("games")} />;

  function pick(c) {
    if (feedback) return;
    if (c === current.display) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      playSfx("correct"); speak(current.display, settings);
      addProgress({ stars: 1 });
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => {
        setFeedback("");
        if (idx + 1 >= items.length) setDone(true);
        else setIdx(i => i + 1);
      }, 1800);
    } else {
      setFeedback("wrong"); playSfx("wrong");
      setTimeout(() => setFeedback(""), 900);
    }
  }

  function coinColor(c) {
    if (c.startsWith("$")) return T.green;
    if (c === "25¢") return T.soft;
    if (c === "10¢") return T.blue;
    if (c === "5¢") return T.purple;
    return T.primary;
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="💰 Money Match" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <ProgressBar value={idx + 1} max={filtered.length} color={T.green} h={6} />
      <Card style={{ textAlign: "center", padding: 24, marginTop: 16, marginBottom: 20 }}>
        <p style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.soft, margin: "0 0 14px" }}>How much money?</p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
          {current.coins.map((c, i) => {
            const isBill = c.startsWith("$");
            return (
              <div key={i} style={{
                width: isBill ? 74 : 56, height: isBill ? 42 : 56,
                borderRadius: isBill ? 8 : "50%",
                background: coinColor(c),
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: T.font, fontSize: 14, fontWeight: 800,
                boxShadow: `0 4px 12px ${coinColor(c)}40`,
              }}>{c}</div>
            );
          })}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {shuffled.map(c => {
          let bg = T.surface, border = T.border, col = T.text;
          if (feedback === "correct" && c === current.display) { bg = T.greenGlow; border = T.green; col = T.green; }
          return (
            <button key={c} onClick={() => pick(c)} style={{
              padding: "18px 0", borderRadius: 16, border: `2.5px solid ${border}`, background: bg, cursor: "pointer",
              fontFamily: T.font, fontSize: 18, fontWeight: 800, color: col,
            }}>{c}</button>
          );
        })}
      </div>
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 Correct!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Count again! 💪</div>}
    </div>
  );
}

// ─── EMOTION MATCH ───────────────────────────────────────────────────────────
function EmotionMatchScreen({ setScreen }) {
  const { settings, addProgress } = useApp();
  const [items, setItems] = useState(() => shuffleArr(lessonsFor(emotionMatchData, settings.ageRange)));
  const [idx, setIdx] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [shuffled, setShuffled] = useState([]);
  const [done, setDone] = useState(false);
  const current = items[idx];
  const filtered = items;

  useEffect(() => {
    if (current) setShuffled([...current.choices].sort(() => Math.random() - 0.5));
  }, [idx, current]);

  function restart() {
    setItems(shuffleArr(lessonsFor(emotionMatchData, settings.ageRange)));
    setIdx(0); setScore(0); setFeedback(""); setDone(false);
  }
  if (done) return <GameComplete score={score} total={items.length} onPlayAgain={restart} onExit={() => setScreen("games")} />;

  function pick(c) {
    if (feedback) return;
    if (c === current.answer) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      playSfx("correct"); speak(current.answer, settings);
      addProgress({ stars: 1, wordsSpoken: 1 });
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => {
        setFeedback("");
        if (idx + 1 >= items.length) setDone(true);
        else setIdx(i => i + 1);
      }, 1800);
    } else {
      setFeedback("wrong"); playSfx("wrong");
      setTimeout(() => setFeedback(""), 900);
    }
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🙂 Emotion Match" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <ProgressBar value={idx + 1} max={filtered.length} color={T.pink} h={6} />
      <Card style={{ textAlign: "center", padding: 32, marginTop: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 110, lineHeight: 1, marginBottom: 10 }}>{current.face}</div>
        <p style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.soft, margin: 0 }}>How is this person feeling?</p>
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {shuffled.map(c => {
          let bg = T.surface, border = T.border, col = T.text;
          if (feedback === "correct" && c === current.answer) { bg = T.greenGlow; border = T.green; col = T.green; }
          return (
            <button key={c} onClick={() => pick(c)} style={{
              padding: 20, borderRadius: 18, border: `2.5px solid ${border}`, background: bg, cursor: "pointer",
              fontFamily: T.font, fontSize: 22, fontWeight: 800, color: col,
            }}>{c}</button>
          );
        })}
      </div>
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 Yes!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Look again! 💪</div>}
    </div>
  );
}

// ─── WHAT'S MISSING ──────────────────────────────────────────────────────────
function WhatsMissingScreen({ setScreen }) {
  const { settings, addProgress } = useApp();
  const [items, setItems] = useState(() => shuffleArr(lessonsFor(missingData, settings.ageRange)));
  const [idx, setIdx] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [phase, setPhase] = useState("show"); // show, hide, answer
  const [shuffled, setShuffled] = useState([]);
  const [done, setDone] = useState(false);
  const current = items[idx];
  const filtered = items;

  useEffect(() => {
    setPhase("show");
    setFeedback("");
    if (current) setShuffled([...current.choices].sort(() => Math.random() - 0.5));
    const t = setTimeout(() => setPhase("answer"), 2500);
    return () => clearTimeout(t);
  }, [idx, current]);

  function restart() {
    setItems(shuffleArr(lessonsFor(missingData, settings.ageRange)));
    setIdx(0); setScore(0); setFeedback(""); setPhase("show"); setDone(false);
  }
  if (done) return <GameComplete score={score} total={items.length} onPlayAgain={restart} onExit={() => setScreen("games")} />;

  function pick(c) {
    if (feedback) return;
    if (c === current.missing) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      playSfx("correct");
      addProgress({ stars: 1 });
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => {
        if (idx + 1 >= items.length) setDone(true);
        else setIdx(i => i + 1);
      }, 1800);
    } else {
      setFeedback("wrong"); playSfx("wrong");
      setTimeout(() => setFeedback(""), 900);
    }
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🔍 What's Missing" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <ProgressBar value={idx + 1} max={filtered.length} color={T.purple} h={6} />
      <Card style={{ textAlign: "center", padding: 24, marginTop: 16, marginBottom: 20 }}>
        <p style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.soft, margin: "0 0 14px" }}>
          {phase === "show" ? "Remember these items..." : "Which one is missing?"}
        </p>
        <div style={{
          display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, fontSize: 42, minHeight: 60,
        }}>
          {phase === "show"
            ? current.items.map((it, i) => <span key={i}>{it}</span>)
            : current.items.filter(it => it !== current.missing).map((it, i) => <span key={i}>{it}</span>)}
          {phase === "answer" && <span style={{ opacity: 0.3 }}>❓</span>}
        </div>
      </Card>
      {phase === "answer" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {shuffled.map((c, i) => {
            let bg = T.surface, border = T.border;
            if (feedback === "correct" && c === current.missing) { bg = T.greenGlow; border = T.green; }
            return (
              <button key={i} onClick={() => pick(c)} style={{
                padding: "24px 0", borderRadius: 18, border: `2.5px solid ${border}`, background: bg, cursor: "pointer",
                fontSize: 42,
              }}>{c}</button>
            );
          })}
        </div>
      )}
      {feedback === "correct" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.green }}>🎉 Found it!</div>}
      {feedback === "wrong" && <div style={{ textAlign: "center", padding: 16, fontFamily: T.font, fontSize: 18, color: T.primary }}>Think again! 💪</div>}
    </div>
  );
}

// ─── STORY BUILDER ───────────────────────────────────────────────────────────
function StoryBuilderScreen({ setScreen }) {
  const { settings, addProgress } = useApp();
  const [templateIdx, setTemplateIdx] = useState(null);
  const [answers, setAnswers] = useState({});
  const [blankIdx, setBlankIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  if (templateIdx === null) {
    return (
      <div style={{ padding: "24px 20px 120px" }}>
        <Header title="📖 Story Builder" onBack={() => setScreen("games")} />
        <p style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.soft, margin: "0 0 16px" }}>Pick a story to build!</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {storyTemplates.map((t, i) => (
            <Card key={t.id} onClick={() => { setTemplateIdx(i); setAnswers({}); setBlankIdx(0); setDone(false); }}
              style={{ display: "flex", alignItems: "center", gap: 16, padding: 20 }}>
              <div style={{ fontSize: 44 }}>{t.emoji}</div>
              <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text }}>{t.title}</div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const template = storyTemplates[templateIdx];
  const currentBlank = template.blanks[blankIdx];

  function pick(choice) {
    const next = { ...answers, [currentBlank.key]: choice };
    setAnswers(next);
    if (blankIdx + 1 < template.blanks.length) {
      setBlankIdx(blankIdx + 1);
    } else {
      setDone(true);
      setShowConfetti(true);
      addProgress({ stars: 2, wordsSpoken: template.blanks.length });
      // build and speak the story
      let story = template.template;
      Object.entries(next).forEach(([k, v]) => {
        story = story.replace(new RegExp(`\\{${k}\\}`, "g"), v);
      });
      speak(story, settings);
      setTimeout(() => setShowConfetti(false), 3000);
    }
  }

  function reset() { setTemplateIdx(null); setAnswers({}); setBlankIdx(0); setDone(false); }

  if (done) {
    let story = template.template;
    Object.entries(answers).forEach(([k, v]) => {
      story = story.replace(new RegExp(`\\{${k}\\}`, "g"), `__${v}__`);
    });
    const parts = story.split(/(__[^_]+__)/g);
    return (
      <div style={{ padding: "24px 20px 120px" }}>
        <Confetti active={showConfetti} />
        <Header title="📖 Your Story" onBack={() => setScreen("games")} />
        <Card style={{ padding: 24, marginTop: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 56, textAlign: "center", marginBottom: 10 }}>{template.emoji}</div>
          <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text, textAlign: "center", marginBottom: 14 }}>{template.title}</div>
          <p style={{ fontFamily: T.fontAlt, fontSize: 17, color: T.text, lineHeight: 1.7, margin: 0 }}>
            {parts.map((p, i) => {
              if (p.startsWith("__") && p.endsWith("__")) {
                return <span key={i} style={{ fontWeight: 800, color: T.primary, background: T.primaryGlow, padding: "2px 6px", borderRadius: 6 }}>{p.slice(2, -2)}</span>;
              }
              return <span key={i}>{p}</span>;
            })}
          </p>
        </Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={() => { let st = template.template; Object.entries(answers).forEach(([k, v]) => { st = st.replace(new RegExp(`\\{${k}\\}`, "g"), v); }); speak(st, settings); }} style={{
            padding: 14, borderRadius: 14, border: `2px solid ${T.primary}`, background: T.primaryGlow,
            fontFamily: T.font, fontSize: 15, fontWeight: 800, color: T.primary, cursor: "pointer",
          }}>🔊 Read it</button>
          <button onClick={reset} style={{
            padding: 14, borderRadius: 14, border: "none", background: T.green,
            fontFamily: T.font, fontSize: 15, fontWeight: 800, color: "#fff", cursor: "pointer",
          }}>+ New Story</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title={`📖 ${template.title}`} onBack={reset} />
      <ProgressBar value={blankIdx + 1} max={template.blanks.length} color={T.yellow} h={6} />
      <Card style={{ textAlign: "center", padding: 24, marginTop: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 56, marginBottom: 10 }}>{template.emoji}</div>
        <p style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, margin: "0 0 6px" }}>Step {blankIdx + 1} of {template.blanks.length}</p>
        <p style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text, margin: 0 }}>{currentBlank.label}</p>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {currentBlank.choices.map(c => (
          <button key={c} onClick={() => pick(c)} style={{
            padding: 18, borderRadius: 16, border: `2px solid ${T.border}`, background: T.surface,
            fontFamily: T.font, fontSize: 17, fontWeight: 700, color: T.text, cursor: "pointer",
          }}>{c}</button>
        ))}
      </div>
    </div>
  );
}

// ─── MAZE RUNNER ─────────────────────────────────────────────────────────────
function MazeRunnerScreen({ setScreen }) {
  const { settings, addProgress } = useApp();
  const filtered = lessonsFor(mazeData, settings.ageRange);
  const [idx, setIdx] = useState(0);
  const [pos, setPos] = useState({ r: 0, c: 0 });
  const [score, setScore] = useState(0);
  const [won, setWon] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const current = filtered[idx % filtered.length];

  useEffect(() => {
    if (!current) return;
    // find start
    for (let r = 0; r < current.rows; r++) {
      for (let c = 0; c < current.cols; c++) {
        if (current.grid[r][c] === 2) { setPos({ r, c }); return; }
      }
    }
  }, [idx, current]);

  function move(dr, dc) {
    if (won || !current) return;
    const nr = pos.r + dr, nc = pos.c + dc;
    if (nr < 0 || nr >= current.rows || nc < 0 || nc >= current.cols) return;
    const cell = current.grid[nr][nc];
    if (cell === 0) { playSfx("wrong"); return; }
    setPos({ r: nr, c: nc });
    if (cell === 3) {
      setWon(true); setShowConfetti(true); setScore(s => s + 1);
      playSfx("win");
      addProgress({ stars: 2 });
      setTimeout(() => setShowConfetti(false), 2500);
    }
  }

  function next() {
    setWon(false);
    setIdx(i => (i + 1) % filtered.length);
  }

  if (!current) return null;
  const cellSize = Math.min(44, Math.floor(320 / current.cols));

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🏁 Maze Runner" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <ProgressBar value={idx + 1} max={filtered.length} color={T.green} h={6} />
      <p style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, margin: "16px 0 10px", textAlign: "center" }}>Guide 🐵 to the 🍌!</p>
      <div style={{
        display: "flex", justifyContent: "center", marginBottom: 20, padding: 10,
        background: T.surface, borderRadius: 18, border: `2px solid ${T.border}`,
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${current.cols}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${current.rows}, ${cellSize}px)`,
          gap: 2,
        }}>
          {current.grid.map((row, r) =>
            row.map((cell, c) => {
              const isPlayer = pos.r === r && pos.c === c;
              let bg = T.border, content = "";
              if (cell === 0) bg = T.text + "30";
              else if (cell === 1 || cell === 2) bg = T.greenGlow;
              else if (cell === 3) { bg = T.yellowGlow; content = "🍌"; }
              if (isPlayer) content = "🐵";
              return (
                <div key={`${r}-${c}`} style={{
                  width: cellSize, height: cellSize, background: bg, borderRadius: 4,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: cellSize * 0.7,
                }}>{content}</div>
              );
            })
          )}
        </div>
      </div>
      {won ? (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: T.font, fontSize: 24, fontWeight: 800, color: T.green, marginBottom: 14 }}>🎉 You made it!</div>
          <Btn onClick={next} color={T.green}>Next Maze →</Btn>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, maxWidth: 260, margin: "0 auto" }}>
          <div />
          <button onClick={() => move(-1, 0)} style={btnStyle(T)}>⬆️</button>
          <div />
          <button onClick={() => move(0, -1)} style={btnStyle(T)}>⬅️</button>
          <div />
          <button onClick={() => move(0, 1)} style={btnStyle(T)}>➡️</button>
          <div />
          <button onClick={() => move(1, 0)} style={btnStyle(T)}>⬇️</button>
          <div />
        </div>
      )}
    </div>
  );
}
function btnStyle(T) {
  return {
    padding: "16px 0", borderRadius: 16, border: `2px solid ${T.primary}`,
    background: T.primaryGlow, fontSize: 28, cursor: "pointer",
  };
}

// ─── MUSIC MAKER ─────────────────────────────────────────────────────────────
function MusicMakerScreen({ setScreen }) {
  const { addProgress } = useApp();
  const audioRef = useRef(null);
  const [recorded, setRecorded] = useState([]);
  const [playing, setPlaying] = useState(false);

  const notes = [
    { name: "C", freq: 261.63, color: "#EF5BA1", emoji: "🎵" },
    { name: "D", freq: 293.66, color: "#F59E0B", emoji: "🎶" },
    { name: "E", freq: 329.63, color: "#EAB308", emoji: "🎵" },
    { name: "F", freq: 349.23, color: "#3EBB6E", emoji: "🎶" },
    { name: "G", freq: 392.00, color: "#4E8AE6", emoji: "🎵" },
    { name: "A", freq: 440.00, color: "#8B6CF6", emoji: "🎶" },
    { name: "B", freq: 493.88, color: "#EC4899", emoji: "🎵" },
    { name: "C²", freq: 523.25, color: "#EF5BA1", emoji: "🎶" },
  ];

  function getCtx() {
    if (!audioRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioRef.current = new AC();
    }
    return audioRef.current;
  }

  function playNote(freq, duration = 0.4) {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + duration);
  }

  function tap(note) {
    playNote(note.freq);
    setRecorded(r => [...r, note].slice(-16));
  }

  async function playback() {
    if (playing || recorded.length === 0) return;
    setPlaying(true);
    for (let i = 0; i < recorded.length; i++) {
      playNote(recorded[i].freq, 0.35);
      await new Promise(r => setTimeout(r, 380));
    }
    setPlaying(false);
    addProgress({ stars: 1 });
  }

  function clearSeq() { setRecorded([]); }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="🎹 Music Maker" onBack={() => setScreen("games")} />
      <p style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, margin: "0 0 16px", textAlign: "center" }}>Tap keys to make music!</p>
      <Card style={{ padding: 14, marginBottom: 16, minHeight: 56, background: T.surface }}>
        <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft, marginBottom: 6 }}>Your song:</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, minHeight: 28 }}>
          {recorded.length === 0 ? (
            <span style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft, fontStyle: "italic" }}>Tap the keys below...</span>
          ) : recorded.map((n, i) => (
            <span key={i} style={{
              padding: "2px 8px", borderRadius: 8, background: n.color + "25",
              color: n.color, fontFamily: T.font, fontSize: 13, fontWeight: 800,
            }}>{n.name}</span>
          ))}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
        {notes.map(n => (
          <button key={n.name} onClick={() => tap(n)} style={{
            padding: "28px 0", borderRadius: 16, border: "none",
            background: `linear-gradient(135deg, ${n.color}, ${n.color}cc)`,
            color: "#fff", fontFamily: T.font, fontSize: 22, fontWeight: 800,
            cursor: "pointer", boxShadow: `0 6px 16px ${n.color}40`,
          }}>
            <div>{n.emoji}</div>
            <div style={{ marginTop: 4 }}>{n.name}</div>
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button onClick={playback} disabled={playing || recorded.length === 0} style={{
          padding: 14, borderRadius: 14, border: "none",
          background: recorded.length ? T.primary : T.border,
          fontFamily: T.font, fontSize: 15, fontWeight: 800, color: "#fff",
          cursor: recorded.length ? "pointer" : "default",
        }}>{playing ? "▶ Playing..." : "▶ Play back"}</button>
        <button onClick={clearSeq} style={{
          padding: 14, borderRadius: 14, border: `2px solid ${T.border}`,
          background: T.surface, fontFamily: T.font, fontSize: 15, fontWeight: 800, color: T.soft, cursor: "pointer",
        }}>Clear</button>
      </div>
    </div>
  );
}

// ─── FOCUS TIMER ─────────────────────────────────────────────────────────────
function FocusScreen({ setScreen }) {
  const { settings } = useApp();
  const [minutes, setMinutes] = useState(15);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState("focus");
  const intervalRef = useRef(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds(s => {
          if (s === 0) {
            setMinutes(m => {
              if (m === 0) {
                clearInterval(intervalRef.current); setRunning(false);
                speak(mode === "focus" ? "Time for a break!" : "Ready to focus again!", settings);
                setMode(prev => prev === "focus" ? "break" : "focus");
                setMinutes(mode === "focus" ? 5 : 15);
                return 0;
              }
              return m - 1;
            });
            return 59;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, mode]);

  const presets = [5, 10, 15, 25];

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="🎯 Focus Timer" onBack={() => { setRunning(false); setScreen("home"); }} />
      <div style={{
        textAlign: "center", padding: "40px 20px", background: mode === "focus" ? T.blueGlow : T.greenGlow,
        borderRadius: 28, marginBottom: 24, border: `2px solid ${mode === "focus" ? T.blue : T.green}20`,
      }}>
        <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 600, color: mode === "focus" ? T.blue : T.green, marginBottom: 12, textTransform: "uppercase", letterSpacing: 2 }}>
          {mode === "focus" ? "🎯 Focus Time" : "🌿 Break Time"}
        </div>
        <div style={{ fontFamily: T.font, fontSize: 72, fontWeight: 800, color: T.text, lineHeight: 1 }}>
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 28 }}>
          <Btn color={running ? T.primary : T.green} size="lg" onClick={() => setRunning(!running)}>
            {running ? "⏸ Pause" : "▶ Start"}
          </Btn>
          {!running && <Btn color={T.soft} size="lg" onClick={() => { setMinutes(mode === "focus" ? 15 : 5); setSeconds(0); }}>↺ Reset</Btn>}
        </div>
      </div>
      {!running && mode === "focus" && (
        <>
          <p style={{ fontFamily: T.font, fontSize: 15, color: T.soft, margin: "0 0 12px" }}>Quick set:</p>
          <div style={{ display: "flex", gap: 10 }}>
            {presets.map(p => (
              <button key={p} onClick={() => { setMinutes(p); setSeconds(0); }} style={{
                flex: 1, padding: "14px 0", borderRadius: 16,
                border: minutes === p ? `2.5px solid ${T.blue}` : `1.5px solid ${T.border}`,
                background: minutes === p ? T.blueGlow : T.surface,
                fontFamily: T.font, fontSize: 16, fontWeight: 700,
                color: minutes === p ? T.blue : T.text, cursor: "pointer",
              }}>{p}m</button>
            ))}
          </div>
        </>
      )}
      <Card style={{ marginTop: 24, background: T.yellowGlow, border: `1.5px solid ${T.yellow}20` }}>
        <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6 }}>💡 Focus Tips</div>
        <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, lineHeight: 2 }}>
          Remove distractions · Have water nearby · Take breaks when the timer says · Start small and build up
        </div>
      </Card>
    </div>
  );
}

// ─── CALM CORNER ─────────────────────────────────────────────────────────────
const affirmations = [
  "I am safe and calm.",
  "This feeling will pass.",
  "I am doing my best, and that is enough.",
  "I can take things one breath at a time.",
  "My feelings are valid.",
  "I am stronger than I think.",
  "It's okay to rest.",
  "I am loved.",
  "I can handle what comes my way.",
  "I am proud of myself for trying.",
  "Little by little, I am getting there.",
  "I am allowed to take up space.",
];

function CalmScreen({ setScreen }) {
  const [breathing, setBreathing] = useState(false);
  const [breathPattern, setBreathPattern] = useState("box"); // box = 4-4-4-4, 478 = 4-7-8, simple = 4-4-4
  const [breathPhase, setBreathPhase] = useState("in");
  const [breathCount, setBreathCount] = useState(4);
  const breathRef = useRef(null);

  const patterns = {
    box: { in: 4, hold: 4, out: 4, hold2: 4, label: "Box Breathing (4-4-4-4)" },
    "478": { in: 4, hold: 7, out: 8, hold2: 0, label: "Relax (4-7-8)" },
    simple: { in: 4, hold: 0, out: 4, hold2: 0, label: "Simple (4-4)" },
  };

  useEffect(() => {
    if (!breathing) return;
    const p = patterns[breathPattern];
    let phase = "in", count = p.in;
    setBreathPhase(phase); setBreathCount(count);
    breathRef.current = setInterval(() => {
      count--;
      if (count <= 0) {
        if (phase === "in") {
          phase = p.hold > 0 ? "hold" : "out";
          count = p.hold > 0 ? p.hold : p.out;
        } else if (phase === "hold") {
          phase = "out"; count = p.out;
        } else if (phase === "out") {
          phase = p.hold2 > 0 ? "hold2" : "in";
          count = p.hold2 > 0 ? p.hold2 : p.in;
        } else {
          phase = "in"; count = p.in;
        }
      }
      setBreathPhase(phase); setBreathCount(count);
    }, 1000);
    return () => clearInterval(breathRef.current);
  }, [breathing, breathPattern]);

  const breathInfo = {
    in: { label: "Breathe In...", color: T.blue, scale: 1.35 },
    hold: { label: "Hold...", color: T.purple, scale: 1.35 },
    out: { label: "Breathe Out...", color: T.green, scale: 0.85 },
    hold2: { label: "Hold...", color: T.purple, scale: 0.85 },
  };
  const bi = breathInfo[breathPhase];

  // ─── Real ambient sounds via Web Audio API ───────────────────────────────
  const audioCtxRef = useRef(null);
  const activeSoundRef = useRef(null);
  const [activeSoundId, setActiveSoundId] = useState(null);
  const [volume, setVolume] = useState(0.5);
  const volumeRef = useRef(0.5);
  const masterGainRef = useRef(null);

  function getCtx() {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
  }

  function stopSound() {
    if (activeSoundRef.current) {
      try { activeSoundRef.current.stop(); } catch (e) { /* ignore */ }
      activeSoundRef.current = null;
    }
    masterGainRef.current = null;
    setActiveSoundId(null);
  }

  useEffect(() => {
    volumeRef.current = volume;
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = volume;
    }
  }, [volume]);

  useEffect(() => () => {
    stopSound();
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (e) { /* ignore */ }
    }
  }, []);

  function makeNoiseBuffer(ctx, type = "white") {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    if (type === "white") {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } else if (type === "brown") {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    } else { // pink
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
    return buf;
  }

  function startMaster(ctx, level) {
    const g = ctx.createGain();
    g.gain.value = volumeRef.current * level;
    g.connect(ctx.destination);
    masterGainRef.current = g;
    // keep level baseline so slider scales correctly
    g._baseLevel = level;
    return g;
  }

  function playOcean() {
    const ctx = getCtx(); if (!ctx) return null;
    if (ctx.state === "suspended") ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, "brown");
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 600; lp.Q.value = 1;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 350;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency);
    const master = startMaster(ctx, 0.9);
    src.connect(lp).connect(master);
    src.start(); lfo.start();
    return { stop: () => { src.stop(); lfo.stop(); } };
  }

  function playRain() {
    const ctx = getCtx(); if (!ctx) return null;
    if (ctx.state === "suspended") ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, "white");
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 500;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 5500;
    const master = startMaster(ctx, 0.35);
    src.connect(hp).connect(lp).connect(master);
    src.start();
    return { stop: () => src.stop() };
  }

  function playWind() {
    const ctx = getCtx(); if (!ctx) return null;
    if (ctx.state === "suspended") ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, "brown");
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 500; bp.Q.value = 1.8;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 280;
    lfo.connect(lfoGain); lfoGain.connect(bp.frequency);
    const master = startMaster(ctx, 0.7);
    src.connect(bp).connect(master);
    src.start(); lfo.start();
    return { stop: () => { src.stop(); lfo.stop(); } };
  }

  function playBirds() {
    const ctx = getCtx(); if (!ctx) return null;
    if (ctx.state === "suspended") ctx.resume();
    // soft leafy background + chirps
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, "pink");
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1200;
    const master = startMaster(ctx, 0.25);
    src.connect(lp).connect(master);
    src.start();
    let stopped = false;
    function chirp() {
      if (stopped) return;
      const now = ctx.currentTime;
      const burst = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < burst; i++) {
        const t = now + i * 0.12;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        const base = 1600 + Math.random() * 1600;
        osc.frequency.setValueAtTime(base, t);
        osc.frequency.exponentialRampToValueAtTime(base * 1.4, t + 0.06);
        osc.frequency.exponentialRampToValueAtTime(base * 0.85, t + 0.14);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(g).connect(master);
        osc.start(t); osc.stop(t + 0.2);
      }
      setTimeout(chirp, 1200 + Math.random() * 2800);
    }
    setTimeout(chirp, 400);
    return { stop: () => { stopped = true; src.stop(); } };
  }

  function playNight() {
    const ctx = getCtx(); if (!ctx) return null;
    if (ctx.state === "suspended") ctx.resume();
    // low hum + crickets
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, "brown");
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 220;
    const master = startMaster(ctx, 0.5);
    src.connect(lp).connect(master);
    src.start();
    let stopped = false;
    function cricket() {
      if (stopped) return;
      const now = ctx.currentTime;
      for (let i = 0; i < 5; i++) {
        const t = now + i * 0.085;
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = 4200 + Math.random() * 400;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.18, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
        osc.connect(g).connect(master);
        osc.start(t); osc.stop(t + 0.05);
      }
      setTimeout(cricket, 700 + Math.random() * 900);
    }
    setTimeout(cricket, 300);
    return { stop: () => { stopped = true; src.stop(); } };
  }

  function playMusic() {
    const ctx = getCtx(); if (!ctx) return null;
    if (ctx.state === "suspended") ctx.resume();
    // ambient pad: C minor-ish chord with slow LFO
    const freqs = [130.81, 155.56, 196.00, 261.63, 311.13]; // C3, Eb3, G3, C4, Eb4
    const master = startMaster(ctx, 0.25);
    const oscs = [], lfos = [];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i < 2 ? "sine" : "triangle";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08 + i * 0.025;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.1;
      lfo.connect(lfoGain); lfoGain.connect(g.gain);
      osc.connect(g).connect(master);
      osc.start(); lfo.start();
      oscs.push(osc); lfos.push(lfo);
    });
    return { stop: () => { oscs.forEach(o => { try { o.stop(); } catch (e) {} }); lfos.forEach(l => { try { l.stop(); } catch (e) {} }); } };
  }

  const sounds = [
    { id: "ocean", emoji: "🌊", label: "Ocean", play: playOcean, color: T.blue },
    { id: "rain", emoji: "🌧️", label: "Rain", play: playRain, color: T.purple },
    { id: "birds", emoji: "🐦", label: "Birds", play: playBirds, color: T.green },
    { id: "music", emoji: "🎵", label: "Pad", play: playMusic, color: T.pink },
    { id: "night", emoji: "🦗", label: "Night", play: playNight, color: T.purple },
    { id: "wind", emoji: "💨", label: "Wind", play: playWind, color: T.blue },
  ];

  function toggleSound(s) {
    if (activeSoundId === s.id) { stopSound(); return; }
    stopSound();
    const handle = s.play();
    if (handle) {
      activeSoundRef.current = handle;
      setActiveSoundId(s.id);
    }
  }

  // Affirmations
  const [affIdx, setAffIdx] = useState(() => Math.floor(Math.random() * affirmations.length));
  function nextAff() { setAffIdx(i => (i + 1 + Math.floor(Math.random() * (affirmations.length - 1))) % affirmations.length); }

  // Muscle relaxation (progressive) — timer-based guide
  const [muscleActive, setMuscleActive] = useState(false);
  const [muscleStep, setMuscleStep] = useState(0);
  const muscleRef = useRef(null);
  const muscleSteps = [
    { emoji: "✊", label: "Squeeze your hands tight...", phase: "tense" },
    { emoji: "🖐️", label: "And release. Let them go soft.", phase: "release" },
    { emoji: "💪", label: "Tighten your arms...", phase: "tense" },
    { emoji: "🫳", label: "And let them relax.", phase: "release" },
    { emoji: "🤷", label: "Pull your shoulders up to your ears...", phase: "tense" },
    { emoji: "😌", label: "And drop them down. Ahh.", phase: "release" },
    { emoji: "😬", label: "Scrunch up your face...", phase: "tense" },
    { emoji: "😊", label: "And let it go soft.", phase: "release" },
    { emoji: "🦵", label: "Squeeze your legs tight...", phase: "tense" },
    { emoji: "🧘", label: "And release. You did it!", phase: "release" },
  ];
  useEffect(() => {
    if (!muscleActive) return;
    muscleRef.current = setInterval(() => {
      setMuscleStep(s => {
        if (s + 1 >= muscleSteps.length) { setMuscleActive(false); return 0; }
        return s + 1;
      });
    }, 4000);
    return () => clearInterval(muscleRef.current);
  }, [muscleActive]);

  const circleSize = 150;

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="🫧 Calm Corner" onBack={() => { setBreathing(false); stopSound(); setScreen("home"); }} />
      <p style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, margin: "0 0 18px" }}>
        A quiet place to slow down. Take what you need.
      </p>

      {/* Breathing exercise */}
      <Card style={{ textAlign: "center", padding: 28, marginBottom: 16, background: breathing ? `${bi.color}08` : T.surface }}>
        <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 14 }}>Breathing Exercise</div>
        {!breathing && (
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
            {Object.entries(patterns).map(([key, p]) => (
              <button key={key} onClick={() => setBreathPattern(key)} style={{
                padding: "8px 12px", borderRadius: 10,
                border: `1.5px solid ${breathPattern === key ? T.blue : T.border}`,
                background: breathPattern === key ? T.blueGlow : T.surface,
                color: breathPattern === key ? T.blue : T.soft,
                fontFamily: T.font, fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>{p.label}</button>
            ))}
          </div>
        )}
        <div style={{
          width: circleSize, height: circleSize, borderRadius: "50%", margin: "0 auto 16px",
          background: breathing ? `${bi.color}25` : `${T.blue}10`,
          border: `3px solid ${breathing ? bi.color : T.blue}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 1s ease-in-out", transform: breathing ? `scale(${bi.scale})` : "scale(1)",
        }}>
          <span style={{ fontSize: breathing ? 44 : 48, fontWeight: 800, color: breathing ? bi.color : T.blue, fontFamily: T.font }}>
            {breathing ? breathCount : "🫁"}
          </span>
        </div>
        {breathing && <p style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: bi.color, margin: "0 0 16px" }}>{bi.label}</p>}
        <Btn color={breathing ? T.primary : T.blue} onClick={() => setBreathing(!breathing)}>
          {breathing ? "Stop" : "Start Breathing"}
        </Btn>
      </Card>

      {/* Ambient sounds */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text }}>Ambient Sounds</div>
        {activeSoundId && (
          <button onClick={stopSound} style={{
            padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${T.primary}`,
            background: T.primaryGlow, color: T.primary, fontFamily: T.font, fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>⏹ Stop</button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        {sounds.map(s => {
          const isActive = activeSoundId === s.id;
          return (
            <button key={s.id} onClick={() => toggleSound(s)} style={{
              padding: "18px 8px", borderRadius: 18,
              border: `2px solid ${isActive ? s.color : T.border}`,
              background: isActive ? `${s.color}18` : T.surface,
              cursor: "pointer", textAlign: "center",
              boxShadow: isActive ? `0 0 0 4px ${s.color}15` : "none",
              transition: "all 0.2s ease",
            }}>
              <div style={{ fontSize: 32, marginBottom: 4, animation: isActive ? "pulse 2s ease-in-out infinite" : "none" }}>{s.emoji}</div>
              <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 700, color: isActive ? s.color : T.text }}>{s.label}</div>
              {isActive && <div style={{ fontFamily: T.fontAlt, fontSize: 10, color: s.color, marginTop: 2 }}>▶ playing</div>}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, padding: "10px 14px", background: T.surface, borderRadius: 12, border: `1.5px solid ${T.border}` }}>
        <span style={{ fontSize: 16 }}>🔈</span>
        <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: T.blue }} />
        <span style={{ fontSize: 16 }}>🔊</span>
      </div>

      {/* Positive affirmation */}
      <Card onClick={nextAff} style={{
        background: `linear-gradient(135deg, ${T.pinkGlow}, ${T.purpleGlow})`,
        border: `1.5px solid ${T.pink}30`, padding: 22, marginBottom: 16, cursor: "pointer", textAlign: "center",
      }}>
        <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 700, color: T.pink, marginBottom: 8, letterSpacing: 1 }}>💖 POSITIVE THOUGHT</div>
        <div style={{ fontFamily: T.font, fontSize: 19, fontWeight: 700, color: T.text, lineHeight: 1.5 }}>
          "{affirmations[affIdx]}"
        </div>
        <div style={{ fontFamily: T.fontAlt, fontSize: 11, color: T.soft, marginTop: 10 }}>Tap for another</div>
      </Card>

      {/* Muscle relaxation */}
      <Card style={{ padding: 22, marginBottom: 16, background: muscleActive ? T.greenGlow : T.surface, border: `1.5px solid ${muscleActive ? T.green + "40" : T.border}` }}>
        <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.green, marginBottom: 12 }}>💆 Muscle Relaxation</div>
        {muscleActive ? (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 64, marginBottom: 10 }}>{muscleSteps[muscleStep].emoji}</div>
            <div style={{ fontFamily: T.font, fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 14 }}>
              {muscleSteps[muscleStep].label}
            </div>
            <ProgressBar value={muscleStep + 1} max={muscleSteps.length} color={T.green} h={6} />
            <button onClick={() => { setMuscleActive(false); setMuscleStep(0); }} style={{
              marginTop: 14, padding: "8px 16px", border: `1.5px solid ${T.border}`, background: T.surface,
              borderRadius: 10, fontFamily: T.font, fontSize: 13, fontWeight: 700, color: T.soft, cursor: "pointer",
            }}>Stop</button>
          </div>
        ) : (
          <>
            <p style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, margin: "0 0 14px", lineHeight: 1.6 }}>
              Tense and release each muscle group to let go of stress. I'll guide you.
            </p>
            <Btn color={T.green} onClick={() => { setMuscleStep(0); setMuscleActive(true); }}>Start Guide</Btn>
          </>
        )}
      </Card>

      {/* 5-4-3-2-1 grounding */}
      <Card style={{ background: T.purpleGlow, border: `1.5px solid ${T.purple}20`, padding: 22 }}>
        <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.purple, marginBottom: 10 }}>🧘 5-4-3-2-1 Grounding</div>
        <p style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.soft, margin: "0 0 10px" }}>Use your senses to feel right here, right now.</p>
        <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.text, lineHeight: 2.2 }}>
          <strong>5</strong> things you can <strong>see</strong> 👀<br />
          <strong>4</strong> things you can <strong>touch</strong> ✋<br />
          <strong>3</strong> things you can <strong>hear</strong> 👂<br />
          <strong>2</strong> things you can <strong>smell</strong> 👃<br />
          <strong>1</strong> thing you can <strong>taste</strong> 👅
        </div>
      </Card>
    </div>
  );
}

// ─── HABITS ──────────────────────────────────────────────────────────────────
function HabitsScreen({ setScreen }) {
  const { settings } = useApp();
  const defaultHabits = [
    { id: 1, emoji: "🌅", label: "Wake up routine", done: false },
    { id: 2, emoji: "🪥", label: "Brush teeth", done: false },
    { id: 3, emoji: "🍎", label: "Eat breakfast", done: false },
    { id: 4, emoji: "📚", label: "Learning time", done: false },
    { id: 5, emoji: "🏃", label: "Movement break", done: false },
    { id: 6, emoji: "🍽️", label: "Eat lunch", done: false },
    { id: 7, emoji: "🎨", label: "Creative time", done: false },
    { id: 8, emoji: "🛁", label: "Bath time", done: false },
    { id: 9, emoji: "📖", label: "Story time", done: false },
    { id: 10, emoji: "🌙", label: "Bedtime", done: false },
  ];
  const [habits, setHabits] = useState(() => loadState("habits", defaultHabits));

  useEffect(() => { saveState("habits", habits); }, [habits]);

  const done = habits.filter(h => h.done).length;

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="✅ My Routines" onBack={() => setScreen("home")} />
      <div style={{
        background: "linear-gradient(135deg, #F7B731 0%, #FFCF5C 100%)",
        borderRadius: 22, padding: 20, marginBottom: 24, color: "#fff",
      }}>
        <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700 }}>Today's Progress</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
          <div style={{ flex: 1 }}><ProgressBar value={done} max={habits.length} color="#fff" h={12} /></div>
          <span style={{ fontFamily: T.font, fontSize: 18, fontWeight: 800 }}>{done}/{habits.length}</span>
        </div>
        {done === habits.length && <div style={{ fontFamily: T.font, fontSize: 16, marginTop: 10 }}>🎉 All done! Amazing job today!</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {habits.map(h => (
          <button key={h.id} onClick={() => { setHabits(prev => prev.map(x => x.id === h.id ? { ...x, done: !x.done } : x)); if (!h.done) playSfx("correct"); }}
            style={{
              display: "flex", alignItems: "center", gap: 14, padding: 16,
              borderRadius: 18, border: `1.5px solid ${h.done ? T.green + "40" : T.border}`,
              background: h.done ? T.greenGlow : T.surface, cursor: "pointer",
              opacity: h.done ? 0.7 : 1, transition: "all 0.2s ease", textAlign: "left",
            }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              border: `2.5px solid ${h.done ? T.green : T.border}`,
              background: h.done ? T.green : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease", flexShrink: 0,
            }}>
              {h.done && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M5 13l4 4L19 7"/></svg>}
            </div>
            <span style={{ fontSize: 24, flexShrink: 0 }}>{h.emoji}</span>
            <span style={{ fontFamily: T.font, fontSize: 16, fontWeight: 600, color: T.text, textDecoration: h.done ? "line-through" : "none" }}>{h.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── REWARDS / BADGES ───────────────────────────────────────────────────────
function RewardsScreen({ setScreen }) {
  const { progress } = useApp();
  const earned = badgeDefs.filter(b => b.check(progress));
  const locked = badgeDefs.filter(b => !b.check(progress));

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="🏆 My Rewards" onBack={() => setScreen("home")} />

      {/* Stats Banner */}
      <div style={{
        background: "linear-gradient(135deg, #8B6CF6 0%, #A78BFA 50%, #C4B5FD 100%)",
        borderRadius: 24, padding: 22, marginBottom: 20, color: "#fff",
        boxShadow: "0 8px 32px rgba(139,108,246,0.3)",
      }}>
        <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 800, marginBottom: 16 }}>My Progress</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Stars", value: progress.totalStars, emoji: "⭐" },
            { label: "Games", value: progress.gamesPlayed, emoji: "🎮" },
            { label: "Streak", value: `${progress.streak}d`, emoji: "🔥" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center", background: "rgba(255,255,255,0.15)", borderRadius: 16, padding: "12px 8px" }}>
              <div style={{ fontSize: 24 }}>{s.emoji}</div>
              <div style={{ fontFamily: T.font, fontSize: 22, fontWeight: 800 }}>{s.value}</div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 11, opacity: 0.8 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          {[
            { label: "Words Spoken", value: progress.wordsSpoken },
            { label: "Focus Min", value: progress.focusMinutes },
            { label: "Routines", value: progress.routinesCompleted },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, textAlign: "center", background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "8px 4px" }}>
              <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 10, opacity: 0.7 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Earned Badges */}
      <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 12 }}>
        Earned Badges ({earned.length}/{badgeDefs.length})
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
        {earned.map(b => (
          <Card key={b.id} style={{ textAlign: "center", padding: 14, background: T.yellowGlow, border: `1.5px solid ${T.yellow}30` }}>
            <div style={{ fontSize: 36 }}>{b.emoji}</div>
            <div style={{ fontFamily: T.font, fontSize: 12, fontWeight: 700, color: T.text, marginTop: 4 }}>{b.label}</div>
            <div style={{ fontFamily: T.fontAlt, fontSize: 10, color: T.soft, marginTop: 2 }}>{b.desc}</div>
          </Card>
        ))}
      </div>

      {locked.length > 0 && (
        <>
          <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.soft, marginBottom: 12 }}>
            Keep Going! ({locked.length} left)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {locked.map(b => (
              <Card key={b.id} style={{ textAlign: "center", padding: 14, opacity: 0.5 }}>
                <div style={{ fontSize: 36 }}>🔒</div>
                <div style={{ fontFamily: T.font, fontSize: 12, fontWeight: 700, color: T.soft, marginTop: 4 }}>{b.label}</div>
                <div style={{ fontFamily: T.fontAlt, fontSize: 10, color: T.soft, marginTop: 2 }}>{b.desc}</div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── SOCIAL STORIES ─────────────────────────────────────────────────────────
function SocialStoriesScreen({ setScreen }) {
  const { settings } = useApp();
  const [storyId, setStoryId] = useState(null);
  const [page, setPage] = useState(0);

  const story = socialStories.find(s => s.id === storyId);

  if (!story) {
    return (
      <div style={{ padding: "24px 20px 120px" }}>
        <Header title="📖 Social Stories" onBack={() => setScreen("home")} />
        <p style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.soft, margin: "0 0 20px", lineHeight: 1.6 }}>
          Visual stories to help prepare for everyday situations.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {socialStories.map(s => (
            <Card key={s.id} onClick={() => { setStoryId(s.id); setPage(0); }}
              style={{ display: "flex", alignItems: "center", gap: 16, padding: 18, border: `1.5px solid ${s.color}20` }}>
              <div style={{
                width: 56, height: 56, borderRadius: 18, background: `${s.color}15`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0,
              }}>{s.emoji}</div>
              <div>
                <div style={{ fontFamily: T.font, fontSize: 17, fontWeight: 700, color: T.text }}>{s.title}</div>
                <div style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.soft, marginTop: 2 }}>{s.pages.length} pages</div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const pg = story.pages[page];
  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title={`📖 ${story.title}`} onBack={() => setStoryId(null)} />
      <ProgressBar value={page + 1} max={story.pages.length} color={story.color} h={6} />

      <Card style={{ textAlign: "center", padding: 40, marginTop: 20, marginBottom: 20, minHeight: 280, display: "flex", flexDirection: "column", justifyContent: "center", background: `${story.color}08` }}>
        <div style={{ fontSize: 80, marginBottom: 20 }}>{pg.emoji}</div>
        <p style={{ fontFamily: T.font, fontSize: 22, fontWeight: 600, color: T.text, lineHeight: 1.5, margin: 0 }}>{pg.text}</p>
      </Card>

      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <Btn color={T.soft} onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Back</Btn>
        <Btn color={story.color} onClick={() => speak(pg.text, settings)}>🔊 Read</Btn>
        {page < story.pages.length - 1 ? (
          <Btn color={T.primary} onClick={() => setPage(p => p + 1)}>Next →</Btn>
        ) : (
          <Btn color={T.green} onClick={() => setStoryId(null)}>Done ✓</Btn>
        )}
      </div>
      <div style={{ textAlign: "center", marginTop: 14, fontFamily: T.fontAlt, fontSize: 13, color: T.soft }}>
        Page {page + 1} of {story.pages.length}
      </div>
    </div>
  );
}

// ─── READING PRACTICE ───────────────────────────────────────────────────────
// ─── MANAGE LESSONS (Parent) ─────────────────────────────────────────────────
function ManageLessonsScreen({ lessons, onSave, onBack }) {
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [wordsText, setWordsText] = useState("");

  function startNew() {
    setEditingId("new");
    setName("");
    setWordsText("");
  }

  function startEdit(lesson) {
    setEditingId(lesson.id);
    setName(lesson.name);
    setWordsText(lesson.words.join(", "));
  }

  function save() {
    const trimmedName = name.trim();
    const words = wordsText.split(/[,\n]/).map(w => w.trim()).filter(Boolean);
    if (!trimmedName || words.length === 0) return;
    let next;
    if (editingId === "new") {
      next = [...lessons, { id: `lesson_${Date.now()}`, name: trimmedName, words }];
    } else {
      next = lessons.map(l => l.id === editingId ? { ...l, name: trimmedName, words } : l);
    }
    onSave(next);
    setEditingId(null);
    setName("");
    setWordsText("");
  }

  function remove(id) {
    onSave(lessons.filter(l => l.id !== id));
  }

  if (editingId !== null) {
    return (
      <div style={{ padding: "24px 20px 120px" }}>
        <Header title={editingId === "new" ? "📝 New Lesson" : "✏️ Edit Lesson"} onBack={() => setEditingId(null)} />
        <Card style={{ padding: 20, marginTop: 8 }}>
          <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>Lesson Name</div>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Spelling Week 1"
            style={{
              width: "100%", padding: 12, borderRadius: 12, border: `1.5px solid ${T.border}`,
              fontFamily: T.fontAlt, fontSize: 15, marginBottom: 14, boxSizing: "border-box", background: T.surface, color: T.text,
            }} />
          <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>Words</div>
          <p style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft, margin: "0 0 6px" }}>
            Separate with commas or new lines.
          </p>
          <textarea value={wordsText} onChange={e => setWordsText(e.target.value)}
            placeholder="apple, banana, cherry&#10;orange, grape"
            rows={8}
            style={{
              width: "100%", padding: 12, borderRadius: 12, border: `1.5px solid ${T.border}`,
              fontFamily: T.fontAlt, fontSize: 15, boxSizing: "border-box", background: T.surface, color: T.text, resize: "vertical",
            }} />
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Btn color={T.soft} onClick={() => setEditingId(null)} style={{ flex: 1 }}>Cancel</Btn>
            <Btn color={T.green} onClick={save} disabled={!name.trim() || !wordsText.trim()} style={{ flex: 1 }}>Save Lesson</Btn>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="🔒 Manage Lessons" onBack={onBack} />
      <p style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, margin: "0 0 16px", lineHeight: 1.5 }}>
        Create custom word lists for practice. The learner will see them under "My Lessons".
      </p>
      <Btn color={T.primary} onClick={startNew} style={{ width: "100%", marginBottom: 16 }}>+ New Lesson</Btn>
      {lessons.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>📋</div>
          <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft }}>No lessons yet. Tap "New Lesson" to create one.</div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lessons.map(l => (
            <Card key={l.id} style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text }}>{l.name}</div>
                  <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.words.length} words: {l.words.slice(0, 6).join(", ")}{l.words.length > 6 ? "…" : ""}
                  </div>
                </div>
                <button onClick={() => startEdit(l)} style={{
                  padding: "6px 10px", borderRadius: 10, border: `1.5px solid ${T.blue}40`,
                  background: T.blueGlow, fontFamily: T.font, fontSize: 12, fontWeight: 700, color: T.blue, cursor: "pointer",
                }}>Edit</button>
                <button onClick={() => remove(l.id)} style={{
                  padding: "6px 10px", borderRadius: 10, border: `1.5px solid ${T.primary}40`,
                  background: T.primaryGlow, fontFamily: T.font, fontSize: 12, fontWeight: 700, color: T.primary, cursor: "pointer",
                }}>✕</button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Profile Manager ─────────────────────────────────────────────────────────
const PROFILE_EMOJI_CHOICES = ["😊", "🦊", "🐻", "🦁", "🐸", "🐼", "🦉", "🐙", "🦕", "🐢", "🌟", "🚀", "🎨", "⚽", "🎵"];
const PROFILE_COLOR_CHOICES = ["#6BA3F5", "#FF6B9D", "#9B59B6", "#3EBB6E", "#F7B731", "#FF8B5E", "#26C6DA", "#EC407A"];

function exportAllData() {
  const bundle = { version: 1, exportedAt: new Date().toISOString(), data: {} };
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith("nb_") || k.startsWith("nbg_"))) {
      bundle.data[k] = localStorage.getItem(k);
    }
  }
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().split("T")[0];
  a.download = `neurobridge-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importAllData(file, onDone) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const bundle = JSON.parse(reader.result);
      if (!bundle?.data || typeof bundle.data !== "object") throw new Error("Invalid backup file");
      // Wipe existing nb_ / nbg_ keys so import fully replaces
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("nb_") || k.startsWith("nbg_"))) toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
      // Restore from bundle
      Object.entries(bundle.data).forEach(([k, v]) => {
        if (typeof v === "string") localStorage.setItem(k, v);
      });
      onDone(null);
    } catch (err) {
      onDone(err);
    }
  };
  reader.onerror = () => onDone(reader.error || new Error("Read failed"));
  reader.readAsText(file);
}

function ManageProfilesScreen({ onBack }) {
  const [profileState, setProfileState] = useState(() => loadGlobalState("profileState", { profiles: [], activeId: null }));
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(PROFILE_EMOJI_CHOICES[0]);
  const [color, setColor] = useState(PROFILE_COLOR_CHOICES[0]);
  const [importMsg, setImportMsg] = useState("");
  const fileRef = useRef(null);

  function persist(next) {
    saveGlobalState("profileState", next);
    setProfileState(next);
  }

  function startNew() {
    setEditingId("new");
    setName("");
    setEmoji(PROFILE_EMOJI_CHOICES[Math.floor(Math.random() * PROFILE_EMOJI_CHOICES.length)]);
    setColor(PROFILE_COLOR_CHOICES[Math.floor(Math.random() * PROFILE_COLOR_CHOICES.length)]);
  }

  function startEdit(p) {
    setEditingId(p.id);
    setName(p.name);
    setEmoji(p.emoji);
    setColor(p.color);
  }

  function saveEdit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editingId === "new") {
      const id = genId();
      persist({ ...profileState, profiles: [...profileState.profiles, { id, name: trimmed, emoji, color }] });
    } else {
      persist({
        ...profileState,
        profiles: profileState.profiles.map(p => p.id === editingId ? { ...p, name: trimmed, emoji, color } : p),
      });
    }
    setEditingId(null);
  }

  function switchTo(id) {
    if (id === profileState.activeId) return;
    persist({ ...profileState, activeId: id });
    // Full reload so all useState initializers re-read the new profile's data.
    window.location.reload();
  }

  function deleteProfile(id) {
    if (profileState.profiles.length <= 1) return; // keep at least one
    if (!window.confirm("Delete this profile and all their data? This cannot be undone.")) return;
    // Wipe that profile's keys
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`nb_${id}_`)) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    const nextProfiles = profileState.profiles.filter(p => p.id !== id);
    const nextActive = profileState.activeId === id ? nextProfiles[0].id : profileState.activeId;
    const nextState = { profiles: nextProfiles, activeId: nextActive };
    saveGlobalState("profileState", nextState);
    if (profileState.activeId === id) {
      window.location.reload();
    } else {
      setProfileState(nextState);
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm("Import will REPLACE all current profiles and progress on this device. Continue?")) {
      e.target.value = "";
      return;
    }
    importAllData(file, err => {
      if (err) {
        setImportMsg("❌ Import failed: " + err.message);
      } else {
        setImportMsg("✅ Import complete. Reloading…");
        setTimeout(() => window.location.reload(), 600);
      }
    });
  }

  if (editingId !== null) {
    return (
      <div style={{ padding: "24px 20px 120px" }}>
        <Header title={editingId === "new" ? "➕ New Profile" : "✏️ Edit Profile"} onBack={() => setEditingId(null)} />
        <Card style={{ padding: 20 }}>
          <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>Name</div>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Mia"
            style={{
              width: "100%", padding: 12, borderRadius: 12, border: `1.5px solid ${T.border}`,
              fontFamily: T.fontAlt, fontSize: 15, marginBottom: 16, boxSizing: "border-box", background: T.surface, color: T.text,
            }} />

          <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>Icon</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
            {PROFILE_EMOJI_CHOICES.map(em => (
              <button key={em} onClick={() => setEmoji(em)} style={{
                padding: 12, borderRadius: 12,
                border: `2px solid ${emoji === em ? color : T.border}`,
                background: emoji === em ? `${color}15` : T.surface,
                fontSize: 22, cursor: "pointer",
              }}>{em}</button>
            ))}
          </div>

          <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>Color</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
            {PROFILE_COLOR_CHOICES.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                height: 40, borderRadius: 12,
                border: `3px solid ${color === c ? T.text : "transparent"}`,
                background: c, cursor: "pointer",
              }} />
            ))}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Btn color={T.soft} onClick={() => setEditingId(null)} style={{ flex: 1 }}>Cancel</Btn>
            <Btn color={T.green} onClick={saveEdit} disabled={!name.trim()} style={{ flex: 1 }}>Save</Btn>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="👥 Profiles" onBack={onBack} />
      <p style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, margin: "0 0 16px", lineHeight: 1.5 }}>
        Each profile has its own age, progress, settings, and lessons. Tap to switch.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        {profileState.profiles.map(p => {
          const isActive = p.id === profileState.activeId;
          return (
            <Card key={p.id} style={{
              padding: 14, display: "flex", alignItems: "center", gap: 12,
              border: `2px solid ${isActive ? p.color : T.border}`,
              background: isActive ? `${p.color}10` : T.surface,
            }}>
              <button onClick={() => switchTo(p.id)} style={{
                flex: 1, display: "flex", alignItems: "center", gap: 12, padding: 0,
                background: "none", border: "none", cursor: "pointer", textAlign: "left",
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 16, background: `${p.color}20`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
                }}>{p.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text }}>{p.name}</div>
                  <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: isActive ? p.color : T.soft, fontWeight: 600 }}>
                    {isActive ? "● Active" : "Tap to switch"}
                  </div>
                </div>
              </button>
              <button onClick={() => startEdit(p)} style={{
                padding: "6px 10px", borderRadius: 10, border: `1.5px solid ${T.blue}40`,
                background: T.blueGlow, fontFamily: T.font, fontSize: 12, fontWeight: 700, color: T.blue, cursor: "pointer",
              }}>Edit</button>
              {profileState.profiles.length > 1 && (
                <button onClick={() => deleteProfile(p.id)} style={{
                  padding: "6px 10px", borderRadius: 10, border: `1.5px solid ${T.primary}40`,
                  background: T.primaryGlow, fontFamily: T.font, fontSize: 12, fontWeight: 700, color: T.primary, cursor: "pointer",
                }}>✕</button>
              )}
            </Card>
          );
        })}
      </div>

      <Btn color={T.primary} onClick={startNew} style={{ width: "100%", marginBottom: 20 }}>+ Add Profile</Btn>

      <Card style={{ padding: 16 }}>
        <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>📦 Backup & Restore</div>
        <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft, marginBottom: 14, lineHeight: 1.5 }}>
          Export everything (all profiles, progress, custom lessons, settings) to a JSON file. Import replaces all current data.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn color={T.blue} onClick={exportAllData} style={{ flex: 1 }}>⬇ Export</Btn>
          <Btn color={T.green} onClick={() => fileRef.current?.click()} style={{ flex: 1 }}>⬆ Import</Btn>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFile} style={{ display: "none" }} />
        {importMsg && (
          <div style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.text, marginTop: 10, textAlign: "center" }}>{importMsg}</div>
        )}
      </Card>
    </div>
  );
}

function ReadingScreen({ setScreen }) {
  const { settings } = useApp();
  const maxLevel = getMaxLevel(settings.ageRange);
  const [mode, setMode] = useState(null); // "sight" | "stories" | "lessons" | "manage_lessons"
  const [wordIdx, setWordIdx] = useState(0);
  const [storyId, setStoryId] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);
  const [shuffledWords, setShuffledWords] = useState([]);
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [parentLessons, setParentLessons] = useState(() => loadState("parentLessons", []));
  const [pinOk, setPinOk] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const levelKey = maxLevel === 1 ? "level1" : maxLevel === 2 ? "level2" : maxLevel === 3 ? "level3" : "level4";

  function startSightWords(lessonId = null) {
    let source;
    if (lessonId) {
      const lesson = parentLessons.find(l => l.id === lessonId);
      source = lesson ? lesson.words : sightWords[levelKey];
    } else {
      source = sightWords[levelKey];
    }
    setShuffledWords(shuffleArr(source));
    setActiveLessonId(lessonId);
    setWordIdx(0);
    setMode("sight");
  }

  function reshuffle() {
    setShuffledWords(prev => shuffleArr(prev));
    setWordIdx(0);
  }

  function openManageLessons() {
    if (settings.parentPin && settings.parentPin.length >= 4 && !pinOk) {
      setShowPin(true);
    } else {
      setMode("manage_lessons");
    }
  }

  function saveLessons(next) {
    setParentLessons(next);
    saveState("parentLessons", next);
  }

  if (showPin) {
    return <PinEntry onSuccess={() => { setPinOk(true); setShowPin(false); setMode("manage_lessons"); }} onCancel={() => setShowPin(false)} />;
  }

  if (!mode) {
    return (
      <div style={{ padding: "24px 20px 120px" }}>
        <Header title="📚 Reading Practice" onBack={() => setScreen("home")} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card onClick={() => startSightWords(null)} style={{ display: "flex", alignItems: "center", gap: 16, padding: 22, background: T.blueGlow, border: `1.5px solid ${T.blue}20` }}>
            <div style={{ width: 60, height: 60, borderRadius: 20, background: `${T.blue}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🔤</div>
            <div>
              <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text }}>Sight Words</div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft }}>Practice reading common words ({sightWords[levelKey].length} available)</div>
            </div>
          </Card>
          <Card onClick={() => setMode("stories")} style={{ display: "flex", alignItems: "center", gap: 16, padding: 22, background: T.purpleGlow, border: `1.5px solid ${T.purple}20` }}>
            <div style={{ width: 60, height: 60, borderRadius: 20, background: `${T.purple}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>📖</div>
            <div>
              <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text }}>Read Along Stories</div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft }}>Short stories with audio</div>
            </div>
          </Card>
          <Card onClick={() => setMode("lessons")} style={{ display: "flex", alignItems: "center", gap: 16, padding: 22, background: T.greenGlow, border: `1.5px solid ${T.green}20` }}>
            <div style={{ width: 60, height: 60, borderRadius: 20, background: `${T.green}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>⭐</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text }}>My Lessons</div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft }}>
                {parentLessons.length > 0 ? `${parentLessons.length} lesson${parentLessons.length === 1 ? "" : "s"} to practice` : "Words picked just for you"}
              </div>
            </div>
          </Card>
          <button onClick={openManageLessons} style={{
            padding: "12px 16px", background: "none", border: `1.5px dashed ${T.border}`,
            borderRadius: 14, fontFamily: T.font, fontSize: 13, fontWeight: 700, color: T.soft, cursor: "pointer",
          }}>
            🔒 Parent: Manage Lessons {settings.parentPin ? "(PIN)" : ""}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "lessons") {
    if (parentLessons.length === 0) {
      return (
        <div style={{ padding: "24px 20px 120px" }}>
          <Header title="⭐ My Lessons" onBack={() => setMode(null)} />
          <Card style={{ textAlign: "center", padding: 40, marginTop: 20 }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>📝</div>
            <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 6 }}>No lessons yet</div>
            <p style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, margin: "0 0 18px", lineHeight: 1.5 }}>
              A parent or helper can create custom word lists for you to practice.
            </p>
            <Btn color={T.green} onClick={openManageLessons}>Create a Lesson</Btn>
          </Card>
        </div>
      );
    }
    return (
      <div style={{ padding: "24px 20px 120px" }}>
        <Header title="⭐ My Lessons" onBack={() => setMode(null)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {parentLessons.map(l => (
            <Card key={l.id} onClick={() => startSightWords(l.id)}
              style={{ display: "flex", alignItems: "center", gap: 16, padding: 18, background: T.greenGlow, border: `1.5px solid ${T.green}30` }}>
              <div style={{ fontSize: 36 }}>📖</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: T.font, fontSize: 17, fontWeight: 700, color: T.text }}>{l.name}</div>
                <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>{l.words.length} words</div>
              </div>
              <div style={{ fontSize: 22, color: T.green }}>▸</div>
            </Card>
          ))}
        </div>
        <button onClick={openManageLessons} style={{
          width: "100%", marginTop: 16, padding: "12px 16px", background: "none", border: `1.5px dashed ${T.border}`,
          borderRadius: 14, fontFamily: T.font, fontSize: 13, fontWeight: 700, color: T.soft, cursor: "pointer",
        }}>
          🔒 Parent: Manage Lessons {settings.parentPin ? "(PIN)" : ""}
        </button>
      </div>
    );
  }

  if (mode === "manage_lessons") {
    return <ManageLessonsScreen
      lessons={parentLessons}
      onSave={saveLessons}
      onBack={() => setMode(null)}
    />;
  }

  if (mode === "sight") {
    const word = shuffledWords[wordIdx];
    const activeLesson = activeLessonId ? parentLessons.find(l => l.id === activeLessonId) : null;
    if (!word) return null;
    return (
      <div style={{ padding: "24px 20px 120px" }}>
        <Header title={activeLesson ? `⭐ ${activeLesson.name}` : "🔤 Sight Words"} onBack={() => setMode(null)}
          right={<span style={{ fontFamily: T.font, fontSize: 14, color: T.soft }}>{wordIdx + 1}/{shuffledWords.length}</span>} />
        <ProgressBar value={wordIdx + 1} max={shuffledWords.length} color={T.blue} h={6} />
        <Card style={{ textAlign: "center", padding: 48, marginTop: 20, marginBottom: 20 }}>
          <div style={{ fontFamily: T.font, fontSize: 64, fontWeight: 800, color: T.text, letterSpacing: 4 }}>{word}</div>
        </Card>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 16 }}>
          <Btn color={T.blue} size="lg" onClick={() => speak(word, settings)}>🔊 Hear It</Btn>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 10 }}>
          <Btn color={T.soft} onClick={() => setWordIdx(i => Math.max(0, i - 1))} disabled={wordIdx === 0}>← Back</Btn>
          {wordIdx + 1 < shuffledWords.length ? (
            <Btn color={T.primary} onClick={() => setWordIdx(i => i + 1)}>Next →</Btn>
          ) : (
            <Btn color={T.green} onClick={reshuffle}>Shuffle Again ↻</Btn>
          )}
        </div>
        <div style={{ textAlign: "center" }}>
          <button onClick={reshuffle} style={{
            padding: "8px 14px", background: "none", border: `1px dashed ${T.border}`,
            borderRadius: 10, fontFamily: T.font, fontSize: 12, color: T.soft, cursor: "pointer",
          }}>↻ Shuffle words</button>
        </div>
      </div>
    );
  }

  // Stories mode
  const filteredStories = lessonsFor(readingStories, settings.ageRange);
  const story = filteredStories.find(s => s.id === storyId);

  if (!story) {
    return (
      <div style={{ padding: "24px 20px 120px" }}>
        <Header title="📖 Read Along" onBack={() => setMode(null)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredStories.map(s => (
            <Card key={s.id} onClick={() => { setStoryId(s.id); setShowAnswer(false); }}
              style={{ display: "flex", alignItems: "center", gap: 16, padding: 18 }}>
              <div style={{ fontSize: 40 }}>{s.emoji}</div>
              <div>
                <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text }}>{s.title}</div>
                <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>Level {s.level}</div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const q = story.questions[0];
  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title={`📖 ${story.title}`} onBack={() => setStoryId(null)} />
      <Card style={{ padding: 24, marginBottom: 16, lineHeight: 2.2 }}>
        <p style={{ fontFamily: T.font, fontSize: 20, fontWeight: 600, color: T.text, margin: 0 }}>{story.text}</p>
      </Card>
      <Btn color={T.blue} onClick={() => speak(story.text, settings)} style={{ width: "100%", marginBottom: 20 }}>🔊 Read It To Me</Btn>

      <Card style={{ padding: 20, background: T.yellowGlow, border: `1.5px solid ${T.yellow}30` }}>
        <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 12 }}>📝 Question:</div>
        <p style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.text, margin: "0 0 14px" }}>{q.q}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {q.choices.map(c => (
            <button key={c} onClick={() => {
              setShowAnswer(true);
              if (c === q.a) { setScore(s => s + 1); playSfx("correct"); }
              else playSfx("wrong");
            }} style={{
              padding: 14, borderRadius: 14, border: `2px solid ${showAnswer && c === q.a ? T.green : T.border}`,
              background: showAnswer && c === q.a ? T.greenGlow : T.surface,
              fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text, cursor: "pointer", textAlign: "left",
            }}>{c}</button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── EMOTION METER ──────────────────────────────────────────────────────────
function EmotionScreen({ setScreen }) {
  const { settings, addProgress } = useApp();
  const [level, setLevel] = useState(3);
  const [selectedCoping, setSelectedCoping] = useState(null);
  const [feelingsLog, setFeelingsLog] = useState(() => loadState("feelingsLog", []));
  const [showHistory, setShowHistory] = useState(false);
  const [saved, setSaved] = useState(false);

  const emotionScale = [
    { level: 1, emoji: "😢", label: "Very Upset", color: "#FF4444" },
    { level: 2, emoji: "😟", label: "Upset", color: "#FF8844" },
    { level: 3, emoji: "😐", label: "Okay", color: "#F7B731" },
    { level: 4, emoji: "😊", label: "Good", color: "#4ECC7E" },
    { level: 5, emoji: "🤩", label: "Great!", color: "#4E8AE6" },
  ];

  const current = emotionScale.find(e => e.level === level);

  function saveCheckin() {
    const entry = { level, ts: Date.now() };
    const updated = [entry, ...feelingsLog].slice(0, 200);
    setFeelingsLog(updated);
    saveState("feelingsLog", updated);
    setSaved(true);
    playSfx("complete");
    addProgress({ emotionCheckins: 1 });
    setTimeout(() => setSaved(false), 2000);
  }

  function getLast7Days() {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStr = d.toLocaleDateString("en-US", { weekday: "short" });
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const end = start + 86400000;
      const dayEntries = feelingsLog.filter(e => e.ts >= start && e.ts < end);
      const avg = dayEntries.length > 0 ? dayEntries.reduce((s, e) => s + e.level, 0) / dayEntries.length : null;
      days.push({ dayStr, avg, count: dayEntries.length });
    }
    return days;
  }

  const trendDays = getLast7Days();
  const avgMood = feelingsLog.length > 0
    ? (feelingsLog.slice(0, 30).reduce((s, e) => s + e.level, 0) / Math.min(feelingsLog.length, 30)).toFixed(1)
    : null;

  if (showHistory) {
    return (
      <div style={{ padding: "24px 20px 120px" }}>
        <Header title="📊 Feelings History" onBack={() => setShowHistory(false)} />

        <Card style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>Last 7 Days</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, padding: "0 4px" }}>
            {trendDays.map((d, i) => {
              const barH = d.avg ? (d.avg / 5) * 100 : 0;
              const barColor = d.avg ? emotionScale[Math.round(d.avg) - 1].color : T.border;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 11, fontFamily: T.fontAlt, color: T.soft }}>{d.avg ? emotionScale[Math.round(d.avg) - 1].emoji : ""}</div>
                  <div style={{
                    width: "100%", borderRadius: 8, background: d.avg ? `${barColor}30` : T.border + "20",
                    height: `${Math.max(barH, 8)}%`, transition: "height 0.3s ease",
                    border: d.avg ? `2px solid ${barColor}40` : `1px solid ${T.border}`,
                  }} />
                  <div style={{ fontSize: 10, fontFamily: T.fontAlt, color: T.soft, fontWeight: 600 }}>{d.dayStr}</div>
                </div>
              );
            })}
          </div>
        </Card>

        {avgMood && (
          <Card style={{ padding: 18, marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 36 }}>{emotionScale[Math.round(Number(avgMood)) - 1].emoji}</div>
            <div>
              <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 700, color: T.text }}>Average Mood</div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.soft }}>{avgMood} / 5 (last 30 check-ins)</div>
            </div>
          </Card>
        )}

        <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 12 }}>Recent Check-ins</div>
        {feelingsLog.length === 0 ? (
          <Card style={{ padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📝</div>
            <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft }}>No check-ins yet. Go back and save one!</div>
          </Card>
        ) : feelingsLog.slice(0, 20).map((entry, i) => {
          const e = emotionScale[entry.level - 1];
          const d = new Date(entry.ts);
          const timeStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          return (
            <Card key={i} style={{ padding: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontSize: 28 }}>{e.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 700, color: e.color }}>{e.label}</div>
                <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>{timeStr}</div>
              </div>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="🌡️ How I Feel" onBack={() => setScreen("home")} />

      <Card style={{ textAlign: "center", padding: 28, marginBottom: 20, background: `${current.color}10`, border: `2px solid ${current.color}25` }}>
        <div style={{ fontSize: 72, marginBottom: 8, transition: "all 0.3s ease" }}>{current.emoji}</div>
        <div style={{ fontFamily: T.font, fontSize: 24, fontWeight: 800, color: current.color }}>{current.label}</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 20 }}>
          {emotionScale.map(e => (
            <button key={e.level} onClick={() => { setLevel(e.level); setSaved(false); playSfx("tap"); }}
              aria-label={`Feeling ${e.label}`}
              style={{
                width: 52, height: 52, borderRadius: 16, border: `3px solid ${level === e.level ? e.color : T.border}`,
                background: level === e.level ? `${e.color}20` : T.surface,
                fontSize: 28, cursor: "pointer", transition: "all 0.2s ease",
                transform: level === e.level ? "scale(1.15)" : "scale(1)",
              }}>{e.emoji}</button>
          ))}
        </div>
        <button onClick={saveCheckin}
          aria-label="Save how I feel"
          style={{
            marginTop: 18, padding: "12px 32px", borderRadius: 20, border: "none",
            background: saved ? T.green : current.color, color: "#fff", fontFamily: T.font,
            fontSize: 16, fontWeight: 700, cursor: "pointer", transition: "all 0.2s ease",
          }}>
          {saved ? "✓ Saved!" : "Save Check-in"}
        </button>
      </Card>

      {feelingsLog.length > 0 && (
        <button onClick={() => { setShowHistory(true); playSfx("tap"); }}
          aria-label="View feelings history"
          style={{
            width: "100%", padding: 14, borderRadius: 16, border: `1.5px solid ${T.purple}25`,
            background: `${T.purple}08`, cursor: "pointer", marginBottom: 20,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
          <span style={{ fontSize: 18 }}>📊</span>
          <span style={{ fontFamily: T.font, fontSize: 15, fontWeight: 700, color: T.purple }}>View My History ({feelingsLog.length} check-ins)</span>
        </button>
      )}

      <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 14 }}>
        {level <= 2 ? "💡 Things That Can Help" : "🌟 Keep It Going!"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        {copingCards.slice(0, level <= 2 ? 8 : 6).map((card, i) => (
          <button key={i} onClick={() => { setSelectedCoping(card); playSfx("tap"); }}
            style={{
              padding: 16, borderRadius: 18, border: `1.5px solid ${card.color}25`,
              background: selectedCoping === card ? `${card.color}15` : T.surface,
              cursor: "pointer", textAlign: "center", transition: "all 0.15s ease",
            }}>
            <div style={{ fontSize: 30, marginBottom: 4 }}>{card.emoji}</div>
            <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 700, color: T.text }}>{card.label}</div>
            <div style={{ fontFamily: T.fontAlt, fontSize: 10, color: T.soft, marginTop: 4, lineHeight: 1.3 }}>{card.desc}</div>
          </button>
        ))}
      </div>

      {level <= 2 && (
        <Card style={{ background: T.pinkGlow, border: `1.5px solid ${T.pink}20`, textAlign: "center", padding: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>💪</div>
          <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text }}>You are strong!</div>
          <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft, marginTop: 6, lineHeight: 1.5 }}>
            Big feelings are okay. They always pass. You've got this!
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── FIDGET / SENSORY TOOLS ─────────────────────────────────────────────────
function FidgetScreen({ setScreen }) {
  const [tool, setTool] = useState(null);
  const [popGrid, setPopGrid] = useState(() => Array(36).fill(false));
  const [spinAngle, setSpinAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [mixColor1, setMixColor1] = useState("#FF4444");
  const [mixColor2, setMixColor2] = useState("#4488FF");
  const [tapCount, setTapCount] = useState(0);

  function resetPop() { setPopGrid(Array(36).fill(false)); }

  function spin() {
    if (spinning) return;
    setSpinning(true);
    const newAngle = spinAngle + 720 + Math.random() * 1440;
    setSpinAngle(newAngle);
    setTimeout(() => setSpinning(false), 2000);
  }

  function mixColors(c1, c2) {
    const hex = s => parseInt(s, 16);
    const r = Math.round((hex(c1.slice(1,3)) + hex(c2.slice(1,3))) / 2);
    const g = Math.round((hex(c1.slice(3,5)) + hex(c2.slice(3,5))) / 2);
    const b = Math.round((hex(c1.slice(5,7)) + hex(c2.slice(5,7))) / 2);
    return `rgb(${r},${g},${b})`;
  }

  const tools = [
    { id: "pop", emoji: "🫧", label: "Pop It", color: T.pink },
    { id: "spinner", emoji: "🌀", label: "Fidget Spinner", color: T.purple },
    { id: "colors", emoji: "🎨", label: "Color Mixer", color: T.blue },
    { id: "tap", emoji: "👆", label: "Tap Counter", color: T.green },
  ];

  if (!tool) {
    return (
      <div style={{ padding: "24px 20px 120px" }}>
        <Header title="🧸 Sensory Tools" onBack={() => setScreen("home")} />
        <p style={{ fontFamily: T.fontAlt, fontSize: 15, color: T.soft, margin: "0 0 20px", lineHeight: 1.6 }}>
          Calming tools for when you need to fidget or focus.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {tools.map(t => (
            <Card key={t.id} onClick={() => setTool(t.id)}
              style={{ textAlign: "center", padding: 24, background: `${t.color}10`, border: `1.5px solid ${t.color}20` }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>{t.emoji}</div>
              <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text }}>{t.label}</div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title={tools.find(t => t.id === tool)?.emoji + " " + tools.find(t => t.id === tool)?.label} onBack={() => setTool(null)} />

      {tool === "pop" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 16 }}>
            {popGrid.map((popped, i) => (
              <button key={i} onClick={() => setPopGrid(g => g.map((v, j) => j === i ? !v : v))}
                style={{
                  aspectRatio: "1", borderRadius: 50, border: "none", cursor: "pointer",
                  background: popped ? T.border : `linear-gradient(135deg, ${T.pink} 0%, ${T.purple} 100%)`,
                  transform: popped ? "scale(0.85)" : "scale(1)",
                  boxShadow: popped ? "inset 0 2px 8px rgba(0,0,0,0.15)" : `0 4px 12px ${T.pink}30`,
                  transition: "all 0.15s ease",
                }} />
            ))}
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: T.font, fontSize: 14, color: T.soft, marginBottom: 8 }}>
              {popGrid.filter(Boolean).length}/{popGrid.length} popped
            </div>
            <Btn color={T.pink} onClick={resetPop} size="sm">Reset All</Btn>
          </div>
        </>
      )}

      {tool === "spinner" && (
        <div style={{ textAlign: "center", padding: 20 }}>
          <div onClick={spin} style={{
            width: 200, height: 200, margin: "20px auto", borderRadius: "50%",
            background: `conic-gradient(${T.purple}, ${T.blue}, ${T.green}, ${T.yellow}, ${T.pink}, ${T.primary}, ${T.purple})`,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            transform: `rotate(${spinAngle}deg)`, transition: spinning ? "transform 2s cubic-bezier(0.2, 0.8, 0.3, 1)" : "none",
            boxShadow: "0 8px 40px rgba(139,108,246,0.3)",
          }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: T.surface, boxShadow: "0 2px 10px rgba(0,0,0,0.2)" }} />
          </div>
          <p style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text, marginTop: 20 }}>
            {spinning ? "Spinning..." : "Tap to spin!"}
          </p>
        </div>
      )}

      {tool === "colors" && (
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={{
            width: 160, height: 160, borderRadius: "50%", margin: "0 auto 24px",
            background: mixColors(mixColor1, mixColor2),
            boxShadow: `0 8px 40px ${mixColors(mixColor1, mixColor2)}40`,
            transition: "background 0.3s ease",
          }} />
          <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>Pick two colors to mix!</div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 12 }}>
            {["#FF4444", "#4488FF", "#44BB44", "#FFBB33", "#BB44FF", "#FF8844", "#FF69B4", "#000000"].map(c => (
              <button key={c} onClick={() => !mixColor1 || mixColor2 ? setMixColor1(c) : setMixColor2(c)}
                style={{
                  width: 36, height: 36, borderRadius: 18, border: (mixColor1 === c || mixColor2 === c) ? "3px solid #000" : `2px solid ${T.border}`,
                  background: c, cursor: "pointer",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <div style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.soft }}>Color 1:</div>
            <div style={{ width: 24, height: 24, borderRadius: 12, background: mixColor1 }} />
            <div style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.soft, marginLeft: 8 }}>Color 2:</div>
            <div style={{ width: 24, height: 24, borderRadius: 12, background: mixColor2 }} />
          </div>
        </div>
      )}

      {tool === "tap" && (
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontFamily: T.font, fontSize: 80, fontWeight: 800, color: T.text, marginBottom: 20 }}>{tapCount}</div>
          <button onClick={() => setTapCount(c => c + 1)} style={{
            width: 180, height: 180, borderRadius: "50%", border: "none", cursor: "pointer",
            background: `linear-gradient(135deg, ${T.green} 0%, #6DD598 100%)`,
            fontSize: 60, color: "#fff", boxShadow: `0 8px 40px ${T.green}40`,
            transition: "transform 0.1s ease", display: "flex", alignItems: "center", justifyContent: "center",
          }} onPointerDown={e => e.currentTarget.style.transform = "scale(0.92)"}
            onPointerUp={e => e.currentTarget.style.transform = "scale(1)"}>👆</button>
          <div style={{ marginTop: 20 }}>
            <Btn color={T.soft} onClick={() => setTapCount(0)} size="sm">Reset</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PARENT DASHBOARD ───────────────────────────────────────────────────────
function ParentDashboard({ setScreen }) {
  const { progress, settings } = useApp();
  const [showPin, setShowPin] = useState(settings.parentPin && settings.parentPin.length === 4);

  if (showPin) {
    return <PinEntry onSuccess={() => setShowPin(false)} onCancel={() => setScreen("settings")} />;
  }

  // Build last-7-days series from dailyLog
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const iso = d.toISOString().split("T")[0];
    const log = progress.dailyLog?.[iso] || {};
    days.push({
      iso,
      label: d.toLocaleDateString(undefined, { weekday: "short" }),
      stars: log.stars || 0,
      gamesPlayed: log.gamesPlayed || 0,
    });
  }
  const maxStars = Math.max(1, ...days.map(d => d.stars));
  const weekStars = days.reduce((sum, d) => sum + d.stars, 0);
  const weekGames = days.reduce((sum, d) => sum + d.gamesPlayed, 0);

  // Per-game breakdown from sessions (last 50)
  const recentSessions = (progress.sessions || []).slice(0, 50);
  const gameStats = {};
  for (const s of recentSessions) {
    if (!gameStats[s.key]) gameStats[s.key] = { key: s.key, label: s.label, plays: 0, correct: 0, total: 0 };
    gameStats[s.key].plays += 1;
    gameStats[s.key].correct += s.score || 0;
    gameStats[s.key].total += s.total || 0;
  }
  const topGames = Object.values(gameStats).sort((a, b) => b.plays - a.plays).slice(0, 5);

  function fmtTime(ts) {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    const isToday = d.toDateString() === today.toDateString();
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (isToday) return `Today ${time}`;
    if (isYesterday) return `Yesterday ${time}`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + time;
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="👨‍👩‍👧 Parent Dashboard" onBack={() => setScreen("settings")} />

      <Card style={{ marginBottom: 16, background: "linear-gradient(135deg, #4E8AE6 0%, #7BA8F0 100%)", color: "#fff", padding: 22 }}>
        <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Overview</div>
        <div style={{ fontFamily: T.fontAlt, fontSize: 13, opacity: 0.85 }}>
          {settings.ageRange ? `${ageRanges.find(a => a.id === settings.ageRange)?.label} Mode` : "No age set"} · {progress.streak} day streak
        </div>
      </Card>

      {/* Last 7 days chart */}
      <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 12 }}>📈 This Week</div>
      <Card style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: T.font, fontSize: 26, fontWeight: 800, color: T.text }}>{weekStars}</div>
            <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>stars this week</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.soft }}>{weekGames} games</div>
            <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>played</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100, marginBottom: 6 }}>
          {days.map((d, i) => {
            const h = Math.round((d.stars / maxStars) * 88);
            const isToday = i === days.length - 1;
            return (
              <div key={d.iso} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <div style={{ fontFamily: T.font, fontSize: 10, fontWeight: 700, color: T.soft, marginBottom: 4, minHeight: 12 }}>
                  {d.stars > 0 ? d.stars : ""}
                </div>
                <div style={{
                  width: "100%", height: Math.max(4, h), borderRadius: "6px 6px 0 0",
                  background: isToday ? T.primary : `${T.primary}60`,
                }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {days.map((d, i) => (
            <div key={d.iso} style={{
              flex: 1, textAlign: "center", fontFamily: T.font, fontSize: 10,
              fontWeight: i === days.length - 1 ? 700 : 500, color: i === days.length - 1 ? T.primary : T.soft,
            }}>{d.label}</div>
          ))}
        </div>
      </Card>

      <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 12 }}>📊 All-Time Stats</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Games Played", value: progress.gamesPlayed, emoji: "🎮", color: T.purple },
          { label: "Stars Earned", value: progress.totalStars, emoji: "⭐", color: T.yellow },
          { label: "Words Spoken", value: progress.wordsSpoken, emoji: "💬", color: T.blue },
          { label: "Focus Minutes", value: progress.focusMinutes, emoji: "🎯", color: T.green },
          { label: "Breathing Min", value: progress.breathingMinutes, emoji: "🫁", color: T.pink },
          { label: "Routines Done", value: progress.routinesCompleted, emoji: "✅", color: T.primary },
        ].map(s => (
          <Card key={s.label} style={{ padding: 16, textAlign: "center", background: `${s.color}08`, border: `1.5px solid ${s.color}15` }}>
            <div style={{ fontSize: 28 }}>{s.emoji}</div>
            <div style={{ fontFamily: T.font, fontSize: 22, fontWeight: 800, color: T.text }}>{s.value}</div>
            <div style={{ fontFamily: T.fontAlt, fontSize: 11, color: T.soft }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Top games */}
      {topGames.length > 0 && (
        <>
          <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 12 }}>🏆 Top Games</div>
          <Card style={{ padding: 14, marginBottom: 20 }}>
            {topGames.map((g, i) => {
              const acc = g.total > 0 ? Math.round((g.correct / g.total) * 100) : 0;
              return (
                <div key={g.key} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 0",
                  borderBottom: i < topGames.length - 1 ? `1px solid ${T.border}` : "none",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: T.font, fontSize: 14, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</div>
                    <div style={{ fontFamily: T.fontAlt, fontSize: 11, color: T.soft, marginTop: 2 }}>
                      {g.plays} play{g.plays === 1 ? "" : "s"} · {acc}% accuracy
                    </div>
                  </div>
                  <div style={{
                    fontFamily: T.font, fontSize: 13, fontWeight: 800, color: acc >= 80 ? T.green : acc >= 50 ? T.yellow : T.primary,
                    padding: "4px 10px", borderRadius: 10,
                    background: acc >= 80 ? T.greenGlow : acc >= 50 ? T.yellowGlow : T.primaryGlow,
                  }}>{acc}%</div>
                </div>
              );
            })}
          </Card>
        </>
      )}

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <>
          <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 12 }}>📋 Recent Sessions</div>
          <Card style={{ padding: 4, marginBottom: 20 }}>
            {recentSessions.slice(0, 15).map((s, i) => {
              const acc = s.total > 0 ? Math.round((s.score / s.total) * 100) : 0;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                  borderBottom: i < Math.min(recentSessions.length, 15) - 1 ? `1px solid ${T.border}` : "none",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</div>
                    <div style={{ fontFamily: T.fontAlt, fontSize: 11, color: T.soft, marginTop: 2 }}>{fmtTime(s.ts)}</div>
                  </div>
                  <div style={{ fontFamily: T.font, fontSize: 12, color: T.soft, textAlign: "right" }}>
                    <div style={{ fontWeight: 800, color: T.text }}>{s.score}/{s.total}</div>
                    <div style={{ fontSize: 10 }}>{acc}%</div>
                  </div>
                </div>
              );
            })}
          </Card>
        </>
      )}

      <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 12 }}>🏅 Badges Earned</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {badgeDefs.filter(b => b.check(progress)).map(b => (
          <div key={b.id} style={{
            padding: "6px 14px", borderRadius: 50, background: T.yellowGlow, border: `1.5px solid ${T.yellow}30`,
            fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.text,
          }}>{b.emoji} {b.label}</div>
        ))}
        {badgeDefs.filter(b => b.check(progress)).length === 0 && (
          <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft }}>No badges yet — keep exploring!</div>
        )}
      </div>

      <Card style={{ padding: 16, background: T.greenGlow, border: `1.5px solid ${T.green}20` }}>
        <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 8 }}>💡 Tips for Parents</div>
        <div style={{ fontFamily: T.fontAlt, fontSize: 13, color: T.soft, lineHeight: 1.8 }}>
          • Celebrate small wins — each star matters!<br />
          • Use Social Stories before new experiences<br />
          • Let your child explore at their own pace<br />
          • Add custom words for your child's specific needs<br />
          • Set game timers for healthy screen limits
        </div>
      </Card>
    </div>
  );
}

// ─── NAV ─────────────────────────────────────────────────────────────────────
function BottomNav({ screen, setScreen }) {
  const items = [
    { id: "home", emoji: "🏠", label: "Home" },
    { id: "soundboard", emoji: "💬", label: "Talk" },
    { id: "games", emoji: "🎮", label: "Games" },
    { id: "emotions", emoji: "🌡️", label: "Feelings" },
    { id: "calm", emoji: "🫧", label: "Calm" },
  ];
  const nonNavScreens = ["habits", "settings", "rewards", "stories", "reading", "fidget", "focus", "parent_dash"];
  const activeId = screen.startsWith("game_") ? "games" : nonNavScreens.includes(screen) ? "home" : screen;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: T.surface, borderTop: `1.5px solid ${T.border}`,
      display: "flex", justifyContent: "space-around", alignItems: "center",
      padding: "6px 0 max(8px, env(safe-area-inset-bottom))", zIndex: 100,
    }}>
      {items.map(item => (
        <button key={item.id} aria-label={item.label} aria-current={activeId === item.id ? "page" : undefined} onClick={() => setScreen(item.id)} style={{
          background: "none", border: "none", display: "flex", flexDirection: "column",
          alignItems: "center", gap: 2, padding: "8px 14px", cursor: "pointer",
          opacity: activeId === item.id ? 1 : 0.4,
          transform: activeId === item.id ? "scale(1.12)" : "scale(1)",
          transition: "all 0.15s ease",
        }}>
          <span aria-hidden="true" style={{ fontSize: 22 }}>{item.emoji}</span>
          <span style={{ fontFamily: T.font, fontSize: 11, fontWeight: activeId === item.id ? 700 : 500, color: activeId === item.id ? T.primary : T.soft }}>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [settings, setSettings] = useState(() => loadState("settings", defaultSettings));
  const [progress, setProgress] = useState(() => loadState("progress", defaultProgress));
  const [screen, setScreen] = useState("home");

  // Apply dark mode theme + font family override
  T = settings.darkMode ? { ...darkTheme } : { ...lightTheme };
  if (settings.fontFamily === "dyslexic") {
    T.font = "'Open Dyslexic', sans-serif";
    T.fontAlt = "'Open Dyslexic', sans-serif";
  }

  // Keep module-level a11y flags in sync so speak/playSfx/haptics respect prefs
  syncA11y(settings);

  function updateSettings(patch) {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveState("settings", next);
      return next;
    });
  }

  function addProgress(patch) {
    setProgress(prev => {
      const today = new Date().toISOString().split("T")[0];
      const wasActiveYesterday = prev.lastActiveDate === new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const isNewDay = prev.lastActiveDate !== today;
      const streak = isNewDay ? (wasActiveYesterday ? prev.streak + 1 : 1) : prev.streak;

      // Merge daily counters (excluding session which is an object, not a number)
      const dailyDelta = { ...patch };
      delete dailyDelta.session;
      const prevDay = prev.dailyLog?.[today] || {};
      const mergedDay = { ...prevDay };
      for (const k of Object.keys(dailyDelta)) {
        if (typeof dailyDelta[k] === "number") {
          mergedDay[k] = (prevDay[k] || 0) + dailyDelta[k];
        }
      }

      // Append session (capped at 200 most recent)
      let sessions = prev.sessions || [];
      if (patch.session) {
        sessions = [patch.session, ...sessions].slice(0, 200);
      }

      const next = {
        ...prev,
        totalStars: (prev.totalStars || 0) + (patch.stars || 0),
        gamesPlayed: (prev.gamesPlayed || 0) + (patch.gamesPlayed || 0),
        wordsSpoken: (prev.wordsSpoken || 0) + (patch.wordsSpoken || 0),
        routinesCompleted: (prev.routinesCompleted || 0) + (patch.routinesCompleted || 0),
        breathingMinutes: (prev.breathingMinutes || 0) + (patch.breathingMinutes || 0),
        focusMinutes: (prev.focusMinutes || 0) + (patch.focusMinutes || 0),
        streak,
        lastActiveDate: today,
        badges: prev.badges || [],
        dailyLog: { ...prev.dailyLog, [today]: mergedDay },
        sessions,
      };

      // Check for new badges
      const newBadges = badgeDefs.filter(b => b.check(next) && !(prev.badges || []).includes(b.id)).map(b => b.id);
      if (newBadges.length > 0) {
        next.badges = [...(next.badges || []), ...newBadges];
      }

      saveState("progress", next);
      return next;
    });
  }

  // Load voices on mount
  useEffect(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  // ─── Game session timer (persists across all game_* screens) ────────────
  const isGameScreen = screen === "games" || screen.startsWith("game_");
  const [gameTimeLeft, setGameTimeLeft] = useState(0);
  const [gameTimerDone, setGameTimerDone] = useState(false);
  const gameTimerRef = useRef(null);

  // Start timer when entering games area; reset when leaving
  useEffect(() => {
    clearInterval(gameTimerRef.current);
    if (isGameScreen && settings.gameTimerMinutes > 0 && !gameTimerDone) {
      if (gameTimeLeft <= 0) {
        setGameTimeLeft(settings.gameTimerMinutes * 60);
      }
    }
    if (!isGameScreen) {
      setGameTimeLeft(0);
      setGameTimerDone(false);
    }
  }, [isGameScreen]);

  // Tick down every second while in games area
  useEffect(() => {
    clearInterval(gameTimerRef.current);
    if (isGameScreen && gameTimeLeft > 0 && !gameTimerDone) {
      gameTimerRef.current = setInterval(() => {
        setGameTimeLeft(t => {
          if (t <= 1) {
            clearInterval(gameTimerRef.current);
            setGameTimerDone(true);
            speak("Game time is over! Time to take a break.", settings);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(gameTimerRef.current);
  }, [isGameScreen, gameTimeLeft > 0, gameTimerDone]);

  // Tour state: show once per profile after age selection
  const [tourDone, setTourDone] = useState(() => loadState("tourDone", false));
  function completeTour() {
    setTourDone(true);
    saveState("tourDone", true);
  }

  // Show onboarding if no age range selected
  if (!settings.ageRange) {
    return (
      <AppContext.Provider value={{ settings, updateSettings, progress, addProgress, currentScreen: screen }}>
        <div style={{
          background: T.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto",
          fontFamily: T.fontAlt, color: T.text, position: "relative", WebkitFontSmoothing: "antialiased",
        }}>
          <style>{`* { box-sizing: border-box; } button { -webkit-tap-highlight-color: transparent; } ::-webkit-scrollbar { display: none; } input { outline: none; } @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <div style={{ animation: "fadeIn 0.4s ease-out" }}><OnboardingScreen /></div>
        </div>
      </AppContext.Provider>
    );
  }

  // Show tour once after age selection
  if (!tourDone) {
    return (
      <AppContext.Provider value={{ settings, updateSettings, progress, addProgress, currentScreen: screen }}>
        <div style={{
          background: T.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto",
          fontFamily: T.fontAlt, color: T.text, position: "relative", WebkitFontSmoothing: "antialiased",
        }}>
          <style>{`* { box-sizing: border-box; } button { -webkit-tap-highlight-color: transparent; } ::-webkit-scrollbar { display: none; } input { outline: none; } @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <div style={{ animation: "fadeIn 0.4s ease-out" }}><OnboardingTour onComplete={completeTour} /></div>
        </div>
      </AppContext.Provider>
    );
  }

  const screens = {
    home: <HomeScreen setScreen={setScreen} />,
    soundboard: <SoundboardScreen setScreen={setScreen} />,
    games: <GamesScreen setScreen={setScreen} />,
    game_words: <WordGameScreen setScreen={setScreen} />,
    game_colors: <ColorGameScreen setScreen={setScreen} />,
    game_patterns: <PatternGameScreen setScreen={setScreen} />,
    game_math: <MathGameScreen setScreen={setScreen} />,
    game_memory: <MemoryGameScreen setScreen={setScreen} />,
    game_rhyming: <RhymingGameScreen setScreen={setScreen} />,
    game_shapes: <ShapeSortScreen setScreen={setScreen} />,
    game_spelling: <SpellingBeeScreen setScreen={setScreen} />,
    game_opposites: <OppositeMatchScreen setScreen={setScreen} />,
    game_counting: <CountingGameScreen setScreen={setScreen} />,
    game_sizes: <SizeSortScreen setScreen={setScreen} />,
    game_clock: <ClockReaderScreen setScreen={setScreen} />,
    game_money: <MoneyMatchScreen setScreen={setScreen} />,
    game_emotions: <EmotionMatchScreen setScreen={setScreen} />,
    game_missing: <WhatsMissingScreen setScreen={setScreen} />,
    game_story: <StoryBuilderScreen setScreen={setScreen} />,
    game_maze: <MazeRunnerScreen setScreen={setScreen} />,
    game_music: <MusicMakerScreen setScreen={setScreen} />,
    focus: <FocusScreen setScreen={setScreen} />,
    calm: <CalmScreen setScreen={setScreen} />,
    habits: <HabitsScreen setScreen={setScreen} />,
    settings: <SettingsScreen setScreen={setScreen} />,
    manage_profiles: <ManageProfilesScreen onBack={() => setScreen("settings")} />,
    stories: <SocialStoriesScreen setScreen={setScreen} />,
    reading: <ReadingScreen setScreen={setScreen} />,
    emotions: <EmotionScreen setScreen={setScreen} />,
    fidget: <FidgetScreen setScreen={setScreen} />,
    rewards: <RewardsScreen setScreen={setScreen} />,
    parent_dash: <ParentDashboard setScreen={setScreen} />,
  };

  const globalCSS = `
    * { box-sizing: border-box; }
    button { -webkit-tap-highlight-color: transparent; }
    ::-webkit-scrollbar { display: none; }
    input { outline: none; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideIn { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
    .page-enter { animation: fadeIn 0.25s ease-out; }
    /* High contrast: stronger borders, heavier text, deeper shadows */
    .high-contrast button, .high-contrast input, .high-contrast textarea { border-width: 3px !important; }
    .high-contrast * { font-weight: 600; }
    .high-contrast h1, .high-contrast h2, .high-contrast h3 { font-weight: 900 !important; }
    /* Reduce motion: disable all animations/transitions app-wide */
    .reduce-motion *, .reduce-motion *::before, .reduce-motion *::after {
      animation-duration: 0.001s !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001s !important;
      scroll-behavior: auto !important;
    }
    .reduce-motion .page-enter { animation: none !important; }
  `;

  const fontZoom = settings.fontSize === "small" ? 0.88 : settings.fontSize === "large" ? 1.18 : 1;
  const rootClass = [
    settings.highContrast ? "high-contrast" : "",
    settings.reduceMotion ? "reduce-motion" : "",
  ].filter(Boolean).join(" ");

  return (
    <AppContext.Provider value={{ settings, updateSettings, progress, addProgress, currentScreen: screen }}>
      <div className={rootClass} style={{
        background: T.bg, minHeight: "100vh",
        maxWidth: screen === "soundboard" ? 1200 : 480,
        margin: "0 auto",
        fontFamily: T.fontAlt, color: T.text, position: "relative", WebkitFontSmoothing: "antialiased",
        transition: settings.reduceMotion ? "none" : "max-width 0.25s ease",
        zoom: fontZoom,
      }}>
        <style>{globalCSS}</style>
        {isGameScreen && settings.gameTimerMinutes > 0 && !gameTimerDone && (
          <GameTimerBadge timeLeft={gameTimeLeft} />
        )}
        {gameTimerDone && isGameScreen && (
          <GameTimerOverlay onGoHome={() => { setGameTimerDone(false); setGameTimeLeft(0); setScreen("home"); }} />
        )}
        <div key={screen} className="page-enter">
          {screens[screen] || <HomeScreen setScreen={setScreen} />}
        </div>
        <BottomNav screen={screen} setScreen={setScreen} />
      </div>
    </AppContext.Provider>
  );
}
