// Interface languages. Client-safe and tiny: the menus' and screens' text lives in
// src/lib/locales/<code>.ts and is only read on the server (src/lib/i18n-server.ts),
// so phones never download every language.

export const LANGUAGES = ["en", "hi", "bn", "mr", "ta", "te", "gu", "kn", "ml", "pa"] as const;
export type Lang = (typeof LANGUAGES)[number];

/** Each language in its own script, so people can find theirs. */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: "English", hi: "हिन्दी", bn: "বাংলা", mr: "मराठी", ta: "தமிழ்",
  te: "తెలుగు", gu: "ગુજરાતી", kn: "ಕನ್ನಡ", ml: "മലയാളം", pa: "ਪੰਜਾਬੀ"
};

/** Same languages in English, for screen readers and the settings hint. */
export const LANGUAGE_ENGLISH: Record<Lang, string> = {
  en: "English", hi: "Hindi", bn: "Bengali", mr: "Marathi", ta: "Tamil",
  te: "Telugu", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi"
};

/** BCP-47 locale: Intl dates and numbers (Indian digit grouping) and speech recognition. */
export const localeOf = (lang: Lang) => `${lang}-IN`;

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
  pa: { language: "ਭਾਸ਼ਾ", hint: "ਮੀਨੂ ਅਤੇ ਮੁੱਖ ਸਕ੍ਰੀਨਾਂ ਦੀ ਭਾਸ਼ਾ ਚੁਣੋ। AI ਟੂਲ ਤੁਹਾਡੀ ਭਾਸ਼ਾ ਵਿੱਚ ਵੀ ਜਵਾਬ ਦੇ ਸਕਦੇ ਹਨ।", speak: "ਟਾਈਪ ਕਰਨ ਦੀ ਬਜਾਏ ਬੋਲੋ", listening: "ਸੁਣ ਰਹੇ ਹਾਂ… ਰੋਕਣ ਲਈ ਟੈਪ ਕਰੋ", noVoice: "ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਵਿੱਚ ਬੋਲ ਕੇ ਲਿਖਣਾ ਉਪਲਬਧ ਨਹੀਂ ਹੈ। Safari ਜਾਂ Chrome ਵਰਤੋ।", voiceDenied: "ਬੋਲ ਕੇ ਲਿਖਣ ਲਈ ਇਸ ਸਾਈਟ ਨੂੰ ਮਾਈਕ੍ਰੋਫ਼ੋਨ ਦੀ ਇਜਾਜ਼ਤ ਦਿਓ।" }
};
