// Interface languages. Client-safe and tiny: the menus' and screens' text lives in
// src/lib/locales/<code>.ts and is only read on the server (src/lib/i18n-server.ts),
// so phones never download every language.

export const INDIAN_LANGUAGES = ["en", "hi", "bn", "mr", "ta", "te", "gu", "kn", "ml", "pa"] as const;
export const WORLD_LANGUAGES = [
  "es", "fr", "de", "pt-BR", "it", "nl", "ru", "uk", "pl", "tr",
  "ar", "ur", "fa", "he", "zh-CN", "zh-TW", "ja", "ko", "id", "ms",
  "vi", "th", "fil", "sw", "el", "cs", "ro", "hu", "sv", "ne"
] as const;
export const LANGUAGES = [...INDIAN_LANGUAGES, ...WORLD_LANGUAGES] as const;
export type Lang = (typeof LANGUAGES)[number];

/** Each language in its own script, so people can find theirs. */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: "English", hi: "हिन्दी", bn: "বাংলা", mr: "मराठी", ta: "தமிழ்",
  te: "తెలుగు", gu: "ગુજરાતી", kn: "ಕನ್ನಡ", ml: "മലയാളം", pa: "ਪੰਜਾਬੀ",
  es: "Español", fr: "Français", de: "Deutsch", "pt-BR": "Português (Brasil)", it: "Italiano",
  nl: "Nederlands", ru: "Русский", uk: "Українська", pl: "Polski", tr: "Türkçe",
  ar: "العربية", ur: "اردو", fa: "فارسی", he: "עברית", "zh-CN": "简体中文",
  "zh-TW": "繁體中文", ja: "日本語", ko: "한국어", id: "Bahasa Indonesia", ms: "Bahasa Melayu",
  vi: "Tiếng Việt", th: "ไทย", fil: "Filipino", sw: "Kiswahili", el: "Ελληνικά",
  cs: "Čeština", ro: "Română", hu: "Magyar", sv: "Svenska", ne: "नेपाली"
};

/** Same languages in English, for screen readers and the menu. */
export const LANGUAGE_ENGLISH: Record<Lang, string> = {
  en: "English", hi: "Hindi", bn: "Bengali", mr: "Marathi", ta: "Tamil",
  te: "Telugu", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
  es: "Spanish", fr: "French", de: "German", "pt-BR": "Portuguese", it: "Italian",
  nl: "Dutch", ru: "Russian", uk: "Ukrainian", pl: "Polish", tr: "Turkish",
  ar: "Arabic", ur: "Urdu", fa: "Persian", he: "Hebrew", "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)", ja: "Japanese", ko: "Korean", id: "Indonesian", ms: "Malay",
  vi: "Vietnamese", th: "Thai", fil: "Filipino", sw: "Swahili", el: "Greek",
  cs: "Czech", ro: "Romanian", hu: "Hungarian", sv: "Swedish", ne: "Nepali"
};

/** Languages written right to left: the whole layout mirrors. */
export const RTL_LANGUAGES: readonly Lang[] = ["ar", "ur", "fa", "he"];
export const dirOf = (lang: Lang): "rtl" | "ltr" => (RTL_LANGUAGES.includes(lang) ? "rtl" : "ltr");

/** Region used for speech recognition (and the base of the date locale). */
const SPEECH_LOCALE: Record<Lang, string> = {
  en: "en-IN", hi: "hi-IN", bn: "bn-IN", mr: "mr-IN", ta: "ta-IN", te: "te-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN",
  es: "es-ES", fr: "fr-FR", de: "de-DE", "pt-BR": "pt-BR", it: "it-IT", nl: "nl-NL", ru: "ru-RU", uk: "uk-UA", pl: "pl-PL", tr: "tr-TR",
  ar: "ar-SA", ur: "ur-PK", fa: "fa-IR", he: "he-IL", "zh-CN": "zh-CN", "zh-TW": "zh-TW", ja: "ja-JP", ko: "ko-KR", id: "id-ID", ms: "ms-MY",
  vi: "vi-VN", th: "th-TH", fil: "fil-PH", sw: "sw-KE", el: "el-GR", cs: "cs-CZ", ro: "ro-RO", hu: "hu-HU", sv: "sv-SE", ne: "ne-NP"
};

/** Locale for speech recognition. */
export const speechLocaleOf = (lang: Lang) => SPEECH_LOCALE[lang];

/**
 * Intl locale for dates and numbers. Always the everyday (Gregorian) calendar and Western digits,
 * so business dates and amounts read the same for everyone (Arabic, Persian and Thai would
 * otherwise default to other calendars).
 */
export const localeOf = (lang: Lang) => `${SPEECH_LOCALE[lang]}-u-ca-gregory-nu-latn`;

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGUAGES as readonly string[]).includes(v);
}

/** The few strings shown by client components (the rest are translated on the server). */
type ClientText = { language: string; hint: string; speak: string; listening: string; noVoice: string; voiceDenied: string };
export const CLIENT_TEXT: Record<Lang, ClientText> = {
  en: { language: "Language", hint: "Choose the language for menus and main screens. AI tools can also reply in your language.", speak: "Speak instead of typing", listening: "Listening… tap to stop", noVoice: "Voice typing isn't available in this browser. Try Safari or Chrome.", voiceDenied: "Allow the microphone for this site to use voice typing." },
  hi: { language: "भाषा", hint: "मेन्यू और मुख्य स्क्रीन की भाषा चुनें। AI टूल्स आपकी भाषा में भी जवाब दे सकते हैं।", speak: "टाइप करने की बजाय बोलें", listening: "सुन रहे हैं… रोकने के लिए टैप करें", noVoice: "इस ब्राउज़र में बोलकर लिखना उपलब्ध नहीं है। Safari या Chrome आज़माएँ।", voiceDenied: "बोलकर लिखने के लिए इस साइट को माइक्रोफ़ोन की अनुमति दें।" },
  bn: { language: "ভাষা", hint: "মেনু ও প্রধান স্ক্রিনের ভাষা বেছে নিন। AI টুলস আপনার ভাষাতেও উত্তর দিতে পারে।", speak: "টাইপ না করে বলুন", listening: "শুনছি… থামাতে ট্যাপ করুন", noVoice: "এই ব্রাউজারে বলে লেখা যায় না। Safari বা Chrome ব্যবহার করুন।", voiceDenied: "বলে লেখার জন্য এই সাইটকে মাইক্রোফোনের অনুমতি দিন।" },
  mr: { language: "भाषा", hint: "मेनू आणि मुख्य स्क्रीनची भाषा निवडा. AI टूल्स तुमच्या भाषेतही उत्तर देऊ शकतात.", speak: "टाइप करण्याऐवजी बोला", listening: "ऐकत आहे… थांबवण्यासाठी टॅप करा", noVoice: "या ब्राउझरमध्ये बोलून लिहिता येत नाही. Safari किंवा Chrome वापरा.", voiceDenied: "बोलून लिहिण्यासाठी या साइटला मायक्रोफोनची परवानगी द्या." },
  ta: { language: "மொழி", hint: "மெனு மற்றும் முதன்மைத் திரைகளின் மொழியைத் தேர்வுசெய்யுங்கள். AI கருவிகள் உங்கள் மொழியிலும் பதிலளிக்கும்.", speak: "தட்டச்சுக்குப் பதிலாகப் பேசுங்கள்", listening: "கேட்கிறது… நிறுத்தத் தட்டுங்கள்", noVoice: "இந்த உலாவியில் குரல் தட்டச்சு இல்லை. Safari அல்லது Chrome பயன்படுத்துங்கள்.", voiceDenied: "குரல் தட்டச்சுக்கு இந்தத் தளத்திற்கு மைக்ரோஃபோன் அனுமதி தாருங்கள்." },
  te: { language: "భాష", hint: "మెనూలు మరియు ప్రధాన స్క్రీన్‌ల భాషను ఎంచుకోండి. AI టూల్స్ మీ భాషలో కూడా సమాధానం ఇస్తాయి.", speak: "టైప్ చేయడానికి బదులు మాట్లాడండి", listening: "వింటోంది… ఆపడానికి ట్యాప్ చేయండి", noVoice: "ఈ బ్రౌజర్‌లో మాట్లాడి టైప్ చేయడం లేదు. Safari లేదా Chrome ప్రయత్నించండి.", voiceDenied: "మాట్లాడి టైప్ చేయడానికి ఈ సైట్‌కు మైక్రోఫోన్ అనుమతి ఇవ్వండి." },
  gu: { language: "ભાષા", hint: "મેનુ અને મુખ્ય સ્ક્રીનની ભાષા પસંદ કરો. AI ટૂલ્સ તમારી ભાષામાં પણ જવાબ આપી શકે છે.", speak: "ટાઇપ કરવાને બદલે બોલો", listening: "સાંભળી રહ્યા છીએ… રોકવા ટૅપ કરો", noVoice: "આ બ્રાઉઝરમાં બોલીને લખવાનું ઉપલબ્ધ નથી. Safari અથવા Chrome વાપરો.", voiceDenied: "બોલીને લખવા માટે આ સાઇટને માઇક્રોફોનની પરવાનગી આપો." },
  kn: { language: "ಭಾಷೆ", hint: "ಮೆನು ಮತ್ತು ಮುಖ್ಯ ಪರದೆಗಳ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ. AI ಟೂಲ್‌ಗಳು ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲೂ ಉತ್ತರಿಸಬಹುದು.", speak: "ಟೈಪ್ ಮಾಡುವ ಬದಲು ಮಾತನಾಡಿ", listening: "ಕೇಳುತ್ತಿದೆ… ನಿಲ್ಲಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ", noVoice: "ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಮಾತಿನ ಮೂಲಕ ಟೈಪ್ ಮಾಡಲು ಸಾಧ್ಯವಿಲ್ಲ. Safari ಅಥವಾ Chrome ಬಳಸಿ.", voiceDenied: "ಮಾತಿನ ಮೂಲಕ ಟೈಪ್ ಮಾಡಲು ಈ ಸೈಟ್‌ಗೆ ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ನೀಡಿ." },
  ml: { language: "ഭാഷ", hint: "മെനുവിന്റെയും പ്രധാന സ്ക്രീനുകളുടെയും ഭാഷ തിരഞ്ഞെടുക്കുക. AI ടൂളുകൾക്ക് നിങ്ങളുടെ ഭാഷയിലും മറുപടി നൽകാം.", speak: "ടൈപ്പ് ചെയ്യുന്നതിന് പകരം സംസാരിക്കുക", listening: "കേൾക്കുന്നു… നിർത്താൻ ടാപ്പ് ചെയ്യുക", noVoice: "ഈ ബ്രൗസറിൽ ശബ്ദത്തിലൂടെ ടൈപ്പ് ചെയ്യാനാവില്ല. Safari അല്ലെങ്കിൽ Chrome ഉപയോഗിക്കുക.", voiceDenied: "ശബ്ദത്തിലൂടെ ടൈപ്പ് ചെയ്യാൻ ഈ സൈറ്റിന് മൈക്രോഫോൺ അനുമതി നൽകുക." },
  pa: { language: "ਭਾਸ਼ਾ", hint: "ਮੀਨੂ ਅਤੇ ਮੁੱਖ ਸਕ੍ਰੀਨਾਂ ਦੀ ਭਾਸ਼ਾ ਚੁਣੋ। AI ਟੂਲ ਤੁਹਾਡੀ ਭਾਸ਼ਾ ਵਿੱਚ ਵੀ ਜਵਾਬ ਦੇ ਸਕਦੇ ਹਨ।", speak: "ਟਾਈਪ ਕਰਨ ਦੀ ਬਜਾਏ ਬੋਲੋ", listening: "ਸੁਣ ਰਹੇ ਹਾਂ… ਰੋਕਣ ਲਈ ਟੈਪ ਕਰੋ", noVoice: "ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਵਿੱਚ ਬੋਲ ਕੇ ਲਿਖਣਾ ਉਪਲਬਧ ਨਹੀਂ ਹੈ। Safari ਜਾਂ Chrome ਵਰਤੋ।", voiceDenied: "ਬੋਲ ਕੇ ਲਿਖਣ ਲਈ ਇਸ ਸਾਈਟ ਨੂੰ ਮਾਈਕ੍ਰੋਫ਼ੋਨ ਦੀ ਇਜਾਜ਼ਤ ਦਿਓ।" },
  es: { language: "Idioma", hint: "Elige el idioma de los menús y las pantallas principales. Las herramientas de IA también pueden responder en tu idioma.", speak: "Habla en lugar de escribir", listening: "Escuchando… toca para parar", noVoice: "El dictado por voz no está disponible en este navegador. Prueba Safari o Chrome.", voiceDenied: "Permite el micrófono para este sitio para dictar por voz." },
  fr: { language: "Langue", hint: "Choisissez la langue des menus et des écrans principaux. Les outils d'IA peuvent aussi répondre dans votre langue.", speak: "Parlez au lieu de taper", listening: "Écoute… touchez pour arrêter", noVoice: "La saisie vocale n'est pas disponible dans ce navigateur. Essayez Safari ou Chrome.", voiceDenied: "Autorisez le micro pour ce site afin d'utiliser la saisie vocale." },
  de: { language: "Sprache", hint: "Wählen Sie die Sprache für Menüs und Hauptbildschirme. KI-Tools können auch in Ihrer Sprache antworten.", speak: "Sprechen statt tippen", listening: "Hört zu… zum Stoppen tippen", noVoice: "Spracheingabe ist in diesem Browser nicht verfügbar. Versuchen Sie Safari oder Chrome.", voiceDenied: "Erlauben Sie dieser Seite das Mikrofon, um die Spracheingabe zu nutzen." },
  "pt-BR": { language: "Idioma", hint: "Escolha o idioma dos menus e das telas principais. As ferramentas de IA também podem responder no seu idioma.", speak: "Fale em vez de digitar", listening: "Ouvindo… toque para parar", noVoice: "A digitação por voz não está disponível neste navegador. Tente o Safari ou o Chrome.", voiceDenied: "Permita o microfone para este site para usar a digitação por voz." },
  it: { language: "Lingua", hint: "Scegli la lingua dei menu e delle schermate principali. Gli strumenti di IA possono rispondere anche nella tua lingua.", speak: "Parla invece di scrivere", listening: "In ascolto… tocca per fermare", noVoice: "La dettatura vocale non è disponibile in questo browser. Prova Safari o Chrome.", voiceDenied: "Consenti il microfono a questo sito per usare la dettatura vocale." },
  nl: { language: "Taal", hint: "Kies de taal voor menu's en hoofdschermen. AI-tools kunnen ook in jouw taal antwoorden.", speak: "Spreek in plaats van typen", listening: "Luistert… tik om te stoppen", noVoice: "Spraakinvoer is niet beschikbaar in deze browser. Probeer Safari of Chrome.", voiceDenied: "Sta de microfoon toe voor deze site om spraakinvoer te gebruiken." },
  ru: { language: "Язык", hint: "Выберите язык меню и основных экранов. Инструменты ИИ могут отвечать и на вашем языке.", speak: "Говорите вместо набора текста", listening: "Слушаю… нажмите, чтобы остановить", noVoice: "Голосовой ввод недоступен в этом браузере. Попробуйте Safari или Chrome.", voiceDenied: "Разрешите этому сайту доступ к микрофону для голосового ввода." },
  uk: { language: "Мова", hint: "Виберіть мову меню та основних екранів. Інструменти ШІ можуть відповідати й вашою мовою.", speak: "Говоріть замість набору", listening: "Слухаю… торкніться, щоб зупинити", noVoice: "Голосовий ввід недоступний у цьому браузері. Спробуйте Safari або Chrome.", voiceDenied: "Дозвольте цьому сайту доступ до мікрофона для голосового вводу." },
  pl: { language: "Język", hint: "Wybierz język menu i głównych ekranów. Narzędzia AI mogą też odpowiadać w Twoim języku.", speak: "Mów zamiast pisać", listening: "Słucham… dotknij, aby zatrzymać", noVoice: "Dyktowanie głosowe nie jest dostępne w tej przeglądarce. Spróbuj Safari lub Chrome.", voiceDenied: "Zezwól tej stronie na mikrofon, aby dyktować głosowo." },
  tr: { language: "Dil", hint: "Menüler ve ana ekranlar için dili seçin. Yapay zekâ araçları sizin dilinizde de yanıt verebilir.", speak: "Yazmak yerine konuşun", listening: "Dinleniyor… durdurmak için dokunun", noVoice: "Sesle yazma bu tarayıcıda kullanılamıyor. Safari veya Chrome'u deneyin.", voiceDenied: "Sesle yazmak için bu siteye mikrofon izni verin." },
  ar: { language: "اللغة", hint: "اختر لغة القوائم والشاشات الرئيسية. يمكن لأدوات الذكاء الاصطناعي أيضًا الرد بلغتك.", speak: "تحدّث بدلًا من الكتابة", listening: "جارٍ الاستماع… اضغط للإيقاف", noVoice: "الكتابة بالصوت غير متاحة في هذا المتصفح. جرّب Safari أو Chrome.", voiceDenied: "اسمح لهذا الموقع باستخدام الميكروفون للكتابة بالصوت." },
  ur: { language: "زبان", hint: "مینو اور اہم اسکرینوں کی زبان منتخب کریں۔ AI ٹولز آپ کی زبان میں بھی جواب دے سکتے ہیں۔", speak: "ٹائپ کرنے کے بجائے بولیں", listening: "سن رہے ہیں… روکنے کے لیے ٹیپ کریں", noVoice: "اس براؤزر میں بول کر لکھنا دستیاب نہیں۔ Safari یا Chrome آزمائیں۔", voiceDenied: "بول کر لکھنے کے لیے اس سائٹ کو مائیکروفون کی اجازت دیں۔" },
  fa: { language: "زبان", hint: "زبان منوها و صفحه‌های اصلی را انتخاب کنید. ابزارهای هوش مصنوعی می‌توانند به زبان شما هم پاسخ دهند.", speak: "به‌جای تایپ کردن صحبت کنید", listening: "در حال گوش دادن… برای توقف ضربه بزنید", noVoice: "تایپ صوتی در این مرورگر در دسترس نیست. Safari یا Chrome را امتحان کنید.", voiceDenied: "برای تایپ صوتی، به این سایت اجازهٔ میکروفون بدهید." },
  he: { language: "שפה", hint: "בחרו את שפת התפריטים והמסכים הראשיים. כלי הבינה המלאכותית יכולים לענות גם בשפה שלכם.", speak: "דברו במקום להקליד", listening: "מקשיב… הקישו כדי לעצור", noVoice: "הקלדה קולית אינה זמינה בדפדפן הזה. נסו את Safari או Chrome.", voiceDenied: "אפשרו לאתר הזה גישה למיקרופון כדי להשתמש בהקלדה קולית." },
  "zh-CN": { language: "语言", hint: "选择菜单和主要页面的语言。AI 工具也可以用你的语言回答。", speak: "用说的代替打字", listening: "正在听… 点按停止", noVoice: "此浏览器不支持语音输入。请试试 Safari 或 Chrome。", voiceDenied: "请允许此网站使用麦克风以进行语音输入。" },
  "zh-TW": { language: "語言", hint: "選擇選單和主要畫面的語言。AI 工具也可以用你的語言回答。", speak: "用說的代替打字", listening: "正在聆聽… 點按停止", noVoice: "此瀏覽器不支援語音輸入。請試試 Safari 或 Chrome。", voiceDenied: "請允許此網站使用麥克風以進行語音輸入。" },
  ja: { language: "言語", hint: "メニューと主な画面の言語を選んでください。AI ツールはあなたの言語でも回答できます。", speak: "入力の代わりに話す", listening: "聞き取り中… タップで停止", noVoice: "このブラウザでは音声入力を使えません。Safari または Chrome をお試しください。", voiceDenied: "音声入力を使うには、このサイトにマイクの使用を許可してください。" },
  ko: { language: "언어", hint: "메뉴와 주요 화면의 언어를 선택하세요. AI 도구도 사용자의 언어로 답할 수 있습니다.", speak: "입력하는 대신 말하기", listening: "듣는 중… 탭하여 중지", noVoice: "이 브라우저에서는 음성 입력을 사용할 수 없습니다. Safari 또는 Chrome을 사용해 보세요.", voiceDenied: "음성 입력을 사용하려면 이 사이트에 마이크 사용을 허용하세요." },
  id: { language: "Bahasa", hint: "Pilih bahasa untuk menu dan layar utama. Alat AI juga dapat menjawab dalam bahasa Anda.", speak: "Bicara alih-alih mengetik", listening: "Mendengarkan… ketuk untuk berhenti", noVoice: "Pengetikan suara tidak tersedia di browser ini. Coba Safari atau Chrome.", voiceDenied: "Izinkan mikrofon untuk situs ini agar bisa mengetik dengan suara." },
  ms: { language: "Bahasa", hint: "Pilih bahasa untuk menu dan skrin utama. Alat AI juga boleh menjawab dalam bahasa anda.", speak: "Bercakap dan bukannya menaip", listening: "Mendengar… ketik untuk berhenti", noVoice: "Taipan suara tidak tersedia dalam pelayar ini. Cuba Safari atau Chrome.", voiceDenied: "Benarkan mikrofon untuk laman ini bagi menggunakan taipan suara." },
  vi: { language: "Ngôn ngữ", hint: "Chọn ngôn ngữ cho menu và các màn hình chính. Công cụ AI cũng có thể trả lời bằng ngôn ngữ của bạn.", speak: "Nói thay vì gõ", listening: "Đang nghe… chạm để dừng", noVoice: "Trình duyệt này không hỗ trợ nhập bằng giọng nói. Hãy thử Safari hoặc Chrome.", voiceDenied: "Hãy cho phép trang này dùng micrô để nhập bằng giọng nói." },
  th: { language: "ภาษา", hint: "เลือกภาษาสำหรับเมนูและหน้าจอหลัก เครื่องมือ AI ตอบเป็นภาษาของคุณได้ด้วย", speak: "พูดแทนการพิมพ์", listening: "กำลังฟัง… แตะเพื่อหยุด", noVoice: "เบราว์เซอร์นี้ไม่รองรับการพิมพ์ด้วยเสียง ลองใช้ Safari หรือ Chrome", voiceDenied: "อนุญาตให้เว็บไซต์นี้ใช้ไมโครโฟนเพื่อพิมพ์ด้วยเสียง" },
  fil: { language: "Wika", hint: "Piliin ang wika ng mga menu at pangunahing screen. Puwede ring sumagot ang mga AI tool sa wika mo.", speak: "Magsalita sa halip na mag-type", listening: "Nakikinig… i-tap para huminto", noVoice: "Hindi available ang voice typing sa browser na ito. Subukan ang Safari o Chrome.", voiceDenied: "Payagan ang mikropono para sa site na ito para magamit ang voice typing." },
  sw: { language: "Lugha", hint: "Chagua lugha ya menyu na skrini kuu. Zana za AI zinaweza pia kujibu kwa lugha yako.", speak: "Ongea badala ya kuandika", listening: "Inasikiliza… gusa ili kusimamisha", noVoice: "Kuandika kwa sauti hakupatikani kwenye kivinjari hiki. Jaribu Safari au Chrome.", voiceDenied: "Ruhusu maikrofoni kwa tovuti hii ili kuandika kwa sauti." },
  el: { language: "Γλώσσα", hint: "Επιλέξτε τη γλώσσα για τα μενού και τις κύριες οθόνες. Τα εργαλεία AI μπορούν να απαντούν και στη γλώσσα σας.", speak: "Μιλήστε αντί να πληκτρολογείτε", listening: "Ακούει… πατήστε για διακοπή", noVoice: "Η φωνητική πληκτρολόγηση δεν είναι διαθέσιμη σε αυτό το πρόγραμμα περιήγησης. Δοκιμάστε Safari ή Chrome.", voiceDenied: "Επιτρέψτε το μικρόφωνο σε αυτόν τον ιστότοπο για φωνητική πληκτρολόγηση." },
  cs: { language: "Jazyk", hint: "Vyberte jazyk nabídek a hlavních obrazovek. Nástroje AI mohou odpovídat i ve vašem jazyce.", speak: "Mluvte místo psaní", listening: "Poslouchám… klepnutím zastavíte", noVoice: "Hlasové zadávání není v tomto prohlížeči dostupné. Zkuste Safari nebo Chrome.", voiceDenied: "Povolte tomuto webu mikrofon, abyste mohli zadávat hlasem." },
  ro: { language: "Limbă", hint: "Alegeți limba meniurilor și a ecranelor principale. Instrumentele AI pot răspunde și în limba dvs.", speak: "Vorbiți în loc să tastați", listening: "Ascultă… atingeți pentru a opri", noVoice: "Dictarea vocală nu este disponibilă în acest browser. Încercați Safari sau Chrome.", voiceDenied: "Permiteți microfonul pentru acest site ca să folosiți dictarea vocală." },
  hu: { language: "Nyelv", hint: "Válassza ki a menük és a fő képernyők nyelvét. Az MI-eszközök az Ön nyelvén is válaszolhatnak.", speak: "Beszéljen gépelés helyett", listening: "Figyel… koppintson a leállításhoz", noVoice: "A hangalapú bevitel nem érhető el ebben a böngészőben. Próbálja a Safarit vagy a Chrome-ot.", voiceDenied: "Engedélyezze a mikrofont ennek a webhelynek a hangalapú bevitelhez." },
  sv: { language: "Språk", hint: "Välj språk för menyer och huvudskärmar. AI-verktygen kan också svara på ditt språk.", speak: "Prata i stället för att skriva", listening: "Lyssnar… tryck för att stoppa", noVoice: "Röstinmatning finns inte i den här webbläsaren. Prova Safari eller Chrome.", voiceDenied: "Tillåt mikrofonen för den här webbplatsen för att använda röstinmatning." },
  ne: { language: "भाषा", hint: "मेनु र मुख्य स्क्रिनहरूको भाषा छान्नुहोस्। AI उपकरणहरूले तपाईंको भाषामा पनि जवाफ दिन सक्छन्।", speak: "टाइप गर्नुको सट्टा बोल्नुहोस्", listening: "सुन्दैछ… रोक्न ट्याप गर्नुहोस्", noVoice: "यो ब्राउजरमा बोलेर लेख्ने सुविधा उपलब्ध छैन। Safari वा Chrome प्रयोग गर्नुहोस्।", voiceDenied: "बोलेर लेख्न यो साइटलाई माइक्रोफोनको अनुमति दिनुहोस्।" }
};
