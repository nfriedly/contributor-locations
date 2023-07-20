import { Octokit } from "https://esm.sh/octokit";

export class ContributorLocations extends EventTarget {
    owner;
    repo;
    oktokit;
  
    locations = {};
  
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
        this.processUser(response.data);
      } catch(er) {
        console.error('error loading contributor data: ', er);
        this.numContributorsFailed++;
      }
    }
  
    processUser(user) {
      if (user.type === 'Bot' || user.login === 'greenkeeperio-bot') {
        this.numBots++;
      } else if (user.location) {
        this.numWithLocation++;
        const location = user.location;
        const users = this.locations[location] = locations[location] || [];
        users.push(user.login);
        // todo: add normalized country
        this.emit('contributor-location', {location, contributor: user.login});
      } else {
        this.numNoLocation++;
      }
    }
  }