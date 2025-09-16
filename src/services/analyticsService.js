const { cloudflareAPI } = require('../cloudflareClient');
const { REFRESH_INTERVAL, SITE_URL } = require('../config');
const { log } = require('../logger');
const { checkSiteAvailability } = require('./availability');

// Simple in-memory cache
const analyticsCache = {
  data: null,
  lastUpdated: null,
  isUpdating: false,
};

async function fetchAnalyticsData() {
  if (analyticsCache.isUpdating) return analyticsCache.data;
  analyticsCache.isUpdating = true;

  try {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    log('INFO', 'Fetching analytics data from Cloudflare GraphQL API');

    const timeseriesQuery = {
      query: `
        query {
          viewer {
            zones(filter: {zoneTag: "${process.env.CLOUDFLARE_ZONE_ID}"}) {
              httpRequests1hGroups(
                limit: 24
                filter: { datetime_geq: "${since.toISOString()}", datetime_lt: "${now.toISOString()}" }
                orderBy: [datetime_ASC]
              ) {
                dimensions { datetime }
                sum {
                  requests
                  pageViews
                  bytes
                  threats
                  cachedRequests
                  cachedBytes
                  responseStatusMap { edgeResponseStatus requests }
                }
                uniq { uniques }
              }
            }
          }
        }
      `,
    };

    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const geoQuery = {
      query: `
        query {
          viewer {
            zones(filter: {zoneTag: "${process.env.CLOUDFLARE_ZONE_ID}"}) {
              httpRequests1hGroups(
                limit: 100
                filter: { datetime_geq: "${threeDaysAgo.toISOString()}", datetime_lt: "${now.toISOString()}" }
                orderBy: [datetime_ASC]
              ) {
                dimensions { datetime }
                sum { countryMap { clientCountryName requests bytes } }
              }
            }
          }
        }
      `,
    };

    const timeseriesResponse = await cloudflareAPI.post('/client/v4/graphql', timeseriesQuery);

    let geoResponse;
    try {
      geoResponse = await cloudflareAPI.post('/client/v4/graphql', geoQuery);
      log('DEBUG', `Geographic response: ${JSON.stringify(geoResponse.data, null, 2)}`);
    } catch (geoError) {
      log('WARN', `Geographic query failed: ${geoError.message}`);
      geoResponse = { data: { data: { viewer: { zones: [{ httpRequests1hGroups: [] }] } } } };
    }

    log('DEBUG', `Timeseries response: ${JSON.stringify(timeseriesResponse.data, null, 2)}`);

    const timeseriesData = timeseriesResponse.data.data?.viewer?.zones?.[0]?.httpRequests1hGroups || [];
    const geoData = geoResponse.data.data?.viewer?.zones?.[0]?.httpRequests1hGroups || [];

    const totals = timeseriesData.reduce(
      (acc, item) => {
        acc.requests += item.sum.requests || 0;
        acc.pageviews += item.sum.pageViews || 0;
        acc.bytes += item.sum.bytes || 0;
        acc.threats += item.sum.threats || 0;
        acc.uniques += item.uniq.uniques || 0;
        acc.cachedRequests += item.sum.cachedRequests || 0;
        acc.cachedBytes += item.sum.cachedBytes || 0;
        return acc;
      },
      { requests: 0, pageviews: 0, bytes: 0, threats: 0, uniques: 0, cachedRequests: 0, cachedBytes: 0 },
    );

    let timeseries = timeseriesData.map((item) => ({
      datetime: item.dimensions.datetime,
      requests: item.sum.requests || 0,
      pageviews: item.sum.pageViews || 0,
      bytes: item.sum.bytes || 0,
      threats: item.sum.threats || 0,
      uniques: item.uniq.uniques || 0,
      cachedRequests: item.sum.cachedRequests || 0,
      cachedBytes: item.sum.cachedBytes || 0,
      responseStatusMap: item.sum.responseStatusMap || [],
    }));

    const allPageviewsZero = timeseries.length > 0 && timeseries.every((pt) => (pt.pageviews || 0) === 0);
    if (allPageviewsZero) {
      timeseries = timeseries.map((pt) => ({ ...pt, pageviews: Math.round((pt.requests || 0) * 0.8) }));
      totals.pageviews = timeseries.reduce((sum, pt) => sum + (pt.pageviews || 0), 0);
    }

    const httpStatusAgg = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    timeseries.forEach((pt) => {
      (pt.responseStatusMap || []).forEach((m) => {
        const code = m.edgeResponseStatus || m.httpStatusCode;
        const r = m.requests || 0;
        if (code >= 200 && code < 300) httpStatusAgg['2xx'] += r;
        else if (code >= 300 && code < 400) httpStatusAgg['3xx'] += r;
        else if (code >= 400 && code < 500) httpStatusAgg['4xx'] += r;
        else if (code >= 500 && code < 600) httpStatusAgg['5xx'] += r;
      });
    });

    const countryTotals = {};
    geoData.forEach((item) => {
      if (item.sum.countryMap) {
        item.sum.countryMap.forEach((country) => {
          const countryName = country.clientCountryName;
          const requests = country.requests || 0;
          countryTotals[countryName] = (countryTotals[countryName] || 0) + requests;
        });
      }
    });

    const geographic = Object.entries(countryTotals)
      .map(([country, requests]) => ({ country, requests, pageviews: Math.round(requests * 0.8) }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    const httpStatus = httpStatusAgg;
    const cacheRatio = totals.requests > 0 ? totals.cachedRequests / totals.requests : 0;
    const estCachedPageviews = Math.round((totals.pageviews || 0) * cacheRatio);
    const estCachedUniques = Math.round((totals.uniques || 0) * cacheRatio);

    const siteStatus = await checkSiteAvailability(SITE_URL);

    const processedData = {
      timeseries,
      totals,
      geographic,
      httpStatus,
      cache: {
        cachedRequests: totals.cachedRequests,
        cachedBytes: totals.cachedBytes,
        cacheRatio,
        estCachedPageviews,
        estCachedUniques,
      },
      siteStatus,
      lastUpdated: now.toISOString(),
      refreshInterval: REFRESH_INTERVAL,
    };

    analyticsCache.data = processedData;
    analyticsCache.lastUpdated = now;

    log('INFO', `Analytics data updated successfully. Next update in ${REFRESH_INTERVAL} seconds`);
    return processedData;
  } catch (error) {
    log('ERROR', `Failed to fetch analytics data: ${error.message}`);
    if (error.response) {
      log('ERROR', `API Response: ${JSON.stringify(error.response.data)}`);
    }
    if (analyticsCache.data) {
      log('WARN', 'Returning cached analytics data due to API error');
      return analyticsCache.data;
    }
    return {
      timeseries: [],
      totals: { requests: 0, pageviews: 0, bytes: 0, threats: 0, uniques: 0 },
      geographic: [],
      httpStatus: [],
      lastUpdated: new Date().toISOString(),
      refreshInterval: REFRESH_INTERVAL,
      error: 'Failed to fetch data from Cloudflare GraphQL API',
    };
  } finally {
    analyticsCache.isUpdating = false;
  }
}

module.exports = {
  fetchAnalyticsData,
  analyticsCache,
};

