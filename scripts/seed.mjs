// Données de démonstration : villes, cinémas, salles, films et séances des
// 7 prochains jours. Idempotent : peut être relancé sans créer de doublons.
//   DATABASE_URL=... bun run db:seed
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquant");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });

const cities = [
  ["11111111-1111-4111-8111-111111111101", "Alger"],
  ["11111111-1111-4111-8111-111111111102", "Oran"],
  ["11111111-1111-4111-8111-111111111103", "Constantine"],
];

// id, nom, ville, adresse, lat, lng, description
const cinemas = [
  [
    "22222222-2222-4222-8222-222222222201",
    "Ibn Khaldoun",
    0,
    "Rue Docteur Saadane, Alger Centre",
    36.774048,
    3.057131,
    "Salle historique du centre d'Alger.",
  ],
  [
    "22222222-2222-4222-8222-222222222202",
    "Ibn Zaydoun",
    0,
    "Riadh El Feth, El Madania, Alger",
    36.743226,
    3.069799,
    "Salle de l'esplanade Riadh El Feth.",
  ],
  [
    "22222222-2222-4222-8222-222222222203",
    "Cosmos",
    0,
    "Riadh El Feth, El Madania, Alger",
    36.743191,
    3.070179,
    "Deux salles modernes à Riadh El Feth.",
  ],
  [
    "22222222-2222-4222-8222-222222222204",
    "Multiplex TMV Garden City",
    0,
    "Garden City, Chéraga, Alger",
    36.750761,
    2.951721,
    "Multiplexe trois salles à Chéraga.",
  ],
  [
    "22222222-2222-4222-8222-222222222205",
    "Multiplex Cinégold Es Senia",
    1,
    "Es Senia, Oran",
    35.638453,
    -0.590899,
    "Multiplexe trois salles dont une VIP.",
  ],
  [
    "22222222-2222-4222-8222-222222222206",
    "AZ Grand Ciné",
    1,
    "Front de mer, Oran",
    35.675803,
    -0.600621,
    "Deux salles au cœur d'Oran.",
  ],
  [
    "22222222-2222-4222-8222-222222222207",
    "Ahmed Bey",
    2,
    "Complexe culturel Zénith, Constantine",
    36.295208,
    6.62364,
    "Grande salle du complexe Zénith.",
  ],
];

// id, cinéma (index), nom, capacité, type
const halls = [
  ["33333333-3333-4333-8333-333333333301", 0, "Salle 1", 120, "standard"],
  ["33333333-3333-4333-8333-333333333302", 1, "Salle 1", 100, "standard"],
  ["33333333-3333-4333-8333-333333333303", 2, "Alpha", 80, "standard"],
  ["33333333-3333-4333-8333-333333333304", 2, "Beta", 60, "standard"],
  ["33333333-3333-4333-8333-333333333305", 3, "Salle 1", 90, "standard"],
  ["33333333-3333-4333-8333-333333333306", 3, "Salle 2", 70, "standard"],
  ["33333333-3333-4333-8333-333333333307", 3, "Salle 3", 50, "standard"],
  ["33333333-3333-4333-8333-333333333308", 4, "Mega", 110, "standard"],
  ["33333333-3333-4333-8333-333333333309", 4, "Mira", 80, "standard"],
  ["33333333-3333-4333-8333-333333333310", 4, "VIP", 40, "vip"],
  ["33333333-3333-4333-8333-333333333311", 5, "César", 90, "standard"],
  ["33333333-3333-4333-8333-333333333312", 5, "Odyssée", 70, "standard"],
  ["33333333-3333-4333-8333-333333333313", 6, "Salle 1", 150, "standard"],
];

// id, titre, titre arabe, durée, genre, classification, synopsis
const movies = [
  [
    "44444444-4444-4444-8444-444444444401",
    "Insidious : L'Invasion du lointain",
    "إنسيديوس: الغزو البعيد",
    108,
    "Horreur",
    "-16",
    "La famille Lambert affronte une nouvelle intrusion venue du Lointain, un territoire spirituel dont personne ne revient indemne.",
  ],
  [
    "44444444-4444-4444-8444-444444444402",
    "Spider-Man : Brand New Day",
    "الرجل العنكبوت: يوم جديد",
    132,
    "Action",
    "Tous publics",
    "Peter Parker repart de zéro dans un New York qui a oublié son nom, entre nouvelles menaces et vieilles blessures.",
  ],
  [
    "44444444-4444-4444-8444-444444444403",
    "Marius et le royaume des mers",
    "ماريوس ومملكة البحار",
    96,
    "Animation",
    "Tous publics",
    "Un jeune pêcheur découvre un royaume sous-marin menacé et devient malgré lui son dernier espoir.",
  ],
  [
    "44444444-4444-4444-8444-444444444404",
    "Pat' Patrouille : Mission Dino",
    "دورية المخالب: مهمة الديناصور",
    88,
    "Animation",
    "Tous publics",
    "La Pat' Patrouille part sur la piste de dinosaures échappés d'une vallée oubliée.",
  ],
  [
    "44444444-4444-4444-8444-444444444405",
    "La Fin d'Oak Street",
    "نهاية شارع أوك",
    114,
    "Drame",
    "-12",
    "Les derniers habitants d'une rue promise à la démolition se battent pour garder leur quartier vivant.",
  ],
  [
    "44444444-4444-4444-8444-444444444406",
    "Vaiana (live action)",
    "فايانا",
    124,
    "Aventure",
    "Tous publics",
    "L'adaptation en prises de vues réelles du voyage de Vaiana à travers le Pacifique.",
  ],
  [
    "44444444-4444-4444-8444-444444444407",
    "Toy Story 5",
    "حكاية لعبة 5",
    100,
    "Animation",
    "Tous publics",
    "Woody, Buzz et la bande font face à une nouvelle génération de jouets connectés.",
  ],
  [
    "44444444-4444-4444-8444-444444444408",
    "Backrooms",
    "الغرف الخلفية",
    102,
    "Horreur",
    "-16",
    "Piégés dans un dédale de couloirs sans fin, des adolescents cherchent une sortie qui n'existe peut-être pas.",
  ],
  [
    "44444444-4444-4444-8444-444444444409",
    "Minions & Monsters",
    "المينيونز والوحوش",
    95,
    "Animation",
    "Tous publics",
    "Les Minions s'associent à des monstres maladroits pour sauver leur ville d'un savant trop ambitieux.",
  ],
  [
    "44444444-4444-4444-8444-444444444410",
    "Michael Jackson",
    "مايكل جاكسون",
    140,
    "Biopic",
    "-12",
    "Le parcours du roi de la pop, de l'enfance à Gary jusqu'aux scènes les plus vastes du monde.",
  ],
  [
    "44444444-4444-4444-8444-444444444411",
    "Poupiya",
    "بوبية",
    92,
    "Comédie",
    "Tous publics",
    "Une comédie familiale algérienne pleine de quiproquos autour d'un mariage qui déraille.",
  ],
];

const languages = ["VF", "VOSTFR", "AR_DUB", "VO"];
const hours = [14, 17, 20];

try {
  await sql.begin(async (tx) => {
    for (const [id, name] of cities) {
      await tx`INSERT INTO cities (id, name) VALUES (${id}, ${name}) ON CONFLICT DO NOTHING`;
    }
    for (const [id, name, city, address, lat, lng, description] of cinemas) {
      await tx`INSERT INTO cinemas (id, name, city_id, address, latitude, longitude, description)
        VALUES (${id}, ${name}, ${cities[city][0]}, ${address}, ${lat}, ${lng}, ${description})
        ON CONFLICT DO NOTHING`;
    }
    for (const [id, cinema, name, capacity, type] of halls) {
      await tx`INSERT INTO halls (id, cinema_id, name, capacity, type)
        VALUES (${id}, ${cinemas[cinema][0]}, ${name}, ${capacity}, ${type}) ON CONFLICT DO NOTHING`;
      // Même plan que src/server/services/halls.ts : rangées de 10 sièges, A, B, C…
      await tx`INSERT INTO seats (hall_id, row_label, seat_number, seat_type)
        SELECT ${id}, chr(65 + (n - 1) / 10), ((n - 1) % 10) + 1, ${type}
        FROM generate_series(1, ${capacity}::int) n
        ON CONFLICT DO NOTHING`;
    }
    for (const [id, title, titleAr, duration, genre, age, synopsis] of movies) {
      await tx`INSERT INTO movies (id, title, title_ar, duration_minutes, genre, age_rating, synopsis)
        VALUES (${id}, ${title}, ${titleAr}, ${duration}, ${genre}, ${age}, ${synopsis})
        ON CONFLICT DO NOTHING`;
    }

    const [{ upcoming }] = await tx`SELECT count(*)::int AS upcoming FROM screenings
      WHERE status = 'publie' AND starts_at > now()`;
    if (upcoming > 0) return;

    // Programme des 7 prochains jours (heures d'Alger = UTC+1, sans heure d'été).
    let i = 0;
    for (let day = 0; day < 7; day++) {
      for (const [hallId] of halls) {
        const movie = movies[(i + day) % movies.length];
        const hour = hours[i % hours.length];
        const lang = languages[i % languages.length];
        const price = hallId.endsWith("10") ? 1200 : 500 + (i % 3) * 100;
        await tx`INSERT INTO screenings (hall_id, movie_id, starts_at, audio_language, price, status)
          VALUES (${hallId}, ${movie[0]},
            (date_trunc('day', now() AT TIME ZONE 'Africa/Algiers') + make_interval(days => ${day}, hours => ${hour}))
              AT TIME ZONE 'Africa/Algiers',
            ${lang}, ${price}, 'publie')`;
        i++;
      }
    }
  });
  console.log("Données de démonstration insérées");
} finally {
  await sql.end();
}
