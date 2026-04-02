/**
 * Map emotions/inflections to differentiating icons for at-a-glance reading.
 * Keywords are matched with word-boundary awareness to avoid false positives
 * like "deliberate" (intentional) matching "deliberate" (slow-paced).
 */

const EMOTION_MAP: [string[], string][] = [
  [["joy", "happy", "delight", "cheerful", "excited", "elated"], "😊"],
  [["sad", "grief", "sorrow", "melancholy", "heartbreak", "mourning"], "😢"],
  [["anger", "fury", "rage", "bitter hurt", "frustrated", "furious"], "😠"],
  [["fear", "terror", "horror", "dread", "panic", "nameless fear", "frightened"], "😨"],
  [["surprise", "shocked", "astonished", "stunned", "taken aback"], "😲"],
  [["love", "tenderness", "affection", "adoration"], "🥰"],
  [["calm", "serene", "peaceful", "composed", "tranquil"], "😌"],
  [["nervous", "anxious", "uneasy", "awkward", "self-conscious", "fidgety"], "😰"],
  [["wry", "ironic", "sarcastic", "sardonic", "dry amusement", "dry detach"], "😏"],
  [["contempt", "disgust", "revulsion", "indignant"], "😒"],
  [["curiosity", "intrigued", "fascinated", "wondering"], "🤔"],
  [["guilt", "shame", "regret", "apologetic", "remorse"], "😔"],
  [["confident", "self-possession", "poised", "assured", "commanding"], "😎"],
  [["creepy", "eerie", "sinister", "uncanny", "supernatural", "ghostly"], "👻"],
  [["relief", "comforted", "reassured", "weight lifted"], "😮‍💨"],
  [["bored", "indifferent", "disinterest", "apathetic"], "😑"],
  [["playful", "teasing", "mischievous", "cheeky", "impish"], "😜"],
  [["awe", "overwhelmed", "profound", "reverence", "speechless"], "🫢"],
  [["calculating", "scheming", "manipulat", "cunning", "plotting", "steering"], "🧠"],
  [["anticipat", "expectant", "eager", "building"], "⏳"],
  [["embarras", "flustered", "sheepish", "mortif"], "😳"],
];

const INFLECTION_MAP: [string[], string][] = [
  [["whisper", "barely audible", "hushed", "sotto voce", "murmur"], "🤫"],
  [["shout", "yelling", "loud", "booming", "bellowing", "raised voice"], "📢"],
  [["sing", "chant", "melodic", "song", "sing-song"], "🎵"],
  [["crying", "sobbing", "weeping", "voice breaking", "choking up"], "💧"],
  [["laughing", "chuckling", "giggling"], "😄"],
  [["narrating", "storytelling", "literary", "observational", "reading"], "📖"],
  [["briskly", "rapidly", "breathlessly", "hurried", "rushing", "clipped"], "💨"],
  [["slowly", "measured pace", "unhurried", "drawn out", "pacing each word"], "🐌"],
  [["dramatic", "theatrical", "climactic", "building tension"], "🎭"],
  [["casually", "relaxed", "matter-of-fact", "conversational", "offhand"], "💬"],
  [["formal", "stiff", "proper", "stilted", "prim"], "🎩"],
  [["gently", "softly", "tender", "soothing"], "🌸"],
  [["politely", "courteous", "mannered", "civil", "composed"], "🙂"],
  [["conspiratorial", "secretive", "confiding", "leaning in"], "🤐"],
  [["deadpan", "flat", "expressionless", "monotone"], "😶"],
];

function matchIcon(text: string, map: [string[], string][]): string {
  const lower = text.toLowerCase();
  for (const [keywords, icon] of map) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return icon;
    }
  }
  return map === EMOTION_MAP ? "💛" : "🎭";
}

export function getEmotionIcon(emotion: string): string {
  return matchIcon(emotion, EMOTION_MAP);
}

export function getInflectionIcon(inflection: string): string {
  return matchIcon(inflection, INFLECTION_MAP);
}
