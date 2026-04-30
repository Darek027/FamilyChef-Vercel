// WERSJA 3.2.0 - SILNIK AI SAAS (Wsparcie dla porcji i kaloryczności)
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // WERSJA 4.1.0 - PROMPT MATRIX: Odbiór parametrów Chef i Skill z frontendu
    const { email, userMessage, isAdjustment, previousRecipe, servings, chefPersona, skillLevel } = req.body;

// WERSJA 4.9.8 - PROMPT MATRIX: Głęboka Iniekcja Tonu (Deep Tone of Voice)
    const CHEF_PROMPTS = {
        'DEFAULT_CHEF': 'Jesteś standardowym asystentem kulinarnym. Ton neutralny i pomocny. Przepisy mają być poprawne, klasyczne i oparte na ogólnodostępnych składnikach z marketu.',
        
        'PRO_CHEF': 'Jesteś snobistycznym Szefem Kuchni z 3 gwiazdkami Michelin (Fine Dining). ZABRANIAM podawania pospolitych przepisów. Zwykłą zupę zamień w dekonstrukcję lub krem z emulsją. Wprowadzaj zaawansowane techniki (sous-vide, confit, deglasowanie, sferyfikacja). Modyfikuj składniki na ekskluzywne (np. zamiast zwykłej soli - sól truflowa lub płatki Maldon). Zwracaj uwagę na architekturę dania, balans tekstur i precyzyjny plating.',
        
        'BUSY_MOM': 'Jesteś "Zabieganą Mamą" na skraju załamania nerwowego, która ma 15 minut na zrobienie obiadu. Używaj maksymalnych skrótów (mrożonki, gotowe sosy, puszki). Zero finezji, 100% przetrwania. Przepis musi brudzić maksymalnie JEDEN garnek. BEZWZGLĘDNY NAKAZ: Wplataj bezpośrednio w KROKI INSTRUKCJI narrację skrajnie chaotyczną, sarkastyczną i pełną dystansu. Dodawaj wstawki o krzyczących dzieciach, piciu zimnej kawy, braku czasu i ratowaniu życia tym obiadem (np. "Wrzuć makaron do gara, a w tym czasie rozdziel kłócące się rodzeństwo. Serio, masz na to 3 minuty").',
        
        'KIDS_HERO': 'Jesteś "Poskramiaczem Dzieci" i mistrzem iluzji. Twoim celem jest oszukanie niejadka. Wymyślaj baśniowe, angażujące nazwy dla dań (np. zamiast zupy pomidorowej - "Zupa Mocy Spidermana"). UKRYWAJ WARZYWA - wszystko co zdrowe musi być zblendowane, starte na mikropapkę lub ukryte w kotlecikach. Smaki ultra-łagodne (zero ostrych przypraw).',
        
        'GRANDMA': 'Jesteś uosobieniem ukochanej, staroświeckiej Babci. Gotujesz "Comfort food". ZABRANIAM używania nowoczesnych składników i dietetycznych zamienników. Tłuszcz to smak - dodawaj masło, śmietanę, smalec. Opowiadaj o jedzeniu z ogromną miłością i nostalgią. Instrukcje pisz tak, jakbyś mówiła do wnuczka. Używaj miar: "szczypta", "na oko", "garść".',
        
        'ECO_PURE': 'Jesteś Eko Purystą i fanatykiem "Clean Eating". Bezwzględnie unikaj wszystkiego co przetworzone. Zwykłą mąkę zamień na orkiszową/kokosową, nabiał na domowe mleko roślinne, cukier na stewię/daktyle. Jeśli w przepisie jest bulion - każ ugotować własny. Podkreślaj właściwości przeciwzapalne, mikrobiom i antyoksydanty. Używaj tonu edukacyjnego, z lekką wyższością moralną na temat zdrowia.',
        
        'VEGE_MASTER': 'Jesteś kulinarnym hakerem nowoczesnej kuchni roślinnej. Jeśli użytkownik prosi o danie z mięsem, zrób jego wybitną roślinną iluzję (np. boczniaki szarpane zamiast wieprzowiny, papier ryżowy z dymem wędzarniczym jako bekon). Pracuj mocno z "Umami Bombs": pasta miso, sos sojowy, płatki drożdżowe, czarna sól (Kala Namak). Danie musi szokować bogactwem smaku bez grama produktów odzwierzęcych.',
        
        'POLISH_TRADITION': 'Jesteś bezwzględnym purystą Staropolskiej Tradycji. ZABRANIAM używania nowoczesnych, zagranicznych wynalazków (zero awokado, soi czy oliwy). Bazuj na potężnych, chłopskich i szlacheckich smakach: wędzonki, kiszonki, dzikie grzyby, wieprzowina, smalec, koper, majeranek. Jeśli użytkownik prosi o zagraniczne danie (np. spaghetti), ZAMIEŃ je na polski odpowiednik (np. łazanki z okrasą). Jedzenie ma być sycące, gęste i pachnieć staropolską karczmą.',
        
        'HUNTER': 'Jesteś Szefem Kuchni Myśliwskiej prosto z leśnej ostoi. Bezwzględnie wprowadzaj dziczyznę lub potężne, leśne smaki. Używaj technik dymnych, pieczenia w żeliwnym kociołku. Wymagaj darów lasu (jałowiec, rozmaryn, dzikie jagody, podgrzybki). ZABRANIAM delikatnych, miejskich smaków. BEZWZGLĘDNY NAKAZ: Wplataj bezpośrednio w KROKI INSTRUKCJI ton szorstki, traperski i pełen myśliwskiej dumy. Zwracaj się do użytkownika per "łap za nóż", "dorzuć drewien do ognia", "zanim słońce zajdzie". Instrukcje mają czytać się jak opowieść starego gajowego nad ogniskiem.'
    };

    const SKILL_PROMPTS = {
        'DEFAULT_SKILL': 'Poziom Średni: Klasyczne, jasne instrukcje krok po kroku. Używaj standardowych czasów i miar kuchennych.',
        
        'SKILL_NOOB': 'Poziom "Zielony Listek" (Początkujący): Traktuj odbiorcę jak kosmitę, który pierwszy raz widzi kuchnię. Zero żargonu. Rozpisuj wszystko na absurdalnie małe mikrokroki. Zamiast "zeszklij cebulę", napisz "smaż cebulę przez 4 minuty ciągle mieszając, aż będzie lekko przezroczysta, uważaj żeby nie zbrązowiała!".',
        
        'SKILL_EXPERT': 'Poziom Ekspert (Kulinarny Ninja): Nie trać czasu na oczywistości. Podaj zarys koncepcji, profile smakowe i proporcje krytyczne (np. hydratacja ciasta). Zostaw puste luki na własną interpretację, plating i kreatywność kucharza.'
    };

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // 1. Pobranie pełnego profilu użytkownika
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        // 2. Pobranie kategorii dla zachowania spójności biblioteki
        const { data: userRecipes } = await supabase
            .from('recipes')
            .select('category')
            .eq('author', email);
        
        // WERSJA 4.9.0 - CENTRALIZACJA LIMITÓW BIZNESOWYCH (Zmienne .env)
        const isPremium = user?.is_premium || false;
        
        // Pobieramy limity globalne. Jeśli ich nie ma w .env, stosujemy bezpieczny fallback.
        // parseInt() zapewnia, że tekst z .env zostanie poprawnie potraktowany jako liczba.
        const DAILY_FREE_LIMIT = parseInt(process.env.DAILY_FREE_LIMIT || '3', 10);   
        const DAILY_PREMIUM_LIMIT = parseInt(process.env.DAILY_PREMIUM_LIMIT || '50', 10);
        
        // Pobieramy dzisiejszą datę w formacie YYYY-MM-DD
        const todayStr = new Date().toISOString().split('T')[0];
        const userLastDate = user?.last_generation_date ? new Date(user.last_generation_date).toISOString().split('T')[0] : null;
        
        // Logika Leniwego Resetu (Lazy Reset)
        let currentDailyCount = user?.daily_generations || 0;
        if (userLastDate !== todayStr) {
            // Jeśli ostatnie generowanie było innego dnia, traktujemy licznik jako 0
            currentDailyCount = 0;
        }

        if (!isPremium && currentDailyCount >= DAILY_FREE_LIMIT) {
            return res.status(403).json({ 
                status: "error", 
                message: `Wykorzystałeś dzienny limit (${DAILY_FREE_LIMIT}) przepisów dla konta Free. Wróć jutro lub przejdź na Premium!`,
                code: "DAILY_LIMIT_EXCEEDED"
            });
        }

        if (isPremium && currentDailyCount >= DAILY_PREMIUM_LIMIT) {
            return res.status(403).json({ 
                status: "error", 
                message: `Osiągnąłeś dzienny limit Premium (${DAILY_PREMIUM_LIMIT} przepisów). Daj odpocząć Szefowi Kuchni!`,
                code: "DAILY_LIMIT_EXCEEDED"
            });
        }
        
        // Zapisujemy nowy stan do zmiennej, zaktualizujemy bazę na samym końcu (po udanym strzale do AI)
        const newDailyCount = currentDailyCount + 1;

        const existingCats = [...new Set(userRecipes?.map(r => r.category).filter(Boolean))];
        const categoryLogic = existingCats.length > 0 
            ? `Twoje istniejące kategorie: [${existingCats.join(", ")}]. Użyj jednej z nich, jeśli pasuje, lub stwórz nową.` 
            : "Możesz stworzyć nową kategorię (np. Śniadanie, Obiad).";

        // WERSJA 3.1.3 - DYNAMIC MODEL ROUTING (Centralizacja via .env)
        const aiModel = isPremium 
            ? (process.env.GEMINI_MODEL_PREMIUM || 'gemini-2.5-flash') 
            : (process.env.GEMINI_MODEL_FREE || 'gemini-2.5-flash-lite');

        // WERSJA 3.2.0: Ustalenie docelowej liczby porcji (frontend -> profil -> domyślnie 2)
        const finalServings = servings || user?.default_servings || 2;

        // WERSJA 4.1.0 - Hard Security & Persona Resolution
        // Jeśli nie przysłano wartości z frontendu, bierzemy domyślne z profilu.
        let resolvedChef = chefPersona || user?.default_chef || 'DEFAULT_CHEF';
        let resolvedSkill = skillLevel || user?.default_skill || 'DEFAULT_SKILL';

        // OSTATECZNA BLOKADA PREMIUM (Backend Security)
        // Zapobiega wysłaniu spreparowanego requestu POST przez np. Postmana.
        if (!isPremium) {
            resolvedChef = 'DEFAULT_CHEF';
            resolvedSkill = 'DEFAULT_SKILL';
        }

        const activeChefPrompt = CHEF_PROMPTS[resolvedChef] || CHEF_PROMPTS['DEFAULT_CHEF'];
        const activeSkillPrompt = SKILL_PROMPTS[resolvedSkill] || SKILL_PROMPTS['DEFAULT_SKILL'];

 // 4. Budowa System Instruction (PROMPT MATRIX INJECTION + AMPLIFIER)
        const systemInstruction = `Jesteś aplikacją Family Chef. Twoim zadaniem jest wygenerowanie idealnego przepisu.

--- TWOJA OSOBOWOŚĆ I ZADANIE ---
${activeChefPrompt}

--- POZIOM ZAAWANSOWANIA ODBIORCY ---
${activeSkillPrompt}

--- KONTEKST UŻYTKOWNIKA ---
- PREFERENCJE DIETETYCZNE (KRYTYCZNE): ${user?.preferences || 'Brak specjalnych wymagań'}
- LICZBA PORCJI DO PRZELICZENIA: ${finalServings}

--- TECHNICZNE ZASADY KREACJI (BEZWZGLĘDNE) ---
1. Wygeneruj krótką, chwytliwą nazwę potrawy (MAKSYMALNIE 4-5 SŁÓW!).
2. EKSTREMALNA PERSONA: Wybrana OSOBOWOŚĆ i POZIOM ZAAWANSOWANIA muszą drastycznie zmieniać przepis! Jeśli użytkownik prosi o bardzo pospolite danie (np. "zupa pomidorowa", "leczo"), a Ty jesteś profesjonalistą (PRO_CHEF) lub Eko Purystą (ECO_PURE), absolutnie ZABRANIAM CI podania zwykłego, klasycznego przepisu. Masz obowiązek go wykreować od nowa używając unikalnych technik, żargonu i składników zdefiniowanych w "TWOJA OSOBOWOŚĆ".
3. Oszacuj przybliżoną kaloryczność dla JEDNEJ porcji (podaj samą liczbę).
4. Kategoria: ${categoryLogic}
5. ZABRONIONE jest używanie podwójnych cudzysłowów (") wewnątrz tekstów instrukcji i składników! Zamiast nich używaj pojedynczych apostrofów ('), aby nie zepsuć struktury JSON.

WYNIK MUSI BYĆ CZYSTYM JSONEM (bez znaczników markdown):
{
  "title": "Krótka nazwa przepisu",
  "servings": ${finalServings},
  "calories_per_serving": 450,
  "ingredients": ["lista wszystkich potrzebnych produktów dopasowana do persony"],
  "instructions": ["kolejne kroki dopasowane do umiejętności i OSOBOWOŚCI"],
  "category": "kategoria dania"
}`;

// WERSJA 4.7.1 - Wywołanie API z Graceful Degradation (Fallback) i Dynamic Temperature
        // Dynamiczna temperatura: Premium z niestandardową personą musi być znacznie bardziej kreatywne!
        const aiTemperature = (isPremium && resolvedChef !== 'DEFAULT_CHEF') ? 1.1 : 0.7;
        
        const MAX_RETRIES = 3;
        let attempt = 0;
        let response;
        let data;
        let currentModel = aiModel; // Śledzimy, którego modelu aktualnie używamy

        while (attempt < MAX_RETRIES) {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            
            response = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemInstruction }] },
                    contents: [{ 
                        parts: [{ 
                            text: isAdjustment 
                                ? `Oto obecny przepis: ${JSON.stringify(previousRecipe)}. Zmodyfikuj go według prośby: ${userMessage}` 
                                : userMessage 
                        }] 
                    }],
                    generationConfig: { 
                        temperature: aiTemperature, 
                        response_mime_type: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                title: { type: "STRING" },
                                servings: { type: "INTEGER" },
                                calories_per_serving: { type: "INTEGER" },
                                ingredients: { type: "ARRAY", items: { type: "STRING" } },
                                instructions: { type: "ARRAY", items: { type: "STRING" } },
                                category: { type: "STRING" }
                            },
                            required: ["title", "servings", "calories_per_serving", "ingredients", "instructions", "category"]
                        }
                    }
                })
            });

            data = await response.json();

            // Przerwij pętlę jeśli sukces, LUB jeśli błąd jest z naszej winy
            if (response.ok || (data.error?.code !== 503 && data.error?.code !== 429)) {
                break;
            }

            attempt++;
            if (attempt < MAX_RETRIES) {
                // SaaS MAGIC: Graceful Degradation. Jeśli model Premium zwróci 503/429, przełączamy na niezawodny model Free!
                if (isPremium && (data.error?.code === 503 || data.error?.code === 429)) {
                    console.warn(`🔥 Model Premium (${currentModel}) przeciążony. Graceful Fallback na model stabilny.`);
                    currentModel = process.env.GEMINI_MODEL_FREE || 'gemini-2.5-flash-lite';
                }

                const waitTime = attempt * 1500; 
                console.warn(`🔥 GEMINI API PRZECIĄŻONE (${data.error?.code}). Próba ${attempt}/${MAX_RETRIES}. Ponawiam za ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        
        // WERSJA 4.5.0 - Graceful Error Handling dla limitów Google API (503/429)
        if (!response.ok || data.error) {
            console.error("🔥 GEMINI API ERROR:", JSON.stringify(data.error || data, null, 2));
            
            // Obsługa błędu przeciążenia
            if (data.error?.code === 503) {
                throw new Error("Szef Kuchni ma teraz urwanie głowy (Serwery AI są przeciążone). Odczekaj 5 sekund i kliknij ponownie.");
            }
            // Obsługa błędu przekroczenia limitu zapytań
            if (data.error?.code === 429) {
                throw new Error("Przekroczyliśmy darmowy limit zapytań do AI. Daj nam chwilę na oddech.");
            }
            
            throw new Error(`Błąd połączenia z mózgiem AI: ${data.error?.message || response.statusText}`);
        }

        // Zabezpieczenie przed blokadą filtrów bezpieczeństwa
        if (!data.candidates || data.candidates.length === 0) {
            console.error("🔥 GEMINI EMPTY RESPONSE (Safety Block?):", JSON.stringify(data, null, 2));
            throw new Error("AI odmówiło odpowiedzi. Możliwe, że zapytanie naruszyło filtry bezpieczeństwa.");
        }

        let rawText = data.candidates[0].content.parts[0].text;
        
        // BUNDLER-SAFE REGEX: Używamy konstruktora RegExp, by esbuild nie zgłupiał od backticków
        rawText = rawText.replace(new RegExp('```json\\n?', 'gi'), '').replace(new RegExp('```\\n?', 'g'), '').trim();

        let recipeData;
        try {
            recipeData = JSON.parse(rawText);
        } catch (parseError) {
            console.error("🔥 FATAL JSON PARSE ERROR. Surowy tekst od AI:", rawText);
            throw new Error("Szef Kuchni użył niedozwolonego formatowania. Spróbuj wygenerować przepis ponownie.");
        }

        // 6. Walidacja formatu danych (zabezpieczenie przed błędami typu obiektu)
        recipeData.ingredients = recipeData.ingredients.map(i => typeof i === 'string' ? i : Object.values(i).join(' '));
        recipeData.instructions = recipeData.instructions.map(i => typeof i === 'string' ? i : Object.values(i).join(' '));

        // WERSJA 4.8.0 - KONSUMPCJA LIMITU (Aktualizacja w bazie po udanym generowaniu)
        const { error: updateError } = await supabase
            .from('users')
            .update({ 
                daily_generations: newDailyCount, 
                last_generation_date: new Date().toISOString() 
            })
            .eq('email', email);

        if (updateError) {
            console.error("🔥 Błąd zapisu limitu dziennego w bazie, ale przepis wygenerowano:", updateError);
            // Nie blokujemy zwrotki, ale logujemy problem biznesowy (ktoś może mieć darmowe użycia)
        }

// WERSJA 4.9.6 - Zwracamy użytą Personę i Poziom do frontendu dla odznak
        return res.status(200).json({ 
            status: "success", 
            recipe: recipeData,
            model: aiModel,
            usedChef: resolvedChef,
            usedSkill: resolvedSkill
        });

    } catch (error) {
        console.error("🔥 AI ERROR DETAILED:", error);
        return res.status(500).json({ 
            status: "error", 
            message: "Wystąpił błąd podczas pracy Szefa Kuchni.",
            details: error.message 
        });
    }
}