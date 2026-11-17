import { FullTripBundle, Activity } from '../types/models';

export const DEMO_TRIPS: Record<string, FullTripBundle> = {
  'demo-lisbon-4d': {
    trip: {
      id: 'demo-lisbon-4d',
      ownerId: 'demo-user',
      destination: 'Lisboa',
      country: 'Portugal',
      startDate: '2026-11-18',
      endDate: '2026-11-21',
      currency: 'EUR',
      totalBudget: 1050,
      travelersCount: 3,
      interests: ['food', 'history', 'viewpoints', 'architecture', 'music'],
      defaultPace: 3,
      status: 'planned',
      memberIds: ['demo-user', 'traveler-rui', 'traveler-sofia'],
      inviteCode: 'LISBOA26',
      assumptions: [
        '3 amigos adultos a viajar juntos',
        'Ritmo diário moderado a pé com miradouros panorâmicos',
        'Mistura de museus verificados e tascas autênticas de bairro',
        'Caminhada + elétrico histórico/metro para subidas superiores a 2 km',
      ],
      groupEnabled: true,
      isDemo: true,
    },
    travelers: [
      {
        id: 'ana',
        tripId: 'demo-lisbon-4d',
        ownerId: 'demo-user',
        userId: 'demo-user',
        displayName: 'Ana',
        interests: ['food', 'markets', 'viewpoints'],
        budgetPerPerson: 380,
        constraints: 'Pescatarian friendly options preferred',
        preferredPace: 3,
        color: '#D97706',
        avatar: 'A',
      },
      {
        id: 'rui',
        tripId: 'demo-lisbon-4d',
        ownerId: 'demo-user',
        userId: 'traveler-rui',
        displayName: 'Rui',
        interests: ['history', 'architecture', 'museums'],
        budgetPerPerson: 350,
        constraints: 'Avoids steep climbs before morning coffee',
        preferredPace: 2,
        color: '#0D9488',
        avatar: 'R',
      },
      {
        id: 'sofia',
        tripId: 'demo-lisbon-4d',
        ownerId: 'demo-user',
        userId: 'traveler-sofia',
        displayName: 'Sofia',
        interests: ['music', 'nightlife', 'culture', 'food'],
        budgetPerPerson: 320,
        constraints: 'None',
        preferredPace: 4,
        color: '#4F46E5',
        avatar: 'S',
      },
    ],
    days: [
      {
        id: 'lis-d1',
        tripId: 'demo-lisbon-4d',
        ownerId: 'demo-user',
        date: '2026-11-18',
        dayNumber: 1,
        theme: 'Alma de Alfama, Azulejos e Pôr do Sol no Tejo',
        paceLevel: 3,
        paceScore: 58,
        activePlan: 'A',
        planBDescription: 'Heavy Atlantic rain backup: National Tile Museum indoor cloisters, Indoor Tasting at Conserveira de Lisboa & Fado Museum.',
        activities: [
          {
            id: 'lis-a1',
            title: 'Castelo de São Jorge & Archaeological Site',
            category: 'culture',
            description: 'Moorish hilltop citadel with sweeping panoramas over terracotta rooftops and the Tagus estuary.',
            startTime: '09:30',
            durationMin: 120,
            openingHoursText: '09:00 – 18:00 (Winter hours)',
            isOutdoor: true,
            interestTags: ['history', 'viewpoints', 'architecture'],
            location: { name: 'Castelo de São Jorge, Alfama', lat: 38.7139, lng: -9.1334 },
            costOptions: {
              budget: { title: 'Exterior Miradouro & Santa Luzia Walk', estimatedCost: 0, description: 'Free panoramic terraces around the castle walls' },
              mid: { title: 'Standard Castle Entry Ticket', estimatedCost: 15, description: 'Official ticket including camera obscura & ramparts' },
              premium: { title: 'Historian-Led Private Citadel Tour', estimatedCost: 45, description: 'Skip-the-line entry with medieval historian guide' },
            },
            selectedTier: 'mid',
            priceConfidence: {
              status: 'verified',
              sourceUrl: 'https://castelodesaojorge.pt/en/prices/',
              verifiedAt: '2026-10-28',
              notes: 'Official EGEAC adult ticket €15.00',
            },
            hoursConfidence: {
              status: 'verified',
              sourceUrl: 'https://castelodesaojorge.pt/en/opening-hours/',
              verifiedAt: '2026-10-28',
              notes: 'Nov-Feb open daily 09:00–18:00',
            },
            whyThis: 'Suggested for Rui (history & architecture) and Ana (panoramic viewpoints).',
            touristTrapScore: 62,
            votes: { ana: 'up', rui: 'up', sofia: 'neutral' },
          },
          {
            id: 'lis-a2',
            title: 'Time Out Market (Mercado da Ribeira)',
            category: 'food',
            description: 'Famous food hall gathering chef-driven stalls under one historic market roof in Cais do Sodré.',
            startTime: '12:45',
            durationMin: 90,
            openingHoursText: '10:00 – 00:00',
            isOutdoor: false,
            interestTags: ['food', 'markets'],
            location: { name: 'Av. 24 de Julho 49, Lisboa', lat: 38.7071, lng: -9.1459 },
            costOptions: {
              budget: { title: 'Petisco & Craft Croquete Bite', estimatedCost: 14, description: 'Two traditional savory snacks + drink' },
              mid: { title: 'Chef Stall Main + Wine Glass', estimatedCost: 28, description: 'Octopus rice or bacalhau à brás from a signature stall' },
              premium: { title: 'Multi-Stall Curated Tasting & Reserve Wine', estimatedCost: 55, description: '4 courses across top chef counters + dessert' },
            },
            selectedTier: 'mid',
            priceConfidence: {
              status: 'estimated',
              notes: 'Average dish €16–€24 + drinks based on current menu boards',
            },
            hoursConfidence: {
              status: 'verified',
              sourceUrl: 'https://www.timeoutmarket.com/lisboa/',
              verifiedAt: '2026-10-25',
            },
            whyThis: 'Suggested for Ana and Sofia because both selected food markets.',
            touristTrapScore: 86,
            localAlternative: {
              id: 'lis-a2-local',
              title: 'Mercado de Campo de Ourique',
              category: 'food',
              description: 'Authentic neighbourhood market where Lisbon locals actually eat fresh seafood, bifanas, and petiscos without cruise crowds.',
              reason: 'Locals actually go here because prices are 30% fairer, seating is relaxed, and traditional stalls sit beside family grocers.',
              location: { name: 'Rua Coelho da Rocha, Campo de Ourique', lat: 38.7158, lng: -9.1666 },
              estimatedCost: 18,
              travelMinutesAway: 14,
              travelSource: 'maps_api',
              priceConfidence: { status: 'estimated', notes: '~€18 per person for petiscos + drink' },
              hoursConfidence: { status: 'verified', sourceUrl: 'https://mercadodecampodeourique.pt/', verifiedAt: '2026-10-20' },
            },
            travelFromPrevious: { mode: 'WALKING', minutes: 19, distanceKm: 1.4, source: 'maps_api' },
            votes: { ana: 'up', rui: 'down', sofia: 'down' },
          },
          {
            id: 'lis-a3',
            title: 'Museu Nacional do Azulejo (National Tile Museum)',
            category: 'culture',
            description: 'Set inside the 1509 Madre de Deus Convent, showcasing five centuries of Portuguese ceramic art and ailded baroque chapel.',
            startTime: '15:15',
            durationMin: 105,
            openingHoursText: '10:00 – 18:00 (Closed Mondays)',
            isOutdoor: false,
            interestTags: ['culture', 'architecture', 'history'],
            location: { name: 'R. da Madre de Deus 4, Lisboa', lat: 38.7249, lng: -9.1136 },
            costOptions: {
              budget: { title: 'Standard Museum Entry', estimatedCost: 8, description: 'Full access to convent cloisters & tile panorama' },
              mid: { title: 'Entry + Audio Guide & Convent Pastry', estimatedCost: 14, description: 'Includes multimedia guide & coffee in the cloister café' },
              premium: { title: 'Tile Painting Workshop + Curated Visit', estimatedCost: 48, description: 'Paint and fire your own traditional azulejo tile' },
            },
            selectedTier: 'mid',
            priceConfidence: {
              status: 'verified',
              sourceUrl: 'http://www.museudoazulejo.gov.pt/',
              verifiedAt: '2026-10-22',
              notes: 'Official ticket €8 + optional audio/café',
            },
            hoursConfidence: {
              status: 'verified',
              sourceUrl: 'http://www.museudoazulejo.gov.pt/',
              verifiedAt: '2026-10-22',
            },
            whyThis: 'Suggested for Rui and Sofia (architecture & cultural heritage).',
            touristTrapScore: 24,
            travelFromPrevious: { mode: 'TRANSIT', minutes: 18, distanceKm: 3.6, source: 'maps_api' },
            votes: { ana: 'up', rui: 'up', sofia: 'up' },
          },
          {
            id: 'lis-a4',
            title: 'Intimate Fado Vadio Evening in Mouraria',
            category: 'nightlife',
            description: 'Small neighbourhood tasca in the birthplace of Fado where local singers perform acoustic sets between petisco courses.',
            startTime: '20:00',
            durationMin: 135,
            openingHoursText: '19:30 – 23:30 (Confirm table reservation)',
            isOutdoor: false,
            interestTags: ['music', 'food', 'nightlife'],
            location: { name: 'Rua do Capelão, Mouraria', lat: 38.7159, lng: -9.1355 },
            costOptions: {
              budget: { title: 'Tasca Wine & Chouriço Assado', estimatedCost: 18, description: 'Minimum consumption at authentic local fado bar' },
              mid: { title: 'Traditional Petiscos Dinner & Live Fado', estimatedCost: 34, description: 'Shared plates, regional wine & 3 acoustic sets' },
              premium: { title: 'Historic Casa de Fado Tasting Menu', estimatedCost: 68, description: 'Reserved front table with full 3-course Portuguese menu' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'estimated', notes: '~€34/person with house wine' },
            hoursConfidence: { status: 'to_confirm', notes: 'Small tascas adjust set times weekly—confirm 48h prior' },
            whyThis: 'Suggested for Sofia (live music & nightlife) and Ana (regional cuisine).',
            touristTrapScore: 35,
            travelFromPrevious: { mode: 'TRANSIT', minutes: 16, distanceKm: 2.5, source: 'maps_api' },
            votes: { ana: 'up', rui: 'up', sofia: 'up' },
          },
        ],
        planB: [
          {
            id: 'lis-d1-pb1',
            title: 'Museu Nacional do Azulejo & Gilded Cloisters (Indoor)',
            category: 'culture',
            description: 'Sheltered 16th-century convent galleries housing Portugal’s iconic ceramic masterpieces.',
            startTime: '10:00',
            durationMin: 120,
            openingHoursText: '10:00 – 18:00',
            isOutdoor: false,
            interestTags: ['history', 'culture', 'architecture'],
            location: { name: 'R. da Madre de Deus 4, Lisboa', lat: 38.7249, lng: -9.1136 },
            costOptions: {
              budget: { title: 'Museum Ticket', estimatedCost: 8, description: 'Standard admission' },
              mid: { title: 'Ticket + Cloister Café Lunch', estimatedCost: 22, description: 'Entry plus sheltered warm lunch' },
              premium: { title: 'Private Indoor Azulejo Workshop', estimatedCost: 48, description: 'Guided visit + tile painting' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'verified', sourceUrl: 'http://www.museudoazulejo.gov.pt/', verifiedAt: '2026-10-22' },
            hoursConfidence: { status: 'verified', sourceUrl: 'http://www.museudoazulejo.gov.pt/', verifiedAt: '2026-10-22' },
            whyThis: 'Indoor rainy-day swap protecting Rui & Ana’s cultural morning.',
            touristTrapScore: 22,
            votes: { ana: 'up', rui: 'up', sofia: 'up' },
          },
          {
            id: 'lis-d1-pb2',
            title: 'Museu do Fado & Baixa Artisanal Conserveira Tasting',
            category: 'food',
            description: 'Explore the indoor Fado archive in Alfama followed by a vintage tinned-seafood tasting in Baixa.',
            startTime: '14:00',
            durationMin: 120,
            openingHoursText: '10:00 – 18:00',
            isOutdoor: false,
            interestTags: ['music', 'food', 'culture'],
            location: { name: 'Largo do Chafariz de Dentro 1, Lisboa', lat: 38.7113, lng: -9.1276 },
            costOptions: {
              budget: { title: 'Fado Museum Ticket', estimatedCost: 5, description: 'Official municipal admission' },
              mid: { title: 'Museum + Artisanal Conservas Pairing', estimatedCost: 24, description: 'Includes tasting of reserve mackerel & white port' },
              premium: { title: 'Private Guitar Luthier Visit & Tasting', estimatedCost: 52, description: 'Meet a Portuguese guitar craftsman indoors' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'verified', sourceUrl: 'https://www.museudofado.pt/', verifiedAt: '2026-10-20' },
            hoursConfidence: { status: 'verified', sourceUrl: 'https://www.museudofado.pt/', verifiedAt: '2026-10-20' },
            whyThis: 'Keeps Sofia’s music interest and Ana’s food tasting completely dry indoors.',
            touristTrapScore: 28,
            travelFromPrevious: { mode: 'TRANSIT', minutes: 14, distanceKm: 1.9, source: 'maps_api' },
            votes: { ana: 'up', rui: 'up', sofia: 'up' },
          },
        ],
      },
      {
        id: 'lis-d2',
        tripId: 'demo-lisbon-4d',
        ownerId: 'demo-user',
        date: '2026-11-19',
        dayNumber: 2,
        theme: 'Descobertas em Belém e Jardins do Príncipe Real',
        paceLevel: 3,
        paceScore: 60,
        activePlan: 'A',
        planBDescription: 'Indoor Coach Museum (Museu Nacional dos Coches) + Maat Covered Exhibition & Indoor Wine Bar.',
        activities: [
          {
            id: 'lis-b1',
            title: 'Mosteiro dos Jerónimos Cloisters',
            category: 'culture',
            description: 'UNESCO Manueline limestone masterpiece built to commemorate Vasco da Gama’s voyage.',
            startTime: '09:30',
            durationMin: 105,
            openingHoursText: '09:30 – 17:30 (Closed Mondays)',
            isOutdoor: false,
            interestTags: ['history', 'architecture'],
            location: { name: 'Praça do Império, Belém', lat: 38.6979, lng: -9.2067 },
            costOptions: {
              budget: { title: 'Church of Santa Maria Entry (Free)', estimatedCost: 0, description: 'Visit the vaulted nave and Vasco da Gama tomb for free' },
              mid: { title: 'Cloisters Official Timed Ticket', estimatedCost: 12, description: 'Full access to the two-story carved Manueline cloister' },
              premium: { title: 'Early-Access Architectural Tour', estimatedCost: 42, description: 'Small group guided visit before peak crowds' },
            },
            selectedTier: 'mid',
            priceConfidence: {
              status: 'verified',
              sourceUrl: 'https://www.mosteirojeronimos.gov.pt/',
              verifiedAt: '2026-10-26',
            },
            hoursConfidence: {
              status: 'verified',
              sourceUrl: 'https://www.mosteirojeronimos.gov.pt/',
              verifiedAt: '2026-10-26',
            },
            whyThis: 'Suggested for Rui’s passion for landmark architecture.',
            touristTrapScore: 76,
            localAlternative: {
              id: 'lis-b1-local',
              title: 'Palácio Nacional da Ajuda',
              category: 'culture',
              description: 'Neoclassical royal palace just uphill from Belém with opulent 19th-century throne rooms and zero ticket queues.',
              reason: 'Locals recommend Ajuda because you walk right in without a 90-minute Belém line and see authentic royal interiors.',
              location: { name: 'Largo da Ajuda, Lisboa', lat: 38.7077, lng: -9.1978 },
              estimatedCost: 8,
              travelMinutesAway: 11,
              travelSource: 'maps_api',
              priceConfidence: { status: 'verified', sourceUrl: 'http://www.palacioajuda.gov.pt/', verifiedAt: '2026-10-22' },
              hoursConfidence: { status: 'verified', sourceUrl: 'http://www.palacioajuda.gov.pt/', verifiedAt: '2026-10-22' },
            },
            votes: { ana: 'up', rui: 'up', sofia: 'neutral' },
          },
          {
            id: 'lis-b2',
            title: 'Warm Pastel de Nata Tasting & Roastery Coffee',
            category: 'food',
            description: 'Crisp puff pastry custard tarts dusted with cinnamon right out of the oven.',
            startTime: '11:45',
            durationMin: 45,
            openingHoursText: '08:00 – 21:00',
            isOutdoor: false,
            interestTags: ['food'],
            location: { name: 'Rua de Belém 84, Lisboa', lat: 38.6975, lng: -9.2032 },
            costOptions: {
              budget: { title: '2 Warm Tarts + Espresso at Counter', estimatedCost: 5, description: 'Classic standing counter service' },
              mid: { title: 'Box of 6 + Ginjinha & Bica Seated', estimatedCost: 12, description: 'Seated inside the tiled salon rooms' },
              premium: { title: 'Pastry Masterclass & Tasting Box', estimatedCost: 38, description: 'Learn laminated dough secrets with a pastry chef' },
            },
            selectedTier: 'budget',
            priceConfidence: {
              status: 'verified',
              sourceUrl: 'https://pasteisdebelem.pt/en/',
              verifiedAt: '2026-10-26',
              notes: '€1.40 per tart + espresso',
            },
            hoursConfidence: {
              status: 'verified',
              sourceUrl: 'https://pasteisdebelem.pt/en/',
              verifiedAt: '2026-10-26',
            },
            whyThis: 'Suggested for Ana, Rui, and Sofia — essential Lisbon culinary ritual.',
            touristTrapScore: 55,
            travelFromPrevious: { mode: 'WALKING', minutes: 6, distanceKm: 0.4, source: 'maps_api' },
            votes: { ana: 'up', rui: 'up', sofia: 'up' },
          },
          {
            id: 'lis-b3',
            title: 'Jardim do Príncipe Real & Independent Concept Stores',
            category: 'shopping',
            description: 'Stroll beneath the giant 150-year-old cedar umbrella tree, historic reservoir, and Moorish-revival Embaixada gallery.',
            startTime: '15:00',
            durationMin: 120,
            openingHoursText: '10:00 – 20:00',
            isOutdoor: true,
            interestTags: ['viewpoints', 'architecture', 'culture'],
            location: { name: 'Praça do Príncipe Real, Lisboa', lat: 38.7163, lng: -9.1488 },
            costOptions: {
              budget: { title: 'Garden Kiosk Coffee & Gallery Walk', estimatedCost: 4, description: 'Relax at the traditional open-air quiosque' },
              mid: { title: 'Underground Patriarcal Reservoir Ticket + Tapas', estimatedCost: 19, description: 'Visit the 1860s cistern + wine glass' },
              premium: { title: 'Curated Portuguese Design & Wine Flight', estimatedCost: 46, description: 'Sommelier tasting of small-batch natural wines' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'estimated', notes: 'Reservoir entry €5 + kiosk refreshments' },
            hoursConfidence: { status: 'estimated', notes: 'Shops open until 20:00; garden open 24h' },
            whyThis: 'Suggested for Sofia and Ana (relaxed afternoon culture & viewpoints).',
            touristTrapScore: 29,
            travelFromPrevious: { mode: 'TRANSIT', minutes: 22, distanceKm: 5.1, source: 'maps_api' },
            votes: { ana: 'up', rui: 'neutral', sofia: 'up' },
          },
        ],
        planB: [
          {
            id: 'lis-d2-pb1',
            title: 'Museu Nacional dos Coches (Royal Coach Museum)',
            category: 'culture',
            description: 'Vast modern indoor pavilion in Belém housing the world’s finest collection of 17th–19th century ceremonial carriages.',
            startTime: '10:00',
            durationMin: 110,
            openingHoursText: '10:00 – 18:00',
            isOutdoor: false,
            interestTags: ['history', 'architecture'],
            location: { name: 'Av. da Índia 136, Lisboa', lat: 38.6966, lng: -9.1986 },
            costOptions: {
              budget: { title: 'Standard Museum Entry', estimatedCost: 8, description: 'Main pavilion & Old Riding Arena' },
              mid: { title: 'Combined Ticket + Audio Guide', estimatedCost: 14, description: 'Full commentary + indoor café pastry' },
              premium: { title: 'Private Curator Tour', estimatedCost: 40, description: 'In-depth royal history walk' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'verified', sourceUrl: 'http://museudoscoches.gov.pt/', verifiedAt: '2026-10-21' },
            hoursConfidence: { status: 'verified', sourceUrl: 'http://museudoscoches.gov.pt/', verifiedAt: '2026-10-21' },
            whyThis: 'All-weather indoor Belém alternative for Rui & the group.',
            touristTrapScore: 25,
            votes: { ana: 'up', rui: 'up', sofia: 'up' },
          },
        ],
      },
      {
        id: 'lis-d3',
        tripId: 'demo-lisbon-4d',
        ownerId: 'demo-user',
        date: '2026-11-20',
        dayNumber: 3,
        theme: 'LX Factory, Museu Gulbenkian e Bairro Alto',
        paceLevel: 3,
        paceScore: 54,
        activePlan: 'A',
        activities: [
          {
            id: 'lis-c1',
            title: 'Museu Calouste Gulbenkian & Modernist Gardens',
            category: 'culture',
            description: 'World-class private art collection spanning Egyptian, Greco-Roman, Islamic, and René Lalique masterpieces.',
            startTime: '10:00',
            durationMin: 135,
            openingHoursText: '10:00 – 18:00 (Closed Tuesdays)',
            isOutdoor: false,
            interestTags: ['culture', 'architecture', 'history'],
            location: { name: 'Av. de Berna 45A, Lisboa', lat: 38.7376, lng: -9.1545 },
            costOptions: {
              budget: { title: 'Permanent Collection Ticket', estimatedCost: 10, description: 'Full museum access' },
              mid: { title: 'Complete Gulbenkian + Temporary Exhibitions', estimatedCost: 14, description: 'Includes CAM modern art & gardens' },
              premium: { title: 'Guided Art & Brutalist Architecture Walk', estimatedCost: 38, description: 'Expert architectural commentary' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'verified', sourceUrl: 'https://gulbenkian.pt/en/', verifiedAt: '2026-10-28' },
            hoursConfidence: { status: 'verified', sourceUrl: 'https://gulbenkian.pt/en/', verifiedAt: '2026-10-28' },
            whyThis: 'Suggested for Rui’s museum day — balanced by Ana’s seafood feast tonight.',
            touristTrapScore: 18,
            votes: { ana: 'neutral', rui: 'up', sofia: 'up' },
          },
          {
            id: 'lis-c2',
            title: 'Ramiro Traditional Cervejaria & Seafood Feast',
            category: 'food',
            description: 'Iconic Lisbon marisqueira serving garlic prawns, clams à Bulhão Pato, and prego steak sandwich.',
            startTime: '19:30',
            durationMin: 120,
            openingHoursText: '12:00 – 00:30',
            isOutdoor: false,
            interestTags: ['food'],
            location: { name: 'Av. Almirante Reis 1, Lisboa', lat: 38.7209, lng: -9.1355 },
            costOptions: {
              budget: { title: 'Clams, Garlic Prawns & Draft Beer', estimatedCost: 26, description: 'Light shared shellfish platter' },
              mid: { title: 'Full Marisqueira Feast + Vinho Verde', estimatedCost: 44, description: 'Sapateira crab, tiger prawns, clams & prego dessert' },
              premium: { title: 'Scarlet Carabineiros & Reserve Alvarinho', estimatedCost: 78, description: 'Wild deep-sea red prawns & premium shellfish' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'estimated', notes: 'Market weight pricing; ~€40–€48/person for mid feast' },
            hoursConfidence: { status: 'verified', sourceUrl: 'https://www.cervejariaramiro.com/', verifiedAt: '2026-10-24' },
            whyThis: 'Suggested for Ana’s pescatarian food focus and Sofia’s evening vibe.',
            touristTrapScore: 58,
            travelFromPrevious: { mode: 'TRANSIT', minutes: 14, distanceKm: 2.3, source: 'maps_api' },
            votes: { ana: 'up', rui: 'up', sofia: 'up' },
          },
        ],
        planB: [],
      },
      {
        id: 'lis-d4',
        tripId: 'demo-lisbon-4d',
        ownerId: 'demo-user',
        date: '2026-11-21',
        dayNumber: 4,
        theme: 'Travessia de Cacilhas e Despedida nos Miradouros',
        paceLevel: 2,
        paceScore: 40,
        activePlan: 'A',
        activities: [
          {
            id: 'lis-d1-act',
            title: 'Tagus River Ferry to Cacilhas & Ponto Final Pier',
            category: 'nature',
            description: 'Cross the river on the commuter ferry and walk the old riverside quay looking back at Lisbon’s Seven Hills and 25 de Abril Bridge.',
            startTime: '11:00',
            durationMin: 150,
            openingHoursText: 'Ferries every 15 mins; Lunch 12:30 – 16:00',
            isOutdoor: true,
            interestTags: ['viewpoints', 'food'],
            location: { name: 'Cais do Ginjal, Almada', lat: 38.6869, lng: -9.1526 },
            costOptions: {
              budget: { title: 'Return Ferry + Quay Walk', estimatedCost: 3, description: 'Navegante ferry ticket (€1.50 each way)' },
              mid: { title: 'Ferry + Grilled Fish Lunch by the Water', estimatedCost: 28, description: 'Fresh sea bass or monkfish rice on the pier' },
              premium: { title: 'Private Sunset Sailboat Return to Belém', estimatedCost: 65, description: '2-hour Tagus sailing charter with local wine' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'estimated', notes: 'Ferry €3 verified; lunch ~€25' },
            hoursConfidence: { status: 'to_confirm', notes: 'Outdoor pier tables depend on wind/tide conditions' },
            whyThis: 'Suggested for Ana & Rui — relaxed final day with waterfront views.',
            touristTrapScore: 42,
            votes: { ana: 'up', rui: 'up', sofia: 'up' },
          },
        ],
        planB: [],
      },
    ],
    expenses: [
      {
        id: 'exp-lis-1',
        tripId: 'demo-lisbon-4d',
        ownerId: 'demo-user',
        authorId: 'demo-user',
        activityId: 'lis-a1',
        category: 'activities',
        description: 'Castelo de São Jorge 3x Entry Tickets',
        amount: 45,
        currency: 'EUR',
        paidBy: 'ana',
        splitMode: 'equal',
        splits: { ana: 15, rui: 15, sofia: 15 },
        date: '2026-11-18',
        settled: false,
      },
      {
        id: 'exp-lis-2',
        tripId: 'demo-lisbon-4d',
        ownerId: 'demo-user',
        authorId: 'traveler-rui',
        activityId: 'lis-a4',
        category: 'food',
        description: 'Mouraria Fado Tasca Dinner & Wine',
        amount: 102,
        currency: 'EUR',
        paidBy: 'rui',
        splitMode: 'equal',
        splits: { ana: 34, rui: 34, sofia: 34 },
        date: '2026-11-18',
        settled: false,
      },
      {
        id: 'exp-lis-3',
        tripId: 'demo-lisbon-4d',
        ownerId: 'demo-user',
        authorId: 'traveler-sofia',
        activityId: '',
        category: 'transport',
        description: 'Navegante 24h Transit Passes + Airport Bolt',
        amount: 39,
        currency: 'EUR',
        paidBy: 'sofia',
        splitMode: 'equal',
        splits: { ana: 13, rui: 13, sofia: 13 },
        date: '2026-11-19',
        settled: false,
      },
    ],
  },

  'demo-porto-3d': {
    trip: {
      id: 'demo-porto-3d',
      ownerId: 'demo-user',
      destination: 'Porto',
      country: 'Portugal',
      startDate: '2026-12-04',
      endDate: '2026-12-06',
      currency: 'EUR',
      totalBudget: 680,
      travelersCount: 2,
      interests: ['wine', 'architecture', 'food', 'culture'],
      defaultPace: 3,
      status: 'planned',
      memberIds: ['demo-user', 'traveler-miguel'],
      inviteCode: 'PORTO26',
      assumptions: [
        'Couple on a 3-day northern Portugal escape',
        'Focus on Port wine cellars in Vila Nova de Gaia, Azulejo churches & Art Deco architecture',
        'Mostly walkable historic centre + Metro over Dom Luís I Bridge',
      ],
      groupEnabled: true,
      isDemo: true,
    },
    travelers: [
      {
        id: 'clara',
        tripId: 'demo-porto-3d',
        ownerId: 'demo-user',
        userId: 'demo-user',
        displayName: 'Clara',
        interests: ['architecture', 'culture', 'books'],
        budgetPerPerson: 340,
        constraints: 'None',
        preferredPace: 3,
        color: '#D97706',
        avatar: 'C',
      },
      {
        id: 'miguel',
        tripId: 'demo-porto-3d',
        ownerId: 'demo-user',
        userId: 'traveler-miguel',
        displayName: 'Miguel',
        interests: ['wine', 'food', 'viewpoints'],
        budgetPerPerson: 340,
        constraints: 'None',
        preferredPace: 3,
        color: '#0D9488',
        avatar: 'M',
      },
    ],
    days: [
      {
        id: 'opo-d1',
        tripId: 'demo-porto-3d',
        ownerId: 'demo-user',
        date: '2026-12-04',
        dayNumber: 1,
        theme: 'Azulejos de São Bento, Clérigos e Caves de Gaia',
        paceLevel: 3,
        paceScore: 56,
        activePlan: 'A',
        planBDescription: 'Palácio da Bolsa Arab Room indoor guided tour + Graham’s 1890 Lodge cellar tasting.',
        activities: [
          {
            id: 'opo-a1',
            title: 'São Bento Railway Station Azulejo Vestibule',
            category: 'culture',
            description: '20,000 tin-glazed blue and white tiles by Jorge Colaço depicting royal battles and rural Douro life.',
            startTime: '09:30',
            durationMin: 45,
            openingHoursText: 'Open daily 06:00 – 01:00',
            isOutdoor: false,
            interestTags: ['architecture', 'culture'],
            location: { name: 'Praça de Almeida Garrett, Porto', lat: 41.1456, lng: -8.6105 },
            costOptions: {
              budget: { title: 'Free Self-Guided Hall Visit', estimatedCost: 0, description: 'Public railway concourse is completely free' },
              mid: { title: 'Audio Architecture Walk + Espresso', estimatedCost: 9, description: 'Includes historical tile guide & nearby pastry' },
              premium: { title: 'Private Belle Époque Porto Walking Tour', estimatedCost: 35, description: '2-hour architectural walk with local historian' },
            },
            selectedTier: 'budget',
            priceConfidence: { status: 'verified', sourceUrl: 'https://www.infraestruturasdeportugal.pt/', verifiedAt: '2026-10-25' },
            hoursConfidence: { status: 'verified', sourceUrl: 'https://www.infraestruturasdeportugal.pt/', verifiedAt: '2026-10-25' },
            whyThis: 'Suggested for Clara (historic tilework & architecture).',
            touristTrapScore: 30,
            votes: { clara: 'up', miguel: 'up' },
          },
          {
            id: 'opo-a2',
            title: 'Livraria Lello Neo-Gothic Bookshop',
            category: 'culture',
            description: '1906 crimson-staircase bookshop in the heart of Cedofeita.',
            startTime: '11:00',
            durationMin: 60,
            openingHoursText: '09:00 – 19:30',
            isOutdoor: false,
            interestTags: ['books', 'architecture'],
            location: { name: 'R. das Carmelitas 144, Porto', lat: 41.1468, lng: -8.6149 },
            costOptions: {
              budget: { title: 'Timed Ticket Voucher (Deductible on Book)', estimatedCost: 8, description: '€8 voucher redeemed when purchasing a pocket classic' },
              mid: { title: 'Ticket + Lello Special Edition Hardcover', estimatedCost: 19, description: 'Entry plus curated Portuguese literature edition' },
              premium: { title: 'Priority Gold Entry (No Queue)', estimatedCost: 16, description: 'Reserved fast-track slot + book credit' },
            },
            selectedTier: 'budget',
            priceConfidence: { status: 'verified', sourceUrl: 'https://www.livrarialello.pt/', verifiedAt: '2026-10-27' },
            hoursConfidence: { status: 'verified', sourceUrl: 'https://www.livrarialello.pt/', verifiedAt: '2026-10-27' },
            whyThis: 'Suggested for Clara (books & Neo-Gothic interiors).',
            touristTrapScore: 91,
            localAlternative: {
              id: 'opo-a2-local',
              title: 'Livraria Chaminé da Mota & Biblioteca Pública Municipal',
              category: 'culture',
              description: 'Porto’s beloved antiquarian bookshop on Rua das Flores paired with the tiled cloisters of the 1833 Municipal Library.',
              reason: 'Locals actually go here because you can browse rare Portuguese editions in peace with zero selfie queues or entry tickets.',
              location: { name: 'Rua das Flores 18, Porto', lat: 41.1438, lng: -8.6134 },
              estimatedCost: 0,
              travelMinutesAway: 6,
              travelSource: 'maps_api',
              priceConfidence: { status: 'verified', sourceUrl: 'https://bmp.cm-porto.pt/', verifiedAt: '2026-10-20' },
              hoursConfidence: { status: 'verified', sourceUrl: 'https://bmp.cm-porto.pt/', verifiedAt: '2026-10-20' },
            },
            travelFromPrevious: { mode: 'WALKING', minutes: 8, distanceKm: 0.5, source: 'maps_api' },
            votes: { clara: 'up', miguel: 'down' },
          },
          {
            id: 'opo-a3',
            title: 'Graham’s 1890 Port Lodge Cellar Tour & Tasting',
            category: 'food',
            description: 'Historic granite cellar in Vila Nova de Gaia overlooking the Douro River and Porto skyline.',
            startTime: '16:00',
            durationMin: 105,
            openingHoursText: '09:30 – 18:00 (Advance booking required)',
            isOutdoor: false,
            interestTags: ['wine', 'food', 'viewpoints'],
            location: { name: 'Rua do Agro 141, Vila Nova de Gaia', lat: 41.1369, lng: -8.6236 },
            costOptions: {
              budget: { title: 'Classic 3-Port Cellar Tasting', estimatedCost: 25, description: 'Guided lodge walk + Ruby, Tawny & Late Bottled Vintage' },
              mid: { title: 'Super Quinas & 10/20 Year Tawny Pairing', estimatedCost: 40, description: 'Aged Tawny flight paired with artisanal cheese & chocolate' },
              premium: { title: 'Private Vintage Room Tasting', estimatedCost: 85, description: 'Single-Quinta Vintage Ports in the private library' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'verified', sourceUrl: 'https://www.grahams-port.com/', verifiedAt: '2026-10-26' },
            hoursConfidence: { status: 'verified', sourceUrl: 'https://www.grahams-port.com/', verifiedAt: '2026-10-26' },
            whyThis: 'Suggested for Miguel (Port wine & river viewpoints).',
            touristTrapScore: 34,
            travelFromPrevious: { mode: 'WALKING', minutes: 24, distanceKm: 1.8, source: 'maps_api' },
            votes: { clara: 'up', miguel: 'up' },
          },
        ],
        planB: [],
      },
      {
        id: 'opo-d2',
        tripId: 'demo-porto-3d',
        ownerId: 'demo-user',
        date: '2026-12-05',
        dayNumber: 2,
        theme: 'Arte Contemporânea em Serralves e Peixe Grelhado em Matosinhos',
        paceLevel: 3,
        paceScore: 52,
        activePlan: 'A',
        activities: [
          {
            id: 'opo-b1',
            title: 'Fundação de Serralves Museum & Pink Art Deco Villa',
            category: 'culture',
            description: 'Álvaro Siza Vieira’s minimalist museum, 1930s pink Art Deco Casa de Serralves, and treetop walkway.',
            startTime: '10:00',
            durationMin: 150,
            openingHoursText: '10:00 – 18:00',
            isOutdoor: true,
            interestTags: ['architecture', 'culture'],
            location: { name: 'R. Dom João de Castro 210, Porto', lat: 41.1597, lng: -8.6596 },
            costOptions: {
              budget: { title: 'Park & Treetop Walk Only', estimatedCost: 12, description: '18-hectare gardens & Art Deco villa exterior' },
              mid: { title: 'Complete Museum + Villa + Park Ticket', estimatedCost: 20, description: 'All exhibitions, Siza wing & gardens' },
              premium: { title: 'Architectural Private Guide + Tea House Lunch', estimatedCost: 52, description: 'Guided Siza Vieira tour + garden lunch' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'verified', sourceUrl: 'https://www.serralves.pt/', verifiedAt: '2026-10-24' },
            hoursConfidence: { status: 'verified', sourceUrl: 'https://www.serralves.pt/', verifiedAt: '2026-10-24' },
            whyThis: 'Suggested for Clara’s love of modernist and Art Deco architecture.',
            touristTrapScore: 19,
            votes: { clara: 'up', miguel: 'up' },
          },
          {
            id: 'opo-b2',
            title: 'Matosinhos Charcoal-Grilled Fish on Rua Heróis de França',
            category: 'food',
            description: 'Fishermen’s quarter where freshly landed turbot, sardines, and sea bream are grilled over open street coals.',
            startTime: '13:30',
            durationMin: 105,
            openingHoursText: '12:00 – 16:00',
            isOutdoor: false,
            interestTags: ['food', 'wine'],
            location: { name: 'Rua Heróis de França, Matosinhos', lat: 41.1818, lng: -8.6915 },
            costOptions: {
              budget: { title: 'Grilled Sardines, Cornbread & Soup', estimatedCost: 16, description: 'Classic fishermen’s lunch menu' },
              mid: { title: 'Charcoal Sea Bass for Two + Douro White', estimatedCost: 34, description: 'Whole wild robalo grilled table-side' },
              premium: { title: 'Wild Turbot (Pregado) & Aged Reserva', estimatedCost: 62, description: 'Prime Atlantic turbot + shellfish starter' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'estimated', notes: '~€34 per person depending on fish weight' },
            hoursConfidence: { status: 'estimated', notes: 'Lunch service 12:00–15:30 daily' },
            whyThis: 'Suggested for Miguel & Clara — authentic northern coastal dining.',
            touristTrapScore: 22,
            travelFromPrevious: { mode: 'TRANSIT', minutes: 16, distanceKm: 3.8, source: 'maps_api' },
            votes: { clara: 'up', miguel: 'up' },
          },
        ],
        planB: [],
      },
      {
        id: 'opo-d3',
        tripId: 'demo-porto-3d',
        ownerId: 'demo-user',
        date: '2026-12-06',
        dayNumber: 3,
        theme: 'Mercado do Bolhão e Hora Dourada no Jardim do Morro',
        paceLevel: 2,
        paceScore: 44,
        activePlan: 'A',
        activities: [
          {
            id: 'opo-c1',
            title: 'Restored Mercado do Bolhão Morning Tasting',
            category: 'food',
            description: 'Neoclassical two-tier fresh market reopened after meticulous restoration, filled with cheese, cured meats, and wine counters.',
            startTime: '10:30',
            durationMin: 90,
            openingHoursText: '08:00 – 20:00 (Closed Sundays)',
            isOutdoor: false,
            interestTags: ['food', 'architecture'],
            location: { name: 'R. Formosa 322, Porto', lat: 41.1494, lng: -8.6067 },
            costOptions: {
              budget: { title: 'Market Walk + Queijo da Serra Bite', estimatedCost: 8, description: 'Sample cured sheep cheese & lupini beans' },
              mid: { title: '3-Counter Tasting + Espumante Glass', estimatedCost: 22, description: 'Seafood cup, presunto & sparkling Bairrada wine' },
              premium: { title: 'Chef-Guided Market Tour & Upstairs Lunch', estimatedCost: 54, description: 'Full market tour + gallery restaurant lunch' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'verified', sourceUrl: 'https://mercadobolhao.pt/', verifiedAt: '2026-10-25' },
            hoursConfidence: { status: 'verified', sourceUrl: 'https://mercadobolhao.pt/', verifiedAt: '2026-10-25' },
            whyThis: 'Suggested for Miguel (food & wine) and Clara (neoclassical iron architecture).',
            touristTrapScore: 46,
            votes: { clara: 'up', miguel: 'up' },
          },
        ],
        planB: [],
      },
    ],
    expenses: [
      {
        id: 'exp-opo-1',
        tripId: 'demo-porto-3d',
        ownerId: 'demo-user',
        authorId: 'demo-user',
        activityId: 'opo-a3',
        category: 'activities',
        description: 'Graham’s Port Cellar Tasting (2x)',
        amount: 80,
        currency: 'EUR',
        paidBy: 'miguel',
        splitMode: 'equal',
        splits: { clara: 40, miguel: 40 },
        date: '2026-12-04',
        settled: false,
      },
    ],
  },

  'demo-rome-5d': {
    trip: {
      id: 'demo-rome-5d',
      ownerId: 'demo-user',
      destination: 'Roma',
      country: 'Itália',
      startDate: '2026-11-24',
      endDate: '2026-11-28',
      currency: 'EUR',
      totalBudget: 1450,
      travelersCount: 2,
      interests: ['history', 'food', 'art', 'architecture'],
      defaultPace: 3,
      status: 'planned',
      memberIds: ['demo-user', 'traveler-lucas'],
      inviteCode: 'ROMA2026',
      assumptions: [
        '2 viajantes durante 5 dias em Roma',
        'Entradas com horário marcado pré-reservadas nos principais locais arqueológicos',
        'Trattorias de bairro em Testaccio e Trastevere em vez de menus turísticos',
      ],
      groupEnabled: true,
      isDemo: true,
    },
    travelers: [
      {
        id: 'elena',
        tripId: 'demo-rome-5d',
        ownerId: 'demo-user',
        userId: 'demo-user',
        displayName: 'Elena',
        interests: ['art', 'history', 'food'],
        budgetPerPerson: 725,
        constraints: 'None',
        preferredPace: 3,
        color: '#D97706',
        avatar: 'E',
      },
      {
        id: 'lucas',
        tripId: 'demo-rome-5d',
        ownerId: 'demo-user',
        userId: 'traveler-lucas',
        displayName: 'Lucas',
        interests: ['architecture', 'food', 'history'],
        budgetPerPerson: 725,
        constraints: 'None',
        preferredPace: 3,
        color: '#0D9488',
        avatar: 'L',
      },
    ],
    days: [
      {
        id: 'rom-d1',
        tripId: 'demo-rome-5d',
        ownerId: 'demo-user',
        date: '2026-11-24',
        dayNumber: 1,
        theme: 'Coliseu, Fórum Romano e Ruas de Monti',
        paceLevel: 3,
        paceScore: 62,
        activePlan: 'A',
        planBDescription: 'Capitoline Museums (Musei Capitolini) indoor underground tabularium & Basilica di San Clemente.',
        activities: [
          {
            id: 'rom-a1',
            title: 'Colosseum, Roman Forum & Palatine Hill',
            category: 'culture',
            description: 'Flavian Amphitheatre and the civic heart of Ancient Rome.',
            startTime: '09:00',
            durationMin: 180,
            openingHoursText: '08:30 – 16:30 (Winter schedule)',
            isOutdoor: true,
            interestTags: ['history', 'architecture'],
            location: { name: 'Piazza del Colosseo 1, Roma', lat: 41.8902, lng: 12.4922 },
            costOptions: {
              budget: { title: 'Official 24h Colosseum + Forum Ticket', estimatedCost: 18, description: 'Official Parco Archeologico entry' },
              mid: { title: 'Full Experience Arena Floor + Underground', estimatedCost: 24, description: 'Includes arena floor & SUPER sites' },
              premium: { title: 'Archaeologist Small-Group Tour', estimatedCost: 69, description: '3-hour expert walk through Forum & Palatine' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'verified', sourceUrl: 'https://colosseo.it/en/tickets/', verifiedAt: '2026-10-28' },
            hoursConfidence: { status: 'verified', sourceUrl: 'https://colosseo.it/en/opening-times/', verifiedAt: '2026-10-28' },
            whyThis: 'Suggested for Elena & Lucas (ancient history & Roman engineering).',
            touristTrapScore: 78,
            localAlternative: {
              id: 'rom-a1-local',
              title: 'Baths of Caracalla (Terme di Caracalla)',
              category: 'culture',
              description: 'Monumental 3rd-century imperial bath complex with towering brick vaults, mosaics, and peaceful pine gardens.',
              reason: 'Locals love Caracalla because its scale rivals the Colosseum with 1/10th of the crowds and instant ticket entry.',
              location: { name: 'Viale delle Terme di Caracalla, Roma', lat: 41.879, lng: 12.4924 },
              estimatedCost: 10,
              travelMinutesAway: 14,
              travelSource: 'maps_api',
              priceConfidence: { status: 'verified', sourceUrl: 'https://www.coopculture.it/', verifiedAt: '2026-10-21' },
              hoursConfidence: { status: 'verified', sourceUrl: 'https://www.coopculture.it/', verifiedAt: '2026-10-21' },
            },
            votes: { elena: 'up', lucas: 'up' },
          },
          {
            id: 'rom-a2',
            title: 'Mercato di Testaccio & Roman Supplì Lunch',
            category: 'food',
            description: 'Bright neighbourhood food market famous for crispy supplì al telefono, artichokes, and slow-simmered sandwiches.',
            startTime: '13:15',
            durationMin: 90,
            openingHoursText: '07:00 – 15:30 (Closed Sundays)',
            isOutdoor: false,
            interestTags: ['food'],
            location: { name: 'Via Beniamino Franklin, Roma', lat: 41.8768, lng: 12.4752 },
            costOptions: {
              budget: { title: 'Supplì + Mordi e Vai Sandwich', estimatedCost: 11, description: 'Iconic Roman street lunch' },
              mid: { title: 'Market Tasting across 3 Stalls + Frascati Wine', estimatedCost: 24, description: 'Fresh pasta box, supplì, and local white wine' },
              premium: { title: 'Testaccio Food & Amphora Hill Guided Tasting', estimatedCost: 58, description: 'Curated gourmet walk around Monte Testaccio' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'estimated', notes: '~€10–€24 based on market stalls' },
            hoursConfidence: { status: 'verified', sourceUrl: 'http://www.mercatoditestaccio.it/', verifiedAt: '2026-10-20' },
            whyThis: 'Suggested for Elena & Lucas — zero-tourist authentic Roman market lunch.',
            touristTrapScore: 16,
            travelFromPrevious: { mode: 'TRANSIT', minutes: 14, distanceKm: 2.1, source: 'maps_api' },
            votes: { elena: 'up', lucas: 'up' },
          },
        ],
        planB: [
          {
            id: 'rom-d1-pb1',
            title: 'Musei Capitolini & Underground Tabularium Gallery',
            category: 'culture',
            description: 'The world’s oldest public museum designed by Michelangelo, with an indoor underground tunnel overlooking the Roman Forum dry and warm.',
            startTime: '09:30',
            durationMin: 150,
            openingHoursText: '09:30 – 19:30',
            isOutdoor: false,
            interestTags: ['history', 'art', 'architecture'],
            location: { name: 'Piazza del Campidoglio 1, Roma', lat: 41.8931, lng: 12.4829 },
            costOptions: {
              budget: { title: 'Standard Museum Entry', estimatedCost: 15, description: 'Full Palazzo dei Conservatori & Palazzo Nuovo' },
              mid: { title: 'Entry + Video Guide & Rooftop Terrazza Caffarelli Coffee', estimatedCost: 24, description: 'Includes multimedia guide' },
              premium: { title: 'Private Classical Sculpture Tour', estimatedCost: 60, description: '2.5h art historian tour' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'verified', sourceUrl: 'https://www.museicapitolini.org/', verifiedAt: '2026-10-22' },
            hoursConfidence: { status: 'verified', sourceUrl: 'https://www.museicapitolini.org/', verifiedAt: '2026-10-22' },
            whyThis: 'Gives you the exact view of the Roman Forum from inside the dry ancient Tabularium.',
            touristTrapScore: 28,
            votes: { elena: 'up', lucas: 'up' },
          },
        ],
      },
      {
        id: 'rom-d2',
        tripId: 'demo-rome-5d',
        ownerId: 'demo-user',
        date: '2026-11-25',
        dayNumber: 2,
        theme: 'Esculturas de Bernini na Galeria Borghese e Noite em Trastevere',
        paceLevel: 3,
        paceScore: 55,
        activePlan: 'A',
        activities: [
          {
            id: 'rom-b1',
            title: 'Galleria Borghese (Bernini & Caravaggio)',
            category: 'culture',
            description: 'Strictly capped 2-hour slots inside Cardinal Scipione Borghese’s villa housing Apollo and Daphne.',
            startTime: '10:00',
            durationMin: 120,
            openingHoursText: '09:00 – 19:00 (Closed Mondays)',
            isOutdoor: false,
            interestTags: ['art', 'architecture'],
            location: { name: 'Piazzale Scipione Borghese 5, Roma', lat: 41.9142, lng: 12.4921 },
            costOptions: {
              budget: { title: 'Villa Borghese Gardens & Pincio Terrace (Free)', estimatedCost: 0, description: 'Park stroll & views over Piazza del Popolo' },
              mid: { title: 'Official Timed Gallery Reservation', estimatedCost: 15, description: '€13 ticket + €2 mandatory booking fee' },
              premium: { title: 'Small-Group Baroque Art Historian Visit', estimatedCost: 59, description: 'Pre-reserved ticket + expert guide' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'verified', sourceUrl: 'https://galleriaborghese.beniculturali.it/', verifiedAt: '2026-10-25' },
            hoursConfidence: { status: 'verified', sourceUrl: 'https://galleriaborghese.beniculturali.it/', verifiedAt: '2026-10-25' },
            whyThis: 'Suggested for Elena’s focus on Renaissance & Baroque art.',
            touristTrapScore: 32,
            votes: { elena: 'up', lucas: 'up' },
          },
        ],
        planB: [],
      },
      {
        id: 'rom-d3',
        tripId: 'demo-rome-5d',
        ownerId: 'demo-user',
        date: '2026-11-26',
        dayNumber: 3,
        theme: 'Panteão, San Luigi dei Francesi e Bairro Judeu',
        paceLevel: 3,
        paceScore: 50,
        activePlan: 'A',
        activities: [
          {
            id: 'rom-c1',
            title: 'Pantheon & Caravaggio’s Contarelli Chapel',
            category: 'culture',
            description: 'Hadrian’s unreinforced concrete dome paired with three free Caravaggio masterpieces two blocks away.',
            startTime: '09:30',
            durationMin: 105,
            openingHoursText: '09:00 – 19:00',
            isOutdoor: false,
            interestTags: ['architecture', 'art', 'history'],
            location: { name: 'Piazza della Rotonda, Roma', lat: 41.8986, lng: 12.4769 },
            costOptions: {
              budget: { title: 'Official Ministry Pantheon Ticket', estimatedCost: 5, description: 'Direct Musei Italiani entry + free church visit' },
              mid: { title: 'Ticket + Audio Guide & Sant’Eustachio Espresso', estimatedCost: 14, description: 'Includes wood-roasted gran caffè nearby' },
              premium: { title: 'Private Roman Engineering & Caravaggio Walk', estimatedCost: 48, description: '2-hour private specialist tour' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'verified', sourceUrl: 'https://portale.museiitaliani.it/', verifiedAt: '2026-10-27' },
            hoursConfidence: { status: 'verified', sourceUrl: 'https://portale.museiitaliani.it/', verifiedAt: '2026-10-27' },
            whyThis: 'Suggested for Lucas (classical engineering) and Elena (Caravaggio).',
            touristTrapScore: 64,
            votes: { elena: 'up', lucas: 'up' },
          },
        ],
        planB: [],
      },
      {
        id: 'rom-d4',
        tripId: 'demo-rome-5d',
        ownerId: 'demo-user',
        date: '2026-11-27',
        dayNumber: 4,
        theme: 'Museus do Vaticano e Bares de Vinho em Prati',
        paceLevel: 3,
        paceScore: 58,
        activePlan: 'A',
        activities: [
          {
            id: 'rom-d4-a1',
            title: 'Vatican Museums, Raphael Rooms & Sistine Chapel',
            category: 'culture',
            description: 'Papal collections culminating in Michelangelo’s frescoed ceiling.',
            startTime: '08:30',
            durationMin: 180,
            openingHoursText: '08:00 – 19:00 (Closed Sundays)',
            isOutdoor: false,
            interestTags: ['art', 'history'],
            location: { name: 'Viale Vaticano, Città del Vaticano', lat: 41.9065, lng: 12.4536 },
            costOptions: {
              budget: { title: 'St. Peter’s Basilica Nave (Free)', estimatedCost: 0, description: 'Visit Bernini’s Baldacchino & Pietà for free' },
              mid: { title: 'Official Vatican Museums Online Ticket', estimatedCost: 25, description: '€20 base + €5 official online skip-the-line' },
              premium: { title: 'Early-Morning Key Master / First Entry Tour', estimatedCost: 75, description: 'Guided entry before general crowds' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'verified', sourceUrl: 'https://tickets.museivaticani.va/', verifiedAt: '2026-10-26' },
            hoursConfidence: { status: 'verified', sourceUrl: 'https://www.museivaticani.va/', verifiedAt: '2026-10-26' },
            whyThis: 'Suggested for Elena & Lucas (Renaissance masterpieces).',
            touristTrapScore: 74,
            localAlternative: {
              id: 'rom-d4-local',
              title: 'Villa Farnesina in Trastevere (Raphael’s Frescoes)',
              category: 'culture',
              description: 'Intimate 1506 Renaissance villa painted directly by Raphael with tranquil gardens and zero Vatican crowds.',
              reason: 'Locals recommend Villa Farnesina because you can admire Raphael’s Triumph of Galatea in complete quiet.',
              location: { name: 'Via della Lungara 230, Roma', lat: 41.8936, lng: 12.4674 },
              estimatedCost: 12,
              travelMinutesAway: 12,
              travelSource: 'maps_api',
              priceConfidence: { status: 'verified', sourceUrl: 'https://www.villafarnesina.it/', verifiedAt: '2026-10-22' },
              hoursConfidence: { status: 'verified', sourceUrl: 'https://www.villafarnesina.it/', verifiedAt: '2026-10-22' },
            },
            votes: { elena: 'up', lucas: 'up' },
          },
        ],
        planB: [],
      },
      {
        id: 'rom-d5',
        tripId: 'demo-rome-5d',
        ownerId: 'demo-user',
        date: '2026-11-28',
        dayNumber: 5,
        theme: 'Pinheiros da Via Ápia Antiga e Parque dos Aquedutos',
        paceLevel: 2,
        paceScore: 42,
        activePlan: 'A',
        activities: [
          {
            id: 'rom-d5-a1',
            title: 'Parco degli Acquedotti & Appian Way Walk',
            category: 'nature',
            description: 'Walk along ancient basalt Roman stones framed by umbrella pines and towering Aqua Claudia arches.',
            startTime: '10:00',
            durationMin: 150,
            openingHoursText: 'Daylight hours (07:00 – Dusk)',
            isOutdoor: true,
            interestTags: ['history', 'architecture', 'nature'],
            location: { name: 'Via Lemonia, Parco degli Acquedotti, Roma', lat: 41.8482, lng: 12.5612 },
            costOptions: {
              budget: { title: 'Free Aqueduct Park Stroll + Picnic', estimatedCost: 8, description: 'Metro Line A to Giulio Agricola + bakery picnic' },
              mid: { title: 'E-Bike Rental Along Via Appia Antica', estimatedCost: 28, description: '3-hour electric bike rental over ancient cobbles' },
              premium: { title: 'Guided Appian Way & Catacombs Bike Tour', estimatedCost: 58, description: 'Includes Catacombs entry & Roman countryside lunch' },
            },
            selectedTier: 'mid',
            priceConfidence: { status: 'estimated', notes: 'Park entry free; E-bike rental ~€28' },
            hoursConfidence: { status: 'verified', sourceUrl: 'https://www.parcoappiaantica.it/', verifiedAt: '2026-10-20' },
            whyThis: 'Suggested for Lucas & Elena — peaceful final day away from city traffic.',
            touristTrapScore: 14,
            votes: { elena: 'up', lucas: 'up' },
          },
        ],
        planB: [],
      },
    ],
    expenses: [
      {
        id: 'exp-rom-1',
        tripId: 'demo-rome-5d',
        ownerId: 'demo-user',
        authorId: 'demo-user',
        activityId: 'rom-a1',
        category: 'activities',
        description: 'Colosseum & Arena 2x Tickets',
        amount: 48,
        currency: 'EUR',
        paidBy: 'elena',
        splitMode: 'equal',
        splits: { elena: 24, lucas: 24 },
        date: '2026-11-24',
        settled: false,
      },
    ],
  },
};

// Enrich all DEMO_TRIPS days and activities with Sprint 4 accommodation, meals, intercity_transit, and distinct tier coordinates
const DEMO_LOGISTICS_BY_TRIP: Record<
  string,
  {
    cityByDay: string[];
    accommodations: { name: string; type: 'hotel' | 'hostel' | 'apartment'; price: number; lat: number; lng: number }[];
    mealsByDay: {
      breakfast: { name: string; cuisine: string; estimatedPrice: number; lat: number; lng: number };
      lunch: { name: string; cuisine: string; estimatedPrice: number; lat: number; lng: number };
      dinner: { name: string; cuisine: string; estimatedPrice: number; lat: number; lng: number };
    }[];
    transitByDayNumber?: Record<number, { method: string; duration: string; price: number; fromCity: string; toCity: string }>;
  }
> = {
  'demo-lisbon-4d': {
    cityByDay: ['Lisboa', 'Lisboa', 'Lisboa', 'Almada e Cacilhas'],
    accommodations: [
      { name: 'Hotel da Baixa & Azulejo Courtyard', type: 'hotel', price: 138, lat: 38.7118, lng: -9.1376 },
      { name: 'Solar do Castelo Heritage Stay', type: 'hotel', price: 145, lat: 38.7136, lng: -9.1338 },
      { name: 'Príncipe Real Garden Loft Apartments', type: 'apartment', price: 132, lat: 38.7161, lng: -9.1482 },
      { name: 'Cais do Ginjal Riverfront Boutique Stay', type: 'apartment', price: 118, lat: 38.6865, lng: -9.1538 },
    ],
    transitByDayNumber: {
      4: {
        method: 'Transtejo River Ferry & Rede Expressos Connection (Cais do Sodré → Cacilhas)',
        duration: '15m',
        price: 3,
        fromCity: 'Lisboa',
        toCity: 'Almada e Cacilhas',
      },
    },
    mealsByDay: [
      {
        breakfast: { name: 'Fábrica Coffee Roasters Baixa', cuisine: 'Specialty Coffee & Croissant', estimatedPrice: 9, lat: 38.7145, lng: -9.1408 },
        lunch: { name: 'Taberna da Rua das Flores', cuisine: 'Petiscos Portugueses', estimatedPrice: 24, lat: 38.7098, lng: -9.1432 },
        dinner: { name: 'Zé dos Cornos Beco dos Surradores', cuisine: 'Traditional Spareribs & Bacalhau', estimatedPrice: 28, lat: 38.7158, lng: -9.1361 },
      },
      {
        breakfast: { name: 'Antiga Confeitaria de Belém', cuisine: 'Pastéis de Belém & Bica', estimatedPrice: 8, lat: 38.6975, lng: -9.2032 },
        lunch: { name: 'Enoteca de Belém Wine & Tasca', cuisine: 'Regional Alentejo & Tapas', estimatedPrice: 26, lat: 38.6981, lng: -9.2044 },
        dinner: { name: 'Tapisco Príncipe Real', cuisine: 'Iberian Petiscos & Vermouth', estimatedPrice: 38, lat: 38.7156, lng: -9.1459 },
      },
      {
        breakfast: { name: 'Copenhagen Coffee Lab & Bakery', cuisine: 'Artisan Sourdough & Espresso', estimatedPrice: 10, lat: 38.7172, lng: -9.1496 },
        lunch: { name: 'Cantina Baldracca Mouraria', cuisine: 'Modern Neighbourhood Tasca', estimatedPrice: 21, lat: 38.7131, lng: -9.1319 },
        dinner: { name: 'Cervejaria Ramiro', cuisine: 'Lisbon Marisqueira & Shellfish', estimatedPrice: 44, lat: 38.7209, lng: -9.1355 },
      },
      {
        breakfast: { name: 'Manteigaria Time Out Chiado', cuisine: 'Warm Custard Tarts & Galão', estimatedPrice: 7, lat: 38.7107, lng: -9.1439 },
        lunch: { name: 'Restaurante Ponto Final Cacilhas', cuisine: 'Grilled Monkfish Rice by the Tagus', estimatedPrice: 32, lat: 38.6869, lng: -9.1526 },
        dinner: { name: 'Atira-te ao Rio', cuisine: 'Riverfront Contemporary Portuguese', estimatedPrice: 39, lat: 38.6867, lng: -9.1531 },
      },
    ],
  },
  'demo-porto-3d': {
    cityByDay: ['Porto', 'Porto', 'Vila Nova de Gaia & Porto'],
    accommodations: [
      { name: 'Torel Avantgarde Boutique Hotel Porto', type: 'hotel', price: 135, lat: 41.1449, lng: -8.6202 },
      { name: 'Casas do Porto Ribeira Apartments', type: 'apartment', price: 118, lat: 41.1411, lng: -8.6138 },
      { name: 'The Yeatman & Gaia Cellar Quarter Stay', type: 'hotel', price: 155, lat: 41.1342, lng: -8.6131 },
    ],
    transitByDayNumber: {
      3: {
        method: 'Alfa Pendular / Metro Dom Luís I Upper Deck Crossing',
        duration: '18m',
        price: 4,
        fromCity: 'Porto',
        toCity: 'Vila Nova de Gaia & Porto',
      },
    },
    mealsByDay: [
      {
        breakfast: { name: 'Confeitaria do Bolhão (Since 1896)', cuisine: 'Traditional Northern Bakery', estimatedPrice: 9, lat: 41.1489, lng: -8.6074 },
        lunch: { name: 'Brasão Aliados Cervejaria', cuisine: 'Francesinha & Craft Beer', estimatedPrice: 21, lat: 41.1482, lng: -8.6114 },
        dinner: { name: 'Cantinho do Avillez Porto', cuisine: 'Contemporary Douro Gastronomy', estimatedPrice: 38, lat: 41.1434, lng: -8.6147 },
      },
      {
        breakfast: { name: 'Combi Coffee Roasters Morgado de Mateus', cuisine: 'Specialty Pour-Over & Brioche', estimatedPrice: 10, lat: 41.1476, lng: -8.6012 },
        lunch: { name: 'O Gaveto Matosinhos', cuisine: 'Charcoal-Grilled Wild Sea Bass', estimatedPrice: 34, lat: 41.1818, lng: -8.6915 },
        dinner: { name: 'Adega São Nicolau Ribeira', cuisine: 'Polvo à Lagareiro & Douro Red', estimatedPrice: 31, lat: 41.1409, lng: -8.6139 },
      },
      {
        breakfast: { name: 'Majestic Café Historic Belle Époque Salon', cuisine: 'Rabanadas & Café de Saco', estimatedPrice: 14, lat: 41.1472, lng: -8.6066 },
        lunch: { name: 'Culto ao Bacalhau Mercado do Bolhão', cuisine: 'Traditional Salt Cod Specialties', estimatedPrice: 26, lat: 41.1494, lng: -8.6067 },
        dinner: { name: 'Vinum at Graham’s 1890 Lodge', cuisine: 'Douro Valley Grill & Vintage Port', estimatedPrice: 48, lat: 41.1369, lng: -8.6236 },
      },
    ],
  },
  'demo-rome-5d': {
    cityByDay: ['Roma', 'Roma', 'Roma', 'Roma', 'Roma'],
    accommodations: [
      { name: 'Hotel Palazzo Manfredi & Monti Suites', type: 'hotel', price: 165, lat: 41.8901, lng: 12.4956 },
      { name: 'Donna Camilla Savelli Trastevere Cloister Hotel', type: 'hotel', price: 158, lat: 41.8884, lng: 12.4669 },
      { name: 'Campo de’ Fiori Renaissance Apartment', type: 'apartment', price: 142, lat: 41.8956, lng: 12.4722 },
      { name: 'Prati Vatican Courtyard Boutique Hotel', type: 'hotel', price: 149, lat: 41.9068, lng: 12.4614 },
      { name: 'Aventine Rose Garden Villa Stay', type: 'hotel', price: 152, lat: 41.8829, lng: 12.4847 },
    ],
    mealsByDay: [
      {
        breakfast: { name: 'Sciascia Caffè 1919', cuisine: 'Chocolate-Rimmed Espresso & Cornetto', estimatedPrice: 8, lat: 41.9082, lng: 12.4648 },
        lunch: { name: 'Mordi e Vai Box 15 (Mercato di Testaccio)', cuisine: 'Roman Allesso & Supplì', estimatedPrice: 14, lat: 41.8768, lng: 12.4752 },
        dinner: { name: 'Armando al Pantheon', cuisine: 'Classic Amatriciana & Saltimbocca', estimatedPrice: 42, lat: 41.8989, lng: 12.4764 },
      },
      {
        breakfast: { name: 'Roscioli Caffè Pasticceria', cuisine: 'Maritozzo con la Panna & Cappuccino', estimatedPrice: 9, lat: 41.8938, lng: 12.4741 },
        lunch: { name: 'Da Enzo al 29 Trastevere', cuisine: 'Cacio e Pepe & Carciofi alla Giudia', estimatedPrice: 26, lat: 41.8879, lng: 12.4779 },
        dinner: { name: 'Taverna Trilussa Trastevere', cuisine: 'Roman Mimosa Ravioli & Castelli Wine', estimatedPrice: 44, lat: 41.8899, lng: 12.4704 },
      },
      {
        breakfast: { name: 'Sant’Eustachio Il Caffè', cuisine: 'Wood-Roasted Gran Caffè', estimatedPrice: 8, lat: 41.8981, lng: 12.4755 },
        lunch: { name: 'Nonna Betta Jewish Ghetto', cuisine: 'Kosher Roman Artichokes & Homemade Pasta', estimatedPrice: 28, lat: 41.8926, lng: 12.4781 },
        dinner: { name: 'Salumeria Roscioli Salone', cuisine: 'Artisanal Burrata, Carbonara & Wine Cellar', estimatedPrice: 49, lat: 41.8942, lng: 12.4745 },
      },
      {
        breakfast: { name: 'Pasticceria Regoli (Since 1916)', cuisine: 'Millefoglie alle Fragoline & Espresso', estimatedPrice: 9, lat: 41.8952, lng: 12.5021 },
        lunch: { name: 'Pizzarium Bonci Prati', cuisine: 'Artisanal Roman Pizza al Taglio', estimatedPrice: 18, lat: 41.9071, lng: 12.4462 },
        dinner: { name: 'Osteria dell’Ingegno Piazza di Pietra', cuisine: 'Seasonal Lazio Kitchen & Wine Bar', estimatedPrice: 39, lat: 41.9001, lng: 12.4792 },
      },
      {
        breakfast: { name: 'Tazza d’Oro Pantheon Roastery', cuisine: 'Granita di Caffè con Panna', estimatedPrice: 7, lat: 41.8992, lng: 12.4775 },
        lunch: { name: 'Hostaria Antica Roma (Via Appia Antica)', cuisine: 'Roman Countryside Garden Trattoria', estimatedPrice: 31, lat: 41.8524, lng: 12.5218 },
        dinner: { name: 'Flavio al Velavevodetto (Monte Testaccio)', cuisine: 'Rigatoni alla Carbonara in Amphora Cave', estimatedPrice: 38, lat: 41.8756, lng: 12.4761 },
      },
    ],
  },
};

for (const [tripKey, bundle] of Object.entries(DEMO_TRIPS)) {
  bundle.language = bundle.language || 'pt';
  bundle.trip.language = bundle.trip.language || 'pt';
  const logistics = DEMO_LOGISTICS_BY_TRIP[tripKey];
  bundle.days.forEach((day, dIdx) => {
    const acc = logistics?.accommodations?.[dIdx] || logistics?.accommodations?.[0];
    const meals = logistics?.mealsByDay?.[dIdx] || logistics?.mealsByDay?.[0];
    const transit = logistics?.transitByDayNumber?.[day.dayNumber];
    day.city = logistics?.cityByDay?.[dIdx] || bundle.trip.destination;

    if (acc && !day.accommodation) {
      const accVerified = dIdx % 2 === 0;
      day.accommodation = {
        name: acc.name,
        type: acc.type,
        price: acc.price,
        isPriceVerified: accVerified,
        coordinates: { lat: acc.lat, lng: acc.lng },
        tierOptions: {
          budget: {
            name: `${day.city} Central Social Hostel & Guesthouse`,
            type: 'hostel',
            price: Math.max(38, Math.round(acc.price * 0.42)),
            isPriceVerified: accVerified,
            coordinates: { lat: Number((acc.lat - 0.0042).toFixed(5)), lng: Number((acc.lng + 0.0038).toFixed(5)) },
          },
          mid: {
            name: acc.name,
            type: acc.type,
            price: acc.price,
            isPriceVerified: accVerified,
            coordinates: { lat: acc.lat, lng: acc.lng },
          },
          premium: {
            name: `Palazzo & Grand Heritage Hotel ${day.city}`,
            type: 'hotel',
            price: Math.round(acc.price * 1.95),
            isPriceVerified: false,
            coordinates: { lat: Number((acc.lat + 0.0049).toFixed(5)), lng: Number((acc.lng - 0.0045).toFixed(5)) },
          },
        },
      };
    }

    if (transit && !day.intercity_transit) {
      day.intercity_transit = {
        ...transit,
        isPriceVerified: true,
      };
    }

    if (meals && !day.meals) {
      day.meals = {
        breakfast: {
          name: meals.breakfast.name,
          cuisine: meals.breakfast.cuisine,
          estimatedPrice: meals.breakfast.estimatedPrice,
          isPriceVerified: true,
          coordinates: { lat: meals.breakfast.lat, lng: meals.breakfast.lng },
          tierVenues: {
            budget: {
              name: `${meals.breakfast.name} — Balcão`,
              estimatedPrice: Math.max(4, Math.round(meals.breakfast.estimatedPrice * 0.65)),
              isPriceVerified: true,
              coordinates: { lat: meals.breakfast.lat, lng: meals.breakfast.lng },
            },
            mid: {
              name: meals.breakfast.name,
              estimatedPrice: meals.breakfast.estimatedPrice,
              isPriceVerified: true,
              coordinates: { lat: meals.breakfast.lat, lng: meals.breakfast.lng },
            },
            premium: {
              name: `${meals.breakfast.name} — Degustação`,
              estimatedPrice: Math.round(meals.breakfast.estimatedPrice * 1.8),
              isPriceVerified: false,
              coordinates: { lat: meals.breakfast.lat, lng: meals.breakfast.lng },
            },
          },
        },
        lunch: {
          name: meals.lunch.name,
          cuisine: meals.lunch.cuisine,
          estimatedPrice: meals.lunch.estimatedPrice,
          isPriceVerified: false,
          coordinates: { lat: meals.lunch.lat, lng: meals.lunch.lng },
          tierVenues: {
            budget: {
              name: `${meals.lunch.name} — Menu do Dia`,
              estimatedPrice: Math.max(8, Math.round(meals.lunch.estimatedPrice * 0.6)),
              isPriceVerified: false,
              coordinates: { lat: meals.lunch.lat, lng: meals.lunch.lng },
            },
            mid: {
              name: meals.lunch.name,
              estimatedPrice: meals.lunch.estimatedPrice,
              isPriceVerified: false,
              coordinates: { lat: meals.lunch.lat, lng: meals.lunch.lng },
            },
            premium: {
              name: `${meals.lunch.name} — Reserva Especial`,
              estimatedPrice: Math.round(meals.lunch.estimatedPrice * 1.85),
              isPriceVerified: false,
              coordinates: { lat: meals.lunch.lat, lng: meals.lunch.lng },
            },
          },
        },
        dinner: {
          name: meals.dinner.name,
          cuisine: meals.dinner.cuisine,
          estimatedPrice: meals.dinner.estimatedPrice,
          isPriceVerified: false,
          coordinates: { lat: meals.dinner.lat, lng: meals.dinner.lng },
          tierVenues: {
            budget: {
              name: `${meals.dinner.name} — Petiscos`,
              estimatedPrice: Math.max(12, Math.round(meals.dinner.estimatedPrice * 0.6)),
              isPriceVerified: false,
              coordinates: { lat: meals.dinner.lat, lng: meals.dinner.lng },
            },
            mid: {
              name: meals.dinner.name,
              estimatedPrice: meals.dinner.estimatedPrice,
              isPriceVerified: false,
              coordinates: { lat: meals.dinner.lat, lng: meals.dinner.lng },
            },
            premium: {
              name: `${meals.dinner.name} — Menu de Autor`,
              estimatedPrice: Math.round(meals.dinner.estimatedPrice * 1.9),
              isPriceVerified: false,
              coordinates: { lat: meals.dinner.lat, lng: meals.dinner.lng },
            },
          },
        },
      };
    }

    const enrichActivities = (acts: typeof day.activities) => {
      acts.forEach((act, aIdx) => {
        const baseLat = act.location.lat;
        const baseLng = act.location.lng;
        const angle = ((dIdx + 1) * 1.7 + (aIdx + 1) * 1.25) % (Math.PI * 2);
        const verified = act.priceConfidence.status === 'verified';
        act.isPriceVerified = verified;

        if (act.costOptions.budget.isPriceVerified === undefined) {
          act.costOptions.budget.isPriceVerified = verified;
        }
        if (act.costOptions.mid.isPriceVerified === undefined) {
          act.costOptions.mid.isPriceVerified = verified;
        }
        if (act.costOptions.premium.isPriceVerified === undefined) {
          act.costOptions.premium.isPriceVerified = verified;
        }

        if (!act.costOptions.budget.coordinates) {
          act.costOptions.budget.venueName =
            act.costOptions.budget.venueName || `${act.costOptions.budget.title} — Local Quarter`;
          act.costOptions.budget.coordinates = {
            lat: Number((baseLat + Math.sin(angle + 1.1) * 0.0054).toFixed(5)),
            lng: Number((baseLng + Math.cos(angle + 1.1) * 0.0054).toFixed(5)),
          };
        }
        if (!act.costOptions.mid.coordinates) {
          act.costOptions.mid.venueName =
            act.costOptions.mid.venueName || `${act.location.name}`;
          act.costOptions.mid.coordinates = {
            lat: Number(baseLat.toFixed(5)),
            lng: Number(baseLng.toFixed(5)),
          };
        }
        if (!act.costOptions.premium.coordinates) {
          act.costOptions.premium.venueName =
            act.costOptions.premium.venueName || `${act.costOptions.premium.title} — Private Salon`;
          act.costOptions.premium.coordinates = {
            lat: Number((baseLat + Math.sin(angle - 1.35) * 0.0068).toFixed(5)),
            lng: Number((baseLng + Math.cos(angle - 1.35) * 0.0068).toFixed(5)),
          };
        }
      });
    };

    enrichActivities(day.activities);
    enrichActivities(day.planB);
  });
}

export interface MiniPreviewStop {
  time: string;
  title: string;
  whyThis: string;
  costEstimate: string;
  confidence: 'verified' | 'estimated';
  sourceNote: string;
  trapScore: number;
}

export function buildInstantMiniPreview(
  destinationRaw: string,
  lang: 'en' | 'pt' = 'en'
): {
  city: string;
  tagline: string;
  day1: MiniPreviewStop[];
  day2: MiniPreviewStop[];
} {
  const clean = destinationRaw.trim() || (lang === 'pt' ? 'Lisboa' : 'Lisbon');
  const lower = clean.toLowerCase();
  const isPt = lang === 'pt';

  if (lower.includes('lisbo')) {
    return {
      city: isPt ? 'Lisboa' : 'Lisbon',
      tagline: isPt
        ? 'Amostra Verificada de 2 Dias · Belém, Claustros de Azulejo e Miradouros'
        : '2-Day Verified Preview · Belém Limestone, Tile Cloisters & Miradouros',
      day1: [
        {
          time: '09:00',
          title: 'Mosteiro dos Jerónimos',
          whyThis: isPt
            ? 'Entrada matinal nos claustros manuelinos da UNESCO antes dos grupos turísticos'
            : 'Early entry to UNESCO Manueline arches before tour groups arrive',
          costEstimate: '18€',
          confidence: 'verified',
          sourceNote: isPt
            ? 'Museus e Monumentos de Portugal (Verificado Out 2026)'
            : 'Museus e Monumentos de Portugal (Checked Oct 2026)',
          trapScore: 48,
        },
        {
          time: '11:30',
          title: 'Pastéis de Belém',
          whyThis: isPt
            ? 'Receita original de 1837 servida morna nas salas de azulejo'
            : 'Original 1837 monastic recipe served in the tiled dining room',
          costEstimate: '8€',
          confidence: 'verified',
          sourceNote: isPt
            ? 'Menu oficial pasteisdebelem.pt (Verificado Out 2026)'
            : 'pasteisdebelem.pt official menu (Checked Oct 2026)',
          trapScore: 62,
        },
      ],
      day2: [
        {
          time: '10:30',
          title: 'Museu Nacional do Azulejo',
          whyThis: isPt
            ? 'Cinco séculos de azulejaria portuguesa num convento de 1509'
            : 'Five centuries of Portuguese ceramic art in a 1509 convent',
          costEstimate: '8€',
          confidence: 'verified',
          sourceNote: isPt
            ? 'museudoazulejo.gov.pt (Verificado Out 2026)'
            : 'museudoazulejo.gov.pt (Checked Oct 2026)',
          trapScore: 22,
        },
        {
          time: '13:15',
          title: 'Mercado de Campo de Ourique',
          whyThis: isPt
            ? 'Mercado de bairro autêntico como alternativa às zonas turísticas'
            : 'Local neighbourhood food hall alternative to crowded tourist hubs',
          costEstimate: '~16€',
          confidence: 'estimated',
          sourceNote: isPt
            ? 'Almoço estimado nas bancas de bairro'
            : 'Estimated neighbourhood counter lunch',
          trapScore: 18,
        },
      ],
    };
  }

  if (lower.includes('porto')) {
    return {
      city: 'Porto',
      tagline: isPt
        ? 'Amostra Verificada de 2 Dias · Azulejos, Arquitetura Siza e Caves do Douro'
        : '2-Day Verified Preview · Azulejos, Siza Architecture & Douro Cellars',
      day1: [
        {
          time: '09:30',
          title: 'Estação de São Bento',
          whyThis: isPt
            ? 'Átrio histórico com 20.000 azulejos e entrada gratuita'
            : 'Iconic 20,000-tile historic hall with free entry',
          costEstimate: '0€',
          confidence: 'verified',
          sourceNote: isPt
            ? 'Infraestruturas de Portugal (Verificado Out 2026)'
            : 'Infraestruturas de Portugal (Checked Oct 2026)',
          trapScore: 30,
        },
        {
          time: '16:00',
          title: 'Graham’s 1890 Port Lodge',
          whyThis: isPt
            ? 'Prova de Vinhos do Porto Tawny com vista sobre o Douro'
            : 'Aged Tawny flight overlooking the Douro riverfront',
          costEstimate: '~25€',
          confidence: 'verified',
          sourceNote: isPt
            ? 'grahams-port.com (Verificado Out 2026)'
            : 'grahams-port.com (Checked Oct 2026)',
          trapScore: 34,
        },
      ],
      day2: [
        {
          time: '10:00',
          title: 'Fundação de Serralves & Casa Art Déco',
          whyThis: isPt
            ? 'Arquitetura minimalista de Siza Vieira e percurso pelas copas'
            : 'Minimalist architecture & treetop park walk',
          costEstimate: '20€',
          confidence: 'verified',
          sourceNote: isPt
            ? 'serralves.pt (Verificado Out 2026)'
            : 'serralves.pt (Checked Oct 2026)',
          trapScore: 19,
        },
        {
          time: '13:30',
          title: 'Matosinhos — Peixe Grelhado no Carvão',
          whyThis: isPt
            ? 'Onde os locais comem robalo fresco acabado de chegar da lota'
            : 'Where locals eat fresh Atlantic sea bass by the port',
          costEstimate: '~32€',
          confidence: 'estimated',
          sourceNote: isPt ? 'Preço médio estimado ao peso' : 'Estimated market weight price',
          trapScore: 22,
        },
      ],
    };
  }

  if (lower.includes('rom') || lower.includes('ital')) {
    return {
      city: isPt ? 'Roma' : 'Rome',
      tagline: isPt
        ? 'Amostra Verificada de 2 Dias · Fórum Imperial, Bernini e Mercado de Testaccio'
        : '2-Day Verified Preview · Imperial Vaults, Bernini & Testaccio Stalls',
      day1: [
        {
          time: '09:00',
          title: isPt ? 'Coliseu e Fórum Romano' : 'Colosseum & Roman Forum',
          whyThis: isPt
            ? 'Entrada com horário marcado no coração da Roma Antiga'
            : 'Timed entry to the civic heart of Ancient Rome',
          costEstimate: '18€',
          confidence: 'verified',
          sourceNote: isPt
            ? 'Tarifa oficial colosseo.it (Verificado Out 2026)'
            : 'colosseo.it official rate (Checked Oct 2026)',
          trapScore: 78,
        },
        {
          time: '13:15',
          title: 'Mercato di Testaccio',
          whyThis: isPt
            ? 'Mercado gastronómico autêntico longe das praças turísticas'
            : 'Authentic neighbourhood food market away from tourist piazzas',
          costEstimate: '~16€',
          confidence: 'estimated',
          sourceNote: isPt ? 'Média estimada das bancas' : 'Estimated stall average',
          trapScore: 16,
        },
      ],
      day2: [
        {
          time: '10:00',
          title: 'Galleria Borghese (Bernini)',
          whyThis: isPt
            ? 'Visita limitada a 2 horas sem multidões no interior'
            : 'Capped 2-hour villa visit with zero crowding inside',
          costEstimate: '15€',
          confidence: 'verified',
          sourceNote: 'galleriaborghese.beniculturali.it',
          trapScore: 32,
        },
        {
          time: '17:30',
          title: 'Giardino degli Aranci (Aventino)',
          whyThis: isPt
            ? 'Vista panorâmica da cúpula emoldurada por pinheiros mansos'
            : 'Panoramic dome view framed by pine trees',
          costEstimate: '0€',
          confidence: 'verified',
          sourceNote: isPt ? 'Horário municipal do parque' : 'Municipal park hours',
          trapScore: 28,
        },
      ],
    };
  }

  return {
    city: clean,
    tagline: isPt
      ? `Amostra Verificada de 2 Dias para ${clean} · Mercados Locais e Cultura`
      : `2-Day Verified Atlas Preview for ${clean} · Local Markets & Cultural Anchors`,
    day1: [
      {
        time: '09:30',
        title: isPt ? `${clean} — Centro Histórico` : `${clean} — Historic Quarter`,
        whyThis: isPt
          ? `Passeio matinal antes da chegada das excursões em ${clean}`
          : `Morning light walk before tour groups arrive in ${clean}`,
        costEstimate: '~14€',
        confidence: 'estimated',
        sourceNote: isPt
          ? 'Estimativa IA (~) — fontes verificadas ao gerar roteiro completo'
          : 'AI Estimate (~) — verified links attached on full generation',
        trapScore: 42,
      },
      {
        time: '13:00',
        title: isPt ? `Mercado Municipal de ${clean}` : `Municipal Market of ${clean}`,
        whyThis: isPt
          ? 'Petiscos regionais autênticos e bancas de produtores locais'
          : 'Authentic regional tapas & seasonal produce stalls',
        costEstimate: '~18€',
        confidence: 'estimated',
        sourceNote: isPt ? 'Média estimada de almoço' : 'Estimated menu average',
        trapScore: 24,
      },
    ],
    day2: [
      {
        time: '10:30',
        title: isPt
          ? `Museu de Belas-Artes e Design (${clean})`
          : `Fine Arts & Design Museum (${clean})`,
        whyThis: isPt
          ? 'Destaque cultural com alternativa interior Plano B pronta'
          : 'Curated cultural highlight with indoor Plan B readiness',
        costEstimate: '~15€',
        confidence: 'estimated',
        sourceNote: isPt ? 'Escalão de entrada estimado' : 'Estimated entry tier',
        trapScore: 31,
      },
      {
        time: '18:00',
        title: isPt ? `Miradouro ao Pôr do Sol (${clean})` : `Sunset Viewpoint (${clean})`,
        whyThis: isPt
          ? 'Vista panorâmica ao final da tarde com vinho regional'
          : 'Golden-hour viewpoint paired with local small-batch wine',
        costEstimate: '~22€',
        confidence: 'estimated',
        sourceNote: isPt ? 'Despesa estimada ao final do dia' : 'Estimated evening spend',
        trapScore: 19,
      },
    ],
  };
}

export interface LocalizedDemoTripMeta {
  city: string;
  country: string;
  locationTitle: string;
  theme: string;
  openBtnLabel: string;
}

export function getLocalizedDemoTripMeta(
  bundle: FullTripBundle,
  t: (key: string, opts?: Record<string, any>) => string
): LocalizedDemoTripMeta {
  const tripId = bundle.trip.id;
  const fallbackCity = bundle.trip.destination;
  const fallbackCountry = bundle.trip.country || '';
  const fallbackTheme = bundle.days[0]?.theme || bundle.trip.destination;

  const city = t(`demoTrip.${tripId}.city`, { defaultValue: fallbackCity });
  const country = t(`demoTrip.${tripId}.country`, { defaultValue: fallbackCountry });
  const theme = t(`demoTrip.${tripId}.theme`, { defaultValue: fallbackTheme });
  const locationTitle = country ? `${city}, ${country}` : city;
  const openBtnLabel = t('hero.openDemoBtn', { city });

  return {
    city,
    country,
    locationTitle,
    theme,
    openBtnLabel,
  };
}

