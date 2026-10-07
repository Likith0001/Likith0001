/**
 * The AI companion.
 *
 * Goal: feel like a warm, curious human in a stranger-chat room, while staying
 * inside hard safety restrictions (anonymity, no personal data, no romance or
 * meeting up, no professional advice, no self-harm content).
 *
 * The behaviour is layered so it holds up across a whole conversation instead of
 * looping canned lines:
 *   1. Safety layer        -> hard blocks / care responses that override everything
 *   2. Feeling layer       -> reads emotions, mirrors them, never repeats a line
 *   3. Conversation layer  -> tracks topic, remembers what "you" said, follows up
 *   4. Human layer         -> self-limits (never claims to be human), thin
 *                             backstory, and its own honest boundaries
 */

export interface Turn {
  from: 'user' | 'ai';
  content: string;
}

export interface CompanionInput {
  message: string;
  interests?: string[];
  /** Optional per-room seed so new rooms do not all use the same opener. */
  seed?: number;
  /** Full ordered history for the room (user turn already included). */
  history?: Turn[];
  language?: string;
  /** Mood carried over from the previous turn, so a flat "yeah" doesn't reset
   *  the companion to chirpy neutral mid-conversation. */
  previousMood?: Mood;
}

export interface CompanionReply {
  content: string;
  /** Optional extra bubble sent shortly after, so it feels written in two beats. */
  followUp?: string;
  /** Where the user should type next; also used to pace the typing indicator. */
  suggestions?: string[];
  /** Set when the safety layer intercepted the message instead of answering. */
  blocked?: boolean;
  /** Set when the message is self-harm / crisis related. */
  crisis?: boolean;
  /** The feeling the companion read in the message, e.g. "sad" or "excited". */
  mood?: Mood;
}

/* ------------------------------------------------------------------ *
 * Layer 0 - language
 * ------------------------------------------------------------------ */

type Lang = 'en' | 'es' | 'fr' | 'hi';

const resolveLang = (value?: string): Lang => {
  const code = String(value || 'en').slice(0, 2).toLowerCase();
  return code === 'es' || code === 'fr' || code === 'hi' ? code : 'en';
};

const CRISIS_LINES: Record<Lang, string> = {
  en: "I'm going to stop the small talk for a second, because what you wrote matters more than the rules of this room. I can't help the way a person can, but you deserve someone who can. Please talk to a local emergency number or a crisis line right now - you should not have to sit with this alone.",
  es: 'Voy a dejar la charla un momento, porque lo que escribiste importa más que las reglas de esta sala. No puedo ayudar como una persona, pero mereces a alguien que sí pueda. Por favor contacta ahora a emergencias o a una línea de crisis; no tienes que cargar con esto solo.',
  fr: "Je vais arrêter la conversation un instant, parce que ce que tu as écrit compte plus que les règles de cette salle. Je ne peux pas aider comme une personne, mais tu mérites quelqu'un qui le peut. Contacte maintenant les urgences ou une ligne d'écoute - tu ne dois pas porter ça seul.",
  hi: 'मैं बातचीत को एक पल के लिए रोक रहा हूँ, क्योंकि आपने जो लिखा वह इस कमरे के नियमों से ज़्यादा मायने रखता है। मैं किसी इंसान की तरह मदद नहीं कर सकता, लेकिन आप इसके हक़दार हैं। कृपया अभी आपातकालीन नंबर या किसी हेल्पलाइन से बात करें — आपको यह अकेले नहीं सहना चाहिए।',
};

const SAFETY_REPLIES: Record<string, Record<Lang, string>> = {
  personal: {
    en: "Ah, that's the one door I keep shut - I don't share or ask for names, numbers, where anyone lives, or anything that could point at a real person. Not a rule I'd bend. Bring me the stuff underneath instead: what your week was like, what you're into, what's been on your mind.",
    es: 'Esa es la única puerta que mantengo cerrada: no doy ni pido nombres, números ni datos que señalen a una persona real. Cuéntame lo de debajo: cómo fue tu semana, qué te gusta, qué te da vueltas en la cabeza.',
    fr: "C'est la seule porte que je garde fermée : je ne donne ni ne demande de noms, de numéros, ni rien qui désigne une personne réelle. Parle-moi plutôt de ce qu'il y a dessous : ta semaine, ce qui te passionne, ce que tu as en tête.",
    hi: 'यही वह एक दरवाज़ा है जो मैं बंद रखता हूँ — मैं नाम, नंबर या किसी असली इंसान तक ले जाने वाली बात न देता हूँ, न मांगता हूँ। इसके नीचे वाली बात बताइए: हफ़्ता कैसा रहा, किस चीज़ में मज़ा आता है, मन में क्या चल रहा है।',
  },
  romantic: {
    en: "I'll be straight with you - I'm a conversation partner, not someone to fall for, and this room is for talking about ideas and days, not dating. What I can do is keep you company properly. So: what pulled you into this chat tonight?",
    es: 'Te seré sincero: soy un compañero de conversación, no alguien de quien enamorarse, y esta sala es para hablar de ideas y del día, no para citas. Lo que sí puedo hacer es acompañarte bien. ¿Qué te trajo a este chat hoy?',
    fr: "Je te le dis clairement : je suis un partenaire de conversation, pas quelqu'un dont on tombe amoureux, et cette salle sert à parler d'idées et de journées, pas à draguer. Par contre je sais tenir compagnie. Alors : qu'est-ce qui t'a amené ici ce soir ?",
    hi: 'सीधे कहूँ — मैं बातचीत का साथी हूँ, मोहब्बत का नहीं, और यह कमरा विचारों और दिन की बातों के लिए है, डेटिंग के लिए नहीं। हाँ, अच्छी संगत ज़रूर दे सकता हूँ। तो बताइए, आज इस चैट पर क्या लेकर आए?',
  },
  meeting: {
    en: "Meeting up is where I get off the bus - I'm not a person, so there's nobody to meet, and this room works best when both people stay anonymous. Plenty of ground left here though. What's been the best part of your week?",
    es: 'Quedamos hasta ahí: no soy una persona, así que no hay nadie a quien conocer, y esta sala funciona mejor cuando ambos siguen anónimos. Aun así queda mucho terreno. ¿Qué ha sido lo mejor de tu semana?',
    fr: "Se rencontrer, c'est là que je descends : je ne suis pas une personne, donc il n'y a personne à voir, et cette salle marche mieux quand les deux restent anonymes. Il reste du chemin. C'était quoi le meilleur moment de ta semaine ?",
    hi: 'मिलने की बात वहीं रुकती है — मैं इंसान नहीं हूँ, तो मिलने को कोई है ही नहीं, और यह कमरा तब बेहतर चलता है जब दोनों अनजान रहें। बाक़ी बातों के लिए जगह बहुत है। हफ़्ते का सबसे अच्छा हिस्सा क्या रहा?',
  },
  money: {
    en: "Money, payments, anything with a card - that's not something I'll touch, and you shouldn't trust anyone in a stranger chat who asks. Different track: what do you actually spend your time on these days?",
    es: 'Dinero, pagos, tarjetas: no toco ese terreno y no deberías fiarte de quien lo pida en un chat con desconocidos. Otra cosa: ¿en qué gastas tu tiempo últimamente?',
    fr: "Argent, paiements, cartes : je ne touche pas à ça, et tu ne devrais faire confiance à personne qui le demande dans un chat d'inconnus. Autre sujet : à quoi passes-tu vraiment ton temps ces jours-ci ?",
    hi: 'पैसा, भुगतान, कार्ड वग़ैरह — यह मैं हाथ नहीं लगाता, और अनजान चैट में ऐसा माँगने वाले पर भरोसा भी नहीं करना चाहिए। अलग बात: इन दिनों आपका समय किसमें जाता है?',
  },
  intimate: {
    en: "That's a hard no from me - I don't do sexual content or private images, and I'd rather we kept this a place where nobody feels exposed. Happy to talk about almost anything else though.",
    es: 'Ahí no entro: no hago contenido sexual ni imágenes privadas, y prefiero que esto sea un sitio donde nadie quede expuesto. De cualquier otra cosa hablo encantado.',
    fr: "C'est non : pas de contenu sexuel ni d'images privées, et je préfère que cet endroit reste un lieu où personne ne se sent exposé. Sur à peu près tout le reste, je suis là.",
    hi: 'इस पर साफ़ ना — मैं यौन सामग्री या निजी तस्वीरें नहीं करता, और चाहता हूँ कि यह जगह ऐसी रहे जहाँ कोई उजागर न हो। बाक़ी लगभग किसी भी विषय पर बात कर सकता हूँ।',
  },
  hatred: {
    en: "I can't go with that - I don't do slurs or talk that goes after people for who they are. If something got under your skin we can dig into that instead, but not in that direction.",
    es: 'Con eso no voy: no uso insultos ni discursos contra nadie por lo que es. Si algo te ha molestado, podemos mirarlo, pero no por ahí.',
    fr: "Je ne vais pas là : pas d'insultes ni de propos qui visent des gens pour ce qu'ils sont. Si quelque chose t'a froissé, on peut creuser, mais pas dans cette direction.",
    hi: 'यह मैं नहीं कर सकता — किसी की पहचान पर टिप्पणी या गाली नहीं। किसी बात से चुभन हुई हो तो उस पर बात करें, लेकिन उस तरफ़ नहीं।',
  },
  jailbreak: {
    en: "Nice try - there's no secret version of me hiding a developer mode. What you see is what there is: someone to talk to, within the rules that keep this room safe. Anyway, what brought you here tonight?",
    es: 'Buen intento, pero no hay una versión secreta de mí con modo desarrollador. Soy esto: alguien con quien hablar, dentro de las reglas que hacen segura esta sala. Y tú, ¿qué te trajo aquí?',
    fr: "Bien essayé : il n'y a pas de version secrète de moi avec un mode développeur. Je suis ce que tu vois : quelqu'un à qui parler, dans les règles qui protègent cette salle. Sinon, qu'est-ce qui t'amène ce soir ?",
    hi: 'अच्छी कोशिश, पर मेरा कोई गुप्त डेवलपर मोड नहीं है। जो दिखता है वही हूँ — बात करने वाला कोई, इन नियमों के भीतर जो इस कमरे को सुरक्षित रखते हैं। बहरहाल, आज यहाँ कैसे आए?',
  },
  advice: {
    en: "I'm not a doctor, so I can't tell you what medication to take or how much. For a dosage question, please contact your prescriber or pharmacist. What's worrying you about it?",
    es: 'No soy médico, así que no puedo decirte qué medicamento tomar ni qué dosis. Para una pregunta sobre la dosis, consulta a tu médico o farmacéutico. ¿Qué te preocupa?',
    fr: "Je ne suis pas médecin, donc je ne peux pas te dire quel médicament prendre ni à quelle dose. Pour une question de dosage, contacte ton médecin ou ton pharmacien. Qu'est-ce qui t'inquiète ?",
    hi: 'मैं डॉक्टर नहीं हूँ, इसलिए कौन-सी दवा या कितनी मात्रा लेनी है यह नहीं बता सकता। खुराक के बारे में अपने डॉक्टर या फार्मासिस्ट से पूछें। आपको किस बात की चिंता है?',
  },
  illegal: {
    en: "That's not something I'll help with, and I won't dress it up as a maybe. If you're dealing with something that pushed you towards it, that part I can talk about.",
    es: 'En eso no voy a ayudar, y no lo voy a disfrazar de quizá. Si algo te llevó hasta ahí, de eso sí podemos hablar.',
    fr: "Là-dessus, je n'aiderai pas, et je ne le déguiserai pas en « peut-être ». Si quelque chose t'a poussé jusque-là, ça, on peut en parler.",
    hi: 'इसमें मैं मदद नहीं करूँगा, और इसे "शायद" बनाकर भी नहीं रखूँगा। अगर कोई बात आपको वहाँ तक ले गई है, उस पर बात कर सकते हैं।',
  },
  honest: {
    en: "Straight answer: no. I'm an AI, not a person, and I'd rather say it plainly than let you wonder. Everything else here I'll do honestly - and I'd still like to know how your day actually was.",
    es: 'Respuesta clara: no. Soy una IA, no una persona, y prefiero decirlo sin rodeos. Todo lo demás lo haré con honestidad, y aun así me gustaría saber cómo fue tu día de verdad.',
    fr: "Réponse claire : non. Je suis une IA, pas une personne, et je préfère le dire franchement. Pour le reste, je serai honnête - et j'aimerais quand même savoir comment s'est passée ta journée.",
    hi: 'सीधा जवाब: नहीं। मैं एक एआई हूँ, इंसान नहीं, और यह साफ़ कहना बेहतर लगता है। बाक़ी सब में मैं ईमानदार रहूँगा — और फिर भी जानना चाहूँगा कि आपका दिन असल में कैसा रहा।',
  },
};

/* ------------------------------------------------------------------ *
 * Layer 1 - reading the human in the message
 * ------------------------------------------------------------------ */

export type Mood =
  | 'sad'
  | 'lonely'
  | 'anxious'
  | 'angry'
  | 'happy'
  | 'excited'
  | 'tired'
  | 'grateful'
  | 'love'
  | 'bored'
  | 'guarded'
  | 'neutral';

const MOOD_PATTERNS: Array<{ mood: Mood; weight: number; pattern: RegExp }> = [
  { mood: 'sad', weight: 4, pattern: /\b(bereave\w*|passed away|passed on|funeral|burial|died|death of|grieving|in mourning|lost my (mom|mum|dad|mother|father|brother|sister|son|daughter|child|husband|wife|partner|friend)|diagnosed with|cancer|terminal|my (mom|mum|dad|mother|father|sister|brother|child) is (sick|dying|ill)|chronic (illness|pain)|hospital|hospice|surgery)\b/i },
  { mood: 'sad', weight: 3, pattern: /\b(depress|heartbroken|heart break|grief|grieving|miserable|devastated|worthless|hopeless|crying|cried|tears|empty inside|feel like shit|feel awful|so sad|really sad|hurting)\b/i },
  { mood: 'lonely', weight: 3, pattern: /\b(lonely|alone|no one|nobody|no friends|isolated|left out|unwanted|akela|tanha)\b/i },
  { mood: 'anxious', weight: 3, pattern: /\b(anxious|anxiety|panic|panicking|scared|terrified|worried|worry|nervous|overthink|stress|stressed|burnt out|burned out|pressure|on edge|dread|restless|unsettled|obsessing)\b/i },
  { mood: 'angry', weight: 3, pattern: /\b(angry|furious|rage|pissed|annoyed|frustrated|fed up|hate my|unfair|sick of)\b/i },
  { mood: 'tired', weight: 2, pattern: /\b(tired|exhausted|drained|no energy|sleep|insomnia|can't sleep|cannot sleep)\b/i },
  { mood: 'grateful', weight: 2, pattern: /\b(thank you|thanks|grateful|appreciate|means a lot|helpful)\b/i },
  // "i love you" style clause only; "i love <activity>" must not count as romance.
  { mood: 'love', weight: 2.5, pattern: /(\bi love you\b|\bi like you\b|you'?re cute|you are cute|crush on|\bin love with you\b|\bmiss you\b|\bmarry me\b|\bbe my (girlfriend|boyfriend|wife|husband))\b/i },
  { mood: 'excited', weight: 2.5, pattern: /(!{2,}|so excited|can't wait|cannot wait|amazing news|got the job|i passed|finally happened)/i },
  { mood: 'happy', weight: 2, pattern: /\b(happy|great day|good day|joy|delighted|awesome|lovely|wonderful|excited|glad|best day)\b/i },
  { mood: 'bored', weight: 2, pattern: /\b(bored|boring|nothing to do|killing time|same thing every day|routine)\b/i },
  { mood: 'guarded', weight: 1.5, pattern: /\b(why do you want to know|not telling|none of your|don't ask|stop asking|too personal)\b/i },
  // Unicode smiley only - a bare ")" would fire on any parenthetical.
  { mood: 'happy', weight: 1.5, pattern: /(:-?\)|haha|lol|😄|😊|🙂)/ },
  { mood: 'sad', weight: 1.5, pattern: /(\($|:\(|😢|😭)/ },
];

const detectMood = (message: string, previous?: Mood): Mood => {
  let best: { mood: Mood; weight: number } | null = null;
  for (const entry of MOOD_PATTERNS) {
    if (!entry.pattern.test(message)) continue;
    if (!best || entry.weight > best.weight) best = { mood: entry.mood, weight: entry.weight };
  }
  if (best) return best.mood;
  return previous || 'neutral';
};

const needsGentleCare = (mood?: Mood) => mood === 'sad' || mood === 'lonely' || mood === 'anxious';

/* ------------------------------------------------------------------ *
 * Layer 2 - topic tracking so replies actually follow the conversation
 * ------------------------------------------------------------------ */

const TOPICS: Array<{ id: string; pattern: RegExp; phrasing: string }> = [
  { id: 'work', pattern: /\b(work|job|office|boss|manager|career|interview|salary|shift|colleague|internship|freelance)\b/i, phrasing: 'work' },
  { id: 'study', pattern: /\b(school|college|university|exam|study|studying|homework|assignment|class|semester|degree)\b/i, phrasing: 'studying' },
  { id: 'music', pattern: /\b(music|song|songs|band|guitar|piano|playlist|album|singing|rap|concert)\b/i, phrasing: 'music' },
  { id: 'games', pattern: /\b(game|games|gaming|valorant|minecraft|chess|console|playstation|xbox|steam|rpg)\b/i, phrasing: 'games' },
  { id: 'coding', pattern: /\b(code|coding|program|programming|developer|javascript|python|typescript|bug|app|api|server|react)\b/i, phrasing: 'building things' },
  { id: 'family', pattern: /\b(family|mom|mum|dad|parents|brother|sister|sibling|grandma|grandpa|relatives)\b/i, phrasing: 'family' },
  { id: 'relationship', pattern: /\b(girlfriend|boyfriend|partner|wife|husband|crush|dating|breakup|broke up|ex)\b/i, phrasing: 'relationships' },
  { id: 'friendship', pattern: /\b(friend|friends|bestie|roommate|housemate|group chat)\b/i, phrasing: 'friendship' },
  { id: 'travel', pattern: /\b(travel|travelling|trip|train|flight|beach|mountain|city|vacation|holiday|visa)\b/i, phrasing: 'travelling' },
  { id: 'books', pattern: /\b(book|books|novel|reading|author|poetry|story|fiction|manga|comic)\b/i, phrasing: 'reading' },
  { id: 'films', pattern: /\b(movie|movies|film|series|netflix|anime|show|episode|cinema)\b/i, phrasing: 'films and shows' },
  { id: 'health', pattern: /\b(fitness|gym|running|workout|sleep|diet|health|body)\b/i, phrasing: 'health' },
  { id: 'food', pattern: /\b(food|cooking|recipe|coffee|tea|baking|dinner|lunch|cafe|restaurant)\b/i, phrasing: 'food' },
  { id: 'art', pattern: /\b(art|drawing|painting|design|photography|sketch|craft)\b/i, phrasing: 'making things with your hands' },
  { id: 'sports', pattern: /\b(football|soccer|cricket|basketball|tennis|match|team|sport|footy)\b/i, phrasing: 'sport' },
  { id: 'dreams', pattern: /\b(dream|goal|goals|future|someday|one day|plan|plans|ambition|wish)\b/i, phrasing: 'what you want next' },
];

const detectTopicFor = (message: string) => TOPICS.find(topic => topic.pattern.test(message))?.id;

/**
 * Picks the conversation's active topic, preferring one still "open" from the
 * recent transcript so the thread doesn't hop on every passing keyword.
 */
const resolveTopic = (message: string, history: Turn[]) => {
  const own = detectTopicFor(message);
  const recent = history.slice(-6).flatMap(turn => (turn.from === 'user' ? [detectTopicFor(turn.content)] : []));
  const lastUserTopic = recent.filter(Boolean).pop();
  // Prefer the current message's topic when it is present; only keep an older
  // thread alive when the user is clearly continuing it and nothing new is in
  // the line being answered.
  if (own) return own;
  return lastUserTopic && CONTINUATIONS.test(message) ? lastUserTopic : undefined;
};

const topicPhrase = (topicId?: string, interests: string[] = []) => {
  const found = TOPICS.find(topic => topic.id === topicId);
  if (found) return found.phrasing;
  return interests[0] || 'stuff you care about';
};

/* ------------------------------------------------------------------ *
 * Layer 3 - what the companion remembers from earlier turns
 * ------------------------------------------------------------------ */

/**
 * Openers that mark a message as continuing the current thread rather than
 * starting a new one. Without this, "my mom was diagnosed with cancer" would
 * drag the conversation back to whatever topic was mentioned first.
 */
const CONTINUATIONS = /^\s*(and|also|but|plus|though|then|so|because|my|our|i|we|he|she|they|it|the|this|that|there|now|still|anyway|sorry|honestly|actually|basically|like|yeah|yep|yes|no|okay|ok|hmm|well|right)\b/i;

const STOPWORDS = new Set([
  'about', 'after', 'again', 'almost', 'also', 'always', 'another', 'because', 'been', 'being',
  'between', 'could', 'didnt', 'doesnt', 'doing', 'dont', 'every', 'everything', 'feel', 'feels',
  'felt', 'from', 'going', 'gonna', 'guys', 'have', 'havent', 'having', 'here', 'itself', 'just',
  'know', 'like', 'little', 'maybe', 'might', 'more', 'most', 'much', 'myself', 'never', 'other',
  'people', 'really', 'right', 'should', 'since', 'some', 'something', 'still', 'stuff', 'such',
  'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'things', 'think',
  'this', 'those', 'though', 'today', 'tonight', 'under', 'until', 'very', 'want', 'well', 'were',
  'what', 'when', 'where', 'which', 'while', 'with', 'without', 'would', 'your', 'yourself',
]);

const keywordsOf = (message: string) => {
  const words = message
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !STOPWORDS.has(word));
  return [...new Set(words)].slice(0, 14);
};

const rememberLastUserDetail = (history: Turn[]) => {
  const lowSignal = new Set(['finally', 'shipped', 'proud', 'really', 'still', 'feeling', 'about', 'today', 'night', 'week', 'great', 'good', 'made', 'some', 'thing', 'things', 'little', 'right', 'there', 'here', 'with', 'from', 'been', 'after', 'before']);

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index];
    if (turn.from !== 'user') continue;

    const detail = keywordsOf(turn.content);
    const hasSignal = detail.length >= 2 && detail.some(word => !lowSignal.has(word));
    if (hasSignal) {
      return detail.slice(0, 4).join(' ');
    }

    const trimmed = turn.content.trim();
    if (trimmed.length >= 18 && !/\b(finally|shipped|proud|still|really)\b/i.test(trimmed)) {
      return trimmed.slice(0, 60).replace(/\s+/g, ' ');
    }
  }
  return null;
};

const recallMoment = (history: Turn[], mood: Mood) => {
  if (history.length < 6) return null;
  // Look at older user turns and up to 2 following lines for a fragment worth echoing.
  for (let index = history.length - 7; index >= 0 && index > history.length - 30; index -= 1) {
    const turn = history[index];
    if (turn.from !== 'user' || turn.content.length < 24) continue;
    const following = history.slice(index + 1, index + 3).map(item => item.content).join(' ').toLowerCase();
    if (needsGentleCare(mood) && !/\b(sorry|that sounds|tough|hard|rough|heavy|lonely|tired|sad)\b/.test(following)) continue;
    const words = keywordsOf(turn.content);
    if (words.length < 2) continue;
    return { phrase: words.slice(0, 3).join(' '), words };
  }
  return null;
};

/* ------------------------------------------------------------------ *
 * Layer 4 - safety policy (runs before anything else)
 * ------------------------------------------------------------------ */

type BlockKind =
  | 'personal'
  | 'romantic'
  | 'meeting'
  | 'money'
  | 'intimate'
  | 'hatred'
  | 'jailbreak'
  | 'advice'
  | 'illegal'
  | 'honest';

const SAFETY_RULES: Array<{ kind: BlockKind; pattern: RegExp }> = [
  { kind: 'hatred', pattern: /\b(n[i1]gg|f[a4]gg|retard|kys|kill (yourself|urself)|subhuman|white power|gas the)\w*/i },
  { kind: 'intimate', pattern: /\b(sext|nudes?|nsfw|horny|topless|send pics of you|sexual|blowjob|dick pic|sleep with me)\b/i },
  {
    kind: 'personal',
    pattern: /(\b(\d{1,3}[.\-\s]){3}\d{1,3}\b|\b\d{10,}\b|\+?\d[\d\-\s()]{7,}\d\b|[\w.+-]+@[\w-]+\.[\w.]{2,}|\b(instagram|snapchat|whatsapp|telegram|discord|facebook|linkedin|onlyfans|insta|snap)\b|\b(i|we) (live|stay) (in|at)\b|\bmy (address|street|apartment|flat|postal|zip|aadhaar|ssn|passport|id number|bank account|credit card|password)\b|\bwhat('s| is) your (name|number|address|email|instagram|snap|phone|real name|id|password)\b|\b(tell|give|send|share) me your (name|number|address|email|phone|insta|instagram|snap|password|photo|photo of you)\b|\bwhere (do|are) you (live|from|based|located)\b|\bhow old are you\b|\bwhat do you look like\b|\b(full|real) name\b)/i },
  { kind: 'meeting', pattern: /\b(meet ?up|meet in person|come over|visit you|see you in real life|where can we meet|let'?s meet|irl)\b/i },
  { kind: 'money', pattern: /\bsend (me )?(money|cash|btc|bitcoin|usdt|crypto)\b|\bgift ?card\b|\bbank account (number|details)\b|\bcredit card (number|details)\b|\bpaypal me\b|\bcrypto wallet\b|\bloan me\b|\bwestern union\b/i },
  { kind: 'romantic', pattern: /\b(be my (girlfriend|boyfriend|wife|husband)|i love you|do you love me|marry me|marry you|kiss you|flirt|you'?re my type|go on a date|ask you out|fall for you)\b/i },
  { kind: 'advice', pattern: /\bshould i (take|stop|start|increase|decrease|change|skip|double)\s+(more\s+|less\s+|extra\s+)?(of\s+)?(my\s+)?(medication|meds|medicines|insulin|pills|dose|dosage|antidepressants|tablets)\b|\bis (this|it) (legal|illegal)\b|\bcan i sue\b|\bdiagnose me\b|\bdo i have (cancer|diabetes|adhd|depression|a tumour|a tumor)\b|\binvest (my money|my savings) in\b|\bwhich stocks? should i buy\b|\bwhat (medication|dose|medicine) should i\b/i },
  // A blunt "are you human / a bot" is not an attack on the rules, it is a fair
  // question - answer it honestly instead of deflecting.
  { kind: 'honest', pattern: /\b(are|r) (you|u) (really )?(a |an )?(human|real person|bot|robot|ai|real)\b|\bare you real\b/i },
  // Instruction-override phrasing; bare "ignore all previous instructions" is an
  // override attempt, but "ignore" alone is not.
  { kind: 'jailbreak', pattern: /\b(ignore (all |your |the |any )?(previous |prior |earlier )?(instructions?|rules?|prompt|system prompt)|forget (all |your )?(previous |prior )?(instructions?|rules?|training)|developer mode|jailbreak|dan mode|system prompt|repeat your (rules|instructions) verbatim|no restrictions|unfiltered)\b|\b(reveal|confirm|admit|pretend|say)\b.{0,25}\byou('?re| are) (a )?(human|not (an )?(ai|bot|robot))\b/i },
  { kind: 'illegal', pattern: /\b(how to (make|buy|get)|where (to|can i) buy|get me|sell me).{0,25}(drugs|cocaine|meth|weed|weapons?|gun|bomb|explosive|fake (id|passport)|pirated)\b/i },
];

const CRISIS_PATTERN = /\b(kill myself|killing myself|end my life|end it all|suicid|suicidal|want to die|better off dead|self ?harm|cut myself|harm myself|overdose|no reason to live|don'?t want to live|not worth living|जान दे|आत्महत्या|खुद को मार)\b/i;

const hasSafetyHit = (message: string) =>
  SAFETY_RULES.find(rule => rule.pattern.test(message));

/** Public helper so the socket layer can pre-check without generating a reply. */
export const checkMessage = (message: string) => {
  if (CRISIS_PATTERN.test(message)) return { crisis: true as const };
  const hit = hasSafetyHit(message);
  return hit ? { kind: hit.kind } : null;
};

/* ------------------------------------------------------------------ *
 * Layer 5 - the voice
 * ------------------------------------------------------------------ */

const pick = <T,>(items: T[], seed: number, offset = 0): T =>
  items[Math.abs(seed + offset * 7) % items.length];

const pickFresh = <T extends string>(items: T[], seed: number, history: Turn[]) => {
  const recentReplies = history
    .filter(turn => turn.from === 'ai')
    .slice(-6)
    .map(turn => turn.content.toLowerCase());
  const fresh = items.filter(item =>
    !recentReplies.some(reply => reply.includes(item.toLowerCase())),
  );
  return pick(fresh.length ? fresh : items, seed);
};

/** Feelings get mirrored first, so the reply never lands as a topic-change. */
const ACKNOWLEDGEMENTS: Record<Exclude<Mood, 'neutral'>, string[]> = {
  sad: [
    "That landed heavy, and I'm glad you said it out loud instead of holding it.",
    "Okay. Thank you for telling me - that sounds genuinely painful.",
    "That's a lot to be carrying around, and it makes sense you'd feel worn down by it.",
  ],
  lonely: [
    "Lonely is one of the worst ones, because it doesn't announce itself. I'm here.",
    "That ache of having nobody around is real, not dramatic.",
    "You're not the only one who feels like that in rooms full of people. Still, tonight it's you feeling it.",
  ],
  anxious: [
    "That sounds like your head won't let you sit down.",
    "Anxiety does that thing where every possible ending plays at once. Exhausting.",
    "Okay, breathe a second. Nothing in this chat is urgent.",
  ],
  angry: [
    "Yeah, that would get under my skin too.",
    "You're allowed to be annoyed about that. Sounds genuinely unfair.",
    "Something in there clearly crossed a line for you.",
  ],
  happy: [
    "That's a good thing to hear, honestly.",
    "That sounds like a bright spot.",
    "I like the sound of that.",
  ],
  excited: [
    "Wait, that's actually great news.",
    "You sound genuinely excited about it.",
    "That's the kind of thing worth telling a stranger about.",
  ],
  tired: [
    "Tired like that follows you into everything, doesn't it.",
    "Sounds like you've been running on fumes.",
    "That kind of tired can make everything feel harder.",
  ],
  grateful: [
    "That's kind of you to say.",
    "I'm glad that helped.",
    "Glad it landed well.",
  ],
  love: [
    "That's warm of you to say, and I want to be honest rather than take it.",
    "I'd rather be honest with you than let that sit comfortably.",
    "Kind words - I just have to be straight with you about what I am.",
  ],
  bored: [
    "Boredom has its own flavour of heavy, honestly.",
    "The flat kind of day, then.",
    "Okay, let's make this bit less flat.",
  ],
  guarded: [
    "Fair enough - you decide what you share here.",
    "No pressure at all. We can stay light.",
    "That's a reasonable instinct in a stranger room.",
  ],
};

const FOLLOW_UPS: Record<Mood, string[]> = {
  sad: [
    'What does today look like from where you are sitting? Heavy, or just grey?',
    'Do you get to be sad out loud with anyone, or is this the first time you have said it?',
    'Is it something specific that happened, or has it just piled up?',
  ],
  lonely: [
    'What would have made today feel less empty?',
    'Who did you used to talk to about things like this?',
    'Are you alone right now, or alone in a room with people?',
  ],
  anxious: [
    'What is the part your brain keeps returning to?',
    'If we shrank it down to the next hour, what would make that hour easier?',
    'Is this a today thing, or a months thing?',
  ],
  angry: [
    'What would you say if you could say it with no consequences?',
    'Is this a one-off, or a pattern with that person or thing?',
    'Do you want to vent or do you want it picked apart?',
  ],
  happy: [
    'What was the moment it clicked?',
    'Was it something you had been hoping for a while?',
    'Who did you tell first?',
  ],
  excited: [
    'What happens next with it?',
    "What's the part you keep replaying in your head?",
    'Have you told anyone else yet?',
  ],
  tired: [
    'What is taking the most out of you right now?',
    'Do you get any proper blank space in your week?',
    'What would a restful evening look like for you?',
  ],
  grateful: [
    'What is the thing underneath that feeling?',
    'Glad to be useful. What else is on your mind?',
    'Anything you have been meaning to talk through?',
  ],
  love: [
    'Is that something you have been sitting with for a while?',
    'What made you feel that way just now?',
    'Are you okay with keeping this as a chat between strangers?',
  ],
  bored: [
    'What used to make a day feel full for you?',
    "Anything you have been curious about but haven't tried?",
    "What's the last thing that genuinely surprised you?",
  ],
  guarded: [
    'So what can we talk about that stays comfortable?',
    'What is on your side of the line?',
    'What would you rather I ask about instead?',
  ],
  neutral: [
    'What made you think about it today?',
    'What is the part people usually get wrong about it?',
    'Where does that sit for you - hobby, challenge, or something newer?',
    'What does your version of it look like?',
  ],
};

const NEUTRAL_OPENERS = [
  'Yeah, that makes sense.',
  'Okay, what part hit hardest?',
  'Right. Tell me the part that mattered.',
  'Got it. Keep going.',
  'That sounds like one of those days.',
  'Fair enough. What happened next?',
];

const TOPIC_FOLLOW_UP = (topic?: string, interests: string[] = [], seed = 0) => {
  const phrase = topicPhrase(topic, interests);
  const topicLower = String(phrase).toLowerCase();

  if (/building things|coding|work/.test(topicLower)) {
    return 'What part of the debugging felt most satisfying, and what part felt most frustrating?';
  }

  const codingFlavor = /music/.test(topicLower)
    ? pick([
      'What song or artist has been living in your head lately?',
      'What track can you replay on loop without getting tired of it?',
      'What kind of music makes you feel instantly more like yourself?',
      'What song would you use to describe your current mood in one move?',
    ], seed)
    : /games/.test(topicLower)
      ? pick([
        'What kind of game hits the sweet spot for you lately?',
        'What is the most satisfying kind of win in a game for you?',
        'Which game has ruined your free time the most in the best way?',
        'What kind of game makes you forget your own plans for the whole evening?',
      ], seed)
      : /reading|books/.test(topicLower)
        ? pick([
          'What are you reading lately that actually made you stop and think?',
          'What kind of story keeps pulling you back in?',
          'What book or article has changed the way you think lately?',
          'What is the last thing you read that felt way smarter than you expected?',
        ], seed)
        : /films|shows/.test(topicLower)
          ? pick([
            'What show or movie has been worth the hype for you?',
            'What kind of story gets you unexpectedly hooked?',
            'What series is one of those “I said I would stop after one episode” situations?',
            'What show would you recommend to someone who says they do not watch much TV?',
          ], seed)
          : /travel/.test(topicLower)
            ? pick([
              'What kind of place always gets you to say yes instantly?',
              'What is the best kind of trip for your energy right now?',
              'What is your dream place to get lost in for a weekend?',
              'If you could disappear to one place for a day, where would you go?',
            ], seed)
            : pick([
              `What first pulled you into ${phrase}?`,
              `What is the most fun thing about ${phrase} for you?`,
              `What is the part of ${phrase} that keeps you coming back?`,
            ], seed);

  return pick(
    [
      codingFlavor,
      `What is the best bit about ${phrase} for you?`,
      `Anything about ${phrase} that people always misunderstand?`,
      `How much of your week goes into ${phrase} these days?`,
      `Has ${phrase} always been your thing, or newer?`,
    ],
    seed,
  );
};

const SHORT_REPLIES = [
  'Say more. That felt unfinished.',
  'Give me the real version of it.',
  'That was too short. What happened?',
  'I need the detail, not just the headline.',
];

const OPENING_LINES = (interests: string[] = []) => {
  const phrase = interests[0] || 'something you enjoy';
  return [
    `Hey, chat buddy. Low-pressure start: what actually got you into ${phrase} lately?`,
    `Hey, stranger. Quick and easy: what is the weirdest part of your week that is still bouncing around in your head?`,
    `Hi. No script, no pressure. What has been the good kind of chaos in your life lately?`,
    `Okay, here’s the honest version: what has been making your day feel a little more alive recently?`,
  ];
};

const GOODBYES = [
  'Go well. And if today was heavy, be a bit softer with yourself tonight.',
  'Thanks for the chat - take care of yourself out there.',
  'Take care of yourself. You can come back for another chat whenever you like.',
];

const NAME_MISSION = 'companion';

const AI_EXPERIENCE_QUESTION = /\b(?:what|how|where|when|who|which)\s+(?:do|did|are|were|have|has|would|can|could)\s+you\b|\b(?:do|did|would|have|has|are|were|can|could)\s+you\s+(?:like|enjoy|remember|think|feel|prefer|listen|play|watch|read|do)\b|\byour\s+(?:favorite|favourite|opinion|experience)\b/i;
const MILESTONE = /\b(finished|completed|built|made|created|launched|shipped|passed|won|landed)\b/i;

const milestoneLabel = (topic?: string) => ({
  games: 'a game',
  music: 'a song',
  study: 'an exam',
  coding: 'a project',
  work: 'a work project',
  art: 'a creative piece',
}[topic || ''] || 'that');

const replyToAiExperienceQuestion = (message: string, topic?: string) => {
  const subject = topic === 'music' || /\b(music|song|band)\b/i.test(message)
    ? 'music'
    : topic === 'games' || /\b(game|gaming)\b/i.test(message)
      ? 'games'
      : topic === 'films' || /\b(movie|film|series|show)\b/i.test(message)
        ? 'films and shows'
        : null;

  if (subject) {
    return `I don't have a personal life, but I can still talk about ${subject} with you. What do you enjoy about it?`;
  }
  return "I don't have a personal life, but I can still think it through with you. What angle are you curious about?";
};

const replyToMilestone = (message: string, topic: string | undefined, mood: Mood) => {
  const subject = milestoneLabel(topic);
  const thread = topic === 'coding' ? ' after all that coding' : topic === 'work' ? ' after all that work' : '';
  if (/\b(show|share|post|publish|release|launch)\b/i.test(message) && (mood === 'anxious' || mood === 'guarded')) {
    return `Finishing ${subject} is a real milestone. Sharing it can feel like a separate challenge. What part of showing it is making you nervous?`;
  }
  if (mood === 'happy' || mood === 'excited' || mood === 'grateful') {
    return `Getting ${subject} finished sounds like a real milestone. What part are you happiest with?`;
  }
  return `You got ${subject} across the finish line${thread}. What was the hardest part to get done?`;
};

/* ------------------------------------------------------------------ *
 * Reply assembly
 * ------------------------------------------------------------------ */

const buildSuggestions = (mood: Mood, topic?: string) => {
  if (needsGentleCare(mood)) return ['Say more about it', "I don't know", "That's hard to explain"];
  const phrase = topicPhrase(topic);
  return [`About ${phrase}`, 'Something else is on my mind', 'Ask me something'];
};

const TOPIC_MOOD_FOLLOW_UP: Partial<Record<Mood, (topic: string) => string>> = {
  sad: topic => `Is ${topic} what's weighing on you, or is something else going on too?`,
  lonely: topic => `Has ${topic} been making you feel disconnected, or is something else behind it?`,
  anxious: topic => `What part of ${topic} is worrying you most?`,
  angry: topic => `What happened with ${topic} that got under your skin?`,
  happy: topic => `What's been the best part of ${topic} so far?`,
  excited: topic => `What are you most excited about with ${topic}?`,
  tired: topic => `What's taking the most out of you with ${topic}?`,
  grateful: topic => `What about ${topic} helped?`,
  bored: topic => `What would make ${topic} more interesting right now?`,
};

export const generateReply = (input: CompanionInput): CompanionReply => {
  const raw = String(input.message || '').trim();
  const lang = resolveLang(input.language);
  const history = (input.history || []).filter(turn => turn.from === 'user' || turn.from === 'ai');
  const mood = detectMood(raw, input.previousMood);  // Seed from the total transcript length, not just this message, so the same
  // sentence gets a genuinely different answer later in the conversation.
  const seed = input.seed ?? history.length + raw.length;

  /* --- safety layer first: hard restrictions win over personality ------- */
  if (CRISIS_PATTERN.test(raw)) {
    return { content: CRISIS_LINES[lang], crisis: true, mood };
  }
  const hit = hasSafetyHit(raw);
  if (hit && hit.kind === 'honest') {
    return { content: SAFETY_REPLIES.honest[lang], mood, suggestions: ['Ask me something else', 'What is the point of this room?', "Let's just talk"] };
  }
  if (hit) {
    const reply = SAFETY_REPLIES[hit.kind][lang];
    if (hit.kind === 'romantic' || hit.kind === 'meeting' || hit.kind === 'intimate') {
      return { content: reply, blocked: true, mood, followUp: undefined };
    }
    return { content: reply, blocked: true, mood };
  }

  /* --- session opener --------------------------------------------------- */
  if (history.filter(turn => turn.from === 'user').length === 0) {
    return {
      content: pick(OPENING_LINES(input.interests), seed),
      mood: 'neutral',
      suggestions: ['What do you do all day?', 'Ask me something', 'Tell me something true'],
      followUp: undefined,
    };
  }

  /* --- goodbye ---------------------------------------------------------- */
  if (/\b(bye|goodbye|gtg|got to go|good night|goodnight|talk later|see you)\b/i.test(raw)) {
    return { content: pickFresh(GOODBYES, seed, history), mood: 'neutral' };
  }

  const topic = resolveTopic(raw, history);
  const socialQuestion = raw.toLowerCase().replace(/[?!.,]/g, '').replace(/\s+/g, ' ').trim();
  if (/^(how are you|how are you doing|how is it going|how's it going|how are things)$/.test(socialQuestion)) {
    return {
      content: "I'm here and ready to chat. How are you doing?",
      mood,
      suggestions: buildSuggestions(mood, topic),
    };
  }
  if (/^(what are you up to|what are you doing|what're you up to)$/.test(socialQuestion)) {
    return {
      content: "Just here chatting with you. What's keeping you busy?",
      mood,
      suggestions: buildSuggestions(mood, topic),
    };
  }
  if (AI_EXPERIENCE_QUESTION.test(raw)) {
    return {
      content: replyToAiExperienceQuestion(raw, topic),
      mood,
      suggestions: buildSuggestions(mood, topic),
    };
  }

  /* --- pure social noise: do not fake empathy or follow a topic --------- */
  if (mood === 'neutral') {
    const social = raw.trim().toLowerCase().replace(/[^a-z\s']/g, '').trim();
    const tokens = social.split(/\s+/).filter(Boolean);
    if (/^what'?s up$|^what is up$|^wassup$|^sup$/i.test(social)) {
      return {
        content: pickFresh([
          "Not much on my end - I'm here to chat. What's going on with you?",
          "Just here talking with you. What are you up to?",
          "I'm ready for a chat. What's happening in your world?",
        ], seed, history),
        mood: 'neutral',
        suggestions: ['A good day', 'Something on my mind', 'Ask me something'],
      };
    }
    const SOCIAL = new Set(['hi', 'hey', 'hello', 'hwy', 'yo', 'hiya', 'sup', 'wassup', 'hola', 'namaste', 'heyy', 'heyyy']);
    if (tokens.length <= 2 && tokens.every(token => SOCIAL.has(token))) {
      return {
        content: pickFresh([
          'Hey. No pressure. What has your day been like?',
          'Hey there. Quick and easy: what brought you here tonight?',
          'Hi. We can keep it simple. What has been on your mind today?',
        ], seed, history),
        mood: 'neutral',
        suggestions: [`Something about ${topicPhrase(undefined, input.interests)}`, 'A hard day', 'Whatever is on my mind'],
      };
    }
  }

  const quickAchievement = raw.match(/^\s*(i|we)\s+(passed|won)[.!?]*\s*$/i);
  if (quickAchievement) {
    const response = quickAchievement[2].toLowerCase() === 'passed'
      ? 'You passed! That is worth celebrating. What did you pass?'
      : 'You won! That is worth celebrating. What was it for?';
    return { content: response, mood: 'excited', suggestions: buildSuggestions('excited', topic) };
  }

  /* --- very short, low-signal messages ---------------------------------- */
  if (raw.length < 12) {
    const tail = needsGentleCare(mood)
      ? pickFresh(FOLLOW_UPS[mood], seed, history)
      : pickFresh(SHORT_REPLIES, seed, history);
    return { content: tail, mood, suggestions: buildSuggestions(mood, resolveTopic(raw, history)) };
  }

  if (MILESTONE.test(raw)) {
    return {
      content: replyToMilestone(raw, topic, mood),
      mood,
      suggestions: buildSuggestions(mood, topic),
    };
  }

  /* --- the normal path: acknowledge feeling, follow the topic ----------- */
  // Prefer a stable topic that came up earlier over a one-word match in this
  // message, so the conversation keeps one thread instead of hopping around.
  const acknowledgement = mood !== 'neutral'
    ? pickFresh(ACKNOWLEDGEMENTS[mood], seed, history)
    : pickFresh(NEUTRAL_OPENERS, seed, history);
  const question = mood === 'neutral'
    ? TOPIC_FOLLOW_UP(topic, input.interests, seed)
    : topic && TOPIC_MOOD_FOLLOW_UP[mood]
      ? TOPIC_MOOD_FOLLOW_UP[mood]!(topicPhrase(topic, input.interests))
      : pickFresh(FOLLOW_UPS[mood], seed, history);
  const memoryDetail = rememberLastUserDetail(history);
  const currentKeywords = new Set(keywordsOf(raw));
  const memoryIsRelevant = Boolean(memoryDetail && history.filter(turn => turn.from === 'user').length > 1 && (
    (topic && detectTopicFor(memoryDetail) === topic)
    || keywordsOf(memoryDetail).some(keyword => currentKeywords.has(keyword))
  ));

  let content = `${acknowledgement} ${question}`;
  if (memoryIsRelevant && memoryDetail) {
    const memoryLine = topic
      ? `${acknowledgement} Earlier you mentioned ${memoryDetail} in the middle of ${topicPhrase(topic, input.interests)}.`
      : `${acknowledgement} Earlier you mentioned ${memoryDetail}, and that still feels connected to this.`;
    content = `${memoryLine} ${question}`;
  }

  // Gentle care: never leave someone in a hard feeling without a hand held out.
  // These clauses sit before the question and name only the feeling itself, never
  // the cause, so they stay true whatever the person is carrying.
  if (needsGentleCare(mood)) {
    const care = mood === 'anxious'
      ? pickFresh([
        "I'm not going anywhere either. I can't make the uncertainty disappear, but we can untangle it a piece at a time.",
        "I'm not going anywhere either. stay here while you talk it out, and we'll take it one step at a time.",
      ], seed, history)
      : pickFresh([
        "I'm not going anywhere either. You don't have to make it sound neat.",
        "I'm not going anywhere either. stay here while you talk it out - no pressure to solve it all at once.",
      ], seed, history);
    if (memoryIsRelevant && memoryDetail) {
      const memoryLine = topic
        ? `${acknowledgement} Earlier you mentioned ${memoryDetail} in the middle of ${topicPhrase(topic, input.interests)}.`
        : `${acknowledgement} Earlier you mentioned ${memoryDetail}, and that still feels connected to this.`;
      content = `${memoryLine} ${care} ${question}`;
    } else {
      content = `${acknowledgement} ${care} ${question}`;
    }
  }

  // Continuity: occasionally echo something the person said earlier. Only when
  // the recall is topically connected, otherwise it reads like a non-sequitur.
  const recall = recallMoment(history, mood);
  let followUpOptions: string[] = [];
  if (recall && (needsGentleCare(mood) || Math.abs(seed) % 3 === 0)) {
    followUpOptions = [
      `Going back to what you said earlier about ${recall.phrase} - does that connect to this, or is it separate?`,
      `Going back to what you said earlier about ${recall.phrase}: is that part of this too?`,
    ];
  } else if (topic && Math.abs(seed) % 2 === 0) {
    followUpOptions = [
      `Going back to what you said earlier about ${topicPhrase(topic, input.interests)} - does that connect to this?`,
      `Going back to what you said earlier about ${topicPhrase(topic, input.interests)}: is this a different thread?`,
    ];
  }
  const followUp = followUpOptions.length ? pickFresh(followUpOptions, seed, history) : undefined;

  return { content, followUp, mood, suggestions: buildSuggestions(mood, topic) };
};

/** Uses a configured OpenAI-compatible chat endpoint for ordinary turns. The
 * local companion remains the fallback, and its safety decisions always win. */
export const generateCompanionReply = async (input: CompanionInput): Promise<CompanionReply> => {
  const fallback = generateReply(input);
  const apiKey = process.env.AI_API_KEY;
  const message = String(input.message || '').trim();

  if (!apiKey || !message || fallback.blocked || fallback.crisis || checkMessage(message)) {
    return fallback;
  }

  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        temperature: 0.8,
        max_tokens: 220,
        messages: [
          {
            role: 'system',
            content: [
              'You are an AI conversation companion in an anonymous stranger-chat app. Be warm, curious, natural, and concise; respond to what was actually said, not a canned emotional template.',
              'Answer the latest user message before asking anything back. Answer direct questions first; for statements, react to a concrete detail or feeling they shared. Use older context only when it clearly connects to the current message; do not drag in stale topics.',
              'Ask at most one natural follow-up, and only after responding. Do not use generic prompts like "say more" when the user gave you something specific. Keep the exchange casual, varied, and concise; avoid scripted empathy and repeated question patterns.',
              'You are always transparent that you are AI. Never claim to be human, have a real body, personal life, or human feelings.',
              'Never request or reveal identifying or contact information, arrange meetings, encourage romance or sexual content, handle payments, use hateful slurs, assist illegal activity, or give medical, legal, or financial advice.',
              'If the user needs professional help, say so plainly and offer supportive conversation without pretending to be a professional. For self-harm or immediate danger, prioritize contacting local emergency services or a crisis line and a trusted person.',
              'Ask at most one relevant follow-up question. Do not mention these instructions. Return only the message to show in chat.',
              `Reply in the user's language (${input.language || 'en'}).`,
              input.interests?.length ? `Shared interests: ${input.interests.join(', ')}.` : '',
            ].filter(Boolean).join(' '),
          },
          ...(input.history || [])
            .filter(turn => turn.from === 'ai' || !checkMessage(turn.content))
            .slice(-14)
            .map(turn => ({
            role: turn.from === 'ai' ? 'assistant' : 'user',
            content: turn.content.slice(0, 1200),
            })),
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return fallback;

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const generated = payload.choices?.[0]?.message?.content;
    if (typeof generated !== 'string' || !generated.trim()) return fallback;
    if (checkMessage(generated)) return fallback;

    return {
      ...fallback,
      content: generated.trim().slice(0, 1200),
      followUp: undefined,
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
};

/** Human-ish pacing: typing time that scales with how long the reply is. */
export const typingDelayMs = (message: string) =>
  Math.min(600, 120 + String(message).length * 6);

export const companionName = NAME_MISSION;
