// Données de démonstration : villes, cinémas, salles, films et programme des
// 7 prochains jours. Idempotent : relancer ne crée pas de doublons, et le
// programme n'est ajouté que s'il n'y a aucune séance publiée à venir.
// Utilisé par le bouton de l'espace admin et par `bun run db:seed`.
import { and, count, eq, gt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { cinemas, cities, halls, movies, screenings, seats } from "../db/schema";
import { seatLayout } from "./admin";

const CITIES = [
  {
    id: "11111111-1111-4111-8111-111111111101",
    name: "Alger",
    name_ar: "الجزائر",
    name_en: "Algiers",
  },
  { id: "11111111-1111-4111-8111-111111111102", name: "Oran", name_ar: "وهران", name_en: "Oran" },
  {
    id: "11111111-1111-4111-8111-111111111103",
    name: "Constantine",
    name_ar: "قسنطينة",
    name_en: "Constantine",
  },
];
const [ALGER, ORAN, CONSTANTINE] = CITIES.map((c) => c.id) as [string, string, string];

const CINEMAS = [
  {
    id: "22222222-2222-4222-8222-222222222201",
    name: "Ibn Khaldoun",
    city_id: ALGER,
    address: "Rue Docteur Saadane, Alger Centre",
    latitude: 36.774048,
    longitude: 3.057131,
    description: "Salle historique du centre d'Alger.",
  },
  {
    id: "22222222-2222-4222-8222-222222222202",
    name: "Ibn Zaydoun",
    city_id: ALGER,
    address: "Riadh El Feth, El Madania, Alger",
    latitude: 36.743226,
    longitude: 3.069799,
    description: "Salle de l'esplanade Riadh El Feth.",
  },
  {
    id: "22222222-2222-4222-8222-222222222203",
    name: "Cosmos",
    city_id: ALGER,
    address: "Riadh El Feth, El Madania, Alger",
    latitude: 36.743191,
    longitude: 3.070179,
    description: "Deux salles modernes à Riadh El Feth.",
  },
  {
    id: "22222222-2222-4222-8222-222222222204",
    name: "Multiplex TMV Garden City",
    city_id: ALGER,
    address: "Garden City, Chéraga, Alger",
    latitude: 36.750761,
    longitude: 2.951721,
    description: "Multiplexe trois salles à Chéraga.",
  },
  {
    id: "22222222-2222-4222-8222-222222222205",
    name: "Multiplex Cinégold Es Senia",
    city_id: ORAN,
    address: "Es Senia, Oran",
    latitude: 35.638453,
    longitude: -0.590899,
    description: "Multiplexe trois salles dont une VIP.",
  },
  {
    id: "22222222-2222-4222-8222-222222222206",
    name: "AZ Grand Ciné",
    city_id: ORAN,
    address: "Front de mer, Oran",
    latitude: 35.675803,
    longitude: -0.600621,
    description: "Deux salles au cœur d'Oran.",
  },
  {
    id: "22222222-2222-4222-8222-222222222207",
    name: "Ahmed Bey",
    city_id: CONSTANTINE,
    address: "Complexe culturel Zénith, Constantine",
    latitude: 36.295208,
    longitude: 6.62364,
    description: "Grande salle du complexe Zénith.",
  },
];

const c = (i: number) => CINEMAS[i]!.id;
const HALLS = [
  {
    id: "33333333-3333-4333-8333-333333333301",
    cinema_id: c(0),
    name: "Salle 1",
    capacity: 120,
    type: "standard" as const,
  },
  {
    id: "33333333-3333-4333-8333-333333333302",
    cinema_id: c(1),
    name: "Salle 1",
    capacity: 100,
    type: "standard" as const,
  },
  {
    id: "33333333-3333-4333-8333-333333333303",
    cinema_id: c(2),
    name: "Alpha",
    capacity: 80,
    type: "standard" as const,
  },
  {
    id: "33333333-3333-4333-8333-333333333304",
    cinema_id: c(2),
    name: "Beta",
    capacity: 60,
    type: "standard" as const,
  },
  {
    id: "33333333-3333-4333-8333-333333333305",
    cinema_id: c(3),
    name: "Salle 1",
    capacity: 90,
    type: "standard" as const,
  },
  {
    id: "33333333-3333-4333-8333-333333333306",
    cinema_id: c(3),
    name: "Salle 2",
    capacity: 70,
    type: "standard" as const,
  },
  {
    id: "33333333-3333-4333-8333-333333333307",
    cinema_id: c(3),
    name: "Salle 3",
    capacity: 50,
    type: "standard" as const,
  },
  {
    id: "33333333-3333-4333-8333-333333333308",
    cinema_id: c(4),
    name: "Mega",
    capacity: 110,
    type: "standard" as const,
  },
  {
    id: "33333333-3333-4333-8333-333333333309",
    cinema_id: c(4),
    name: "Mira",
    capacity: 80,
    type: "standard" as const,
  },
  {
    id: "33333333-3333-4333-8333-333333333310",
    cinema_id: c(4),
    name: "VIP",
    capacity: 40,
    type: "vip" as const,
  },
  {
    id: "33333333-3333-4333-8333-333333333311",
    cinema_id: c(5),
    name: "César",
    capacity: 90,
    type: "standard" as const,
  },
  {
    id: "33333333-3333-4333-8333-333333333312",
    cinema_id: c(5),
    name: "Odyssée",
    capacity: 70,
    type: "standard" as const,
  },
  {
    id: "33333333-3333-4333-8333-333333333313",
    cinema_id: c(6),
    name: "Salle 1",
    capacity: 150,
    type: "standard" as const,
  },
];

const MOVIES = [
  {
    id: "44444444-4444-4444-8444-444444444401",
    title: "Insidious : L'Invasion du lointain",
    title_ar: "إنسيديوس: الغزو البعيد",
    title_en: "Insidious: The Further Invasion",
    original_title: "Insidious: The Further",
    original_language: "en",
    synopsis_ar:
      "تواجه عائلة لامبرت اقتحاماً جديداً قادماً من «البعيد»، عالم روحي لا يعود منه أحد سالماً.",
    synopsis_en:
      "The Lambert family faces a new intrusion from the Further, a spirit realm no one returns from unscathed.",
    duration_minutes: 108,
    genre: "Horreur",
    age_rating: "-16",
    synopsis:
      "La famille Lambert affronte une nouvelle intrusion venue du Lointain, un territoire spirituel dont personne ne revient indemne.",
  },
  {
    id: "44444444-4444-4444-8444-444444444402",
    title: "Spider-Man : Brand New Day",
    title_ar: "الرجل العنكبوت: يوم جديد",
    title_en: "Spider-Man: Brand New Day",
    original_title: "Spider-Man: Brand New Day",
    original_language: "en",
    synopsis_ar: "يبدأ بيتر باركر من جديد في نيويورك نسيت اسمه، بين تهديدات جديدة وجراح قديمة.",
    synopsis_en:
      "Peter Parker starts over in a New York that has forgotten his name, facing new threats and old wounds.",
    duration_minutes: 132,
    genre: "Action",
    age_rating: "Tous publics",
    synopsis:
      "Peter Parker repart de zéro dans un New York qui a oublié son nom, entre nouvelles menaces et vieilles blessures.",
  },
  {
    id: "44444444-4444-4444-8444-444444444403",
    title: "Marius et le royaume des mers",
    title_ar: "ماريوس ومملكة البحار",
    title_en: "Marius and the Kingdom of the Sea",
    original_title: "Marius et le royaume des mers",
    original_language: "fr",
    synopsis_ar: "يكتشف صياد شاب مملكة تحت البحر مهددة، ويصبح رغماً عنه أملها الأخير.",
    synopsis_en:
      "A young fisherman discovers an endangered undersea kingdom and becomes, despite himself, its last hope.",
    duration_minutes: 96,
    genre: "Animation",
    age_rating: "Tous publics",
    synopsis:
      "Un jeune pêcheur découvre un royaume sous-marin menacé et devient malgré lui son dernier espoir.",
  },
  {
    id: "44444444-4444-4444-8444-444444444404",
    title: "Pat' Patrouille : Mission Dino",
    title_ar: "دورية المخالب: مهمة الديناصور",
    title_en: "PAW Patrol: Dino Mission",
    original_title: "PAW Patrol: Dino Mission",
    original_language: "en",
    synopsis_ar: "تنطلق دورية المخالب في أثر ديناصورات هاربة من وادٍ منسي.",
    synopsis_en: "The PAW Patrol tracks dinosaurs that escaped from a forgotten valley.",
    duration_minutes: 88,
    genre: "Animation",
    age_rating: "Tous publics",
    synopsis: "La Pat' Patrouille part sur la piste de dinosaures échappés d'une vallée oubliée.",
  },
  {
    id: "44444444-4444-4444-8444-444444444405",
    title: "La Fin d'Oak Street",
    title_ar: "نهاية شارع أوك",
    title_en: "The End of Oak Street",
    original_title: "The End of Oak Street",
    original_language: "en",
    synopsis_ar: "يكافح آخر سكان شارع مهدد بالهدم للحفاظ على حيّهم حياً.",
    synopsis_en:
      "The last residents of a street slated for demolition fight to keep their neighbourhood alive.",
    duration_minutes: 114,
    genre: "Drame",
    age_rating: "-12",
    synopsis:
      "Les derniers habitants d'une rue promise à la démolition se battent pour garder leur quartier vivant.",
  },
  {
    id: "44444444-4444-4444-8444-444444444406",
    title: "Vaiana (live action)",
    title_ar: "فايانا",
    title_en: "Moana (live action)",
    original_title: "Moana",
    original_language: "en",
    synopsis_ar: "النسخة الحية من رحلة فايانا عبر المحيط الهادئ.",
    synopsis_en: "The live-action adaptation of Moana's voyage across the Pacific.",
    duration_minutes: 124,
    genre: "Aventure",
    age_rating: "Tous publics",
    synopsis: "L'adaptation en prises de vues réelles du voyage de Vaiana à travers le Pacifique.",
  },
  {
    id: "44444444-4444-4444-8444-444444444407",
    title: "Toy Story 5",
    title_ar: "حكاية لعبة 5",
    title_en: "Toy Story 5",
    original_title: "Toy Story 5",
    original_language: "en",
    synopsis_ar: "وودي وباز ورفاقهما في مواجهة جيل جديد من الألعاب المتصلة.",
    synopsis_en: "Woody, Buzz and the gang face a new generation of connected toys.",
    duration_minutes: 100,
    genre: "Animation",
    age_rating: "Tous publics",
    synopsis: "Woody, Buzz et la bande font face à une nouvelle génération de jouets connectés.",
  },
  {
    id: "44444444-4444-4444-8444-444444444408",
    title: "Backrooms",
    title_ar: "الغرف الخلفية",
    title_en: "Backrooms",
    original_title: "Backrooms",
    original_language: "en",
    synopsis_ar: "مراهقون عالقون في متاهة ممرات لا نهاية لها يبحثون عن مخرج قد لا يكون موجوداً.",
    synopsis_en:
      "Trapped in an endless maze of corridors, teenagers search for an exit that may not exist.",
    duration_minutes: 102,
    genre: "Horreur",
    age_rating: "-16",
    synopsis:
      "Piégés dans un dédale de couloirs sans fin, des adolescents cherchent une sortie qui n'existe peut-être pas.",
  },
  {
    id: "44444444-4444-4444-8444-444444444409",
    title: "Minions & Monsters",
    title_ar: "المينيونز والوحوش",
    title_en: "Minions & Monsters",
    original_title: "Minions & Monsters",
    original_language: "en",
    synopsis_ar: "يتحالف المينيونز مع وحوش خرقاء لإنقاذ مدينتهم من عالم شديد الطموح.",
    synopsis_en:
      "The Minions team up with clumsy monsters to save their town from an overambitious scientist.",
    duration_minutes: 95,
    genre: "Animation",
    age_rating: "Tous publics",
    synopsis:
      "Les Minions s'associent à des monstres maladroits pour sauver leur ville d'un savant trop ambitieux.",
  },
  {
    id: "44444444-4444-4444-8444-444444444410",
    title: "Michael Jackson",
    title_ar: "مايكل جاكسون",
    title_en: "Michael Jackson",
    original_title: "Michael",
    original_language: "en",
    synopsis_ar: "مسيرة ملك البوب، من طفولته في غاري إلى أكبر مسارح العالم.",
    synopsis_en:
      "The journey of the King of Pop, from his childhood in Gary to the world's biggest stages.",
    duration_minutes: 140,
    genre: "Biopic",
    age_rating: "-12",
    synopsis:
      "Le parcours du roi de la pop, de l'enfance à Gary jusqu'aux scènes les plus vastes du monde.",
  },
  {
    id: "44444444-4444-4444-8444-444444444411",
    title: "Poupiya",
    title_ar: "بوبية",
    title_en: "Poupiya",
    original_title: "بوبية",
    original_language: "ar",
    synopsis_ar: "كوميديا عائلية جزائرية مليئة بسوء التفاهم حول عرس يخرج عن السيطرة.",
    synopsis_en:
      "An Algerian family comedy full of mix-ups around a wedding that goes off the rails.",
    duration_minutes: 92,
    genre: "Comédie",
    age_rating: "Tous publics",
    synopsis:
      "Une comédie familiale algérienne pleine de quiproquos autour d'un mariage qui déraille.",
  },
];

const LANGUAGES = ["VF", "VOSTFR", "AR_DUB", "VO"] as const;
const HOURS = [14, 17, 20];
const DAY = 24 * 60 * 60_000;
const ALGIERS_OFFSET = 60 * 60_000; // UTC+1 toute l'année

// Minuit (heure d'Alger) du jour en cours, en UTC.
function algiersMidnight(now: Date) {
  const local = now.getTime() + ALGIERS_OFFSET;
  return local - (local % DAY) - ALGIERS_OFFSET;
}

export async function seedDemo(db: Db, now = new Date()) {
  return db.transaction(async (tx) => {
    // Les traductions sont complétées si elles manquent, jamais écrasées.
    await tx
      .insert(cities)
      .values(CITIES)
      .onConflictDoUpdate({
        target: cities.id,
        set: {
          name_ar: sql`coalesce(${cities.name_ar}, excluded.name_ar)`,
          name_en: sql`coalesce(${cities.name_en}, excluded.name_en)`,
        },
      });
    await tx.insert(cinemas).values(CINEMAS).onConflictDoNothing();
    await tx.insert(halls).values(HALLS).onConflictDoNothing();
    for (const hall of HALLS) {
      await tx
        .insert(seats)
        .values(seatLayout(hall.capacity, hall.type).map((s) => ({ ...s, hall_id: hall.id })))
        .onConflictDoNothing();
    }
    await tx
      .insert(movies)
      .values(MOVIES)
      .onConflictDoUpdate({
        target: movies.id,
        set: {
          title_ar: sql`coalesce(${movies.title_ar}, excluded.title_ar)`,
          title_en: sql`coalesce(${movies.title_en}, excluded.title_en)`,
          synopsis_ar: sql`coalesce(${movies.synopsis_ar}, excluded.synopsis_ar)`,
          synopsis_en: sql`coalesce(${movies.synopsis_en}, excluded.synopsis_en)`,
          original_title: sql`coalesce(${movies.original_title}, excluded.original_title)`,
          original_language: sql`coalesce(${movies.original_language}, excluded.original_language)`,
        },
      });

    const [{ upcoming }] = (await tx
      .select({ upcoming: count() })
      .from(screenings)
      .where(and(eq(screenings.status, "publie"), gt(screenings.starts_at, now)))) as [
      { upcoming: number },
    ];
    if (upcoming > 0) return { screeningsAdded: 0 };

    const midnight = algiersMidnight(now);
    const rows = [];
    let i = 0;
    for (let day = 0; day < 7; day++) {
      for (const hall of HALLS) {
        const hour = HOURS[i % HOURS.length]!;
        rows.push({
          hall_id: hall.id,
          movie_id: MOVIES[(i + day) % MOVIES.length]!.id,
          starts_at: new Date(midnight + day * DAY + hour * 60 * 60_000),
          audio_language: LANGUAGES[i % LANGUAGES.length]!,
          price: hall.type === "vip" ? 1200 : 500 + (i % 3) * 100,
          status: "publie" as const,
        });
        i++;
      }
    }
    // Les séances déjà passées aujourd'hui ne sont pas créées.
    const future = rows.filter((r) => r.starts_at > now);
    if (future.length) await tx.insert(screenings).values(future);
    return { screeningsAdded: future.length };
  });
}
