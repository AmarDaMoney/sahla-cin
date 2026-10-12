# Ciné Algérie

Create a professional cinema ticket booking app called "BookCinéDZ" for Algeria. 

The app should have:

SCREENS:

1. Home screen with:

   - Logo "BookCinéDZ" with a red and dark theme

   - List of movies currently showing (with poster image, title in French and Arabic, rating, duration, genre tags)

   - Search bar to filter movies

   - "🇩🇿 Algerian Films" special section highlighted

   - City selector (Alger, Oran, Constantine)

   - Bottom navigation with 3 tabs: Films / Cinemas / More

2. Movie Detail screen with:

   - Movie poster (full width header)

   - Title in French + Arabic subtitle

   - Star rating, duration, genres

   - Synopsis in French

   - YouTube trailer button (opens link)

   - List of cinemas showing this movie with available time slots (14:00, 17:30, 21:00)

   - Each time slot is a red clickable button

   - "Book Ticket" flow

3. Cinemas screen with:

   - List of 3 cinemas in Alger:

     * Ibn Zeydoun — 2 Rue Didouche Mourad — Tel: 021 73 52 42 — 3 screens

     * Cinéma Algéria — Blvd Zirout Youcef — Tel: 021 63 78 15 — 2 screens  

     * El Mouggar — Rue Asselah Hocine — Tel: 021 74 28 90 — 1 screen

   - Each cinema card shows name, address, phone, number of screens

   - "Get Directions" button (opens Google Maps link)

4. Ticket Booking flow:

   - Select number of seats (1 to 6)

   - Show total price (500 DA per seat)

   - Payment method selector: CIB card / BaridiMob / Dahabia

   - "Confirm & Pay" button

   - After confirmation: show QR code ticket with booking reference, movie name, cinema, date, time, seats

5. More screen with:

   - "Report an Error" button (form with error type + message)

   - "Join WhatsApp Group" button

   - "About" section with app version BETA 1.0

   - Legal mentions

DESIGN:

- Dark theme background: #0f172a (dark navy)

- Primary color: #dc2626 (red)

- Accent: white text

- Modern, clean, premium feel

- Arabic text support for movie titles

- Mobile-first responsive design

SAMPLE DATA - Use these 4 movies:

1. Title: "Aquaman et le Royaume Perdu" | Arabic: "أكوامان والمملكة المفقودة" | Rating: 7.2 | Duration: 124 min | Genres: Action, Aventure | Poster: https://image.tmdb.org/t/p/w500/8xV47NDrjdZDpkVcCFqkdHa3T0C.jpg

2. Title: "Wonka" | Arabic: "ونكا" | Rating: 7.8 | Duration: 116 min | Genres: Comédie, Famille | Poster: https://image.tmdb.org/t/p/w500/qhb1qOilapbapxWQn9jtRCMwXJF.jpg

3. Title: "Migration" | Arabic: "الهجرة" | Rating: 7.4 | Duration: 92 min | Genres: Animation, Famille | Poster: https://image.tmdb.org/t/p/w500/ldfCF9RhR40mppkzmftxapaHeTo.jpg

4. Title: "Le Temps d'Aimer" | Arabic: "وقت الحب" | Rating: 8.1 | Duration: 105 min | Genres: Drame, Romance | DZ FLAG badge on poster | Algerian film

Make it look like a real production app, not a demo. Use shadcn/ui components. Make all buttons functional with smooth transitions.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://sahla-cin.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1fa9aa41-39d2-4090-b296-ce7103b95de5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
