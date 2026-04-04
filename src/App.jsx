import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";

// ─── Theme ───────────────────────────────────────────────────────────────────
const lightTheme = {
  bg: "#FFF8F0", surface: "#FFFFFF", text: "#2B2520", soft: "#9E9589",
  primary: "#FF6B3D", primaryGlow: "#FFF0EB",
  blue: "#4E8AE6", blueGlow: "#EBF2FF",
  purple: "#8B6CF6", purpleGlow: "#F3EFFF",
  green: "#3EBB6E", greenGlow: "#E6F9ED",
  yellow: "#F7B731", yellowGlow: "#FFF7E0",
  pink: "#E84E8A", pinkGlow: "#FFEBF3",
  border: "#F0EBE3", shadow: "0 4px 20px rgba(43,37,32,0.06)",
  radius: 22, font: "'Baloo 2', cursive", fontAlt: "'Atkinson Hyperlegible', sans-serif",
};
const darkTheme = {
  bg: "#1A1A2E", surface: "#16213E", text: "#E8E8E8", soft: "#8888AA",
  primary: "#FF6B3D", primaryGlow: "#2A1A15",
  blue: "#5B9BF0", blueGlow: "#1A2540",
  purple: "#9B7FF0", purpleGlow: "#1E1A35",
  green: "#4ECC7E", greenGlow: "#152520",
  yellow: "#FFD044", yellowGlow: "#2A2515",
  pink: "#F06B9E", pinkGlow: "#2A1520",
  border: "#2A2A4A", shadow: "0 4px 20px rgba(0,0,0,0.3)",
  radius: 22, font: "'Baloo 2', cursive", fontAlt: "'Atkinson Hyperlegible', sans-serif",
};
let T = lightTheme;

// ─── Persistent Storage ──────────────────────────────────────────────────────
function loadState(key, fallback) {
  try { const v = localStorage.getItem(`nb_${key}`); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveState(key, value) {
  try { localStorage.setItem(`nb_${key}`, JSON.stringify(value)); } catch {}
}

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
  highContrast: false,
  hapticFeedback: true,
  darkMode: false,
};

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
function getMaxLevel(ageRange) {
  if (ageRange === "child") return 1;
  if (ageRange === "teen") return 2;
  return 3; // young_adult, adult
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
];

// ─── Reading Practice Data ──────────────────────────────────────────────────
const sightWords = {
  level1: ["the", "and", "is", "it", "to", "in", "I", "a", "my", "we", "go", "no", "so", "he", "me", "be", "do", "up", "at", "on"],
  level2: ["said", "have", "with", "they", "this", "from", "that", "what", "were", "when", "your", "each", "make", "like", "just", "over", "such", "take", "than", "them"],
  level3: ["about", "could", "would", "there", "their", "which", "other", "because", "through", "before", "should", "between", "people", "different", "important", "another", "together", "something", "sometimes", "everything"],
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
    id: "ocean_story", title: "Under the Sea", emoji: "🌊", level: 3,
    text: "The ocean is full of amazing creatures. Dolphins swim together in groups called pods. Octopuses have eight arms and are very smart. The coral reef is like an underwater city where thousands of fish live. Scientists are working to protect these beautiful places for the future.",
    questions: [{ q: "What are groups of dolphins called?", choices: ["Herds", "Pods", "Schools"], a: "Pods" }],
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
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = settings.voiceRate ?? 0.85;
  u.pitch = settings.voicePitch ?? 1.0;
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
  return (
    <div onClick={onClick} style={{
      background: T.surface, borderRadius: T.radius, padding: 20,
      boxShadow: T.shadow, border: `1.5px solid ${T.border}`,
      cursor: onClick ? "pointer" : "default", transition: "transform 0.12s ease", ...style,
    }}
      onPointerDown={e => onClick && (e.currentTarget.style.transform = "scale(0.97)")}
      onPointerUp={e => onClick && (e.currentTarget.style.transform = "scale(1)")}
      onPointerLeave={e => onClick && (e.currentTarget.style.transform = "scale(1)")}
    >{children}</div>
  );
}

function Header({ title, onBack, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, minHeight: 40 }}>
      {onBack && (
        <button onClick={onBack} style={{
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
    { emoji: "💬", title: "Soundboard", desc: "Build sentences & communicate", color: T.blue, glow: T.blueGlow, screen: "soundboard", gradient: "linear-gradient(135deg, #4E8AE6 0%, #7BA8F0 100%)" },
    { emoji: "🎮", title: "Learning Games", desc: "7 games: words, memory & more", color: T.purple, glow: T.purpleGlow, screen: "games", gradient: "linear-gradient(135deg, #8B6CF6 0%, #A78BFA 100%)" },
    { emoji: "📖", title: "Social Stories", desc: "Prepare for new experiences", color: T.primary, glow: T.primaryGlow, screen: "stories", gradient: "linear-gradient(135deg, #FF6B3D 0%, #FF8F6B 100%)" },
    { emoji: "📚", title: "Reading Practice", desc: "Sight words & read-along stories", color: T.blue, glow: T.blueGlow, screen: "reading", gradient: "linear-gradient(135deg, #4E8AE6 0%, #7BA8F0 100%)" },
    { emoji: "🌡️", title: "How I Feel", desc: "Emotion check-in & coping tools", color: T.pink, glow: T.pinkGlow, screen: "emotions", gradient: "linear-gradient(135deg, #E84E8A 0%, #F08CB4 100%)" },
    { emoji: "🎯", title: "Focus Timer", desc: "Stay on track with reminders", color: T.green, glow: T.greenGlow, screen: "focus", gradient: "linear-gradient(135deg, #3EBB6E 0%, #6DD598 100%)" },
    { emoji: "🫧", title: "Calm Corner", desc: "Breathing & grounding exercises", color: T.purple, glow: T.purpleGlow, screen: "calm", gradient: "linear-gradient(135deg, #8B6CF6 0%, #A78BFA 100%)" },
    { emoji: "🧸", title: "Sensory Tools", desc: "Pop-it, spinner, color mixer", color: T.pink, glow: T.pinkGlow, screen: "fidget", gradient: "linear-gradient(135deg, #E84E8A 0%, #F08CB4 100%)" },
    { emoji: "✅", title: "My Routines", desc: "Daily schedules & checklists", color: T.yellow, glow: T.yellowGlow, screen: "habits", gradient: "linear-gradient(135deg, #F7B731 0%, #FFCF5C 100%)" },
    { emoji: "🏆", title: "My Rewards", desc: `${progress.totalStars} stars · ${badgeDefs.filter(b => b.check(progress)).length} badges`, color: T.yellow, glow: T.yellowGlow, screen: "rewards", gradient: "linear-gradient(135deg, #F7B731 0%, #FFCF5C 100%)" },
  ];

  return (
    <div style={{ padding: "20px 16px 120px" }}>
      {/* Hero Banner */}
      <div style={{
        background: "linear-gradient(135deg, #FF6B3D 0%, #FF8F6B 40%, #FFB088 100%)",
        borderRadius: 28, padding: "26px 22px 22px", marginBottom: 20, color: "#fff", position: "relative", overflow: "hidden",
        boxShadow: "0 8px 32px rgba(255,107,61,0.3)",
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
          <button onClick={() => setScreen("settings")} style={{
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

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="⚙️ Settings" onBack={() => setScreen("home")} />

      {/* Profile */}
      <Card style={{ marginBottom: 16, background: ageInfo ? `${ageInfo.color}08` : T.surface }}>
        <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 14 }}>👤 Profile</div>
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
          <button onClick={() => updateSettings({ kidsMode: !settings.kidsMode })} style={{
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

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>High Contrast</div>
            <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>Bolder colors & borders</div>
          </div>
          <button onClick={() => updateSettings({ highContrast: !settings.highContrast })} style={{
            width: 52, height: 30, borderRadius: 15, border: "none", cursor: "pointer",
            background: settings.highContrast ? T.blue : T.border, position: "relative", transition: "all 0.2s ease",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, background: "#fff", position: "absolute", top: 3,
              left: settings.highContrast ? 25 : 3, transition: "left 0.2s ease", boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.text }}>🌙 Dark Mode</div>
            <div style={{ fontFamily: T.fontAlt, fontSize: 12, color: T.soft }}>Easier on sensitive eyes</div>
          </div>
          <button onClick={() => updateSettings({ darkMode: !settings.darkMode })} style={{
            width: 52, height: 30, borderRadius: 15, border: "none", cursor: "pointer",
            background: settings.darkMode ? T.purple : T.border, position: "relative", transition: "all 0.2s ease",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, background: "#fff", position: "absolute", top: 3,
              left: settings.darkMode ? 25 : 3, transition: "left 0.2s ease", boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
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

// ─── SOUNDBOARD (Enhanced for full sentences) ────────────────────────────────
function SoundboardScreen({ setScreen }) {
  const { settings } = useApp();
  const [cat, setCat] = useState(null);
  const [sentence, setSentence] = useState([]);
  const [lastSpoken, setLastSpoken] = useState(null);
  const [customWords, setCustomWords] = useState(() => loadState("customWords", []));
  const [showAddWord, setShowAddWord] = useState(false);
  const [newWordLabel, setNewWordLabel] = useState("");
  const [newWordEmoji, setNewWordEmoji] = useState("🗣️");
  const [newWordSpeech, setNewWordSpeech] = useState("");
  const [newWordCat, setNewWordCat] = useState("custom");

  function tapItem(item) {
    speak(item.speech, settings);
    setLastSpoken(item.label);
    setSentence(prev => [...prev, item]);
    setTimeout(() => setLastSpoken(null), 600);
  }

  function speakSentence() {
    if (sentence.length > 0) {
      const text = sentence.map(s => s.speech).join(" ");
      speak(text, settings);
    }
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

  // Build full categories list including custom words
  const customCategory = customWords.length > 0 ? {
    id: "custom", label: "My Words", emoji: "⭐", color: T.primary, glow: T.primaryGlow,
    items: customWords.filter(w => w.catId === "custom"),
  } : null;

  const allCategories = customCategory ? [customCategory, ...aacCategories] : aacCategories;

  // Get items for current category, including custom words added to built-in categories
  function getCatItems(catId) {
    const builtIn = aacCategories.find(c => c.id === catId);
    const builtInItems = builtIn ? builtIn.items : [];
    const customInCat = customWords.filter(w => w.catId === catId);
    return [...builtInItems, ...customInCat];
  }

  const quickPhrases = [
    { label: "I want", emoji: "👉", speech: "I want" },
    { label: "I need", emoji: "🙋", speech: "I need" },
    { label: "I like", emoji: "💛", speech: "I like" },
    { label: "I don't like", emoji: "👎", speech: "I don't like" },
    { label: "Can I have", emoji: "🤲", speech: "Can I have" },
    { label: "Let's go", emoji: "🚶", speech: "Let's go" },
    { label: "to the", emoji: "➡️", speech: "to the" },
    { label: "with", emoji: "🤝", speech: "with" },
    { label: "and", emoji: "➕", speech: "and" },
    { label: "the", emoji: "📎", speech: "the" },
    { label: "is", emoji: "🟰", speech: "is" },
    { label: "my", emoji: "🙋", speech: "my" },
  ];

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="💬 Soundboard" onBack={() => setScreen("home")}
        right={
          <button onClick={() => setShowAddWord(!showAddWord)} style={{
            padding: "6px 12px", borderRadius: 12, border: `1.5px solid ${T.primary}40`,
            background: T.primaryGlow, fontFamily: T.font, fontSize: 12, fontWeight: 700,
            color: T.primary, cursor: "pointer",
          }}>+ Add Word</button>
        }
      />

      {/* Add Word Panel (for parents) */}
      {showAddWord && (
        <Card style={{ marginBottom: 16, padding: 18, border: `2px solid ${T.primary}30`, animation: "scaleIn 0.2s ease-out" }}>
          <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 12 }}>
            ⭐ Add Custom Word
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input value={newWordEmoji} onChange={e => setNewWordEmoji(e.target.value)}
              style={{ width: 50, padding: 10, borderRadius: 12, border: `1.5px solid ${T.border}`, fontSize: 24, textAlign: "center" }}
              placeholder="😊" />
            <input value={newWordLabel} onChange={e => setNewWordLabel(e.target.value)}
              style={{ flex: 1, padding: 10, borderRadius: 12, border: `1.5px solid ${T.border}`, fontFamily: T.fontAlt, fontSize: 14 }}
              placeholder="Button label (e.g. Juice)" />
          </div>
          <input value={newWordSpeech} onChange={e => setNewWordSpeech(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 12, border: `1.5px solid ${T.border}`, fontFamily: T.fontAlt, fontSize: 14, marginBottom: 10, boxSizing: "border-box" }}
            placeholder="What to say (e.g. I want juice please)" />
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {[{ id: "custom", label: "My Words" }, ...aacCategories.slice(0, 6)].map(c => (
              <button key={c.id} onClick={() => setNewWordCat(c.id)} style={{
                padding: "4px 10px", borderRadius: 10, fontSize: 11, fontFamily: T.font, fontWeight: 600,
                border: `1.5px solid ${newWordCat === c.id ? T.primary : T.border}`,
                background: newWordCat === c.id ? T.primaryGlow : T.surface,
                color: newWordCat === c.id ? T.primary : T.soft, cursor: "pointer",
              }}>{c.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn color={T.soft} size="sm" onClick={() => setShowAddWord(false)}>Cancel</Btn>
            <Btn color={T.primary} size="sm" onClick={addCustomWord} disabled={!newWordLabel.trim() || !newWordSpeech.trim()}>Add Word</Btn>
          </div>
        </Card>
      )}

      {/* Sentence Builder Bar */}
      <div style={{
        background: T.surface, borderRadius: 18, padding: 14, marginBottom: 10,
        border: `2px solid ${T.blue}30`, minHeight: 56,
        display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", boxShadow: T.shadow,
      }}>
        {sentence.length === 0 ? (
          <span style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft }}>Tap cards to build a sentence...</span>
        ) : sentence.map((s, i) => (
          <button key={i} onClick={() => removeWord(i)} style={{
            background: T.blueGlow, padding: "5px 10px", borderRadius: 10, border: `1px solid ${T.blue}30`,
            fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.blue, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            {s.emoji} {s.label}
            <span style={{ fontSize: 10, opacity: 0.5 }}>✕</span>
          </button>
        ))}
      </div>

      {/* Sentence preview */}
      {sentence.length > 0 && (
        <div style={{
          fontFamily: T.fontAlt, fontSize: 14, color: T.text, padding: "8px 14px",
          background: T.yellowGlow, borderRadius: 12, marginBottom: 10, fontStyle: "italic",
          border: `1px solid ${T.yellow}30`,
        }}>
          "{sentence.map(s => s.speech).join(" ")}"
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Btn color={T.blue} onClick={speakSentence} style={{ flex: 1 }} disabled={sentence.length === 0} size="sm">🔊 Speak</Btn>
        <Btn color={T.soft} onClick={() => setSentence([])} disabled={sentence.length === 0} size="sm">Clear</Btn>
      </div>

      {/* Quick Phrase Starters */}
      {cat === null && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 700, color: T.soft, marginBottom: 8 }}>Quick phrases:</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {quickPhrases.map((p, i) => (
              <button key={i} onClick={() => tapItem(p)} style={{
                padding: "5px 10px", borderRadius: 10, border: `1.5px solid ${T.purple}25`,
                background: T.purpleGlow, fontFamily: T.font, fontSize: 12, fontWeight: 600,
                color: T.purple, cursor: "pointer",
              }}>{p.emoji} {p.label}</button>
            ))}
          </div>
        </div>
      )}

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
    </div>
  );
}

// ─── GAMES HUB ───────────────────────────────────────────────────────────────
function GamesScreen({ setScreen }) {
  const { settings } = useApp();
  const [gameTimerActive, setGameTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(settings.gameTimerMinutes * 60);
  const [timerDone, setTimerDone] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (settings.kidsMode && settings.gameTimerMinutes > 0 && !gameTimerActive) {
      setGameTimerActive(true);
      setTimeLeft(settings.gameTimerMinutes * 60);
    }
  }, []);

  useEffect(() => {
    if (gameTimerActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            clearInterval(timerRef.current);
            setTimerDone(true);
            speak("Game time is over! Time to take a break.", settings);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [gameTimerActive]);

  if (timerDone) {
    return (
      <div style={{ padding: "24px 20px 120px" }}>
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 80, marginBottom: 20 }}>⏰</div>
          <h1 style={{ fontFamily: T.font, fontSize: 28, fontWeight: 800, color: T.text, margin: "0 0 12px" }}>Game Time is Up!</h1>
          <p style={{ fontFamily: T.fontAlt, fontSize: 16, color: T.soft, lineHeight: 1.6, marginBottom: 24 }}>
            Great job playing! Time to take a break and do something else.
          </p>
          <Btn color={T.primary} onClick={() => setScreen("home")}>Go Home</Btn>
        </div>
      </div>
    );
  }

  const games = [
    { id: "words", emoji: "🔤", title: "Word Match", desc: "Match pictures to words", color: T.primary, glow: T.primaryGlow },
    { id: "colors", emoji: "🎨", title: "Color Match", desc: "Learn your colors", color: T.blue, glow: T.blueGlow },
    { id: "patterns", emoji: "🔷", title: "Pattern Finder", desc: "What comes next?", color: T.purple, glow: T.purpleGlow },
    { id: "math", emoji: "🔢", title: "Number Fun", desc: "Adding, subtracting & more", color: T.green, glow: T.greenGlow },
    { id: "memory", emoji: "🧠", title: "Memory Match", desc: "Find the matching pairs", color: T.pink, glow: T.pinkGlow },
    { id: "rhyming", emoji: "🎤", title: "Rhyme Time", desc: "Which word rhymes?", color: T.yellow, glow: T.yellowGlow },
    { id: "shapes", emoji: "🧩", title: "Odd One Out", desc: "Which doesn't belong?", color: T.primary, glow: T.primaryGlow },
  ];

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="🎮 Learning Games" onBack={() => setScreen("home")}
        right={gameTimerActive && timeLeft > 0 ? (
          <span style={{ fontFamily: T.font, fontSize: 14, color: timeLeft < 60 ? T.primary : T.soft, fontWeight: 700 }}>
            ⏱️ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
          </span>
        ) : null}
      />
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
  const maxLevel = getMaxLevel(settings.ageRange);
  const filtered = wordGames.filter(g => g.level <= maxLevel);
  const [idx, setIdx] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const game = filtered[idx % filtered.length];

  function pick(choice) {
    if (feedback) return;
    if (choice === game.word) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      speak("Great job!", settings);
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => { setFeedback(""); setShowHint(false); setIdx(i => (i + 1) % filtered.length); }, 1800);
    } else {
      setFeedback("wrong"); speak("Try again!", settings);
      setTimeout(() => setFeedback(""), 1000);
    }
  }

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Confetti active={showConfetti} />
      <Header title="🔤 Word Match" onBack={() => setScreen("games")}
        right={<span style={{ fontFamily: T.font, fontSize: 16, color: T.green, fontWeight: 700 }}>⭐ {score}</span>} />
      <ProgressBar value={idx + 1} max={filtered.length} color={T.primary} h={6} />
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
      speak(`Yes! That's ${target.name.toLowerCase()}!`, settings);
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(newRound, 1500);
    } else { setFeedback("wrong"); speak("Not quite!", settings); setTimeout(() => setFeedback(""), 800); }
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
  const maxLevel = getMaxLevel(settings.ageRange);
  const filtered = patternData.filter(p => p.level <= maxLevel);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const p = filtered[idx % filtered.length];

  function pick(val) {
    if (feedback) return;
    if (val === p.answer) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      speak("You found the pattern!", settings);
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => { setFeedback(""); setIdx(i => (i + 1) % filtered.length); }, 1500);
    } else { setFeedback("wrong"); speak("Look again", settings); setTimeout(() => setFeedback(""), 800); }
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
  const maxLevel = getMaxLevel(settings.ageRange);
  const filtered = mathProblems.filter(p => p.level <= maxLevel);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const prob = filtered[idx % filtered.length];

  function pick(val) {
    if (feedback) return;
    if (val === prob.a) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      speak(`Yes! ${prob.q} equals ${prob.a}`, settings);
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => { setFeedback(""); setIdx(i => (i + 1) % filtered.length); }, 1500);
    } else { setFeedback("wrong"); speak("Not quite", settings); setTimeout(() => setFeedback(""), 800); }
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
        speak("Match!", settings);
        if (newMatched.length === cards.length) {
          setShowConfetti(true);
          speak("Amazing! You found them all!", settings);
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
  const maxLevel = getMaxLevel(settings.ageRange);
  const filtered = rhymingData.filter(r => r.level <= maxLevel);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const item = filtered[idx % filtered.length];

  function pick(choice) {
    if (feedback) return;
    if (choice === item.answer) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      speak(`Yes! ${item.word} rhymes with ${item.answer}!`, settings);
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => { setFeedback(""); setIdx(i => (i + 1) % filtered.length); }, 1500);
    } else {
      setFeedback("wrong"); speak("Try another one!", settings);
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
  const maxLevel = getMaxLevel(settings.ageRange);
  const filtered = shapeSortData.filter(s => s.level <= maxLevel);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const item = filtered[idx % filtered.length];

  function pick(emoji) {
    if (feedback) return;
    if (emoji === item.answer) {
      setFeedback("correct"); setScore(s => s + 1); setShowConfetti(true);
      speak(`Right! That one doesn't belong!`, settings);
      setTimeout(() => setShowConfetti(false), 2000);
      setTimeout(() => { setFeedback(""); setIdx(i => (i + 1) % filtered.length); }, 1500);
    } else {
      setFeedback("wrong"); speak("That one fits! Look again.", settings);
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
function CalmScreen({ setScreen }) {
  const { settings } = useApp();
  const [breathing, setBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState("in");
  const [breathCount, setBreathCount] = useState(4);
  const breathRef = useRef(null);

  useEffect(() => {
    if (breathing) {
      let phase = "in", count = 4;
      breathRef.current = setInterval(() => {
        count--;
        if (count <= 0) {
          if (phase === "in") { phase = "hold"; } else if (phase === "hold") { phase = "out"; } else { phase = "in"; }
          count = 4;
        }
        setBreathPhase(phase); setBreathCount(count);
      }, 1000);
    }
    return () => clearInterval(breathRef.current);
  }, [breathing]);

  const breathInfo = { in: { label: "Breathe In...", color: T.blue, scale: 1.3 }, hold: { label: "Hold...", color: T.purple, scale: 1.3 }, out: { label: "Breathe Out...", color: T.green, scale: 0.9 } };
  const bi = breathInfo[breathPhase];

  const sounds = [
    { emoji: "🌊", label: "Ocean" }, { emoji: "🌧️", label: "Rain" }, { emoji: "🐦", label: "Birds" },
    { emoji: "🎵", label: "Music" }, { emoji: "🦗", label: "Night" }, { emoji: "💨", label: "Wind" },
  ];

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="🫧 Calm Corner" onBack={() => { setBreathing(false); setScreen("home"); }} />
      <Card style={{ textAlign: "center", padding: 32, marginBottom: 20, background: breathing ? `${bi.color}08` : T.surface }}>
        <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 20 }}>Breathing Exercise</div>
        <div style={{
          width: 140, height: 140, borderRadius: "50%", margin: "0 auto 20px",
          background: breathing ? `${bi.color}20` : `${T.blue}10`,
          border: `3px solid ${breathing ? bi.color : T.blue}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 1s ease", transform: breathing ? `scale(${bi.scale})` : "scale(1)",
        }}>
          <span style={{ fontSize: breathing ? 40 : 48 }}>{breathing ? breathCount : "🫁"}</span>
        </div>
        {breathing && <p style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: bi.color, margin: "0 0 16px" }}>{bi.label}</p>}
        <Btn color={breathing ? T.primary : T.blue} onClick={() => setBreathing(!breathing)}>
          {breathing ? "Stop" : "Start Breathing"}
        </Btn>
      </Card>
      <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 14 }}>Ambient Sounds</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
        {sounds.map(s => (
          <button key={s.label} onClick={() => speak(s.label, settings)} style={{
            padding: "18px 8px", borderRadius: 18, border: `1.5px solid ${T.border}`,
            background: T.surface, cursor: "pointer", textAlign: "center",
          }}>
            <div style={{ fontSize: 32, marginBottom: 4 }}>{s.emoji}</div>
            <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 700, color: T.text }}>{s.label}</div>
          </button>
        ))}
      </div>
      <Card style={{ background: T.purpleGlow, border: `1.5px solid ${T.purple}20` }}>
        <div style={{ fontFamily: T.font, fontSize: 16, fontWeight: 700, color: T.purple, marginBottom: 10 }}>🧘 5-4-3-2-1 Grounding</div>
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
          <button key={h.id} onClick={() => { setHabits(prev => prev.map(x => x.id === h.id ? { ...x, done: !x.done } : x)); if (!h.done) speak("Nice job!", settings); }}
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
function ReadingScreen({ setScreen }) {
  const { settings } = useApp();
  const maxLevel = getMaxLevel(settings.ageRange);
  const [mode, setMode] = useState(null); // "sight" | "stories"
  const [wordIdx, setWordIdx] = useState(0);
  const [storyId, setStoryId] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);

  const levelKey = maxLevel === 1 ? "level1" : maxLevel === 2 ? "level2" : "level3";
  const words = sightWords[levelKey];

  if (!mode) {
    return (
      <div style={{ padding: "24px 20px 120px" }}>
        <Header title="📚 Reading Practice" onBack={() => setScreen("home")} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card onClick={() => setMode("sight")} style={{ display: "flex", alignItems: "center", gap: 16, padding: 22, background: T.blueGlow, border: `1.5px solid ${T.blue}20` }}>
            <div style={{ width: 60, height: 60, borderRadius: 20, background: `${T.blue}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🔤</div>
            <div>
              <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text }}>Sight Words</div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft }}>Practice reading common words</div>
            </div>
          </Card>
          <Card onClick={() => setMode("stories")} style={{ display: "flex", alignItems: "center", gap: 16, padding: 22, background: T.purpleGlow, border: `1.5px solid ${T.purple}20` }}>
            <div style={{ width: 60, height: 60, borderRadius: 20, background: `${T.purple}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>📖</div>
            <div>
              <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.text }}>Read Along Stories</div>
              <div style={{ fontFamily: T.fontAlt, fontSize: 14, color: T.soft }}>Short stories with audio</div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (mode === "sight") {
    const word = words[wordIdx % words.length];
    return (
      <div style={{ padding: "24px 20px 120px" }}>
        <Header title="🔤 Sight Words" onBack={() => setMode(null)}
          right={<span style={{ fontFamily: T.font, fontSize: 14, color: T.soft }}>{wordIdx + 1}/{words.length}</span>} />
        <ProgressBar value={wordIdx + 1} max={words.length} color={T.blue} h={6} />
        <Card style={{ textAlign: "center", padding: 48, marginTop: 20, marginBottom: 20 }}>
          <div style={{ fontFamily: T.font, fontSize: 64, fontWeight: 800, color: T.text, letterSpacing: 4 }}>{word}</div>
        </Card>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 16 }}>
          <Btn color={T.blue} size="lg" onClick={() => speak(word, settings)}>🔊 Hear It</Btn>
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Btn color={T.soft} onClick={() => setWordIdx(i => Math.max(0, i - 1))} disabled={wordIdx === 0}>← Back</Btn>
          <Btn color={T.primary} onClick={() => setWordIdx(i => i + 1)}>Next →</Btn>
        </div>
      </div>
    );
  }

  // Stories mode
  const filteredStories = readingStories.filter(s => s.level <= maxLevel);
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
              if (c === q.a) { setScore(s => s + 1); speak("Correct!", settings); }
              else speak("Try again!", settings);
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
  const [level, setLevel] = useState(3); // 1-5 scale
  const [selectedCoping, setSelectedCoping] = useState(null);

  const emotionScale = [
    { level: 1, emoji: "😢", label: "Very Upset", color: "#FF4444" },
    { level: 2, emoji: "😟", label: "Upset", color: "#FF8844" },
    { level: 3, emoji: "😐", label: "Okay", color: "#F7B731" },
    { level: 4, emoji: "😊", label: "Good", color: "#4ECC7E" },
    { level: 5, emoji: "🤩", label: "Great!", color: "#4E8AE6" },
  ];

  const current = emotionScale.find(e => e.level === level);

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="🌡️ How I Feel" onBack={() => setScreen("home")} />

      {/* Emotion Meter */}
      <Card style={{ textAlign: "center", padding: 28, marginBottom: 20, background: `${current.color}10`, border: `2px solid ${current.color}25` }}>
        <div style={{ fontSize: 72, marginBottom: 8, transition: "all 0.3s ease" }}>{current.emoji}</div>
        <div style={{ fontFamily: T.font, fontSize: 24, fontWeight: 800, color: current.color }}>{current.label}</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 20 }}>
          {emotionScale.map(e => (
            <button key={e.level} onClick={() => { setLevel(e.level); speak(`I feel ${e.label.toLowerCase()}`, settings); }}
              style={{
                width: 52, height: 52, borderRadius: 16, border: `3px solid ${level === e.level ? e.color : T.border}`,
                background: level === e.level ? `${e.color}20` : T.surface,
                fontSize: 28, cursor: "pointer", transition: "all 0.2s ease",
                transform: level === e.level ? "scale(1.15)" : "scale(1)",
              }}>{e.emoji}</button>
          ))}
        </div>
      </Card>

      {/* Coping Strategies */}
      <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 14 }}>
        {level <= 2 ? "💡 Things That Can Help" : "🌟 Keep It Going!"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        {copingCards.slice(0, level <= 2 ? 8 : 6).map((card, i) => (
          <button key={i} onClick={() => { setSelectedCoping(card); speak(card.desc, settings); }}
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

  const today = new Date().toISOString().split("T")[0];
  const todayLog = progress.dailyLog[today] || {};

  return (
    <div style={{ padding: "24px 20px 120px" }}>
      <Header title="👨‍👩‍👧 Parent Dashboard" onBack={() => setScreen("settings")} />

      <Card style={{ marginBottom: 16, background: "linear-gradient(135deg, #4E8AE6 0%, #7BA8F0 100%)", color: "#fff", padding: 22 }}>
        <div style={{ fontFamily: T.font, fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Overview</div>
        <div style={{ fontFamily: T.fontAlt, fontSize: 13, opacity: 0.85 }}>
          {settings.ageRange ? `${ageRanges.find(a => a.id === settings.ageRange)?.label} Mode` : "No age set"} · {progress.streak} day streak
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
        <button key={item.id} onClick={() => setScreen(item.id)} style={{
          background: "none", border: "none", display: "flex", flexDirection: "column",
          alignItems: "center", gap: 2, padding: "8px 14px", cursor: "pointer",
          opacity: activeId === item.id ? 1 : 0.4,
          transform: activeId === item.id ? "scale(1.12)" : "scale(1)",
          transition: "all 0.15s ease",
        }}>
          <span style={{ fontSize: 22 }}>{item.emoji}</span>
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

  // Apply dark mode theme
  T = settings.darkMode ? darkTheme : lightTheme;

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
        dailyLog: { ...prev.dailyLog, [today]: { ...(prev.dailyLog?.[today] || {}), ...patch } },
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

  // Show onboarding if no age range selected
  if (!settings.ageRange) {
    return (
      <AppContext.Provider value={{ settings, updateSettings, progress, addProgress }}>
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
    focus: <FocusScreen setScreen={setScreen} />,
    calm: <CalmScreen setScreen={setScreen} />,
    habits: <HabitsScreen setScreen={setScreen} />,
    settings: <SettingsScreen setScreen={setScreen} />,
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
  `;

  return (
    <AppContext.Provider value={{ settings, updateSettings, progress, addProgress }}>
      <div style={{
        background: T.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto",
        fontFamily: T.fontAlt, color: T.text, position: "relative", WebkitFontSmoothing: "antialiased",
      }}>
        <style>{globalCSS}</style>
        <div key={screen} className="page-enter">
          {screens[screen] || <HomeScreen setScreen={setScreen} />}
        </div>
        <BottomNav screen={screen} setScreen={setScreen} />
      </div>
    </AppContext.Provider>
  );
}
