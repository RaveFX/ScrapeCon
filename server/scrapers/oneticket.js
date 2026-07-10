// Using native fetch built-in in Node 18+

async function scrapeOneTicket() {
  try {
    const url = 'https://oneticket-live.onepayapi.lk/api/v3/oneticket/user/event/get/?page=1&limit=200&category_id=1';
    console.log('[OneTicket Scraper] Fetching from API...');
    
    const response = await fetch(url, {
      headers: {
        'accept': '*/*',
        'content-type': 'application/json',
        'origin': 'https://oneticket.lk',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    const docs = Array.isArray(json.data) ? json.data : [];

    console.log(`[OneTicket Scraper] Found ${docs.length} raw events.`);

    const cdnBase = 'https://storage.googleapis.com/oneticket';

    return docs.map(doc => {
      // Form full image URLs
      let bannerUrl = doc.event_banner || '';
      if (bannerUrl.startsWith('/')) {
        bannerUrl = `${cdnBase}${bannerUrl}`;
      }
      let posterUrl = doc.event_image || '';
      if (posterUrl.startsWith('/')) {
        posterUrl = `${cdnBase}${posterUrl}`;
      }

      // Format date and time
      // event_datetime: "2026-07-21 19:00:00"
      let startIso = null;
      let friendlyDate = '';
      if (doc.event_datetime) {
        // Replace space with T to parse correctly in some environments, or parse manually
        const parts = doc.event_datetime.split(' ');
        if (parts.length === 2) {
          startIso = `${parts[0]}T${parts[1]}.000Z`; // Assume Colombo time or UTC. Let's make it standard
          const dateObj = new Date(doc.event_datetime);
          if (!isNaN(dateObj.getTime())) {
            startIso = dateObj.toISOString();
            friendlyDate = dateObj.toLocaleDateString('en-US', {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Colombo'
            });
          }
        }
      }

      const ticketLink = `https://oneticket.lk/event/${doc.event_slug}`;

      // Determine status
      let status = 'active';
      if (doc.is_sold_out) {
        status = 'sold-out';
      } else if (doc.is_postponed) {
        status = 'active'; // or custom postponed
      }

      // Collect tags
      const tags = ['Concert'];
      if (doc.tag && doc.tag.name) {
        tags.push(doc.tag.name);
      }
      if (doc.is_indoor) {
        tags.push('Indoor');
      } else {
        tags.push('Outdoor');
      }

      const minPrice = parseFloat(doc.minimum_ticket_amount) || 0;

      // Construct description since API event_details is sometimes a code/hash
      let description = doc.event_name;
      if (doc.venue) {
        description += ` happening at ${doc.venue}.`;
      }
      if (friendlyDate) {
        description += ` Date & Time: ${friendlyDate}.`;
      }
      description += ` Tickets start from ${minPrice} ${doc.tickets_currency || 'LKR'}.`;

      return {
        id: `oneticket-${doc.id}`,
        source: 'OneTicket',
        name: doc.event_name || 'Untitled Concert',
        description: description,
        bannerUrl,
        posterUrl,
        venue: doc.venue || 'TBA',
        city: doc.venue || 'Colombo',
        dateTime: startIso || doc.event_datetime,
        originalDateStr: friendlyDate || doc.event_datetime,
        priceCurrency: doc.tickets_currency || 'LKR',
        minPrice,
        maxPrice: minPrice, // OneTicket API only gives minimum price directly
        ticketLink,
        status,
        tags: [...new Set(tags)]
      };
    });
  } catch (error) {
    console.error('[OneTicket Scraper] Error scraping:', error.message);
    return [];
  }
}

// Support running directly as a script for testing
if (require.main === module) {
  scrapeOneTicket().then(concerts => {
    console.log('Scraped result count:', concerts.length);
    if (concerts.length > 0) {
      console.log('Sample concert:', JSON.stringify(concerts[0], null, 2));
    }
  });
}

module.exports = scrapeOneTicket;
