export interface WorldCountryOption {
  value: string;
  labelEn: string;
  labelPt: string;
  lat: number;
  lng: number;
  suggestedCities: string[];
  knownCities: string[];
}

export interface CityValidationResult {
  valid: boolean;
  normalizedInput: string;
  canonicalCity?: string;
  matchedCountry?: string;
  reason?:
    | 'empty'
    | 'invalid_characters'
    | 'profanity'
    | 'gibberish'
    | 'wrong_country'
    | 'unknown_city_for_country'
    | 'needs_geocoding';
}

export interface LocationSanitizationResult {
  valid: boolean;
  sanitized: string;
  reason?: 'empty' | 'invalid_characters' | 'profanity' | 'gibberish';
}

export interface ActivityBoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
  centerLat: number;
  centerLng: number;
  spanLat: number;
  spanLng: number;
  recommendedZoom: number;
}

export function normalizeGeoText(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const VALID_LOCATION_CHARS_REGEX = /^(?=.*\p{L}.*\p{L})[\p{L}\p{M}\s'.\-’]+$/u;
const REPEATED_CHARS_REGEX = /(.)\1{3,}/i;
const CONSONANT_MASH_REGEX = /[bcdfghjklmnpqrstvwxz]{5,}/i;

const PROFANITY_BLOCKLIST = new Set([
  'fuck',
  'fucking',
  'fucker',
  'motherfucker',
  'shit',
  'shitty',
  'bullshit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'dick',
  'pussy',
  'cock',
  'whore',
  'slut',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'caralho',
  'foda',
  'fodase',
  'merda',
  'puta',
  'cabrao',
  'paneleiro',
  'cona',
  'pissa',
  'mierda',
  'puto',
  'pendejo',
  'cabron',
  'chingar',
  'verga',
  'culero',
]);

/**
 * Frontend pre-check that blocks numbers, invalid special characters, profanity/slurs,
 * and keyboard-mash gibberish before querying the Geocoding API.
 */
export function sanitizeAndCheckLocationInput(rawInput: string): LocationSanitizationResult {
  const sanitized = String(rawInput || '')
    .trim()
    .replace(/\s+/g, ' ');

  if (!sanitized) {
    return { valid: false, sanitized: '', reason: 'empty' };
  }

  if (sanitized.length < 2 || sanitized.length > 85) {
    return { valid: false, sanitized, reason: 'invalid_characters' };
  }

  // Block numbers (0-9) and invalid special characters (@#$%^&*!+=?<>~[]{}|\;:"/_ etc.)
  if (!VALID_LOCATION_CHARS_REGEX.test(sanitized)) {
    return { valid: false, sanitized, reason: 'invalid_characters' };
  }

  const norm = normalizeGeoText(sanitized);
  if (!norm || norm.length < 2) {
    return { valid: false, sanitized, reason: 'invalid_characters' };
  }

  // Block profanity and offensive slurs
  const tokens = norm.split(/[\s-]+/).filter(Boolean);
  for (const token of tokens) {
    if (
      PROFANITY_BLOCKLIST.has(token) ||
      /^(fuck|motherfuck|shit|bullshit|bitch|asshole|cunt|nigger|nigga|faggot|caralho|fodase|merda|mierda|pendejo)/i.test(
        token
      )
    ) {
      return { valid: false, sanitized, reason: 'profanity' };
    }
  }
  if (PROFANITY_BLOCKLIST.has(norm.replace(/\s+/g, ''))) {
    return { valid: false, sanitized, reason: 'profanity' };
  }

  // Block obvious keyboard-mash gibberish (e.g. "aaaaa", "xkcdqwe", or vowel-less ASCII words >= 4 chars)
  if (REPEATED_CHARS_REGEX.test(norm) || CONSONANT_MASH_REGEX.test(norm)) {
    return { valid: false, sanitized, reason: 'gibberish' };
  }

  for (const token of tokens) {
    if (token.length >= 4 && /^[a-z]+$/.test(token) && !/[aeiouy]/.test(token)) {
      return { valid: false, sanitized, reason: 'gibberish' };
    }
  }

  return { valid: true, sanitized };
}

/**
 * Comprehensive worldwide list of countries, strictly sorted in alphabetical order by value (English name).
 */
export const WORLD_COUNTRIES: WorldCountryOption[] = [
  { value: 'Afghanistan', labelEn: 'Afghanistan', labelPt: 'Afeganistão', lat: 34.5553, lng: 69.2075, suggestedCities: ['Kabul', 'Herat', 'Mazar-i-Sharif'], knownCities: ['Kabul', 'Herat', 'Mazar-i-Sharif', 'Kandahar', 'Bamyan'] },
  { value: 'Albania', labelEn: 'Albania', labelPt: 'Albânia', lat: 41.3275, lng: 19.8187, suggestedCities: ['Tirana', 'Berat', 'Gjirokastër', 'Sarandë'], knownCities: ['Tirana', 'Berat', 'Gjirokaster', 'Sarande', 'Durres', 'Shkoder', 'Vlore', 'Ksamil', 'Kruje'] },
  { value: 'Algeria', labelEn: 'Algeria', labelPt: 'Argélia', lat: 36.7538, lng: 3.0588, suggestedCities: ['Algiers', 'Oran', 'Constantine', 'Tlemcen'], knownCities: ['Algiers', 'Argel', 'Oran', 'Constantine', 'Tlemcen', 'Annaba', 'Ghardaia', 'Tamanrasset'] },
  { value: 'Andorra', labelEn: 'Andorra', labelPt: 'Andorra', lat: 42.5063, lng: 1.5218, suggestedCities: ['Andorra la Vella', 'Soldeu', 'Ordino'], knownCities: ['Andorra la Vella', 'Soldeu', 'Ordino', 'Escaldes-Engordany', 'Encamp', 'La Massana'] },
  { value: 'Angola', labelEn: 'Angola', labelPt: 'Angola', lat: -8.839, lng: 13.2894, suggestedCities: ['Luanda', 'Lubango', 'Benguela', 'Huambo'], knownCities: ['Luanda', 'Lubango', 'Benguela', 'Huambo', 'Lobito', 'Namibe', 'Malanje', 'Cabinda'] },
  { value: 'Antigua and Barbuda', labelEn: 'Antigua and Barbuda', labelPt: 'Antígua e Barbuda', lat: 17.1274, lng: -61.8468, suggestedCities: ["St. John's", 'English Harbour', 'Jolly Harbour'], knownCities: ['St Johns', 'Saint Johns', 'English Harbour', 'Jolly Harbour', 'Codrington'] },
  { value: 'Argentina', labelEn: 'Argentina', labelPt: 'Argentina', lat: -34.6037, lng: -58.3816, suggestedCities: ['Buenos Aires', 'Mendoza', 'Bariloche', 'Córdoba'], knownCities: ['Buenos Aires', 'Mendoza', 'Bariloche', 'San Carlos de Bariloche', 'Cordoba', 'Ushuaia', 'Salta', 'Rosario', 'El Calafate', 'Puerto Iguazu', 'Mar del Plata'] },
  { value: 'Armenia', labelEn: 'Armenia', labelPt: 'Arménia', lat: 40.1792, lng: 44.4991, suggestedCities: ['Yerevan', 'Dilijan', 'Gyumri'], knownCities: ['Yerevan', 'Erevan', 'Dilijan', 'Gyumri', 'Goris', 'Sevan', 'Tsaghkadzor'] },
  { value: 'Australia', labelEn: 'Australia', labelPt: 'Austrália', lat: -33.8688, lng: 151.2093, suggestedCities: ['Sydney', 'Melbourne', 'Brisbane', 'Perth'], knownCities: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra', 'Cairns', 'Gold Coast', 'Hobart', 'Darwin', 'Byron Bay'] },
  { value: 'Austria', labelEn: 'Austria', labelPt: 'Áustria', lat: 48.2082, lng: 16.3738, suggestedCities: ['Vienna', 'Salzburg', 'Innsbruck', 'Hallstatt'], knownCities: ['Vienna', 'Viena', 'Wien', 'Salzburg', 'Salzburgo', 'Innsbruck', 'Hallstatt', 'Graz', 'Linz', 'Klagenfurt', 'Bregenz', 'Zell am See', 'Bad Gastein'] },
  { value: 'Azerbaijan', labelEn: 'Azerbaijan', labelPt: 'Azerbaijão', lat: 40.4093, lng: 49.8671, suggestedCities: ['Baku', 'Sheki', 'Qabala'], knownCities: ['Baku', 'Bacu', 'Sheki', 'Qabala', 'Gabala', 'Ganja', 'Quba'] },
  { value: 'Bahamas', labelEn: 'Bahamas', labelPt: 'Bahamas', lat: 25.0443, lng: -77.3504, suggestedCities: ['Nassau', 'Freeport', 'Exuma'], knownCities: ['Nassau', 'Freeport', 'Exuma', 'Eleuthera', 'Harbour Island', 'Bimini'] },
  { value: 'Bahrain', labelEn: 'Bahrain', labelPt: 'Barém', lat: 26.2285, lng: 50.586, suggestedCities: ['Manama', 'Muharraq', 'Riffa'], knownCities: ['Manama', 'Muharraq', 'Riffa', 'Isa Town'] },
  { value: 'Bangladesh', labelEn: 'Bangladesh', labelPt: 'Bangladexe', lat: 23.8103, lng: 90.4125, suggestedCities: ['Dhaka', 'Chittagong', 'Sylhet'], knownCities: ['Dhaka', 'Daca', 'Chittagong', 'Sylhet', 'Coxs Bazar', 'Khulna', 'Rajshahi'] },
  { value: 'Barbados', labelEn: 'Barbados', labelPt: 'Barbados', lat: 13.0969, lng: -59.6145, suggestedCities: ['Bridgetown', 'Holetown', 'Speightstown'], knownCities: ['Bridgetown', 'Holetown', 'Speightstown', 'Oistins', 'Bathsheba'] },
  { value: 'Belarus', labelEn: 'Belarus', labelPt: 'Bielorrússia', lat: 53.9006, lng: 27.559, suggestedCities: ['Minsk', 'Brest', 'Grodno'], knownCities: ['Minsk', 'Brest', 'Grodno', 'Vitebsk', 'Gomel', 'Mogilev'] },
  { value: 'Belgium', labelEn: 'Belgium', labelPt: 'Bélgica', lat: 50.8503, lng: 4.3517, suggestedCities: ['Brussels', 'Bruges', 'Ghent', 'Antwerp'], knownCities: ['Brussels', 'Bruxelas', 'Bruxelles', 'Bruges', 'Brugge', 'Ghent', 'Gante', 'Gent', 'Antwerp', 'Antuerpia', 'Leuven', 'Liege', 'Namur', 'Dinant', 'Ostend'] },
  { value: 'Belize', labelEn: 'Belize', labelPt: 'Belize', lat: 17.5046, lng: -88.1962, suggestedCities: ['Belize City', 'San Pedro', 'San Ignacio'], knownCities: ['Belize City', 'San Pedro', 'San Ignacio', 'Placencia', 'Caye Caulker', 'Belmopan'] },
  { value: 'Benin', labelEn: 'Benin', labelPt: 'Benim', lat: 6.3703, lng: 2.3912, suggestedCities: ['Cotonou', 'Porto-Novo', 'Ouidah'], knownCities: ['Cotonou', 'Porto-Novo', 'Ouidah', 'Abomey', 'Parakou'] },
  { value: 'Bhutan', labelEn: 'Bhutan', labelPt: 'Butão', lat: 27.4728, lng: 89.6393, suggestedCities: ['Thimphu', 'Paro', 'Punakha'], knownCities: ['Thimphu', 'Paro', 'Punakha', 'Bumthang', 'Phobjikha'] },
  { value: 'Bolivia', labelEn: 'Bolivia', labelPt: 'Bolívia', lat: -16.4897, lng: -68.1193, suggestedCities: ['La Paz', 'Sucre', 'Uyuni', 'Santa Cruz'], knownCities: ['La Paz', 'Sucre', 'Uyuni', 'Santa Cruz', 'Santa Cruz de la Sierra', 'Cochabamba', 'Potosi', 'Copacabana'] },
  { value: 'Bosnia and Herzegovina', labelEn: 'Bosnia and Herzegovina', labelPt: 'Bósnia e Herzegovina', lat: 43.8563, lng: 18.4131, suggestedCities: ['Sarajevo', 'Mostar', 'Banja Luka'], knownCities: ['Sarajevo', 'Saraievo', 'Mostar', 'Banja Luka', 'Trebinje', 'Jajce', 'Travnik'] },
  { value: 'Botswana', labelEn: 'Botswana', labelPt: 'Botsuana', lat: -24.6282, lng: 25.9231, suggestedCities: ['Gaborone', 'Maun', 'Kasane'], knownCities: ['Gaborone', 'Maun', 'Kasane', 'Francistown'] },
  { value: 'Brazil', labelEn: 'Brazil', labelPt: 'Brasil', lat: -22.9068, lng: -43.1729, suggestedCities: ['Rio de Janeiro', 'São Paulo', 'Salvador', 'Florianópolis'], knownCities: ['Rio de Janeiro', 'Sao Paulo', 'Salvador', 'Florianopolis', 'Brasilia', 'Recife', 'Olinda', 'Fortaleza', 'Belo Horizonte', 'Ouro Preto', 'Paraty', 'Foz do Iguacu', 'Manaus', 'Curitiba', 'Porto Alegre', 'Gramado', 'Natal', 'Maceio', 'Belem'] },
  { value: 'Brunei', labelEn: 'Brunei', labelPt: 'Brunei', lat: 4.9031, lng: 114.9398, suggestedCities: ['Bandar Seri Begawan', 'Kuala Belait'], knownCities: ['Bandar Seri Begawan', 'Kuala Belait', 'Seria', 'Tutong'] },
  { value: 'Bulgaria', labelEn: 'Bulgaria', labelPt: 'Bulgária', lat: 42.6977, lng: 23.3219, suggestedCities: ['Sofia', 'Plovdiv', 'Varna', 'Veliko Tarnovo'], knownCities: ['Sofia', 'Sófia', 'Plovdiv', 'Varna', 'Veliko Tarnovo', 'Burgas', 'Nessebar', 'Bansko', 'Rila'] },
  { value: 'Burkina Faso', labelEn: 'Burkina Faso', labelPt: 'Burquina Faso', lat: 12.3714, lng: -1.5197, suggestedCities: ['Ouagadougou', 'Bobo-Dioulasso'], knownCities: ['Ouagadougou', 'Bobo-Dioulasso', 'Banfora'] },
  { value: 'Burundi', labelEn: 'Burundi', labelPt: 'Burundi', lat: -3.3614, lng: 29.3599, suggestedCities: ['Bujumbura', 'Gitega'], knownCities: ['Bujumbura', 'Gitega'] },
  { value: 'Cabo Verde', labelEn: 'Cabo Verde', labelPt: 'Cabo Verde', lat: 14.933, lng: -23.5133, suggestedCities: ['Praia', 'Mindelo', 'Santa Maria', 'Sal Rei'], knownCities: ['Praia', 'Mindelo', 'Santa Maria', 'Sal', 'Boa Vista', 'Sal Rei', 'Sao Filipe', 'Tarrafal', 'Espargos'] },
  { value: 'Cambodia', labelEn: 'Cambodia', labelPt: 'Camboja', lat: 11.5564, lng: 104.9282, suggestedCities: ['Siem Reap', 'Phnom Penh', 'Kampot'], knownCities: ['Siem Reap', 'Phnom Penh', 'Kampot', 'Battambang', 'Sihanoukville', 'Kep', 'Koh Rong'] },
  { value: 'Cameroon', labelEn: 'Cameroon', labelPt: 'Camarões', lat: 3.848, lng: 11.5021, suggestedCities: ['Yaoundé', 'Douala', 'Kribi'], knownCities: ['Yaounde', 'Douala', 'Kribi', 'Limbe', 'Bamenda', 'Buea'] },
  { value: 'Canada', labelEn: 'Canada', labelPt: 'Canadá', lat: 45.5017, lng: -73.5673, suggestedCities: ['Toronto', 'Vancouver', 'Montreal', 'Quebec City'], knownCities: ['Toronto', 'Vancouver', 'Montreal', 'Quebec City', 'Quebec', 'Ottawa', 'Calgary', 'Banff', 'Victoria', 'Halifax', 'Whistler', 'Edmonton', 'Winnipeg', 'Niagara Falls'] },
  { value: 'Central African Republic', labelEn: 'Central African Republic', labelPt: 'República Centro-Africana', lat: 4.3947, lng: 18.5582, suggestedCities: ['Bangui', 'Bimbo'], knownCities: ['Bangui', 'Bimbo', 'Berberati'] },
  { value: 'Chad', labelEn: 'Chad', labelPt: 'Chade', lat: 12.1348, lng: 15.0557, suggestedCities: ["N'Djamena", 'Moundou'], knownCities: ['NDjamena', 'Moundou', 'Abeche'] },
  { value: 'Chile', labelEn: 'Chile', labelPt: 'Chile', lat: -33.4489, lng: -70.6693, suggestedCities: ['Santiago', 'Valparaíso', 'San Pedro de Atacama', 'Puerto Varas'], knownCities: ['Santiago', 'Valparaiso', 'San Pedro de Atacama', 'Atacama', 'Puerto Varas', 'Punta Arenas', 'Puerto Natales', 'Vina del Mar', 'La Serena', 'Pucon', 'Concepcion'] },
  { value: 'China', labelEn: 'China', labelPt: 'China', lat: 39.9042, lng: 116.4074, suggestedCities: ['Beijing', 'Shanghai', "Xi'an", 'Chengdu'], knownCities: ['Beijing', 'Pequim', 'Shanghai', 'Xangai', 'Xian', 'Chengdu', 'Guangzhou', 'Shenzhen', 'Guilin', 'Hangzhou', 'Suzhou', 'Chongqing', 'Hong Kong', 'Macau', 'Kunming', 'Lhasa', 'Harbin'] },
  { value: 'Colombia', labelEn: 'Colombia', labelPt: 'Colômbia', lat: 4.711, lng: -74.0721, suggestedCities: ['Bogotá', 'Medellín', 'Cartagena', 'Cali'], knownCities: ['Bogota', 'Medellin', 'Cartagena', 'Cali', 'Santa Marta', 'Barranquilla', 'Salento', 'Villa de Leyva', 'San Andres'] },
  { value: 'Comoros', labelEn: 'Comoros', labelPt: 'Comores', lat: -11.7172, lng: 43.2473, suggestedCities: ['Moroni', 'Mutsamudu'], knownCities: ['Moroni', 'Mutsamudu', 'Fomboni'] },
  { value: 'Congo (Brazzaville)', labelEn: 'Congo (Brazzaville)', labelPt: 'Congo-Brazzaville', lat: -4.2634, lng: 15.2429, suggestedCities: ['Brazzaville', 'Pointe-Noire'], knownCities: ['Brazzaville', 'Pointe-Noire'] },
  { value: 'Congo (Kinshasa)', labelEn: 'Congo (Kinshasa)', labelPt: 'República Democrática do Congo', lat: -4.4419, lng: 15.2663, suggestedCities: ['Kinshasa', 'Goma', 'Lubumbashi'], knownCities: ['Kinshasa', 'Goma', 'Lubumbashi', 'Bukavu'] },
  { value: 'Costa Rica', labelEn: 'Costa Rica', labelPt: 'Costa Rica', lat: 9.9281, lng: -84.0907, suggestedCities: ['San José', 'La Fortuna', 'Monteverde', 'Manuel Antonio'], knownCities: ['San Jose', 'La Fortuna', 'Monteverde', 'Manuel Antonio', 'Tamarindo', 'Puerto Viejo', 'Jacó', 'Liberia', 'Tortuguero'] },
  { value: 'Croatia', labelEn: 'Croatia', labelPt: 'Croácia', lat: 42.6507, lng: 18.0944, suggestedCities: ['Dubrovnik', 'Split', 'Zadar', 'Zagreb'], knownCities: ['Dubrovnik', 'Split', 'Zadar', 'Zagreb', 'Zagrebe', 'Rovinj', 'Pula', 'Hvar', 'Korcula', 'Rijeka', 'Sibenik', 'Plitvice', 'Trogir', 'Makarska'] },
  { value: 'Cuba', labelEn: 'Cuba', labelPt: 'Cuba', lat: 23.1136, lng: -82.3666, suggestedCities: ['Havana', 'Trinidad', 'Viñales', 'Varadero'], knownCities: ['Havana', 'La Habana', 'Trinidad', 'Vinales', 'Varadero', 'Santiago de Cuba', 'Cienfuegos', 'Camaguey'] },
  { value: 'Cyprus', labelEn: 'Cyprus', labelPt: 'Chipre', lat: 35.1856, lng: 33.3823, suggestedCities: ['Nicosia', 'Paphos', 'Limassol', 'Larnaca'], knownCities: ['Nicosia', 'Paphos', 'Pafos', 'Limassol', 'Larnaca', 'Ayia Napa', 'Protaras'] },
  { value: 'Czechia', labelEn: 'Czechia', labelPt: 'Chéquia', lat: 50.0755, lng: 14.4378, suggestedCities: ['Prague', 'Český Krumlov', 'Brno', 'Karlovy Vary'], knownCities: ['Prague', 'Praga', 'Praha', 'Cesky Krumlov', 'Brno', 'Karlovy Vary', 'Olomouc', 'Plzen', 'Kutna Hora'] },
  { value: 'Denmark', labelEn: 'Denmark', labelPt: 'Dinamarca', lat: 55.6761, lng: 12.5683, suggestedCities: ['Copenhagen', 'Aarhus', 'Odense', 'Aalborg'], knownCities: ['Copenhagen', 'Copenhaga', 'Kobenhavn', 'Aarhus', 'Odense', 'Aalborg', 'Roskilde', 'Helsingor', 'Billund', 'Skagen'] },
  { value: 'Djibouti', labelEn: 'Djibouti', labelPt: 'Djibuti', lat: 11.5721, lng: 43.1456, suggestedCities: ['Djibouti City', 'Tadjoura'], knownCities: ['Djibouti City', 'Djibouti', 'Tadjoura', 'Obock'] },
  { value: 'Dominica', labelEn: 'Dominica', labelPt: 'Dominica', lat: 15.3092, lng: -61.3794, suggestedCities: ['Roseau', 'Portsmouth'], knownCities: ['Roseau', 'Portsmouth', 'Soufriere'] },
  { value: 'Dominican Republic', labelEn: 'Dominican Republic', labelPt: 'República Dominicana', lat: 18.4861, lng: -69.9312, suggestedCities: ['Santo Domingo', 'Punta Cana', 'Puerto Plata', 'Samaná'], knownCities: ['Santo Domingo', 'Punta Cana', 'Puerto Plata', 'Samana', 'La Romana', 'Santiago de los Caballeros', 'Las Terrenas'] },
  { value: 'Ecuador', labelEn: 'Ecuador', labelPt: 'Equador', lat: -0.1807, lng: -78.4678, suggestedCities: ['Quito', 'Cuenca', 'Guayaquil', 'Baños'], knownCities: ['Quito', 'Cuenca', 'Guayaquil', 'Banos', 'Galapagos', 'Puerto Ayora', 'Otavalo', 'Mindo', 'Montanita'] },
  { value: 'Egypt', labelEn: 'Egypt', labelPt: 'Egito', lat: 30.0444, lng: 31.2357, suggestedCities: ['Cairo', 'Luxor', 'Aswan', 'Alexandria'], knownCities: ['Cairo', 'Luxor', 'Aswan', 'Assuao', 'Alexandria', 'Giza', 'Sharm El Sheikh', 'Hurghada', 'Dahab', 'Siwa'] },
  { value: 'El Salvador', labelEn: 'El Salvador', labelPt: 'El Salvador', lat: 13.6929, lng: -89.2182, suggestedCities: ['San Salvador', 'Santa Ana', 'Suchitoto'], knownCities: ['San Salvador', 'Santa Ana', 'Suchitoto', 'El Tunco', 'La Libertad'] },
  { value: 'Equatorial Guinea', labelEn: 'Equatorial Guinea', labelPt: 'Guiné Equatorial', lat: 3.7504, lng: 8.7371, suggestedCities: ['Malabo', 'Bata'], knownCities: ['Malabo', 'Bata'] },
  { value: 'Eritrea', labelEn: 'Eritrea', labelPt: 'Eritreia', lat: 15.3229, lng: 38.9251, suggestedCities: ['Asmara', 'Massawa'], knownCities: ['Asmara', 'Massawa', 'Keren'] },
  { value: 'Estonia', labelEn: 'Estonia', labelPt: 'Estónia', lat: 59.437, lng: 24.7536, suggestedCities: ['Tallinn', 'Tartu', 'Pärnu'], knownCities: ['Tallinn', 'Talim', 'Tartu', 'Parnu', 'Narva', 'Saaremaa', 'Kuressaare'] },
  { value: 'Eswatini', labelEn: 'Eswatini', labelPt: 'Essuatíni', lat: -26.3054, lng: 31.1367, suggestedCities: ['Mbabane', 'Lobamba', 'Manzini'], knownCities: ['Mbabane', 'Lobamba', 'Manzini'] },
  { value: 'Ethiopia', labelEn: 'Ethiopia', labelPt: 'Etiópia', lat: 9.032, lng: 38.7469, suggestedCities: ['Addis Ababa', 'Lalibela', 'Gondar', 'Axum'], knownCities: ['Addis Ababa', 'Adis Abeba', 'Lalibela', 'Gondar', 'Axum', 'Bahir Dar', 'Harar'] },
  { value: 'Fiji', labelEn: 'Fiji', labelPt: 'Fiji', lat: -18.1416, lng: 178.4419, suggestedCities: ['Suva', 'Nadi', 'Denarau'], knownCities: ['Suva', 'Nadi', 'Denarau', 'Lautoka', 'Savusavu'] },
  { value: 'Finland', labelEn: 'Finland', labelPt: 'Finlândia', lat: 60.1699, lng: 24.9384, suggestedCities: ['Helsinki', 'Rovaniemi', 'Turku', 'Tampere'], knownCities: ['Helsinki', 'Helsinquia', 'Rovaniemi', 'Turku', 'Tampere', 'Porvoo', 'Oulu', 'Levi', 'Inari'] },
  { value: 'France', labelEn: 'France', labelPt: 'França', lat: 48.8566, lng: 2.3522, suggestedCities: ['Paris', 'Lyon', 'Nice', 'Bordeaux'], knownCities: ['Paris', 'Lyon', 'Liao', 'Nice', 'Bordeaux', 'Bordeus', 'Marseille', 'Marselha', 'Strasbourg', 'Estrasburgo', 'Toulouse', 'Lille', 'Nantes', 'Montpellier', 'Cannes', 'Avignon', 'Avinhao', 'Aix-en-Provence', 'Colmar', 'Annecy', 'Chamonix', 'Saint-Malo', 'Biarritz', 'Dijon', 'Reims', 'Rouen', 'Versailles'] },
  { value: 'Gabon', labelEn: 'Gabon', labelPt: 'Gabão', lat: 0.4162, lng: 9.4673, suggestedCities: ['Libreville', 'Port-Gentil'], knownCities: ['Libreville', 'Port-Gentil', 'Franceville'] },
  { value: 'Gambia', labelEn: 'Gambia', labelPt: 'Gâmbia', lat: 13.4549, lng: -16.579, suggestedCities: ['Banjul', 'Serekunda', 'Kololi'], knownCities: ['Banjul', 'Serekunda', 'Kololi', 'Bakau'] },
  { value: 'Georgia', labelEn: 'Georgia', labelPt: 'Geórgia', lat: 41.7151, lng: 44.8271, suggestedCities: ['Tbilisi', 'Batumi', 'Kutaisi', 'Kazbegi'], knownCities: ['Tbilisi', 'Tbilissi', 'Batumi', 'Kutaisi', 'Kazbegi', 'Stepantsminda', 'Mtskheta', 'Sighnaghi', 'Mestia'] },
  { value: 'Germany', labelEn: 'Germany', labelPt: 'Alemanha', lat: 52.52, lng: 13.405, suggestedCities: ['Berlin', 'Munich', 'Hamburg', 'Heidelberg'], knownCities: ['Berlin', 'Berlim', 'Munich', 'Munique', 'Munchen', 'Hamburg', 'Hamburgo', 'Heidelberg', 'Frankfurt', 'Cologne', 'Colonia', 'Koln', 'Dresden', 'Stuttgart', 'Estugarda', 'Nuremberg', 'Nuremberga', 'Leipzig', 'Dusseldorf', 'Bremen', 'Freiburg', 'Rothenburg ob der Tauber', 'Bamberg', 'Potsdam', 'Bonn'] },
  { value: 'Ghana', labelEn: 'Ghana', labelPt: 'Gana', lat: 5.6037, lng: -0.187, suggestedCities: ['Accra', 'Kumasi', 'Cape Coast'], knownCities: ['Accra', 'Acra', 'Kumasi', 'Cape Coast', 'Tamale', 'Elmina'] },
  { value: 'Greece', labelEn: 'Greece', labelPt: 'Grécia', lat: 37.9838, lng: 23.7275, suggestedCities: ['Athens', 'Santorini', 'Naxos', 'Chania'], knownCities: ['Athens', 'Atenas', 'Santorini', 'Thira', 'Oia', 'Fira', 'Naxos', 'Chania', 'Thessaloniki', 'Salonica', 'Mykonos', 'Miconos', 'Rhodes', 'Rodes', 'Corfu', 'Heraklion', 'Rethymno', 'Crete', 'Creta', 'Paros', 'Milos', 'Nafplio', 'Delphi', 'Meteora', 'Zakynthos'] },
  { value: 'Grenada', labelEn: 'Grenada', labelPt: 'Granada', lat: 12.0561, lng: -61.7488, suggestedCities: ["St. George's", 'Grand Anse'], knownCities: ['St Georges', 'Saint Georges', 'Grand Anse', 'Gouyave'] },
  { value: 'Guatemala', labelEn: 'Guatemala', labelPt: 'Guatemala', lat: 14.6349, lng: -90.5069, suggestedCities: ['Antigua', 'Guatemala City', 'Panajachel', 'Flores'], knownCities: ['Antigua', 'Antigua Guatemala', 'Guatemala City', 'Panajachel', 'Lake Atitlan', 'Flores', 'Tikal', 'Quetzaltenango'] },
  { value: 'Guinea', labelEn: 'Guinea', labelPt: 'Guiné', lat: 9.6412, lng: -13.5784, suggestedCities: ['Conakry', 'Kindia'], knownCities: ['Conakry', 'Conacri', 'Kindia', 'Labe'] },
  { value: 'Guinea-Bissau', labelEn: 'Guinea-Bissau', labelPt: 'Guiné-Bissau', lat: 11.8636, lng: -15.5977, suggestedCities: ['Bissau', 'Bafatá', 'Bubaque'], knownCities: ['Bissau', 'Bafata', 'Bubaque', 'Cacheu', 'Bolama'] },
  { value: 'Guyana', labelEn: 'Guyana', labelPt: 'Guiana', lat: 6.8013, lng: -58.1551, suggestedCities: ['Georgetown', 'Linden'], knownCities: ['Georgetown', 'Linden', 'Lethem'] },
  { value: 'Haiti', labelEn: 'Haiti', labelPt: 'Haiti', lat: 18.5944, lng: -72.3074, suggestedCities: ['Port-au-Prince', 'Cap-Haïtien', 'Jacmel'], knownCities: ['Port-au-Prince', 'Cap-Haitien', 'Jacmel'] },
  { value: 'Honduras', labelEn: 'Honduras', labelPt: 'Honduras', lat: 14.0723, lng: -87.1921, suggestedCities: ['Tegucigalpa', 'Roatán', 'Copán Ruinas'], knownCities: ['Tegucigalpa', 'Roatan', 'Copan Ruinas', 'Copan', 'San Pedro Sula', 'Utila', 'La Ceiba'] },
  { value: 'Hungary', labelEn: 'Hungary', labelPt: 'Hungria', lat: 47.4979, lng: 19.0402, suggestedCities: ['Budapest', 'Eger', 'Pécs', 'Szentendre'], knownCities: ['Budapest', 'Budapeste', 'Eger', 'Pecs', 'Szentendre', 'Debrecen', 'Szeged', 'Gyor', 'Siofok', 'Balaton', 'Heviz'] },
  { value: 'Iceland', labelEn: 'Iceland', labelPt: 'Islândia', lat: 64.1466, lng: -21.9426, suggestedCities: ['Reykjavik', 'Akureyri', 'Vík', 'Húsavík'], knownCities: ['Reykjavik', 'Reiquiavique', 'Akureyri', 'Vik', 'Husavik', 'Selfoss', 'Hofn', 'Isafjordur', 'Seydisfjordur'] },
  { value: 'India', labelEn: 'India', labelPt: 'Índia', lat: 28.6139, lng: 77.209, suggestedCities: ['New Delhi', 'Jaipur', 'Mumbai', 'Udaipur'], knownCities: ['New Delhi', 'Nova Deli', 'Delhi', 'Jaipur', 'Mumbai', 'Bombaim', 'Udaipur', 'Agra', 'Varanasi', 'Kochi', 'Goa', 'Bengaluru', 'Bangalore', 'Kolkata', 'Calcuta', 'Chennai', 'Hyderabad', 'Jodhpur', 'Rishikesh', 'Amritsar'] },
  { value: 'Indonesia', labelEn: 'Indonesia', labelPt: 'Indonésia', lat: -8.5069, lng: 115.2625, suggestedCities: ['Ubud', 'Jakarta', 'Yogyakarta', 'Seminyak'], knownCities: ['Ubud', 'Bali', 'Jakarta', 'Jacarta', 'Yogyakarta', 'Seminyak', 'Canggu', 'Denpasar', 'Uluwatu', 'Nusa Dua', 'Lombok', 'Bandung', 'Surabaya', 'Labuan Bajo'] },
  { value: 'Iran', labelEn: 'Iran', labelPt: 'Irão', lat: 35.6892, lng: 51.389, suggestedCities: ['Tehran', 'Isfahan', 'Shiraz', 'Yazd'], knownCities: ['Tehran', 'Teerao', 'Isfahan', 'Shiraz', 'Yazd', 'Tabriz', 'Kashan'] },
  { value: 'Iraq', labelEn: 'Iraq', labelPt: 'Iraque', lat: 33.3152, lng: 44.3661, suggestedCities: ['Baghdad', 'Erbil', 'Basra'], knownCities: ['Baghdad', 'Bagdade', 'Erbil', 'Basra', 'Najaf', 'Karbala'] },
  { value: 'Ireland', labelEn: 'Ireland', labelPt: 'Irlanda', lat: 53.3498, lng: -6.2603, suggestedCities: ['Dublin', 'Galway', 'Cork', 'Killarney'], knownCities: ['Dublin', 'Galway', 'Cork', 'Killarney', 'Limerick', 'Kilkenny', 'Dingle', 'Waterford', 'Sligo', 'Westport'] },
  { value: 'Israel', labelEn: 'Israel', labelPt: 'Israel', lat: 32.0853, lng: 34.7818, suggestedCities: ['Tel Aviv', 'Jerusalem', 'Haifa'], knownCities: ['Tel Aviv', 'Jerusalem', 'Haifa', 'Eilat', 'Nazareth', 'Acre', 'Tiberias'] },
  { value: 'Italy', labelEn: 'Italy', labelPt: 'Itália', lat: 41.8902, lng: 12.4922, suggestedCities: ['Rome', 'Florence', 'Venice', 'Milan'], knownCities: ['Rome', 'Roma', 'Florence', 'Florenca', 'Firenze', 'Venice', 'Veneza', 'Venezia', 'Milan', 'Milao', 'Milano', 'Naples', 'Napoles', 'Napoli', 'Bologna', 'Bolonha', 'Turin', 'Turim', 'Torino', 'Verona', 'Pisa', 'Siena', 'Genoa', 'Genova', 'Palermo', 'Catania', 'Taormina', 'Sorrento', 'Amalfi', 'Positano', 'Ravello', 'Capri', 'Como', 'Bellagio', 'Bergamo', 'Padua', 'Padova', 'Parma', 'Modena', 'Lucca', 'Perugia', 'Assisi', 'Matera', 'Bari', 'Lecce', 'Alberobello', 'Cagliari', 'Trieste', 'Cinque Terre', 'La Spezia', 'Orvieto', 'Rimini', 'Ravenna', 'Bolzano', 'Cortina'] },
  { value: 'Ivory Coast', labelEn: 'Ivory Coast', labelPt: 'Costa do Marfim', lat: 5.36, lng: -4.0083, suggestedCities: ['Abidjan', 'Yamoussoukro', 'Grand-Bassam'], knownCities: ['Abidjan', 'Yamoussoukro', 'Grand-Bassam', 'Bouake'] },
  { value: 'Jamaica', labelEn: 'Jamaica', labelPt: 'Jamaica', lat: 17.9712, lng: -76.7936, suggestedCities: ['Kingston', 'Montego Bay', 'Ocho Rios', 'Negril'], knownCities: ['Kingston', 'Montego Bay', 'Ocho Rios', 'Negril', 'Port Antonio'] },
  { value: 'Japan', labelEn: 'Japan', labelPt: 'Japão', lat: 35.6762, lng: 139.6503, suggestedCities: ['Tokyo', 'Kyoto', 'Osaka', 'Hakone'], knownCities: ['Tokyo', 'Toquio', 'Kyoto', 'Quioto', 'Osaka', 'Hakone', 'Nara', 'Hiroshima', 'Sapporo', 'Fukuoka', 'Kanazawa', 'Takayama', 'Kobe', 'Yokohama', 'Nagoya', 'Kamakura', 'Nikko', 'Okinawa', 'Naha', 'Kumamoto', 'Nagasaki', 'Beppu', 'Matsumoto', 'Koyasan', 'Naoshima'] },
  { value: 'Jordan', labelEn: 'Jordan', labelPt: 'Jordânia', lat: 31.9454, lng: 35.9284, suggestedCities: ['Amman', 'Petra', 'Wadi Rum', 'Aqaba'], knownCities: ['Amman', 'Ama', 'Petra', 'Wadi Rum', 'Aqaba', 'Jerash', 'Madaba'] },
  { value: 'Kazakhstan', labelEn: 'Kazakhstan', labelPt: 'Cazaquistão', lat: 43.222, lng: 76.8512, suggestedCities: ['Almaty', 'Astana', 'Shymkent'], knownCities: ['Almaty', 'Astana', 'Nur-Sultan', 'Shymkent', 'Turkistan', 'Aktau'] },
  { value: 'Kenya', labelEn: 'Kenya', labelPt: 'Quénia', lat: -1.2921, lng: 36.8219, suggestedCities: ['Nairobi', 'Mombasa', 'Diani Beach', 'Naivasha'], knownCities: ['Nairobi', 'Mombasa', 'Mombaca', 'Diani Beach', 'Naivasha', 'Lamu', 'Malindi', 'Nakuru', 'Kisumu'] },
  { value: 'Kiribati', labelEn: 'Kiribati', labelPt: 'Quiribáti', lat: 1.4518, lng: 172.9717, suggestedCities: ['Tarawa', 'Kiritimati'], knownCities: ['Tarawa', 'South Tarawa', 'Kiritimati'] },
  { value: 'Kosovo', labelEn: 'Kosovo', labelPt: 'Kosovo', lat: 42.6629, lng: 21.1655, suggestedCities: ['Pristina', 'Prizren', 'Peja'], knownCities: ['Pristina', 'Prizren', 'Peja', 'Gjakova'] },
  { value: 'Kuwait', labelEn: 'Kuwait', labelPt: 'Koweit', lat: 29.3759, lng: 47.9774, suggestedCities: ['Kuwait City', 'Salmiya', 'Hawalli'], knownCities: ['Kuwait City', 'Cidade do Koweit', 'Salmiya', 'Hawalli', 'Ahmadi'] },
  { value: 'Kyrgyzstan', labelEn: 'Kyrgyzstan', labelPt: 'Quirguistão', lat: 42.8746, lng: 74.5698, suggestedCities: ['Bishkek', 'Karakol', 'Osh'], knownCities: ['Bishkek', 'Karakol', 'Osh', 'Cholpon-Ata', 'Naryn'] },
  { value: 'Laos', labelEn: 'Laos', labelPt: 'Laos', lat: 19.8834, lng: 102.1347, suggestedCities: ['Luang Prabang', 'Vientiane', 'Vang Vieng'], knownCities: ['Luang Prabang', 'Vientiane', 'Vienciana', 'Vang Vieng', 'Pakse', 'Nong Khiaw'] },
  { value: 'Latvia', labelEn: 'Latvia', labelPt: 'Letónia', lat: 56.9496, lng: 24.1052, suggestedCities: ['Riga', 'Jūrmala', 'Sigulda', 'Cēsis'], knownCities: ['Riga', 'Jurmala', 'Sigulda', 'Cesis', 'Liepaja', 'Kuldiga', 'Daugavpils'] },
  { value: 'Lebanon', labelEn: 'Lebanon', labelPt: 'Líbano', lat: 33.8938, lng: 35.5018, suggestedCities: ['Beirut', 'Byblos', 'Batroun', 'Baalbek'], knownCities: ['Beirut', 'Beirute', 'Byblos', 'Jbeil', 'Batroun', 'Baalbek', 'Tyre', 'Sidon', 'Tripoli'] },
  { value: 'Lesotho', labelEn: 'Lesotho', labelPt: 'Lesoto', lat: -29.3151, lng: 27.4869, suggestedCities: ['Maseru', 'Semonkong'], knownCities: ['Maseru', 'Semonkong', 'Malealea'] },
  { value: 'Liberia', labelEn: 'Liberia', labelPt: 'Libéria', lat: 6.3156, lng: -10.8074, suggestedCities: ['Monrovia', 'Robertsport'], knownCities: ['Monrovia', 'Robertsport', 'Buchanan'] },
  { value: 'Libya', labelEn: 'Libya', labelPt: 'Líbia', lat: 32.8872, lng: 13.1913, suggestedCities: ['Tripoli', 'Benghazi', 'Ghadames'], knownCities: ['Tripoli', 'Benghazi', 'Ghadames', 'Misrata'] },
  { value: 'Liechtenstein', labelEn: 'Liechtenstein', labelPt: 'Listenstaine', lat: 47.141, lng: 9.5209, suggestedCities: ['Vaduz', 'Schaan', 'Malbun'], knownCities: ['Vaduz', 'Schaan', 'Malbun', 'Triesenberg', 'Balzers'] },
  { value: 'Lithuania', labelEn: 'Lithuania', labelPt: 'Lituânia', lat: 54.6872, lng: 25.2797, suggestedCities: ['Vilnius', 'Kaunas', 'Klaipėda', 'Trakai'], knownCities: ['Vilnius', 'Vilna', 'Kaunas', 'Klaipeda', 'Trakai', 'Nida', 'Palanga', 'Siauliai'] },
  { value: 'Luxembourg', labelEn: 'Luxembourg', labelPt: 'Luxemburgo', lat: 49.6116, lng: 6.1319, suggestedCities: ['Luxembourg City', 'Vianden', 'Echternach'], knownCities: ['Luxembourg City', 'Luxembourg', 'Luxemburgo', 'Vianden', 'Echternach', 'Clervaux', 'Esch-sur-Alzette'] },
  { value: 'Madagascar', labelEn: 'Madagascar', labelPt: 'Madagáscar', lat: -18.8792, lng: 47.5079, suggestedCities: ['Antananarivo', 'Nosy Be', 'Morondava'], knownCities: ['Antananarivo', 'Nosy Be', 'Morondava', 'Antsirabe', 'Toamasina', 'Diego Suarez'] },
  { value: 'Malawi', labelEn: 'Malawi', labelPt: 'Maláui', lat: -13.9626, lng: 33.7741, suggestedCities: ['Lilongwe', 'Blantyre', 'Cape Maclear'], knownCities: ['Lilongwe', 'Blantyre', 'Cape Maclear', 'Zomba', 'Nkhata Bay'] },
  { value: 'Malaysia', labelEn: 'Malaysia', labelPt: 'Malásia', lat: 3.139, lng: 101.6869, suggestedCities: ['Kuala Lumpur', 'George Town', 'Langkawi', 'Malacca'], knownCities: ['Kuala Lumpur', 'George Town', 'Penang', 'Langkawi', 'Malacca', 'Melaka', 'Kota Kinabalu', 'Ipoh', 'Kuching', 'Cameron Highlands', 'Johor Bahru'] },
  { value: 'Maldives', labelEn: 'Maldives', labelPt: 'Maldivas', lat: 4.1755, lng: 73.5093, suggestedCities: ['Malé', 'Maafushi', 'Baa Atoll'], knownCities: ['Male', 'Maafushi', 'Baa Atoll', 'Ari Atoll', 'Hulhumale', 'Addu City'] },
  { value: 'Mali', labelEn: 'Mali', labelPt: 'Mali', lat: 12.6392, lng: -8.0029, suggestedCities: ['Bamako', 'Timbuktu', 'Djenné'], knownCities: ['Bamako', 'Timbuktu', 'Tombuctu', 'Djenne', 'Segou'] },
  { value: 'Malta', labelEn: 'Malta', labelPt: 'Malta', lat: 35.8989, lng: 14.5146, suggestedCities: ['Valletta', 'Mdina', 'Sliema', 'Victoria (Gozo)'], knownCities: ['Valletta', 'La Valeta', 'Mdina', 'Sliema', 'St Julians', 'Saint Julians', 'Gozo', 'Victoria', 'Rabat', 'Marsaxlokk', 'Birgu'] },
  { value: 'Marshall Islands', labelEn: 'Marshall Islands', labelPt: 'Ilhas Marshall', lat: 7.1164, lng: 171.1858, suggestedCities: ['Majuro', 'Ebeye'], knownCities: ['Majuro', 'Ebeye'] },
  { value: 'Mauritania', labelEn: 'Mauritania', labelPt: 'Mauritânia', lat: 18.0735, lng: -15.9582, suggestedCities: ['Nouakchott', 'Chinguetti', 'Atar'], knownCities: ['Nouakchott', 'Chinguetti', 'Atar', 'Nouadhibou'] },
  { value: 'Mauritius', labelEn: 'Mauritius', labelPt: 'Maurícia', lat: -20.1609, lng: 57.5012, suggestedCities: ['Port Louis', 'Grand Baie', 'Flic en Flac'], knownCities: ['Port Louis', 'Grand Baie', 'Flic en Flac', 'Le Morne', 'Mahebourg', 'Curepipe'] },
  { value: 'Mexico', labelEn: 'Mexico', labelPt: 'México', lat: 19.4326, lng: -99.1332, suggestedCities: ['Mexico City', 'Oaxaca', 'Mérida', 'Guadalajara'], knownCities: ['Mexico City', 'Cidade do Mexico', 'CDMX', 'Oaxaca', 'Merida', 'Guadalajara', 'Cancun', 'Tulum', 'Playa del Carmen', 'San Miguel de Allende', 'Puebla', 'Puerto Vallarta', 'Guanajuato', 'Monterrey', 'Los Cabos', 'Cabo San Lucas'] },
  { value: 'Micronesia', labelEn: 'Micronesia', labelPt: 'Micronésia', lat: 6.9248, lng: 158.1611, suggestedCities: ['Palikir', 'Kolonia', 'Weno'], knownCities: ['Palikir', 'Kolonia', 'Weno', 'Yap'] },
  { value: 'Moldova', labelEn: 'Moldova', labelPt: 'Moldávia', lat: 47.0105, lng: 28.8638, suggestedCities: ['Chișinău', 'Orheiul Vechi', 'Tiraspol'], knownCities: ['Chisinau', 'Orheiul Vechi', 'Tiraspol', 'Balti'] },
  { value: 'Monaco', labelEn: 'Monaco', labelPt: 'Mónaco', lat: 43.7384, lng: 7.4246, suggestedCities: ['Monte Carlo', 'Monaco-Ville', 'Fontvieille'], knownCities: ['Monte Carlo', 'Monaco', 'Monaco-Ville', 'Fontvieille', 'La Condamine'] },
  { value: 'Mongolia', labelEn: 'Mongolia', labelPt: 'Mongólia', lat: 47.8864, lng: 106.9057, suggestedCities: ['Ulaanbaatar', 'Karakorum', 'Dalanzadgad'], knownCities: ['Ulaanbaatar', 'Ulan Bator', 'Karakorum', 'Kharkhorin', 'Dalanzadgad', 'Erdenet'] },
  { value: 'Montenegro', labelEn: 'Montenegro', labelPt: 'Montenegro', lat: 42.4247, lng: 18.7712, suggestedCities: ['Kotor', 'Budva', 'Podgorica', 'Perast'], knownCities: ['Kotor', 'Budva', 'Podgorica', 'Perast', 'Herceg Novi', 'Tivat', 'Cetinje', 'Ulcinj', 'Zabljak'] },
  { value: 'Morocco', labelEn: 'Morocco', labelPt: 'Marrocos', lat: 31.6295, lng: -7.9811, suggestedCities: ['Marrakech', 'Fes', 'Chefchaouen', 'Essaouira'], knownCities: ['Marrakech', 'Marraquexe', 'Fes', 'Fez', 'Chefchaouen', 'Essaouira', 'Rabat', 'Casablanca', 'Tangier', 'Tanger', 'Agadir', 'Meknes', 'Ouarzazate', 'Merzouga'] },
  { value: 'Mozambique', labelEn: 'Mozambique', labelPt: 'Moçambique', lat: -25.9692, lng: 32.5732, suggestedCities: ['Maputo', 'Vilankulo', 'Tofo', 'Ilha de Moçambique'], knownCities: ['Maputo', 'Vilankulo', 'Vilanculos', 'Tofo', 'Inhambane', 'Ilha de Mocambique', 'Beira', 'Nampula', 'Pemba'] },
  { value: 'Myanmar', labelEn: 'Myanmar', labelPt: 'Mianmar', lat: 16.8409, lng: 96.1735, suggestedCities: ['Yangon', 'Bagan', 'Mandalay'], knownCities: ['Yangon', 'Rangum', 'Bagan', 'Mandalay', 'Inle Lake', 'Naypyidaw'] },
  { value: 'Namibia', labelEn: 'Namibia', labelPt: 'Namíbia', lat: -22.5609, lng: 17.0658, suggestedCities: ['Windhoek', 'Swakopmund', 'Walvis Bay'], knownCities: ['Windhoek', 'Swakopmund', 'Walvis Bay', 'Sossusvlei', 'Luderitz'] },
  { value: 'Nauru', labelEn: 'Nauru', labelPt: 'Nauru', lat: -0.5477, lng: 166.9209, suggestedCities: ['Yaren', 'Denigomodu'], knownCities: ['Yaren', 'Denigomodu'] },
  { value: 'Nepal', labelEn: 'Nepal', labelPt: 'Nepal', lat: 27.7172, lng: 85.324, suggestedCities: ['Kathmandu', 'Pokhara', 'Lalitpur', 'Bhaktapur'], knownCities: ['Kathmandu', 'Catmandu', 'Pokhara', 'Lalitpur', 'Patan', 'Bhaktapur', 'Chitwan', 'Lumbini', 'Nagarkot'] },
  { value: 'Netherlands', labelEn: 'Netherlands', labelPt: 'Países Baixos', lat: 52.3676, lng: 4.9041, suggestedCities: ['Amsterdam', 'Utrecht', 'Haarlem', 'Rotterdam'], knownCities: ['Amsterdam', 'Amesterdao', 'Utrecht', 'Haarlem', 'Rotterdam', 'Roterdao', 'The Hague', 'Haia', 'Den Haag', 'Delft', 'Leiden', 'Maastricht', 'Eindhoven', 'Groningen', 'Giethoorn', 'Zaandam', 'Gouda', 'Alkmaar'] },
  { value: 'New Zealand', labelEn: 'New Zealand', labelPt: 'Nova Zelândia', lat: -36.8485, lng: 174.7633, suggestedCities: ['Auckland', 'Queenstown', 'Wellington', 'Christchurch'], knownCities: ['Auckland', 'Queenstown', 'Wellington', 'Christchurch', 'Rotorua', 'Wanaka', 'Dunedin', 'Nelson', 'Napier', 'Taupo'] },
  { value: 'Nicaragua', labelEn: 'Nicaragua', labelPt: 'Nicarágua', lat: 11.9344, lng: -85.956, suggestedCities: ['Granada', 'León', 'Managua', 'San Juan del Sur'], knownCities: ['Granada', 'Leon', 'Managua', 'San Juan del Sur', 'Ometepe', 'Matagalpa'] },
  { value: 'Niger', labelEn: 'Niger', labelPt: 'Níger', lat: 13.5116, lng: 2.1254, suggestedCities: ['Niamey', 'Agadez', 'Zinder'], knownCities: ['Niamey', 'Agadez', 'Zinder'] },
  { value: 'Nigeria', labelEn: 'Nigeria', labelPt: 'Nigéria', lat: 6.5244, lng: 3.3792, suggestedCities: ['Lagos', 'Abuja', 'Calabar'], knownCities: ['Lagos', 'Abuja', 'Calabar', 'Ibadan', 'Kano', 'Port Harcourt', 'Enugu'] },
  { value: 'North Korea', labelEn: 'North Korea', labelPt: 'Coreia do Norte', lat: 39.0392, lng: 125.7625, suggestedCities: ['Pyongyang', 'Kaesong'], knownCities: ['Pyongyang', 'Kaesong', 'Wonsan'] },
  { value: 'North Macedonia', labelEn: 'North Macedonia', labelPt: 'Macedónia do Norte', lat: 41.9981, lng: 21.4254, suggestedCities: ['Skopje', 'Ohrid', 'Bitola'], knownCities: ['Skopje', 'Escopia', 'Ohrid', 'Bitola', 'Tetovo', 'Mavrovo'] },
  { value: 'Norway', labelEn: 'Norway', labelPt: 'Noruega', lat: 59.9139, lng: 10.7522, suggestedCities: ['Oslo', 'Bergen', 'Tromsø', 'Stavanger'], knownCities: ['Oslo', 'Bergen', 'Tromso', 'Stavanger', 'Trondheim', 'Alesund', 'Lofoten', 'Svolvaer', 'Flam', 'Kristiansand', 'Geiranger'] },
  { value: 'Oman', labelEn: 'Oman', labelPt: 'Omã', lat: 23.588, lng: 58.3829, suggestedCities: ['Muscat', 'Nizwa', 'Salalah', 'Sur'], knownCities: ['Muscat', 'Mascate', 'Nizwa', 'Salalah', 'Sur', 'Sohar', 'Jebel Akhdar'] },
  { value: 'Pakistan', labelEn: 'Pakistan', labelPt: 'Paquistão', lat: 31.5204, lng: 74.3587, suggestedCities: ['Lahore', 'Islamabad', 'Karachi', 'Hunza'], knownCities: ['Lahore', 'Islamabad', 'Islamabade', 'Karachi', 'Hunza', 'Skardu', 'Peshawar', 'Multan'] },
  { value: 'Palau', labelEn: 'Palau', labelPt: 'Palau', lat: 7.3419, lng: 134.4789, suggestedCities: ['Koror', 'Ngerulmud'], knownCities: ['Koror', 'Ngerulmud', 'Melekeok'] },
  { value: 'Palestine', labelEn: 'Palestine', labelPt: 'Palestina', lat: 31.7054, lng: 35.2024, suggestedCities: ['Bethlehem', 'Ramallah', 'Jericho'], knownCities: ['Bethlehem', 'Belem', 'Ramallah', 'Jericho', 'Jerico', 'Hebron', 'Nablus'] },
  { value: 'Panama', labelEn: 'Panama', labelPt: 'Panamá', lat: 8.9824, lng: -79.5199, suggestedCities: ['Panama City', 'Boquete', 'Bocas del Toro'], knownCities: ['Panama City', 'Cidade do Panama', 'Boquete', 'Bocas del Toro', 'San Blas', 'Portobelo', 'El Valle de Anton', 'Santiago de Veraguas', 'Parque Nacional Santa Fe', 'Santa Fe', 'Pedasi', 'Chitre', 'David'] },
  { value: 'Papua New Guinea', labelEn: 'Papua New Guinea', labelPt: 'Papua-Nova Guiné', lat: -9.4438, lng: 147.1803, suggestedCities: ['Port Moresby', 'Lae', 'Madang'], knownCities: ['Port Moresby', 'Lae', 'Madang', 'Mount Hagen', 'Rabaul'] },
  { value: 'Paraguay', labelEn: 'Paraguay', labelPt: 'Paraguai', lat: -25.2637, lng: -57.5759, suggestedCities: ['Asunción', 'Encarnación', 'Ciudad del Este'], knownCities: ['Asuncion', 'Assuncao', 'Encarnacion', 'Ciudad del Este', 'Aregua'] },
  { value: 'Peru', labelEn: 'Peru', labelPt: 'Peru', lat: -12.0464, lng: -77.0428, suggestedCities: ['Lima', 'Cusco', 'Arequipa', 'Ollantaytambo'], knownCities: ['Lima', 'Cusco', 'Cuzco', 'Arequipa', 'Ollantaytambo', 'Machu Picchu', 'Aguas Calientes', 'Puno', 'Iquitos', 'Trujillo', 'Huaraz', 'Paracas', 'Ica'] },
  { value: 'Philippines', labelEn: 'Philippines', labelPt: 'Filipinas', lat: 14.5995, lng: 120.9842, suggestedCities: ['Manila', 'Cebu', 'El Nido', 'Siargao'], knownCities: ['Manila', 'Cebu', 'El Nido', 'Palawan', 'Siargao', 'Boracay', 'Coron', 'Bohol', 'Davao', 'Baguio', 'Vigan'] },
  { value: 'Poland', labelEn: 'Poland', labelPt: 'Polónia', lat: 50.0647, lng: 19.945, suggestedCities: ['Kraków', 'Warsaw', 'Gdańsk', 'Wrocław'], knownCities: ['Krakow', 'Cracovia', 'Warsaw', 'Varsovia', 'Gdansk', 'Wroclaw', 'Poznan', 'Zakopane', 'Torun', 'Lodz', 'Sopot', 'Lublin', 'Katowice'] },
  { value: 'Portugal', labelEn: 'Portugal', labelPt: 'Portugal', lat: 38.7139, lng: -9.1334, suggestedCities: ['Lisbon', 'Porto', 'Sintra', 'Coimbra'], knownCities: ['Lisbon', 'Lisboa', 'Porto', 'Oporto', 'Sintra', 'Coimbra', 'Faro', 'Lagos', 'Evora', 'Braga', 'Guimaraes', 'Aveiro', 'Funchal', 'Madeira', 'Ponta Delgada', 'Azores', 'Acores', 'Cascais', 'Nazare', 'Obidos', 'Tavira', 'Albufeira', 'Portimao', 'Viana do Castelo', 'Tomar', 'Setubal', 'Viseu', 'Covilha', 'Leiria', 'Alcobaca', 'Batalha', 'Peso da Regua', 'Pinhao', 'Douro', 'Algarve', 'Ericeira', 'Monsaraz', 'Marvao', 'Gerês'] },
  { value: 'Qatar', labelEn: 'Qatar', labelPt: 'Catar', lat: 25.2854, lng: 51.531, suggestedCities: ['Doha', 'Al Wakrah', 'Lusail'], knownCities: ['Doha', 'Al Wakrah', 'Lusail', 'Al Khor'] },
  { value: 'Romania', labelEn: 'Romania', labelPt: 'Roménia', lat: 44.4268, lng: 26.1025, suggestedCities: ['Bucharest', 'Brașov', 'Sibiu', 'Cluj-Napoca'], knownCities: ['Bucharest', 'Bucareste', 'Brasov', 'Sibiu', 'Cluj-Napoca', 'Cluj', 'Sighisoara', 'Timisoara', 'Sinaia', 'Iasi', 'Constanta', 'Oradea'] },
  { value: 'Russia', labelEn: 'Russia', labelPt: 'Rússia', lat: 55.7558, lng: 37.6173, suggestedCities: ['Moscow', 'Saint Petersburg', 'Kazan', 'Sochi'], knownCities: ['Moscow', 'Moscovo', 'Saint Petersburg', 'Sao Petersburgo', 'Kazan', 'Sochi', 'Vladivostok', 'Yekaterinburg', 'Irkutsk', 'Suzdal'] },
  { value: 'Rwanda', labelEn: 'Rwanda', labelPt: 'Ruanda', lat: -1.9441, lng: 30.0619, suggestedCities: ['Kigali', 'Musanze', 'Gisenyi'], knownCities: ['Kigali', 'Musanze', 'Ruhengeri', 'Gisenyi', 'Rubavu', 'Butare'] },
  { value: 'Saint Kitts and Nevis', labelEn: 'Saint Kitts and Nevis', labelPt: 'São Cristóvão e Neves', lat: 17.3026, lng: -62.7177, suggestedCities: ['Basseterre', 'Charlestown'], knownCities: ['Basseterre', 'Charlestown'] },
  { value: 'Saint Lucia', labelEn: 'Saint Lucia', labelPt: 'Santa Lúcia', lat: 14.0101, lng: -60.9875, suggestedCities: ['Castries', 'Soufrière', 'Rodney Bay'], knownCities: ['Castries', 'Soufriere', 'Rodney Bay', 'Gros Islet', 'Vieux Fort'] },
  { value: 'Saint Vincent and the Grenadines', labelEn: 'Saint Vincent and the Grenadines', labelPt: 'São Vicente e Granadinas', lat: 13.1587, lng: -61.2248, suggestedCities: ['Kingstown', 'Bequia'], knownCities: ['Kingstown', 'Bequia', 'Port Elizabeth', 'Mustique'] },
  { value: 'Samoa', labelEn: 'Samoa', labelPt: 'Samoa', lat: -13.8333, lng: -171.7667, suggestedCities: ['Apia', 'Salelologa'], knownCities: ['Apia', 'Salelologa', 'Lalomanu'] },
  { value: 'San Marino', labelEn: 'San Marino', labelPt: 'São Marinho', lat: 43.9356, lng: 12.4473, suggestedCities: ['San Marino City', 'Borgo Maggiore'], knownCities: ['San Marino', 'San Marino City', 'Borgo Maggiore', 'Serravalle'] },
  { value: 'Sao Tome and Principe', labelEn: 'Sao Tome and Principe', labelPt: 'São Tomé e Príncipe', lat: 0.3365, lng: 6.7273, suggestedCities: ['São Tomé', 'Santo António'], knownCities: ['Sao Tome', 'Santo Antonio', 'Trindade', 'Santana'] },
  { value: 'Saudi Arabia', labelEn: 'Saudi Arabia', labelPt: 'Arábia Saudita', lat: 24.7136, lng: 46.6753, suggestedCities: ['Riyadh', 'Jeddah', 'AlUla', 'Medina'], knownCities: ['Riyadh', 'Riade', 'Jeddah', 'Jida', 'AlUla', 'Al Ula', 'Medina', 'Mecca', 'Meca', 'Dammam', 'Abha'] },
  { value: 'Senegal', labelEn: 'Senegal', labelPt: 'Senegal', lat: 14.7167, lng: -17.4677, suggestedCities: ['Dakar', 'Saint-Louis', 'Saly'], knownCities: ['Dakar', 'Dacar', 'Saint-Louis', 'Saly', 'Gorée', 'Ziguinchor', 'Touba'] },
  { value: 'Serbia', labelEn: 'Serbia', labelPt: 'Sérvia', lat: 44.7866, lng: 20.4489, suggestedCities: ['Belgrade', 'Novi Sad', 'Niš', 'Subotica'], knownCities: ['Belgrade', 'Belgrado', 'Novi Sad', 'Nis', 'Subotica', 'Zlatibor', 'Sremski Karlovci'] },
  { value: 'Seychelles', labelEn: 'Seychelles', labelPt: 'Seicheles', lat: -4.6191, lng: 55.4513, suggestedCities: ['Victoria', 'Beau Vallon', 'La Digue'], knownCities: ['Victoria', 'Beau Vallon', 'Mahe', 'Praslin', 'La Digue'] },
  { value: 'Sierra Leone', labelEn: 'Sierra Leone', labelPt: 'Serra Leoa', lat: 8.4657, lng: -13.2317, suggestedCities: ['Freetown', 'Bo'], knownCities: ['Freetown', 'Bo', 'Kenema'] },
  { value: 'Singapore', labelEn: 'Singapore', labelPt: 'Singapura', lat: 1.3521, lng: 103.8198, suggestedCities: ['Singapore', 'Marina Bay', 'Sentosa'], knownCities: ['Singapore', 'Singapura', 'Marina Bay', 'Sentosa', 'Chinatown', 'Kampong Glam', 'Orchard'] },
  { value: 'Slovakia', labelEn: 'Slovakia', labelPt: 'Eslováquia', lat: 48.1486, lng: 17.1077, suggestedCities: ['Bratislava', 'Košice', 'Poprad', 'Banská Štiavnica'], knownCities: ['Bratislava', 'Kosice', 'Poprad', 'High Tatras', 'Banska Stiavnica', 'Zilina', 'Trnava'] },
  { value: 'Slovenia', labelEn: 'Slovenia', labelPt: 'Eslovénia', lat: 46.0569, lng: 14.5058, suggestedCities: ['Ljubljana', 'Bled', 'Piran', 'Maribor'], knownCities: ['Ljubljana', 'Liubliana', 'Bled', 'Lake Bled', 'Piran', 'Maribor', 'Bohinj', 'Koper', 'Postojna', 'Kranjska Gora', 'Ptuj'] },
  { value: 'Solomon Islands', labelEn: 'Solomon Islands', labelPt: 'Ilhas Salomão', lat: -9.4456, lng: 159.9729, suggestedCities: ['Honiara', 'Gizo'], knownCities: ['Honiara', 'Gizo', 'Auki'] },
  { value: 'Somalia', labelEn: 'Somalia', labelPt: 'Somália', lat: 2.0469, lng: 45.3182, suggestedCities: ['Mogadishu', 'Hargeisa'], knownCities: ['Mogadishu', 'Mogadiscio', 'Hargeisa'] },
  { value: 'South Africa', labelEn: 'South Africa', labelPt: 'África do Sul', lat: -33.9249, lng: 18.4241, suggestedCities: ['Cape Town', 'Johannesburg', 'Stellenbosch', 'Durban'], knownCities: ['Cape Town', 'Cidade do Cabo', 'Johannesburg', 'Joanesburgo', 'Stellenbosch', 'Franschhoek', 'Durban', 'Pretoria', 'Knysna', 'Port Elizabeth', 'Gqeberha', 'Hermanus'] },
  { value: 'South Korea', labelEn: 'South Korea', labelPt: 'Coreia do Sul', lat: 37.5665, lng: 126.978, suggestedCities: ['Seoul', 'Busan', 'Gyeongju', 'Jeju'], knownCities: ['Seoul', 'Seul', 'Busan', 'Gyeongju', 'Jeju', 'Incheon', 'Jeonju', 'Daegu', 'Suwon', 'Sokcho', 'Gangneung'] },
  { value: 'South Sudan', labelEn: 'South Sudan', labelPt: 'Sudão do Sul', lat: 4.8594, lng: 31.5713, suggestedCities: ['Juba', 'Wau'], knownCities: ['Juba', 'Wau', 'Malakal'] },
  { value: 'Spain', labelEn: 'Spain', labelPt: 'Espanha', lat: 40.4168, lng: -3.7038, suggestedCities: ['Barcelona', 'Madrid', 'Seville', 'Granada'], knownCities: ['Barcelona', 'Madrid', 'Seville', 'Sevilha', 'Sevilla', 'Granada', 'Valencia', 'Malaga', 'Bilbao', 'Bilbau', 'San Sebastian', 'Donostia', 'Cordoba', 'Cordova', 'Toledo', 'Salamanca', 'Santiago de Compostela', 'Zaragoza', 'Saragoca', 'Palma', 'Mallorca', 'Maiorca', 'Ibiza', 'Tenerife', 'Las Palmas', 'Cadiz', 'Ronda', 'Girona', 'Segovia', 'Alicante', 'Vigo', 'A Coruna', 'Oviedo', 'Santander', 'Marbella', 'Tarragona'] },
  { value: 'Sri Lanka', labelEn: 'Sri Lanka', labelPt: 'Sri Lanca', lat: 6.9271, lng: 79.8612, suggestedCities: ['Colombo', 'Kandy', 'Galle', 'Ella'], knownCities: ['Colombo', 'Kandy', 'Galle', 'Ella', 'Sigiriya', 'Nuwara Eliya', 'Mirissa', 'Negombo', 'Trincomalee'] },
  { value: 'Sudan', labelEn: 'Sudan', labelPt: 'Sudão', lat: 15.5007, lng: 32.5599, suggestedCities: ['Khartoum', 'Omdurman'], knownCities: ['Khartoum', 'Cartum', 'Omdurman', 'Port Sudan'] },
  { value: 'Suriname', labelEn: 'Suriname', labelPt: 'Suriname', lat: 5.852, lng: -55.2038, suggestedCities: ['Paramaribo', 'Nieuw Nickerie'], knownCities: ['Paramaribo', 'Nieuw Nickerie'] },
  { value: 'Sweden', labelEn: 'Sweden', labelPt: 'Suécia', lat: 59.3293, lng: 18.0686, suggestedCities: ['Stockholm', 'Gothenburg', 'Malmö', 'Uppsala'], knownCities: ['Stockholm', 'Estocolmo', 'Gothenburg', 'Gotemburgo', 'Goteborg', 'Malmo', 'Uppsala', 'Visby', 'Gotland', 'Kiruna', 'Lund', 'Abisko'] },
  { value: 'Switzerland', labelEn: 'Switzerland', labelPt: 'Suíça', lat: 47.3769, lng: 8.5417, suggestedCities: ['Zurich', 'Lucerne', 'Interlaken', 'Zermatt'], knownCities: ['Zurich', 'Zurique', 'Lucerne', 'Lucerna', 'Luzern', 'Interlaken', 'Zermatt', 'Geneva', 'Genebra', 'Geneve', 'Bern', 'Berna', 'Basel', 'Basileia', 'Lausanne', 'Lausana', 'Montreux', 'Lugano', 'Lauterbrunnen', 'Grindelwald', 'St Moritz', 'Davos', 'Locarno'] },
  { value: 'Syria', labelEn: 'Syria', labelPt: 'Síria', lat: 33.5138, lng: 36.2765, suggestedCities: ['Damascus', 'Aleppo'], knownCities: ['Damascus', 'Damasco', 'Aleppo', 'Alepo', 'Latakia', 'Homs'] },
  { value: 'Taiwan', labelEn: 'Taiwan', labelPt: 'Taiwan', lat: 25.033, lng: 121.5654, suggestedCities: ['Taipei', 'Tainan', 'Kaohsiung', 'Hualien'], knownCities: ['Taipei', 'Taipé', 'Tainan', 'Kaohsiung', 'Hualien', 'Taichung', 'Jiufen', 'Kenting', 'Sun Moon Lake'] },
  { value: 'Tajikistan', labelEn: 'Tajikistan', labelPt: 'Tajiquistão', lat: 38.5598, lng: 68.787, suggestedCities: ['Dushanbe', 'Khujand', 'Khorog'], knownCities: ['Dushanbe', 'Khujand', 'Khorog', 'Panjakent'] },
  { value: 'Tanzania', labelEn: 'Tanzania', labelPt: 'Tanzânia', lat: -6.1659, lng: 39.2026, suggestedCities: ['Zanzibar', 'Arusha', 'Dar es Salaam', 'Moshi'], knownCities: ['Zanzibar', 'Stone Town', 'Arusha', 'Dar es Salaam', 'Moshi', 'Dodoma', 'Serengeti', 'Bagamoyo'] },
  { value: 'Thailand', labelEn: 'Thailand', labelPt: 'Tailândia', lat: 13.7563, lng: 100.5018, suggestedCities: ['Bangkok', 'Chiang Mai', 'Phuket', 'Krabi'], knownCities: ['Bangkok', 'Banguecoque', 'Chiang Mai', 'Phuket', 'Krabi', 'Koh Samui', 'Ayutthaya', 'Chiang Rai', 'Pattaya', 'Hua Hin', 'Koh Phangan', 'Koh Tao', 'Pai', 'Sukhothai'] },
  { value: 'Timor-Leste', labelEn: 'Timor-Leste', labelPt: 'Timor-Leste', lat: -8.5569, lng: 125.5603, suggestedCities: ['Dili', 'Baucau', 'Maubisse'], knownCities: ['Dili', 'Baucau', 'Maubisse', 'Atauro'] },
  { value: 'Togo', labelEn: 'Togo', labelPt: 'Togo', lat: 6.1256, lng: 1.2254, suggestedCities: ['Lomé', 'Kpalimé'], knownCities: ['Lome', 'Kpalime', 'Sokode'] },
  { value: 'Tonga', labelEn: 'Tonga', labelPt: 'Tonga', lat: -21.1394, lng: -175.2049, suggestedCities: ["Nuku'alofa", 'Neiafu'], knownCities: ['Nukualofa', 'Neiafu'] },
  { value: 'Trinidad and Tobago', labelEn: 'Trinidad and Tobago', labelPt: 'Trindade e Tobago', lat: 10.6549, lng: -61.5019, suggestedCities: ['Port of Spain', 'Scarborough'], knownCities: ['Port of Spain', 'Scarborough', 'San Fernando', 'Crown Point'] },
  { value: 'Tunisia', labelEn: 'Tunisia', labelPt: 'Tunísia', lat: 36.8065, lng: 10.1815, suggestedCities: ['Tunis', 'Sidi Bou Said', 'Sousse', 'Djerba'], knownCities: ['Tunis', 'Tunes', 'Sidi Bou Said', 'Carthage', 'Sousse', 'Hammamet', 'Djerba', 'Kairouan', 'Tozeur', 'Monastir'] },
  { value: 'Turkey', labelEn: 'Turkey', labelPt: 'Turquia', lat: 41.0082, lng: 28.9784, suggestedCities: ['Istanbul', 'Cappadocia', 'Antalya', 'Bodrum'], knownCities: ['Istanbul', 'Istambul', 'Cappadocia', 'Capadocia', 'Goreme', 'Antalya', 'Bodrum', 'Izmir', 'Esmirna', 'Ankara', 'Ancara', 'Fethiye', 'Kas', 'Ephesus', 'Selcuk', 'Pamukkale', 'Trabzon'] },
  { value: 'Turkmenistan', labelEn: 'Turkmenistan', labelPt: 'Turquemenistão', lat: 37.9601, lng: 58.3261, suggestedCities: ['Ashgabat', 'Merv'], knownCities: ['Ashgabat', 'Merv', 'Mary', 'Turkmenbashi'] },
  { value: 'Tuvalu', labelEn: 'Tuvalu', labelPt: 'Tuvalu', lat: -8.5211, lng: 179.1962, suggestedCities: ['Funafuti'], knownCities: ['Funafuti', 'Vaiaku'] },
  { value: 'Uganda', labelEn: 'Uganda', labelPt: 'Uganda', lat: 0.3476, lng: 32.5825, suggestedCities: ['Kampala', 'Entebbe', 'Jinja'], knownCities: ['Kampala', 'Entebbe', 'Jinja', 'Fort Portal', 'Kabale'] },
  { value: 'Ukraine', labelEn: 'Ukraine', labelPt: 'Ucrânia', lat: 50.4501, lng: 30.5234, suggestedCities: ['Kyiv', 'Lviv', 'Odesa'], knownCities: ['Kyiv', 'Kiev', 'Lviv', 'Odesa', 'Odessa', 'Kharkiv', 'Chernivtsi'] },
  { value: 'United Arab Emirates', labelEn: 'United Arab Emirates', labelPt: 'Emirados Árabes Unidos', lat: 25.2048, lng: 55.2708, suggestedCities: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ras Al Khaimah'], knownCities: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ras Al Khaimah', 'Al Ain', 'Fujairah', 'Ajman'] },
  { value: 'United Kingdom', labelEn: 'United Kingdom', labelPt: 'Reino Unido', lat: 51.5072, lng: -0.1276, suggestedCities: ['London', 'Edinburgh', 'Bath', 'Oxford'], knownCities: ['London', 'Londres', 'Edinburgh', 'Edimburgo', 'Bath', 'Oxford', 'Cambridge', 'Manchester', 'Liverpool', 'Glasgow', 'York', 'Bristol', 'Brighton', 'Cardiff', 'Belfast', 'Inverness', 'St Andrews', 'Cotswolds', 'Stratford-upon-Avon', 'Canterbury', 'Windsor', 'Birmingham', 'Newcastle', 'Leeds'] },
  { value: 'United States', labelEn: 'United States', labelPt: 'Estados Unidos', lat: 40.7128, lng: -74.006, suggestedCities: ['New York', 'San Francisco', 'Boston', 'Chicago'], knownCities: ['New York', 'Nova Iorque', 'NYC', 'Manhattan', 'San Francisco', 'Sao Francisco', 'Boston', 'Chicago', 'Los Angeles', 'Washington', 'Washington DC', 'Miami', 'New Orleans', 'Nova Orleaes', 'Seattle', 'Las Vegas', 'Austin', 'San Diego', 'Honolulu', 'Philadelphia', 'Filadelfia', 'Nashville', 'Charleston', 'Savannah', 'Portland', 'Denver', 'Atlanta', 'Orlando', 'Houston', 'Dallas', 'Phoenix', 'Santa Fe'] },
  { value: 'Uruguay', labelEn: 'Uruguay', labelPt: 'Uruguai', lat: -34.9011, lng: -56.1645, suggestedCities: ['Montevideo', 'Colonia del Sacramento', 'Punta del Este'], knownCities: ['Montevideo', 'Montevideu', 'Colonia del Sacramento', 'Punta del Este', 'Jose Ignacio', 'Piriapolis'] },
  { value: 'Uzbekistan', labelEn: 'Uzbekistan', labelPt: 'Usbequistão', lat: 41.2995, lng: 69.2401, suggestedCities: ['Samarkand', 'Bukhara', 'Tashkent', 'Khiva'], knownCities: ['Samarkand', 'Samarcanda', 'Bukhara', 'Bucara', 'Tashkent', 'Khiva'] },
  { value: 'Vanuatu', labelEn: 'Vanuatu', labelPt: 'Vanuatu', lat: -17.7333, lng: 168.3273, suggestedCities: ['Port Vila', 'Luganville'], knownCities: ['Port Vila', 'Luganville', 'Tanna'] },
  { value: 'Vatican City', labelEn: 'Vatican City', labelPt: 'Cidade do Vaticano', lat: 41.9029, lng: 12.4534, suggestedCities: ['Vatican City'], knownCities: ['Vatican City', 'Vaticano', 'Vatican'] },
  { value: 'Venezuela', labelEn: 'Venezuela', labelPt: 'Venezuela', lat: 10.4806, lng: -66.9036, suggestedCities: ['Caracas', 'Mérida', 'Isla Margarita'], knownCities: ['Caracas', 'Merida', 'Isla Margarita', 'Porlamar', 'Maracaibo', 'Valencia'] },
  { value: 'Vietnam', labelEn: 'Vietnam', labelPt: 'Vietname', lat: 21.0285, lng: 105.8542, suggestedCities: ['Hanoi', 'Hoi An', 'Ho Chi Minh City', 'Da Nang'], knownCities: ['Hanoi', 'Hoi An', 'Ho Chi Minh City', 'Saigon', 'Da Nang', 'Hue', 'Ha Long', 'Ninh Binh', 'Sapa', 'Nha Trang', 'Da Lat', 'Phu Quoc'] },
  { value: 'Yemen', labelEn: 'Yemen', labelPt: 'Iémen', lat: 15.3694, lng: 44.191, suggestedCities: ["Sana'a", 'Socotra', 'Aden'], knownCities: ['Sanaa', 'Socotra', 'Aden', 'Shibam'] },
  { value: 'Zambia', labelEn: 'Zambia', labelPt: 'Zâmbia', lat: -15.3875, lng: 28.3228, suggestedCities: ['Livingstone', 'Lusaka', 'Ndola'], knownCities: ['Livingstone', 'Lusaka', 'Ndola', 'South Luangwa'] },
  { value: 'Zimbabwe', labelEn: 'Zimbabwe', labelPt: 'Zimbabué', lat: -17.8252, lng: 31.0335, suggestedCities: ['Victoria Falls', 'Harare', 'Bulawayo'], knownCities: ['Victoria Falls', 'Harare', 'Bulawayo', 'Masvingo'] },
].sort((a, b) => a.value.localeCompare(b.value, 'en', { sensitivity: 'base' }));

const SORTED_COUNTRIES_EN: WorldCountryOption[] = [...WORLD_COUNTRIES].sort((a, b) =>
  a.labelEn.localeCompare(b.labelEn, 'en', { sensitivity: 'base' })
);

const SORTED_COUNTRIES_PT: WorldCountryOption[] = [...WORLD_COUNTRIES].sort((a, b) =>
  a.labelPt.localeCompare(b.labelPt, 'pt', { sensitivity: 'base' })
);

// Pre-indexed O(1) lookup tables built once at module initialization
const COUNTRY_BY_NORM_KEY = new Map<string, WorldCountryOption>();
const COUNTRY_CITY_MAP = new Map<string, Map<string, string>>();
const GLOBAL_CITY_TO_COUNTRY = new Map<
  string,
  { countryValue: string; canonicalCity: string }
>();

for (const c of WORLD_COUNTRIES) {
  const normVal = normalizeGeoText(c.value);
  const normEn = normalizeGeoText(c.labelEn);
  const normPt = normalizeGeoText(c.labelPt);
  if (normVal) COUNTRY_BY_NORM_KEY.set(normVal, c);
  if (normEn) COUNTRY_BY_NORM_KEY.set(normEn, c);
  if (normPt) COUNTRY_BY_NORM_KEY.set(normPt, c);

  const cityMap = new Map<string, string>();
  for (const city of [...c.suggestedCities, ...c.knownCities]) {
    const normCity = normalizeGeoText(city);
    if (!normCity) continue;
    if (!cityMap.has(normCity)) {
      cityMap.set(normCity, city);
    }
    if (!GLOBAL_CITY_TO_COUNTRY.has(normCity)) {
      GLOBAL_CITY_TO_COUNTRY.set(normCity, {
        countryValue: c.value,
        canonicalCity: city,
      });
    }
  }
  COUNTRY_CITY_MAP.set(c.value, cityMap);
}

/**
 * Returns the full worldwide list of countries strictly sorted in alphabetical order in O(1) time.
 */
export function getSortedWorldCountries(language: 'en' | 'pt' = 'en'): WorldCountryOption[] {
  return language === 'pt' ? SORTED_COUNTRIES_PT : SORTED_COUNTRIES_EN;
}

/**
 * Finds a country entry by English name, Portuguese name, or normalized match in O(1) time.
 */
export function findWorldCountry(countryQuery: string): WorldCountryOption | undefined {
  const norm = normalizeGeoText(countryQuery);
  if (!norm) return undefined;
  return COUNTRY_BY_NORM_KEY.get(norm);
}

/**
 * Infers a country and initial city list from a URL query parameter in O(1) time.
 */
export function resolveCountryFromQueryParam(cityParam: string | null): {
  country: string;
  initialCities: string[];
} {
  if (!cityParam || !cityParam.trim()) {
    return { country: 'Italy', initialCities: ['Rome', 'Florence'] };
  }
  const clean = cityParam.trim();
  const norm = normalizeGeoText(clean);
  if (!norm) {
    return { country: 'Italy', initialCities: ['Rome', 'Florence'] };
  }

  const directCountry = COUNTRY_BY_NORM_KEY.get(norm);
  if (directCountry) {
    return { country: directCountry.value, initialCities: [] };
  }

  const cityOwner = GLOBAL_CITY_TO_COUNTRY.get(norm);
  if (cityOwner) {
    return { country: cityOwner.countryValue, initialCities: [clean] };
  }

  return { country: 'Italy', initialCities: ['Rome'] };
}

/**
 * Registers a geocoder-verified city, town, or nature reserve into the in-memory country index
 * and coordinate lookup table so subsequent validations and map bounds are instant.
 */
export function registerVerifiedCityCoordinates(
  cityName: string,
  countryName: string,
  coords?: { lat: number; lng: number }
): void {
  const cleanCity = String(cityName || '').trim();
  const normCity = normalizeGeoText(cleanCity);
  if (!normCity) return;

  const targetCountry = findWorldCountry(countryName);
  if (targetCountry) {
    let cityMap = COUNTRY_CITY_MAP.get(targetCountry.value);
    if (!cityMap) {
      cityMap = new Map<string, string>();
      COUNTRY_CITY_MAP.set(targetCountry.value, cityMap);
    }
    cityMap.set(normCity, cleanCity);
  }

  if (
    coords &&
    typeof coords.lat === 'number' &&
    typeof coords.lng === 'number' &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng)
  ) {
    GLOBAL_CITY_COORDINATES[normCity] = {
      lat: Number(coords.lat.toFixed(5)),
      lng: Number(coords.lng.toFixed(5)),
    };
  }
}

/**
 * Validates that a user-inputted city passes sanitization and checks the local O(1) index.
 * If not found in the pre-computed index, returns reason: 'needs_geocoding' so the caller
 * can verify the place against the Geocoding API within the selected country's boundaries.
 */
export function validateCityInCountry(
  cityInput: string,
  selectedCountry: string
): CityValidationResult {
  const sanitization = sanitizeAndCheckLocationInput(cityInput);
  const normalizedInput = normalizeGeoText(cityInput);

  if (!sanitization.valid) {
    return {
      valid: false,
      normalizedInput,
      reason: sanitization.reason || 'invalid_characters',
    };
  }

  const targetCountry = findWorldCountry(selectedCountry);
  if (!targetCountry) {
    return { valid: false, normalizedInput, reason: 'unknown_city_for_country' };
  }

  // 1. O(1) check if the city belongs to the selected country's known cities, suggested cities, or geocoder cache
  const targetCityMap = COUNTRY_CITY_MAP.get(targetCountry.value);
  const matchedInTarget = targetCityMap?.get(normalizedInput);

  if (matchedInTarget) {
    return {
      valid: true,
      normalizedInput,
      canonicalCity: matchedInTarget,
      matchedCountry: targetCountry.value,
    };
  }

  // 2. O(1) check if the input is another country's name
  const matchedOtherCountry = COUNTRY_BY_NORM_KEY.get(normalizedInput);
  if (matchedOtherCountry && matchedOtherCountry.value !== targetCountry.value) {
    return {
      valid: false,
      normalizedInput,
      matchedCountry: matchedOtherCountry.value,
      reason: 'wrong_country',
    };
  }

  // 3. O(1) check if the city is a major capital/metropolis known to belong to a DIFFERENT country
  const cityOwner = GLOBAL_CITY_TO_COUNTRY.get(normalizedInput);
  if (cityOwner && cityOwner.countryValue !== targetCountry.value) {
    return {
      valid: false,
      normalizedInput,
      canonicalCity: cityOwner.canonicalCity,
      matchedCountry: cityOwner.countryValue,
      reason: 'wrong_country',
    };
  }

  // 4. Not in the pre-computed top-tier index: requires live Geocoding API verification
  return {
    valid: false,
    normalizedInput,
    reason: 'needs_geocoding',
  };
}

/**
 * Detailed coordinates lookup for major cities across the globe.
 */
export const GLOBAL_CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  // Italy
  rome: { lat: 41.8902, lng: 12.4922 },
  roma: { lat: 41.8902, lng: 12.4922 },
  florence: { lat: 43.7696, lng: 11.2558 },
  florenca: { lat: 43.7696, lng: 11.2558 },
  firenze: { lat: 43.7696, lng: 11.2558 },
  venice: { lat: 45.4408, lng: 12.3155 },
  veneza: { lat: 45.4408, lng: 12.3155 },
  milan: { lat: 45.4642, lng: 9.19 },
  milao: { lat: 45.4642, lng: 9.19 },
  naples: { lat: 40.8518, lng: 14.2681 },
  napoles: { lat: 40.8518, lng: 14.2681 },
  bologna: { lat: 44.4949, lng: 11.3426 },
  turin: { lat: 45.0703, lng: 7.6869 },
  verona: { lat: 45.4384, lng: 10.9916 },
  pisa: { lat: 43.7228, lng: 10.4017 },
  siena: { lat: 43.3188, lng: 11.3308 },
  genoa: { lat: 44.4056, lng: 8.9463 },
  palermo: { lat: 38.1157, lng: 13.3615 },
  amalfi: { lat: 40.634, lng: 14.6027 },
  sorrento: { lat: 40.6263, lng: 14.3758 },
  como: { lat: 45.8081, lng: 9.0852 },
  bari: { lat: 41.1171, lng: 16.8719 },
  // Portugal
  lisbon: { lat: 38.7139, lng: -9.1334 },
  lisboa: { lat: 38.7139, lng: -9.1334 },
  porto: { lat: 41.1496, lng: -8.6109 },
  oporto: { lat: 41.1496, lng: -8.6109 },
  sintra: { lat: 38.7979, lng: -9.3881 },
  coimbra: { lat: 40.2033, lng: -8.4103 },
  faro: { lat: 37.0194, lng: -7.9304 },
  lagos: { lat: 37.1028, lng: -8.673 },
  evora: { lat: 38.5714, lng: -7.9135 },
  braga: { lat: 41.5454, lng: -8.4265 },
  guimaraes: { lat: 41.4425, lng: -8.2918 },
  aveiro: { lat: 40.6405, lng: -8.6538 },
  funchal: { lat: 32.6669, lng: -16.9241 },
  madeira: { lat: 32.6669, lng: -16.9241 },
  'ponta delgada': { lat: 37.7412, lng: -25.6756 },
  cascais: { lat: 38.6979, lng: -9.4215 },
  // Spain
  barcelona: { lat: 41.3874, lng: 2.1686 },
  madrid: { lat: 40.4168, lng: -3.7038 },
  seville: { lat: 37.3891, lng: -5.9845 },
  sevilha: { lat: 37.3891, lng: -5.9845 },
  granada: { lat: 37.1773, lng: -3.5986 },
  valencia: { lat: 39.4699, lng: -0.3763 },
  malaga: { lat: 36.7213, lng: -4.4214 },
  bilbao: { lat: 43.263, lng: -2.935 },
  'san sebastian': { lat: 43.3183, lng: -1.9812 },
  cordoba: { lat: 37.8882, lng: -4.7794 },
  toledo: { lat: 39.8628, lng: -4.0273 },
  // France
  paris: { lat: 48.8566, lng: 2.3522 },
  lyon: { lat: 45.764, lng: 4.8357 },
  nice: { lat: 43.7102, lng: 7.262 },
  bordeaux: { lat: 44.8378, lng: -0.5792 },
  marseille: { lat: 43.2965, lng: 5.3698 },
  strasbourg: { lat: 48.5734, lng: 7.7521 },
  toulouse: { lat: 43.6047, lng: 1.4442 },
  // Japan
  tokyo: { lat: 35.6762, lng: 139.6503 },
  toquio: { lat: 35.6762, lng: 139.6503 },
  kyoto: { lat: 35.0116, lng: 135.7681 },
  quioto: { lat: 35.0116, lng: 135.7681 },
  osaka: { lat: 34.6937, lng: 135.5023 },
  hakone: { lat: 35.2324, lng: 139.1069 },
  nara: { lat: 34.6851, lng: 135.8048 },
  hiroshima: { lat: 34.3853, lng: 132.4553 },
  sapporo: { lat: 43.0618, lng: 141.3545 },
  fukuoka: { lat: 33.5902, lng: 130.4017 },
  kanazawa: { lat: 36.5613, lng: 136.6562 },
  // UK & Ireland
  london: { lat: 51.5072, lng: -0.1276 },
  londres: { lat: 51.5072, lng: -0.1276 },
  edinburgh: { lat: 55.9533, lng: -3.1883 },
  edimburgo: { lat: 55.9533, lng: -3.1883 },
  bath: { lat: 51.3781, lng: -2.3597 },
  oxford: { lat: 51.752, lng: -1.2577 },
  cambridge: { lat: 52.2053, lng: 0.1218 },
  manchester: { lat: 53.4808, lng: -2.2426 },
  dublin: { lat: 53.3498, lng: -6.2603 },
  galway: { lat: 53.2707, lng: -9.0568 },
  // Central & Northern Europe
  berlin: { lat: 52.52, lng: 13.405 },
  berlim: { lat: 52.52, lng: 13.405 },
  munich: { lat: 48.1351, lng: 11.582 },
  munique: { lat: 48.1351, lng: 11.582 },
  hamburg: { lat: 53.5511, lng: 9.9937 },
  heidelberg: { lat: 49.3988, lng: 8.6724 },
  frankfurt: { lat: 50.1109, lng: 8.6821 },
  cologne: { lat: 50.9375, lng: 6.9603 },
  amsterdam: { lat: 52.3676, lng: 4.9041 },
  amesterdao: { lat: 52.3676, lng: 4.9041 },
  utrecht: { lat: 52.0907, lng: 5.1214 },
  haarlem: { lat: 52.3874, lng: 4.6462 },
  rotterdam: { lat: 51.9244, lng: 4.4777 },
  brussels: { lat: 50.8503, lng: 4.3517 },
  bruges: { lat: 51.2093, lng: 3.2247 },
  ghent: { lat: 51.0543, lng: 3.7174 },
  antwerp: { lat: 51.2194, lng: 4.4025 },
  vienna: { lat: 48.2082, lng: 16.3738 },
  viena: { lat: 48.2082, lng: 16.3738 },
  salzburg: { lat: 47.8095, lng: 13.055 },
  innsbruck: { lat: 47.2692, lng: 11.4041 },
  hallstatt: { lat: 47.5622, lng: 13.6493 },
  zurich: { lat: 47.3769, lng: 8.5417 },
  lucerne: { lat: 47.0502, lng: 8.3093 },
  interlaken: { lat: 46.6863, lng: 7.8632 },
  zermatt: { lat: 46.0207, lng: 7.7491 },
  geneva: { lat: 46.2044, lng: 6.1432 },
  prague: { lat: 50.0755, lng: 14.4378 },
  praga: { lat: 50.0755, lng: 14.4378 },
  budapest: { lat: 47.4979, lng: 19.0402 },
  krakow: { lat: 50.0647, lng: 19.945 },
  warsaw: { lat: 52.2297, lng: 21.0122 },
  copenhagen: { lat: 55.6761, lng: 12.5683 },
  stockholm: { lat: 59.3293, lng: 18.0686 },
  oslo: { lat: 59.9139, lng: 10.7522 },
  bergen: { lat: 60.3913, lng: 5.3221 },
  helsinki: { lat: 60.1699, lng: 24.9384 },
  reykjavik: { lat: 64.1466, lng: -21.9426 },
  // Mediterranean & Balkans
  athens: { lat: 37.9838, lng: 23.7275 },
  atenas: { lat: 37.9838, lng: 23.7275 },
  santorini: { lat: 36.3932, lng: 25.4615 },
  naxos: { lat: 37.1036, lng: 25.3777 },
  chania: { lat: 35.5138, lng: 24.018 },
  dubrovnik: { lat: 42.6507, lng: 18.0944 },
  split: { lat: 43.5081, lng: 16.4402 },
  zadar: { lat: 44.1194, lng: 15.2314 },
  zagreb: { lat: 45.815, lng: 15.9819 },
  ljubljana: { lat: 46.0569, lng: 14.5058 },
  bled: { lat: 46.3683, lng: 14.1146 },
  kotor: { lat: 42.4247, lng: 18.7712 },
  istanbul: { lat: 41.0082, lng: 28.9784 },
  valletta: { lat: 35.8989, lng: 14.5146 },
  // Africa & Middle East
  marrakech: { lat: 31.6295, lng: -7.9811 },
  fes: { lat: 34.0181, lng: -5.0078 },
  chefchaouen: { lat: 35.1688, lng: -5.2636 },
  essaouira: { lat: 31.5085, lng: -9.7595 },
  cairo: { lat: 30.0444, lng: 31.2357 },
  'cape town': { lat: -33.9249, lng: 18.4241 },
  dubai: { lat: 25.2048, lng: 55.2708 },
  'abu dhabi': { lat: 24.4539, lng: 54.3773 },
  // Americas & Asia-Pacific
  'new york': { lat: 40.7128, lng: -74.006 },
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  boston: { lat: 42.3601, lng: -71.0589 },
  chicago: { lat: 41.8781, lng: -87.6298 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  miami: { lat: 25.7617, lng: -80.1918 },
  toronto: { lat: 43.6532, lng: -79.3832 },
  vancouver: { lat: 49.2827, lng: -123.1207 },
  montreal: { lat: 45.5017, lng: -73.5673 },
  'mexico city': { lat: 19.4326, lng: -99.1332 },
  oaxaca: { lat: 17.0732, lng: -96.7266 },
  'panama city': { lat: 8.9824, lng: -79.5199 },
  'santiago de veraguas': { lat: 8.0981, lng: -80.9832 },
  boquete: { lat: 8.7802, lng: -82.4414 },
  'bocas del toro': { lat: 9.3403, lng: -82.2419 },
  'rio de janeiro': { lat: -22.9068, lng: -43.1729 },
  'sao paulo': { lat: -23.5505, lng: -46.6333 },
  salvador: { lat: -12.9714, lng: -38.5014 },
  'buenos aires': { lat: -34.6037, lng: -58.3816 },
  santiago: { lat: -33.4489, lng: -70.6693 },
  lima: { lat: -12.0464, lng: -77.0428 },
  cusco: { lat: -13.532, lng: -71.9675 },
  bogota: { lat: 4.711, lng: -74.0721 },
  medellin: { lat: 6.2442, lng: -75.5812 },
  cartagena: { lat: 10.391, lng: -75.4794 },
  bangkok: { lat: 13.7563, lng: 100.5018 },
  'chiang mai': { lat: 18.7883, lng: 98.9853 },
  singapore: { lat: 1.3521, lng: 103.8198 },
  seoul: { lat: 37.5665, lng: 126.978 },
  busan: { lat: 35.1796, lng: 129.0756 },
  taipei: { lat: 25.033, lng: 121.5654 },
  hanoi: { lat: 21.0285, lng: 105.8542 },
  'hoi an': { lat: 15.8801, lng: 108.338 },
  ubud: { lat: -8.5069, lng: 115.2625 },
  sydney: { lat: -33.8688, lng: 151.2093 },
  melbourne: { lat: -37.8136, lng: 144.9631 },
  auckland: { lat: -36.8485, lng: 174.7633 },
  queenstown: { lat: -45.0312, lng: 168.6626 },
};

/**
 * Checks whether a city name has exact coordinates in GLOBAL_CITY_COORDINATES.
 */
export function hasExactCityCoordinates(city?: string): boolean {
  const normCity = normalizeGeoText(city || '');
  return Boolean(normCity && GLOBAL_CITY_COORDINATES[normCity]);
}

/**
 * Resolves accurate coordinates for any city and/or country worldwide.
 */
export function resolveDestinationCoordinates(
  city?: string,
  country?: string
): { lat: number; lng: number } {
  const normCity = normalizeGeoText(city || '');
  if (normCity && GLOBAL_CITY_COORDINATES[normCity]) {
    return GLOBAL_CITY_COORDINATES[normCity];
  }

  if (country) {
    const matchedCountry = findWorldCountry(country);
    if (matchedCountry) {
      // Check if the first suggested city has specific coordinates
      const firstSug = normalizeGeoText(matchedCountry.suggestedCities[0] || '');
      if (firstSug && GLOBAL_CITY_COORDINATES[firstSug] && !normCity) {
        return GLOBAL_CITY_COORDINATES[firstSug];
      }
      return { lat: matchedCountry.lat, lng: matchedCountry.lng };
    }
  }

  if (city) {
    const matchedCountryFromCity = findWorldCountry(city);
    if (matchedCountryFromCity) {
      return { lat: matchedCountryFromCity.lat, lng: matchedCountryFromCity.lng };
    }
  }

  return { lat: 41.8902, lng: 12.4922 };
}

/**
 * Ensures an activity coordinate stays strictly within the requested city bounds.
 * If an AI response returns invalid coordinates or jumps to a faraway city (> maxDeltaDeg),
 * clamps the coordinate to a local neighborhood offset around the target city center.
 */
export function clampCoordinatesToCityBounds(
  lat: number | undefined,
  lng: number | undefined,
  cityCenter: { lat: number; lng: number },
  activityIndex = 0,
  maxDeltaDeg = 0.35
): { lat: number; lng: number } {
  const isValidNumber =
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001);

  if (isValidNumber) {
    const dLat = Math.abs(lat - cityCenter.lat);
    const dLng = Math.abs(lng - cityCenter.lng);
    if (dLat <= maxDeltaDeg && dLng <= maxDeltaDeg) {
      return {
        lat: Number(lat.toFixed(5)),
        lng: Number(lng.toFixed(5)),
      };
    }
  }

  // Deterministic local neighborhood offset within the target city bounds (~400m - 1.5km)
  const angle = (activityIndex * 2.1) % (Math.PI * 2);
  const radius = 0.004 + (activityIndex % 4) * 0.0025;
  return {
    lat: Number((cityCenter.lat + Math.sin(angle) * radius).toFixed(5)),
    lng: Number((cityCenter.lng + Math.cos(angle) * radius).toFixed(5)),
  };
}

/**
 * Enforces strict chronological multi-city routing:
 * Completes all days in City A before moving to City B (never alternating back and forth day-by-day).
 */
export function assignContiguousCitiesToDays(
  cities: string[],
  daysCount: number,
  fallbackCity: string = 'Rome'
): string[] {
  const cleanCities = (cities || []).map((c) => String(c || '').trim()).filter(Boolean);
  const totalDays = Math.max(1, Math.min(21, Math.round(daysCount || 1)));
  if (cleanCities.length === 0) {
    return Array.from({ length: totalDays }, () => fallbackCity);
  }
  if (cleanCities.length === 1) {
    return Array.from({ length: totalDays }, () => cleanCities[0]);
  }
  return Array.from({ length: totalDays }, (_, idx) => {
    const cityIdx = Math.min(
      cleanCities.length - 1,
      Math.floor((idx * cleanCities.length) / totalDays)
    );
    return cleanCities[cityIdx];
  });
}

/**
 * Resolves the active venue name and distinct geographic coordinates for an activity's
 * currently selected budget tier ('budget' | 'mid' | 'premium').
 * Guarantees that Budget, Mid, and Premium variations NEVER recycle the exact same coordinates.
 */
export function getActiveActivityLocation(activity: {
  id?: string;
  title?: string;
  location?: { name?: string; lat?: number; lng?: number; placeId?: string };
  selectedTier?: 'budget' | 'mid' | 'premium';
  costOptions?: Record<
    string,
    {
      title?: string;
      venueName?: string;
      coordinates?: { lat?: number; lng?: number };
    }
  >;
}): { name: string; venueName: string; lat: number; lng: number; placeId?: string } {
  const baseLat =
    typeof activity?.location?.lat === 'number' && Number.isFinite(activity.location.lat)
      ? activity.location.lat
      : 41.8902;
  const baseLng =
    typeof activity?.location?.lng === 'number' && Number.isFinite(activity.location.lng)
      ? activity.location.lng
      : 12.4922;
  const baseName = activity?.location?.name || activity?.title || 'City Center';
  const tier = activity?.selectedTier || 'mid';
  const tierOpt = activity?.costOptions?.[tier];

  // Deterministic seed from activity ID/title so each activity has stable distinct tier offsets
  const seedStr = `${activity?.id || ''}:${activity?.title || ''}`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) % 10000;
  }
  const angleBase = ((hash % 360) * Math.PI) / 180;

  if (
    tierOpt?.coordinates &&
    typeof tierOpt.coordinates.lat === 'number' &&
    typeof tierOpt.coordinates.lng === 'number' &&
    Number.isFinite(tierOpt.coordinates.lat) &&
    Number.isFinite(tierOpt.coordinates.lng)
  ) {
    let lat = tierOpt.coordinates.lat;
    let lng = tierOpt.coordinates.lng;

    // Guard: if AI accidentally returned the exact same coordinates as base/mid for budget or premium, offset slightly within the neighborhood
    const midCoords = activity?.costOptions?.mid?.coordinates || { lat: baseLat, lng: baseLng };
    if (
      tier !== 'mid' &&
      Math.abs(lat - (midCoords.lat ?? baseLat)) < 0.00015 &&
      Math.abs(lng - (midCoords.lng ?? baseLng)) < 0.00015
    ) {
      const tierAngle = tier === 'budget' ? angleBase + 1.15 : angleBase - 1.35;
      const tierRadius = tier === 'budget' ? 0.0052 : 0.0068;
      lat = Number((baseLat + Math.sin(tierAngle) * tierRadius).toFixed(5));
      lng = Number((baseLng + Math.cos(tierAngle) * tierRadius).toFixed(5));
    }

    const resolvedName = tierOpt.venueName || tierOpt.title || baseName;
    return {
      name: resolvedName,
      venueName: resolvedName,
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      placeId: activity?.location?.placeId,
    };
  }

  if (tier === 'budget') {
    const budgetAngle = angleBase + 1.15;
    const budgetRadius = 0.0052;
    const resolvedName = tierOpt?.venueName || tierOpt?.title || `${baseName} (Local Quarter)`;
    return {
      name: resolvedName,
      venueName: resolvedName,
      lat: Number((baseLat + Math.sin(budgetAngle) * budgetRadius).toFixed(5)),
      lng: Number((baseLng + Math.cos(budgetAngle) * budgetRadius).toFixed(5)),
      placeId: activity?.location?.placeId,
    };
  }

  if (tier === 'premium') {
    const premiumAngle = angleBase - 1.35;
    const premiumRadius = 0.0068;
    const resolvedName = tierOpt?.venueName || tierOpt?.title || `${baseName} (Premier District)`;
    return {
      name: resolvedName,
      venueName: resolvedName,
      lat: Number((baseLat + Math.sin(premiumAngle) * premiumRadius).toFixed(5)),
      lng: Number((baseLng + Math.cos(premiumAngle) * premiumRadius).toFixed(5)),
      placeId: activity?.location?.placeId,
    };
  }

  const resolvedName = tierOpt?.venueName || baseName;
  return {
    name: resolvedName,
    venueName: resolvedName,
    lat: Number(baseLat.toFixed(5)),
    lng: Number(baseLng.toFixed(5)),
    placeId: activity?.location?.placeId,
  };
}

/**
 * Calculates a tight geographic bounding box (fitBounds) for a list of activities
 * (automatically resolving each activity's active budget tier coordinates when present)
 * so the map focuses tightly on the specific city and reacts immediately to tier changes.
 */
export function computeActivityBounds(
  activities: {
    id?: string;
    title?: string;
    location?: { name?: string; lat?: number; lng?: number };
    selectedTier?: 'budget' | 'mid' | 'premium';
    costOptions?: Record<
      string,
      {
        title?: string;
        venueName?: string;
        coordinates?: { lat?: number; lng?: number };
      }
    >;
  }[],
  fallbackCenter: { lat: number; lng: number } = { lat: 41.8902, lng: 12.4922 }
): ActivityBoundingBox {
  const validPoints = (activities || [])
    .map((a) => {
      if (!a) return undefined;
      if (a.selectedTier || a.costOptions) {
        return getActiveActivityLocation(a);
      }
      return a.location;
    })
    .filter(
      (loc): loc is { lat: number; lng: number } =>
        Boolean(loc) &&
        typeof loc!.lat === 'number' &&
        typeof loc!.lng === 'number' &&
        Number.isFinite(loc!.lat) &&
        Number.isFinite(loc!.lng) &&
        loc!.lat >= -90 &&
        loc!.lat <= 90 &&
        loc!.lng >= -180 &&
        loc!.lng <= 180 &&
        !(Math.abs(loc!.lat) < 0.0001 && Math.abs(loc!.lng) < 0.0001)
    );

  if (validPoints.length === 0) {
    const pad = 0.012;
    return {
      north: Number((fallbackCenter.lat + pad).toFixed(5)),
      south: Number((fallbackCenter.lat - pad).toFixed(5)),
      east: Number((fallbackCenter.lng + pad).toFixed(5)),
      west: Number((fallbackCenter.lng - pad).toFixed(5)),
      centerLat: fallbackCenter.lat,
      centerLng: fallbackCenter.lng,
      spanLat: pad * 2,
      spanLng: pad * 2,
      recommendedZoom: 13,
    };
  }

  // Filter out any extreme rogue outlier (> 0.6 degrees away from median point) so the map stays tightly focused on the city
  const sortedLats = [...validPoints].map((p) => p.lat).sort((a, b) => a - b);
  const sortedLngs = [...validPoints].map((p) => p.lng).sort((a, b) => a - b);
  const medianLat = sortedLats[Math.floor(sortedLats.length / 2)];
  const medianLng = sortedLngs[Math.floor(sortedLngs.length / 2)];

  const cityClusterPoints = validPoints.filter(
    (p) => Math.abs(p.lat - medianLat) <= 0.6 && Math.abs(p.lng - medianLng) <= 0.6
  );
  const points = cityClusterPoints.length > 0 ? cityClusterPoints : [validPoints[0]];

  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;

  for (const pt of points) {
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;
    if (pt.lng < minLng) minLng = pt.lng;
    if (pt.lng > maxLng) maxLng = pt.lng;
  }

  // Ensure a sensible minimum city neighborhood span so single-marker or ultra-close stops don't over-zoom
  const minSpan = 0.008;
  const rawSpanLat = maxLat - minLat;
  const rawSpanLng = maxLng - minLng;

  const padLat = Math.max((minSpan - rawSpanLat) / 2, rawSpanLat * 0.18, 0.003);
  const padLng = Math.max((minSpan - rawSpanLng) / 2, rawSpanLng * 0.18, 0.003);

  const north = Number((maxLat + padLat).toFixed(5));
  const south = Number((minLat - padLat).toFixed(5));
  const east = Number((maxLng + padLng).toFixed(5));
  const west = Number((minLng - padLng).toFixed(5));
  const centerLat = Number(((north + south) / 2).toFixed(5));
  const centerLng = Number(((east + west) / 2).toFixed(5));
  const spanLat = Number((north - south).toFixed(5));
  const spanLng = Number((east - west).toFixed(5));

  const maxSpan = Math.max(spanLat, spanLng);
  let recommendedZoom = 14;
  if (maxSpan > 0.25) recommendedZoom = 11;
  else if (maxSpan > 0.1) recommendedZoom = 12;
  else if (maxSpan > 0.04) recommendedZoom = 13;
  else if (maxSpan > 0.015) recommendedZoom = 14;
  else recommendedZoom = 15;

  return {
    north,
    south,
    east,
    west,
    centerLat,
    centerLng,
    spanLat,
    spanLng,
    recommendedZoom,
  };
}

/**
 * Filters the pre-sorted 197-country list in real-time by query string (matching
 * localized PT/EN labels and canonical country names, accent-insensitively).
 */
export function filterWorldCountries(
  query: string,
  lang: 'en' | 'pt' = 'pt'
): WorldCountryOption[] {
  const fullList = getSortedWorldCountries(lang);
  const normQuery = normalizeGeoText(query);
  if (!normQuery) {
    return fullList;
  }
  return fullList.filter(
    (c) =>
      normalizeGeoText(c.labelPt).includes(normQuery) ||
      normalizeGeoText(c.labelEn).includes(normQuery) ||
      normalizeGeoText(c.value).includes(normQuery)
  );
}
