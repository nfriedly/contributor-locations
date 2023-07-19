import { Octokit } from "https://esm.sh/octokit";

const $ = document.querySelector.bind(document);

const query = location.search.substr(1)
                .split('&')
                .map(s=>s.split('='))
                .reduce((acc,[key,value]) => {
                  acc[key]=decodeURIComponent(value); 
                  return acc
                }, {});
if (query.repo_url) {
  $('#repo_url').value = query.repo_url;
}
if (query.token) {
  $('#token').value = query.token;
}

$('form').onsubmit = async (e) => {
	e.preventDefault();

  const {owner, repo} = parseUrl($('#repo_url').value);
  if (!owner || !repo) {
  	return alert("Unable to parse GitHub repository URL");
  }
  const token = $('#token').value
  
  $('#title').textContent = `${repo} contributor locations`;
  $('#summary').textContent = 'Loading contributors...';
  $('#locations').innerHTML= '';
  
  // todo: progress bar
  
  try {
  	handleContributorLocations(await getContributorsByLocation(owner, repo, token, onProgress))
  } catch (er) {
  	alert(er)
		console.error(er); 
    //$('#error').textContent = er.message || er;
  }
}

function onProgress({
  	rateLimitRemaining,
    numContributors,
    isLimited,
    noLocationCount,
    numContributorsRequested, 
    numContributorsLoaded, 
    numContributorsFailed,
  }) {
  if (!numContributorsLoaded && !numContributorsFailed) {
  	// todo: pluralize
    $('#summary').textContent = `${numContributors} contributors, loading locations ${isLimited ? 'of top ' + rateLimitRemaining : ''}...`;
  }
  // todo: update progress bar
}

function handleContributorLocations({ 
    locations, 
  	rateLimitRemaining,
    numContributors,
    isLimited,
    noLocationCount,
    numBots,
    numContributorsRequested, 
    numContributorsLoaded, 
    numContributorsFailed,
  }) {
  // todo: pluralize
  $('#summary').textContent = `${(isLimited) ? 'The top ' : ''}${numContributorsRequested - noLocationCount - numBots} contributors (of ${numContributors}) are from ${Object.keys(locations).length} specified locations. ${numBots} are bots. ${noLocationCount} contributors have no location set.`;
    const locationsUl = $('#locations');
    for(const location of Object.keys(locations)) {
      const locationLi = document.createElement('li');
      locationLi.textContent = location;
      locationLi.title = locations[location].join(', ');
      locationsUl.appendChild(locationLi)
    }
}

const reGithubURL = /(https?:\/\/)?(www\.)?github\.com\/(?<owner>[^\/]+)\/(?<repo>[^\/]+)/i;
function parseUrl(url) {
	const match = url?.match(reGithubURL);
  return match?.groups || {};
}

function getContributorsByLocation(owner, repo, auth, onProgress) {

  const octokit = new Octokit({
    auth
  })
  
	// maybe should be a class so it doesn't have to return all these values
  let rateLimitRemaining;
  let numContributors;
  let isLimited;
  let noLocationCount = 0;
  let numContributorsRequested;
  let numContributorsLoaded = 0;
  let numContributorsFailed = 0;
  let numBots = 0;


  // https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#list-repository-contributors
  // todo: use pagination API to get all contributors from repos with > 100 contributors
  return octokit.request('GET /repos/{owner}/{repo}/contributors', {
    owner,
    repo,
    anon: 1,
    per_page: 100, // the rate limit is 60 requests per hour for unauthenticated users
    headers: {
      'X-GitHub-Api-Version': '2022-11-28'
    }
  }).then(response => {
    let contributors = response.data;
    numContributors = contributors.length;
    rateLimitRemaining = response.headers['x-ratelimit-remaining'];
    isLimited = rateLimitRemaining < numContributors;
    if (isLimited) {
      contributors = contributors.slice(0, rateLimitRemaining);
    }
    numContributorsRequested = contributors.length;
    onProgress({numContributors, isLimited, rateLimitRemaining, numContributorsRequested, numContributorsLoaded, numContributorsFailed})
    return Promise.allSettled(contributors
      .filter(contributor => {
        if (contributor.type == 'Anonymous') {
          noLocationCount++;
          numContributorsLoaded++;
          return false
        }
        return true;
      })
      .map(contributor => octokit.request(contributor.url)
        .then(c => {
          numContributorsLoaded++;
          return c;
        }).catch(er => {
          console.error('error loading contributor data: ', er);
          numContributorsFailed++;
        })
        .finally(() => onProgress({numContributors, isLimited, rateLimitRemaining, numContributorsRequested, numContributorsLoaded, numContributorsFailed})
      )));
  }).then(responses => {
    const locations = {};
    responses.filter(r => r.status === 'fulfilled')
    	.map(r=>r.value)
      .forEach(response => {
        const contributor = response.data;
   			if (contributor.type === 'Bot' || contributor.login === 'greenkeeperio-bot') {
        	numBots++;
        } else if (contributor.location) {
        	console.log('contributor', contributor)
          locations[contributor.location] = locations[contributor.location] || [];
          locations[contributor.location].push(contributor.login);
        } else {
          noLocationCount++;
        }
      });
    return {
      locations,
      rateLimitRemaining,
      numContributors,
      isLimited,
      noLocationCount,
      numBots,
      numContributorsRequested, 
      numContributorsLoaded, 
      numContributorsFailed,
    }
  })
}