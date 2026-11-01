// Championnats suivis. Pour en ajouter un : une ligne ici (code football-data.org + codes CSV football-data.co.uk).
// Le plan gratuit de football-data.org couvre aussi PPL (Portugal), DED (Pays-Bas), ELC (Championship) ; il suffit de les ajouter,
// avec les codes CSV P1 (Portugal) ou N1 (Pays-Bas) et leur deuxième division quand elle existe.
export const LEAGUES = [
  {code: 'FL1', name: 'Ligue 1', csv: ['F1', 'F2']},
  {code: 'PL', name: 'Premier League', csv: ['E0', 'E1']},
  {code: 'BL1', name: 'Bundesliga', csv: ['D1', 'D2']},
  {code: 'SA', name: 'Serie A', csv: ['I1', 'I2']},
  {code: 'PD', name: 'La Liga', csv: ['SP1', 'SP2']},
  {code: 'PPL', name: 'Liga Portugal', csv: ['P1']},     // pas de 2e division dans les fichiers : un promu passe par le calcul simple
  {code: 'DED', name: 'Eredivisie', csv: ['N1']},
  {code: 'ELC', name: 'Championship', csv: ['E1', 'E2']},
  // Ligue 2 : absente du plan gratuit de football-data.org. Calendrier et résultats lus dans les fichiers de football-data.co.uk.
  {code: 'FL2', name: 'Ligue 2', csv: ['F2'], source: 'csv'},
];
// Codes CSV des deuxièmes divisions (servent d'historique pour les équipes promues).
export const SECOND_DIVISIONS = new Set(['F2', 'E1', 'D2', 'I2', 'SP2']);

// Noms de l'API (football-data.org) → noms des fichiers CSV. Clés en minuscules sans accents ni ponctuation.
// Un alias n'est utilisé que si le nom visé existe dans l'historique ; sinon la recherche approchée prend le relais.
export const ALIASES = {
  PL: {
    'manchester city': 'Man City', 'manchester united': 'Man United', 'nottingham forest': "Nott'm Forest",
    'wolverhampton wanderers': 'Wolves', 'tottenham hotspur': 'Tottenham', 'west bromwich albion': 'West Brom',
    'leicester city': 'Leicester', 'ipswich town': 'Ipswich', 'luton town': 'Luton', 'leeds united': 'Leeds',
    'newcastle united': 'Newcastle', 'west ham united': 'West Ham', 'brighton hove albion': 'Brighton', 'afc bournemouth': 'Bournemouth',
  },
  BL1: {
    'fc bayern munchen': 'Bayern Munich', 'bayern munchen': 'Bayern Munich', 'eintracht frankfurt': 'Ein Frankfurt',
    'borussia monchengladbach': "M'gladbach", 'borussia dortmund': 'Dortmund', 'bayer 04 leverkusen': 'Leverkusen',
    '1 fc union berlin': 'Union Berlin', 'rb leipzig': 'RB Leipzig', 'fc st pauli 1910': 'St Pauli', 'hamburger sv': 'Hamburg',
    '1 fc koln': 'FC Koln', '1 fsv mainz 05': 'Mainz', '1 fc heidenheim 1846': 'Heidenheim',
  },
  SA: {
    'fc internazionale milano': 'Inter', 'internazionale': 'Inter', 'ac milan': 'Milan', 'hellas verona fc': 'Verona',
    'ssc napoli': 'Napoli', 'as roma': 'Roma', 'ss lazio': 'Lazio', 'us lecce': 'Lecce',
  },
  PD: {
    'club atletico de madrid': 'Ath Madrid', 'atletico madrid': 'Ath Madrid', 'athletic club': 'Ath Bilbao',
    'rcd espanyol de barcelona': 'Espanol', 'rayo vallecano de madrid': 'Vallecano', 'real sociedad de futbol': 'Sociedad',
    'real betis balompie': 'Betis', 'rc celta de vigo': 'Celta', 'deportivo alaves': 'Alaves', 'ud las palmas': 'Las Palmas', 'villarreal cf': 'Villarreal',
  },
  FL1: {},
  ELC: {
    'sheffield wednesday': 'Sheffield Weds', 'queens park rangers': 'QPR', 'west bromwich albion': 'West Brom', 'preston north end': 'Preston',
    'blackburn rovers': 'Blackburn', 'wolverhampton wanderers': 'Wolves', 'nottingham forest': "Nott'm Forest", 'leicester city': 'Leicester', 'ipswich town': 'Ipswich',
    'luton town': 'Luton', 'leeds united': 'Leeds', 'manchester united': 'Man United', 'manchester city': 'Man City', 'newcastle united': 'Newcastle', 'west ham united': 'West Ham',
    'tottenham hotspur': 'Tottenham', 'brighton hove albion': 'Brighton', 'afc bournemouth': 'Bournemouth', 'milton keynes dons': 'Milton Keynes Dons', 'peterborough united': 'Peterborough',
    'oxford united': 'Oxford', 'stoke city': 'Stoke', 'swansea city': 'Swansea', 'hull city': 'Hull', 'norwich city': 'Norwich', 'coventry city': 'Coventry', 'derby county': 'Derby',
    'birmingham city': 'Birmingham', 'charlton athletic': 'Charlton', 'cardiff city': 'Cardiff', 'plymouth argyle': 'Plymouth', 'huddersfield town': 'Huddersfield', 'rotherham united': 'Rotherham',
  },
  PPL: {
    'sporting clube de portugal': 'Sp Lisbon', 'sporting cp': 'Sp Lisbon', 'sport lisboa e benfica': 'Benfica', 'sl benfica': 'Benfica', 'fc porto': 'Porto',
    'sporting clube de braga': 'Sp Braga', 'sc braga': 'Sp Braga', 'vitoria sc': 'Guimaraes', 'vitoria guimaraes': 'Guimaraes', 'fc famalicao': 'Famalicao',
    'gil vicente fc': 'Gil Vicente', 'rio ave fc': 'Rio Ave', 'cd santa clara': 'Santa Clara', 'casa pia ac': 'Casa Pia', 'moreirense fc': 'Moreirense',
    'fc arouca': 'Arouca', 'gd estoril praia': 'Estoril', 'estoril praia': 'Estoril', 'cd nacional': 'Nacional', 'avs futebol sad': 'AVS', 'afs': 'AVS',
    'cf estrela da amadora': 'Estrela', 'fc alverca': 'Alverca', 'cd tondela': 'Tondela', 'boavista fc': 'Boavista', 'sc farense': 'Farense',
  },
  DED: {
    'psv': 'PSV Eindhoven', 'psv eindhoven': 'PSV Eindhoven', 'afc ajax': 'Ajax', 'feyenoord rotterdam': 'Feyenoord', 'az': 'AZ Alkmaar', 'az alkmaar': 'AZ Alkmaar',
    'fc twente 65': 'Twente', 'fc twente': 'Twente', 'fc utrecht': 'Utrecht', 'sc heerenveen': 'Heerenveen', 'nec': 'Nijmegen', 'nec nijmegen': 'Nijmegen',
    'go ahead eagles': 'Go Ahead Eagles', 'sparta rotterdam': 'Sparta Rotterdam', 'fc groningen': 'Groningen', 'pec zwolle': 'Zwolle', 'heracles almelo': 'Heracles',
    'nac breda': 'NAC Breda', 'fortuna sittard': 'For Sittard', 'sbv excelsior': 'Excelsior', 'excelsior': 'Excelsior', 'fc volendam': 'Volendam', 'sc telstar': 'Telstar', 'telstar': 'Telstar',
    'willem ii': 'Willem II', 'rkc waalwijk': 'Waalwijk', 'almere city fc': 'Almere City',
  },
};
