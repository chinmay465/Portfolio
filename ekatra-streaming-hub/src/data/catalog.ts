import type { Genre, Kind, ProviderId, Title } from '../types.ts'

/**
 * Offline demo catalog so the app works without an API key.
 * Only each service's own originals and exclusive titles are listed, since those stay put;
 * licensed titles move between services too often to hard-code. Overviews are our own one-liners.
 * `weight` is an editorial popularity weight (0–1) used for cold-start ranking, not a rating.
 */
function t(
  slug: string,
  name: string,
  kind: Kind,
  year: number,
  genres: Genre[],
  language: string,
  provider: ProviderId,
  weight: number,
  tags: string[],
  overview: string,
): Title {
  return {
    id: `demo:${slug}`,
    name,
    kind,
    year,
    genres,
    language,
    providers: [provider],
    popularity: weight,
    tags,
    overview,
  }
}

export const DEMO_CATALOG: Title[] = [
  // Netflix
  t('sacred-games', 'Sacred Games', 'series', 2018, ['Crime', 'Thriller', 'Drama'], 'hi', 'netflix', 0.9, ['gangster', 'cop', 'mumbai', 'mythology'], 'A Mumbai cop gets a call from a gangster warning that the city has 25 days left.'),
  t('delhi-crime', 'Delhi Crime', 'series', 2019, ['Crime', 'Drama'], 'hi', 'netflix', 0.8, ['cop', 'true-story', 'delhi'], 'A police team races to find the men behind a brutal attack in the capital.'),
  t('kota-factory', 'Kota Factory', 'series', 2019, ['Drama', 'Comedy'], 'hi', 'netflix', 0.8, ['students', 'coming-of-age', 'small-town'], 'Teenagers grind through entrance-exam coaching in Kota, with one teacher who cares.'),
  t('jamtara', 'Jamtara', 'series', 2020, ['Crime', 'Drama'], 'hi', 'netflix', 0.6, ['con', 'small-town', 'cop'], 'Young phone scammers in a Jharkhand town run into local politics and a stubborn SP.'),
  t('kohrra', 'Kohrra', 'series', 2023, ['Crime', 'Mystery'], 'hi', 'netflix', 0.6, ['cop', 'murder-mystery', 'punjab'], 'Two Punjab cops investigate an NRI groom found dead days before his wedding.'),
  t('heeramandi', 'Heeramandi: The Diamond Bazaar', 'series', 2024, ['Drama', 'History'], 'hi', 'netflix', 0.6, ['period', 'epic'], 'Rival courtesans fight for power in pre-independence Lahore.'),
  t('scoop', 'Scoop', 'series', 2023, ['Drama', 'Crime'], 'hi', 'netflix', 0.5, ['journalism', 'mumbai', 'true-story'], 'A crime reporter becomes the accused in the murder case she was covering.'),
  t('jaane-jaan', 'Jaane Jaan', 'film', 2023, ['Thriller', 'Mystery'], 'hi', 'netflix', 0.55, ['murder-mystery', 'cop'], 'A quiet maths teacher helps his neighbour cover up a killing, and a cop smells it.'),
  t('stranger-things', 'Stranger Things', 'series', 2016, ['Sci-Fi', 'Horror', 'Drama'], 'en', 'netflix', 1, ['supernatural', 'small-town', 'coming-of-age', '80s'], 'A boy vanishes in a small Indiana town and his friends find a girl with powers.'),
  t('money-heist', 'Money Heist', 'series', 2017, ['Crime', 'Thriller'], 'es', 'netflix', 0.9, ['heist'], 'A mastermind called the Professor leads a crew into Spain’s Royal Mint.'),
  t('squid-game', 'Squid Game', 'series', 2021, ['Thriller', 'Drama'], 'ko', 'netflix', 0.95, ['survival', 'debt'], 'People drowning in debt compete in deadly children’s games for a huge prize.'),
  t('dark', 'Dark', 'series', 2017, ['Sci-Fi', 'Mystery'], 'de', 'netflix', 0.8, ['time-travel', 'small-town'], 'A missing child exposes a time loop tying four German families together.'),
  t('the-crown', 'The Crown', 'series', 2016, ['Drama', 'History'], 'en', 'netflix', 0.7, ['period', 'royalty', 'true-story'], 'The reign of Elizabeth II, from her wedding to the modern era.'),
  t('wednesday', 'Wednesday', 'series', 2022, ['Mystery', 'Comedy', 'Fantasy'], 'en', 'netflix', 0.85, ['supernatural', 'coming-of-age'], 'Wednesday Addams solves a string of murders at her new boarding school.'),
  t('narcos', 'Narcos', 'series', 2015, ['Crime', 'Drama'], 'en', 'netflix', 0.75, ['drugs', 'true-story', 'cop'], 'DEA agents hunt Pablo Escobar across Colombia.'),
  t('mindhunter', 'Mindhunter', 'series', 2017, ['Crime', 'Thriller'], 'en', 'netflix', 0.7, ['serial-killer', 'true-story', 'investigator'], 'Two FBI agents interview serial killers to learn how they think.'),
  t('black-mirror', 'Black Mirror', 'series', 2011, ['Sci-Fi', 'Thriller'], 'en', 'netflix', 0.7, ['anthology', 'tech', 'satire'], 'Stand-alone stories about technology going a step too far.'),
  t('glass-onion', 'Glass Onion: A Knives Out Mystery', 'film', 2022, ['Mystery', 'Comedy'], 'en', 'netflix', 0.6, ['murder-mystery', 'investigator'], 'Detective Benoit Blanc joins a tech billionaire’s island party, and someone dies.'),
  t('the-irishman', 'The Irishman', 'film', 2019, ['Crime', 'Drama'], 'en', 'netflix', 0.55, ['gangster', 'true-story', 'period'], 'An ageing hitman looks back on his years with the mob and Jimmy Hoffa.'),

  // Prime Video
  t('the-family-man', 'The Family Man', 'series', 2019, ['Action', 'Thriller', 'Comedy'], 'hi', 'prime', 0.95, ['spy', 'family', 'mumbai'], 'A middle-class dad secretly works as an intelligence officer chasing terror plots.'),
  t('mirzapur', 'Mirzapur', 'series', 2018, ['Crime', 'Action'], 'hi', 'prime', 0.9, ['gangster', 'small-town', 'uttar-pradesh'], 'Two brothers get pulled into the empire of Mirzapur’s gun-running don.'),
  t('panchayat', 'Panchayat', 'series', 2020, ['Comedy', 'Drama'], 'hi', 'prime', 0.95, ['small-town', 'village', 'slice-of-life'], 'An engineering grad takes a government job as secretary of a remote village office.'),
  t('paatal-lok', 'Paatal Lok', 'series', 2020, ['Crime', 'Thriller'], 'hi', 'prime', 0.8, ['cop', 'delhi', 'journalism'], 'A washed-up Delhi cop lands a high-profile case tied to a plot on a TV anchor.'),
  t('farzi', 'Farzi', 'series', 2023, ['Crime', 'Thriller'], 'hi', 'prime', 0.75, ['con', 'counterfeit', 'cop'], 'A struggling artist starts printing perfect fake currency.'),
  t('dahaad', 'Dahaad', 'series', 2023, ['Crime', 'Thriller'], 'hi', 'prime', 0.6, ['cop', 'serial-killer', 'small-town'], 'A Rajasthan sub-inspector links a run of missing women to one man.'),
  t('made-in-heaven', 'Made in Heaven', 'series', 2019, ['Drama', 'Romance'], 'hi', 'prime', 0.6, ['weddings', 'delhi'], 'Two Delhi wedding planners see the secrets behind lavish weddings.'),
  t('inside-edge', 'Inside Edge', 'series', 2017, ['Sports', 'Drama'], 'hi', 'prime', 0.45, ['cricket', 'corporate'], 'Money, fixing and egos inside a T20 cricket franchise.'),
  t('shershaah', 'Shershaah', 'film', 2021, ['War', 'Action', 'Drama'], 'hi', 'prime', 0.7, ['army', 'true-story'], 'The life of Captain Vikram Batra, up to the Kargil war.'),
  t('the-boys', 'The Boys', 'series', 2019, ['Action', 'Sci-Fi', 'Comedy'], 'en', 'prime', 0.95, ['superheroes', 'satire'], 'Vigilantes take on corrupt superheroes owned by a mega-corporation.'),
  t('fallout', 'Fallout', 'series', 2024, ['Sci-Fi', 'Action'], 'en', 'prime', 0.8, ['post-apocalyptic', 'video-game'], 'A vault dweller steps out into a nuclear wasteland Los Angeles.'),
  t('reacher', 'Reacher', 'series', 2022, ['Action', 'Crime'], 'en', 'prime', 0.75, ['investigator', 'small-town'], 'A drifter and ex-military cop untangles a conspiracy in a small Georgia town.'),
  t('jack-ryan', 'Jack Ryan', 'series', 2018, ['Action', 'Thriller'], 'en', 'prime', 0.6, ['spy'], 'A CIA analyst is pushed into field work after spotting a terror money trail.'),
  t('mrs-maisel', 'The Marvelous Mrs. Maisel', 'series', 2017, ['Comedy', 'Drama'], 'en', 'prime', 0.55, ['period', 'stand-up'], 'A 1950s New York housewife discovers she’s a natural at stand-up.'),
  t('rings-of-power', 'The Lord of the Rings: The Rings of Power', 'series', 2022, ['Fantasy', 'Drama'], 'en', 'prime', 0.65, ['epic'], 'Middle-earth thousands of years before the Hobbits.'),
  t('invincible', 'Invincible', 'series', 2021, ['Animation', 'Action', 'Sci-Fi'], 'en', 'prime', 0.7, ['superheroes', 'coming-of-age'], 'The son of Earth’s greatest hero gets his powers and learns the family secret.'),

  // JioHotstar
  t('special-ops', 'Special Ops', 'series', 2020, ['Action', 'Thriller'], 'hi', 'jiohotstar', 0.75, ['spy', 'terrorism'], 'A RAW officer’s 19-year hunt for the mastermind behind an attack on Parliament.'),
  t('aarya', 'Aarya', 'series', 2020, ['Crime', 'Drama'], 'hi', 'jiohotstar', 0.7, ['family', 'drugs'], 'After her husband is shot, a mother takes over his drug business to protect her kids.'),
  t('criminal-justice', 'Criminal Justice', 'series', 2019, ['Crime', 'Drama'], 'hi', 'jiohotstar', 0.65, ['courtroom', 'mumbai'], 'A cab driver wakes up next to a dead passenger, and a small-time lawyer takes his case.'),
  t('the-night-manager-in', 'The Night Manager', 'series', 2023, ['Thriller'], 'hi', 'jiohotstar', 0.55, ['spy', 'arms-dealer'], 'An ex-navy officer goes undercover inside an arms dealer’s inner circle.'),
  t('asur', 'Asur', 'series', 2020, ['Crime', 'Thriller', 'Mystery'], 'hi', 'jiohotstar', 0.6, ['serial-killer', 'mythology', 'forensics'], 'A forensic expert returns to the CBI to catch a killer who stages murders like myths.'),
  t('house-of-the-dragon', 'House of the Dragon', 'series', 2022, ['Fantasy', 'Drama'], 'en', 'jiohotstar', 0.9, ['epic', 'dragons', 'family'], 'House Targaryen tears itself apart over who gets the Iron Throne.'),
  t('the-last-of-us', 'The Last of Us', 'series', 2023, ['Drama', 'Sci-Fi', 'Horror'], 'en', 'jiohotstar', 0.9, ['post-apocalyptic', 'video-game', 'survival'], 'A smuggler escorts a teenage girl across a collapsed America.'),
  t('succession', 'Succession', 'series', 2018, ['Drama', 'Comedy'], 'en', 'jiohotstar', 0.8, ['family', 'corporate', 'satire'], 'Four siblings scheme to take over their father’s media empire.'),
  t('loki', 'Loki', 'series', 2021, ['Sci-Fi', 'Fantasy'], 'en', 'jiohotstar', 0.7, ['superheroes', 'time-travel'], 'The god of mischief is drafted by an agency that polices the timeline.'),
  t('the-mandalorian', 'The Mandalorian', 'series', 2019, ['Sci-Fi', 'Action'], 'en', 'jiohotstar', 0.75, ['space', 'western'], 'A lone bounty hunter protects a mysterious child across the outer rim.'),
  t('the-bear', 'The Bear', 'series', 2022, ['Comedy', 'Drama'], 'en', 'jiohotstar', 0.8, ['kitchen', 'family'], 'A fine-dining chef comes home to run his late brother’s Chicago sandwich shop.'),
  t('shogun', 'Shōgun', 'series', 2024, ['Drama', 'History', 'War'], 'en', 'jiohotstar', 0.75, ['period', 'epic'], 'An English sailor is shipwrecked in feudal Japan in the middle of a power struggle.'),

  // SonyLIV
  t('scam-1992', 'Scam 1992: The Harshad Mehta Story', 'series', 2020, ['Crime', 'Drama', 'History'], 'hi', 'sonyliv', 0.95, ['true-story', 'finance', 'mumbai'], 'A Mumbai stockbroker’s rise and the securities scam that brought him down.'),
  t('scam-2003', 'Scam 2003: The Telgi Story', 'series', 2023, ['Crime', 'Drama'], 'hi', 'sonyliv', 0.6, ['true-story', 'con', 'counterfeit'], 'A fruit seller builds a nationwide fake stamp-paper racket.'),
  t('rocket-boys', 'Rocket Boys', 'series', 2022, ['Drama', 'History'], 'hi', 'sonyliv', 0.7, ['true-story', 'science', 'period'], 'Homi Bhabha and Vikram Sarabhai build India’s nuclear and space programmes.'),
  t('gullak', 'Gullak', 'series', 2019, ['Comedy', 'Family'], 'hi', 'sonyliv', 0.75, ['small-town', 'family', 'slice-of-life'], 'Everyday squabbles and small joys of the Mishra family in a small town.'),
  t('maharani', 'Maharani', 'series', 2021, ['Drama', 'Politics'], 'hi', 'sonyliv', 0.55, ['politics', 'small-town'], 'A homemaker suddenly becomes Bihar’s chief minister.'),
  t('undekhi', 'Undekhi', 'series', 2020, ['Thriller', 'Crime'], 'hi', 'sonyliv', 0.5, ['cover-up', 'weddings', 'cop'], 'A wedding videographer films a murder at a powerful family’s celebration.'),
  t('freedom-at-midnight', 'Freedom at Midnight', 'series', 2024, ['History', 'Drama', 'Politics'], 'hi', 'sonyliv', 0.5, ['period', 'true-story', 'politics'], 'The negotiations and leaders behind India’s independence and partition.'),

  // ZEE5
  t('sunflower', 'Sunflower', 'series', 2021, ['Comedy', 'Crime'], 'hi', 'zee5', 0.5, ['murder-mystery', 'mumbai'], 'A murder in a Mumbai housing society and the oddball residents caught up in it.'),
  t('rangbaaz', 'Rangbaaz', 'series', 2018, ['Crime', 'Action'], 'hi', 'zee5', 0.45, ['gangster', 'uttar-pradesh', 'true-story'], 'A Gorakhpur student turns into one of UP’s most feared gangsters.'),
  t('the-broken-news', 'The Broken News', 'series', 2022, ['Drama'], 'hi', 'zee5', 0.4, ['journalism', 'mumbai'], 'Two rival news channels, one ethical and one loud, in a fight for ratings.'),
]
