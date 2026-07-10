const fs = require('fs');
const path = require('path');

const scrapeMyTickets = require('../server/scrapers/mytickets');
const scrapeOneTicket = require('../server/scrapers/oneticket');
const scrapeTicketsMinistry = require('../server/scrapers/ticketsministry');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'concerts.json');

async function runScraper() {
  console.log('[Scraper Task] Starting scraping process...');
  const startTime = Date.now();

  try {
    // Run all scrapers in parallel
    const [mytickets, oneticket, ticketsministry] = await Promise.all([
      scrapeMyTickets().catch(err => {
        console.error('[Scraper Task] MyTickets failed:', err.message);
        return [];
      }),
      scrapeOneTicket().catch(err => {
        console.error('[Scraper Task] OneTicket failed:', err.message);
        return [];
      }),
      scrapeTicketsMinistry().catch(err => {
        console.error('[Scraper Task] TicketsMinistry failed:', err.message);
        return [];
      })
    ]);

    // Coordinates lookup for major venues in Sri Lanka
    const venueCoords = {
      'BMICH': [6.9011, 79.8736],
      'BMICH - COLOMBO': [6.9011, 79.8736],
      'BMICH Outdoor': [6.9011, 79.8736],
      'BMICH Outdoor Garden': [6.9011, 79.8736],
      'Nelum Pokuna Indoor Theater': [6.9089, 79.8676],
      'Nelum Pokuna': [6.9089, 79.8676],
      'Musaeus College Auditorium': [6.9135, 79.8656],
      'Musaeus College': [6.9135, 79.8656],
      'Havelock Grounds': [6.8833, 79.8667],
      'Waters Edge Outdoor': [6.9055, 79.9114],
      'Waters Edge': [6.9055, 79.9114],
      'Waters Edge Parking Area': [6.9055, 79.9114],
      'Air Force Ground': [6.9197, 79.8519],
      'Anura Bandaranayeka Auditorium': [7.1593, 80.0242],
      'Bandaranayake Central College': [7.1524, 80.0534],
      'Maliyadeva Boys College Auditorium': [7.4818, 80.3609],
      'Rabindranath Tagore Auditorium': [5.9381, 80.5762],
      'University of Ruhuna,Matara': [5.9381, 80.5762],
      'Peradeniya': [7.2713, 80.5973]
    };

    function extractCoordsFromEmbedUrl(url) {
      if (!url) return null;
      const latMatch = url.match(/!3d(-?\d+\.\d+)/);
      const lngMatch = url.match(/!2d(-?\d+\.\d+)/);
      if (latMatch && lngMatch) {
        return [parseFloat(latMatch[1]), parseFloat(lngMatch[1])];
      }
      return null;
    }

    function resolveCoords(concert) {
      // 1. Try parsing from embedUrl (highly accurate)
      if (concert.embedUrl) {
        const coords = extractCoordsFromEmbedUrl(concert.embedUrl);
        if (coords) return coords;
      }

      // 2. Try using non-zero lat/lng provided in raw API
      if (concert.lat && concert.lng && concert.lat !== 0 && concert.lng !== 0) {
        return [concert.lat, concert.lng];
      }

      // 3. Fallback to venue lookup dictionary
      const cleanVenue = (concert.venue || '').trim();
      if (cleanVenue) {
        if (venueCoords[cleanVenue]) return venueCoords[cleanVenue];
        for (const [key, coords] of Object.entries(venueCoords)) {
          if (cleanVenue.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(cleanVenue.toLowerCase())) {
            return coords;
          }
        }
      }

      // 4. Default: Colombo center with jitter based on concert ID hash
      const baseLat = 6.9271;
      const baseLng = 79.8612;
      let hash = 0;
      const id = concert.id || '';
      for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
      }
      const jitterLat = ((hash & 0xFF) / 255 - 0.5) * 0.08;
      const jitterLng = (((hash >> 8) & 0xFF) / 255 - 0.5) * 0.08;

      return [baseLat + jitterLat, baseLng + jitterLng];
    }

    // Merge and de-duplicate by ID
    let merged = [...mytickets, ...oneticket, ...ticketsministry];
    const seen = new Set();
    const deDuplicated = merged.filter(concert => {
      if (seen.has(concert.id)) return false;
      seen.add(concert.id);
      return true;
    });

    // Populate resolved coordinates & delete temporary raw helper properties
    deDuplicated.forEach(concert => {
      const [latitude, longitude] = resolveCoords(concert);
      concert.latitude = latitude;
      concert.longitude = longitude;
      
      delete concert.embedUrl;
      delete concert.lat;
      delete concert.lng;
    });

    // Sort by Date ascending
    deDuplicated.sort((a, b) => {
      if (!a.dateTime) return 1;
      if (!b.dateTime) return -1;
      return new Date(a.dateTime) - new Date(b.dateTime);
    });

    const counts = {
      MyTickets: mytickets.length,
      OneTicket: oneticket.length,
      TicketsMinistry: ticketsministry.length,
      Total: deDuplicated.length
    };

    const outputData = {
      lastSyncTime: new Date().toISOString(),
      counts,
      concerts: deDuplicated
    };

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Write file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Scraper Task] Scraping completed successfully in ${duration}s!`);
    console.log(`[Scraper Task] Total concerts cached: ${counts.Total}`);
    console.log(`[Scraper Task] Saved to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('[Scraper Task] Critical error during scraping:', error.message);
    process.exit(1);
  }
}

runScraper();
