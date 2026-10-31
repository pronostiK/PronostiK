// Championnats suivis. Pour en ajouter un : une ligne ici (code football-data.org + codes CSV football-data.co.uk).
// Le plan gratuit de football-data.org couvre aussi PPL (Portugal), DED (Pays-Bas), ELC (Championship) ; il suffit de les ajouter,
// avec les codes CSV P1 (Portugal) ou N1 (Pays-Bas) et leur deuxième division quand elle existe.
export const LEAGUES = [
  {code: 'FL1', name: 'Ligue 1', csv: ['F1', 'F2']},
  {code: 'PL', name: 'Premier League', csv: ['E0', 'E1']},
  {code: 'BL1', name: 'Bundesliga', csv: ['D1', 'D2']},
  {code: 'SA', name: 'Serie A', csv: ['I1', 'I2']},
  {code: 'PD', name: 'La Liga', csv: ['SP1', 'SP2']},
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
    'ssc napoli': 'Napoli', 'as roma': 'Roma', 'ss lazio': 'Lazio',
  },
  PD: {
    'club atletico de madrid': 'Ath Madrid', 'atletico madrid': 'Ath Madrid', 'athletic club': 'Ath Bilbao',
    'rcd espanyol de barcelona': 'Espanol', 'rayo vallecano de madrid': 'Vallecano', 'real sociedad de futbol': 'Sociedad',
    'real betis balompie': 'Betis', 'rc celta de vigo': 'Celta', 'deportivo alaves': 'Alaves', 'ud las palmas': 'Las Palmas',
  },
  FL1: {},
};
