const config = require('../config')
const path = require('path')
const axios = require('axios')
const cheerio = require('cheerio')
const log = require('simple-node-logger').createSimpleLogger( path.join( __dirname, '../', config.logFile ) );

const adRepository = require('../repositories/adRepositorie.js')
const Ad = require('./Ad.js')

let page = 1
let maxPrice = 0
let minPrice = 99999999
let sumPrices = 0
let validAds = 0
let adsFound = 0
let nextPage = 0

const scraper = async (url) => {

    page = 1
    maxPrice = 0
    minPrice = 99999999
    sumPrices = 0
    adsFound = 0
    validAds = 0
    nextPage = 0

    const parsedUrl = new URL(url)
    const searchTerm = parsedUrl.searchParams.get('q') || ''
    const searchId = hashCode(url);
    const notify = await termAlreadySearched(searchId)

    do {

        url = setUrlParam(url, 'o', page)

        try {

            const response  = await axios( url )
            const html      = response.data;
            const $         = cheerio.load(html)
            nextPage        = $('[data-lurker-detail="next_page"]').length

            await scrapePage($, searchTerm, searchId, notify)

        } catch (error) {
            log.error( 'Could not fetch the url ' + url)
        }

        page++

    } while (nextPage);
}

const scrapePage = async ($, searchTerm, searchId, notify) => {

    try {
        const script = $('script[id="initial-data"]').first().attr('data-json')
        const adList = JSON.parse(script).listingProps.adList
        adsFound += adList.length

        log.info( `Checking new ads for: ${searchTerm}` )
        log.info( 'Ads found: ' + adsFound )

        for( let i = 0; i < adList.length; i++ ){

            log.debug( 'Checking ad: ' + (i+1))
        
            const advert    = adList[i]
            const title     = advert.subject
            const id        = advert.listId
            const url       = advert.url
            const price     = parseInt( advert.price?.replace('R$ ', '')?.replace('.', '') || '0' )

            const result = {
                id,
                url,
                title,
                searchTerm,
                searchId,
                price,
                notify
            }
            
            const ad = new Ad( result )
            ad.process()

            if(ad.valid){
                validAds++
                minPrice = checkMinPrice(ad.price, minPrice)
                maxPrice = checkMaxPrice(ad.price, maxPrice)
                sumPrices += ad.price
            }
        }
        
        log.info( 'Valid ads: ' + validAds )

        if (validAds) {
            log.info( 'Maximum price: ' + maxPrice)
            log.info( 'Minimum price: ' + minPrice)
            log.info( 'Average price: ' + sumPrices / validAds)
        }
    } catch( error ) {
        log.error( error );
        throw new Error('Scraping failed');
    }

}

const termAlreadySearched = async (id) => {
    try {
        await adRepository.getAdsBySearchId(id, 1)
        return true
    } catch (error) {
        log.error( error )
        return false
    }
}

const setUrlParam = (url, param, value) => {
    const newUrl = new URL(url)
    let searchParams = newUrl.searchParams;
    searchParams.set(param, value);
    newUrl.search = searchParams.toString();
    return newUrl.toString();
}

const checkMinPrice = (price, minPrice) => {
    if(price < minPrice) return price
    else return minPrice
}

const checkMaxPrice = (price, maxPrice) => {
    if(price > maxPrice) return price
    else return maxPrice
}

const hashCode = function(s) {
    var h = 0, l = s.length, i = 0;
    if ( l > 0 )
      while (i < l)
        h = (h << 5) - h + s.charCodeAt(i++) | 0;
    return h;
};

module.exports = {
    scraper
}