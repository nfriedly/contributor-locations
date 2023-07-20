import { ContributorLocations } from "./contributor-locations.js"

const $ = document.querySelector.bind(document);

function plural(num, singular='', plural='s') {
  return num === 1 ? singular : plural;
}

function idify(str) {
  return str.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
}

const reGithubURL = /(https?:\/\/)?(www\.)?github\.com\/(?<owner>[^\/]+)\/(?<repo>[^\/]+)/i;
function parseUrl(url) {
  const match = url?.match(reGithubURL);
  return match?.groups || {};
}

$('form').onsubmit = async (e) => {
  e.preventDefault();

  const { owner,  repo } = parseUrl($('#repo_url').value);

  if (!owner || !repo) {
    return alert("Unable to parse GitHub repository URL");
  }
  const token = $('#token').value

  $('#results').style.display = '';

  $('#title').textContent = `${repo} contributor locations`;
  $('#summary').textContent = 'Loading contributors...';
  $('#locations').innerHTML = '';

  // todo: progress bar
  const cl = new ContributorLocations(owner, repo, token);

  cl.on('totalContributors', numContributors =>
    $('#summary').textContent = `${numContributors} contributor${plural(numContributors)}, loading location${plural(numContributors)}...`
  );

  const locations = $('#locations');

  cl.on('contributor-location', ({contributor, location}) => {
    let isNew = false;
    const id = `location_${idify(location)}`
    let li = $(`#${id}`);
    if (!li) {
      isNew = true;
      li = document.createElement('li');
      li.id = id;
      li.textContent = location;
      li.contributors = [];
      locations.appendChild(li);
    }
    li.contributors.push(contributor)
    li.title = li.contributors.join(', ');
    li.dataset.count = li.contributors.length;
  })

  function updateSummary(isRateLimited) {
    const numLocations = locations.childNodes.length;
    const {numWithLocation, numContributors, numBots, numNoLocation, numContributorsLoaded, rateLimitRemaining } = cl;
    $('#summary').textContent = `${numContributors} contributor${plural(numContributors)}. 
      ${isRateLimited ? `Rate limiting prevented loading data for all, but of the ${numContributorsLoaded} loaded, ` : ''}
      ${numWithLocation} ${plural(numWithLocation, 'is', 'are')} from ${numLocations} specified location${plural(numLocations)}, 
      ${numNoLocation} ${plural(numBots, 'has', 'have')} no location set, 
      and ${numBots} ${plural(numBots, 'is a bot', 'are bots')}.
      (${rateLimitRemaining} requests remaining.)`;
  }

  cl.on('ratelimited', () => updateSummary(true));

  cl.on('done', () => updateSummary(false));

  try {
    cl.go();
  } catch (er) {
    console.log(er);
    alert(er.message);
  }
}

$('#submit').disabled = false;
