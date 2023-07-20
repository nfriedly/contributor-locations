import { Octokit } from "https://esm.sh/octokit";

export class ContributorLocations extends EventTarget {
    owner;
    repo;
    oktokit;
  
    usersByLocation = {};
    countriesByLocation = {
      // somewhat unbelieveably, the gennames API doesn't recognize either of these
      'USA': 'United States',
      'United States': 'United States',
      // these get incorrect results
      'Cambridge, UK': 'United Kingdom', // United States !?
      '::1': undefined, // Iran
      'remote': undefined, // U.S. Outlying Islands
      'On the run': undefined, // Canada
      'Global': undefined, // UAE
      'nomad': undefined, // Papua New Guinea
    };
  
    numContributors = 0;
    numWithLocation = 0;
    numNoLocation = 0; // does not include bots
    numBots = 0;

    numContributorsRequested = 0;
    numContributorsLoaded = 0;
    numContributorsFailed = 0;
  
    rateLimitRemaining;
  
    constructor(owner, repo, auth) {
      super();
      this.owner = owner;
      this.repo = repo;
      this.octokit = new Octokit({
        auth
      })
    }
  
    on(event, listener) {
      return this.addEventListener(event, (e) => listener(e.detail));
    }
  
    emit(event, data) {
        console.log('event', event, data)
      return this.dispatchEvent(new CustomEvent(event, {detail: data}));
    }
  
    async go() {
      let contributors = await this.getContributors();
      this.numContributors = contributors.length
      this.emit('totalContributors', this.numContributors);
      contributors = this.filterAnon(contributors);
      await this.getLocations(contributors);
      this.emit('done');
    }
  
    // todo: look into the GraphQL API to see if we can get what we need in a smaller number of queries
    // https://docs.github.com/en/graphql
    async getContributors() {
      return this.octokit.paginate('GET /repos/{owner}/{repo}/contributors', {
        owner: this.owner,
        repo: this.repo,
        anon: 1,
        per_page: 100, // the rate limit is 60 requests per hour for unauthenticated users
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
    }
  
    filterAnon(contributors) {
      return contributors
        .filter(contributor => {
          if (contributor.type == 'Anonymous') {
            this.numNoLocation++;
            return false
          }
          return true;
        })
    }
  
    async getLocations(contributors) {
      for (let contributor of contributors) {
        if (this.rateLimitRemaining <= 0) {
          this.emit('ratelimited')
        }
        // todo: will octokit automatically wait for the limit to expire here?
        await this.getLocation(contributor)
      }
    }
  
    async getLocation(contributor) {
      this.numContributorsRequested++;
      try {
        const response = await this.octokit.request(contributor.url);
        this.numContributorsLoaded++;
        this.rateLimitRemaining = response.headers['x-ratelimit-remaining'];
        // todo: fetch the locations concurrently with the users
        await this.processUser(response.data);
      } catch(er) {
        console.error('error loading contributor data: ', er);
        this.numContributorsFailed++;
      }
    }
  
    async processUser(user) {
      if (user.type === 'Bot' || user.login === 'greenkeeperio-bot') {
        this.numBots++;
      } else if (user.location) {
        this.numWithLocation++;
        const location = user.location;
        const users = this.usersByLocation[location] = locations[location] || [];
        users.push(user.login);
        const country = await(this.getCountry(location));
        this.emit('contributor-location', {location, contributor: user.login, country});
      } else {
        this.numNoLocation++;
      }
    }

    async getCountry(loc) {
      // note: using hasOwnProperty check so that we don't repeatedly look up locations for which there is no match
      // (it will return true even if the value is set to undefined)
      if (!this.countriesByLocation.hasOwnProperty(loc)) {
        loc = loc.replace(/The Netherlands/i, 'Netherlands'); // for some reason, the "The" throws off the geonames API sometimes
        const url = `https://secure.geonames.org/search?q=${encodeURIComponent(loc)}&username=nfriedly&maxRows=1&type=json`; //&callback=handleGeoNames if they don't do CORS
        const response = await fetch(url);
        const results = await response.json();
        //console.log(loc, '=>', results);
        const country = results?.geonames?.[0]?.countryName;
        this.countriesByLocation[loc] = country;
        if (country && country !== loc) {
          // also save the exact country name, since that's an easy way to prevent one or more API lookups later
          this[country] = country;
        }
      }
      return this.countriesByLocation[loc];
    }
  }