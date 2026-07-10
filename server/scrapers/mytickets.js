// Using native fetch built-in in Node 18+

// Helper to slugify a string
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars (except -)
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

async function scrapeMyTickets() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const url = `https://api.mytickets.lk/event-svc/v1/events?page=1&limit=200&sort[repeatable.start_time]=1&filter[category]=Prime&filter[repeatable.end_time]=gte(${today})&filter[_filterActiveDealsOnly]=true&include=repeatable.location,repeatable.deals&filter[subcategory]=Concert`;

    console.log('[MyTickets Scraper] Fetching from API...');
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'origin': 'https://mytickets.lk',
        'x-correlation-id': '770ae55a-e380-494f-85c0-42f762caa012',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    const docs = (json.data && json.data.docs) ? json.data.docs : [];

    console.log(`[MyTickets Scraper] Found ${docs.length} raw events.`);

    return docs.map(doc => {
      const repeatable = doc.repeatable || {};
      const location = repeatable.location || {};
      
      // Calculate min and max price from seat categories
      let minPrice = 0;
      let maxPrice = 0;
      const seatCategories = repeatable.settings?.seats?.categories || [];
      if (seatCategories.length > 0) {
        const costs = seatCategories.map(cat => cat.cost).filter(c => typeof c === 'number');
        if (costs.length > 0) {
          minPrice = Math.min(...costs);
          maxPrice = Math.max(...costs);
        }
      }

      // Format date and time
      const startIso = repeatable.start_time || doc.created_at;
      let friendlyDate = '';
      if (startIso) {
        const dateObj = new Date(startIso);
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

      const slug = slugify(doc.name || '');
      const ticketLink = `https://mytickets.lk/event/${slug}/${doc._id}`;

      // Determine status
      let status = 'active';
      if (repeatable.sold_out) {
        status = 'sold-out';
      } else if (repeatable.status === 'cancelled') {
        status = 'cancelled';
      }

      // Collect tags
      const tags = ['Concert'];
      if (repeatable.deals && repeatable.deals.length > 0) {
        tags.push('Hot Deal');
      }
      if (doc.tags) {
        doc.tags.forEach(t => { if (t) tags.push(t); });
      }

      return {
        id: `mytickets-${doc._id}`,
        source: 'MyTickets',
        name: doc.name || 'Untitled Concert',
        description: doc.description || '',
        bannerUrl: doc.photo_urls?.default || '',
        posterUrl: doc.photo_urls?.default || '',
        venue: location.name || 'TBA',
        city: location.city || 'Colombo',
        dateTime: startIso,
        originalDateStr: friendlyDate,
        priceCurrency: doc.settings?.currency || 'LKR',
        minPrice,
        maxPrice,
        ticketLink,
        status,
        tags: [...new Set(tags)]
      };
    });
  } catch (error) {
    console.error('[MyTickets Scraper] Error scraping:', error.message);
    return [];
  }
}

// Support running directly as a script for testing
if (require.main === module) {
  scrapeMyTickets().then(concerts => {
    console.log('Scraped result count:', concerts.length);
    if (concerts.length > 0) {
      console.log('Sample concert:', JSON.stringify(concerts[0], null, 2));
    }
  });
}

module.exports = scrapeMyTickets;
