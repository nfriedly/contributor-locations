import { ContributorLocations } from "./contributor-locations.js"
import { initSettings } from "./settings.js"

initSettings();

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

const progressOuter = $('#progress-outer');
const progressInner = $('#progress-inner');
function setProgress(percent) {
  progressOuter.setAttribute("aria-progressnow", percent);
  progressInner.style.width = `${percent}%`;
}
function resetProgress() {
  progressOuter.className = "progress";
  progressInner.className = 'progress-bar progress-bar-striped progress-bar-animated bg-info';
  setProgress(0);
}
function progressStalled() {
  progressInner.className = 'progress-bar progress-bar-striped bg-warning';
}
function progressComplete() {
  setProgress(100);
  progressOuter.className = "progress hidden";
  progressInner.className = 'progress-bar progress-bar-striped progress-bar-animated bg-success';
}

$('form').onsubmit = async (e) => {
  e.preventDefault();

  const { owner,  repo } = parseUrl($('#repo_url').value);

  if (!owner || !repo) {
    return alert("Unable to parse GitHub repository URL");
  }
  // todo: add an option to save the token to localStorage
  const token = $('#token').value

  $('#results').style.display = '';
  
  const locations = $('#locations');
  const countries = $('#countries');

  $('#title').textContent = `${repo} contributor locations`;
  $('#summary').textContent = 'Loading contributors...';
  locations.innerHTML = ''; // reset in case it was previously called
  countries.innerHTML = '';
  resetProgress();

  const cl = new ContributorLocations(owner, repo, token);

  cl.on('totalContributors', numContributors =>
    $('#summary').textContent = `${numContributors} contributor${plural(numContributors)}, loading location${plural(numContributors)}...`
  );

  function findOrCreateLi(parent, type, data) {
    const { contributor, location, country } = data;
    let isNew = false;
    const id = `${type}_${idify(data[type])}`
    let li = $(`#${id}`);
    if (!li) {
      isNew = true;
      li = document.createElement('li');
      li.id = id;
      const locName = document.createElement('span');
      locName.textContent = data[type]
      li.appendChild(locName);
      li.locName = locName;
      li.contributors = [];
      li.locations = [];
      if (country) {
        li.dataset.country = country;
      } else {
        li.dataset.unknownCountry = 'true';
      }
      parent.appendChild(li)
      const individuals = document.createElement('ul');
      individuals.className = 'individual-list'
      li.appendChild(individuals);
      li.individuals = individuals;
    }
    li.contributors.push(contributor)
    li.locations.push(location);
    li.locName.dataset.count = li.contributors.length;
    if (li.dataset.country !== country) {
      console.warn('country mismatch for location', {id, locations: li.locations, firstCountry: li.dataset.country, secondCountry: country});
    }
    const individual = document.createElement('li');
    const a = document.createElement('a');
    a.href = `https://github.com/${contributor}`
    a.textContent = contributor;
    individual.appendChild(a);
    li.individuals.appendChild(individual);
    return li;
  }

  cl.on('contributor-location', (data) => {
    const locationLi = findOrCreateLi(locations, 'location', data);
    locationLi.title = `${locationLi.dataset.country || 'Unrecognized location' } - ${locationLi.contributors.join(', ')}`;

    if (data.country) {
      const countryLi = findOrCreateLi(countries, 'country', data);
      // todo: group these by location
      countryLi.title = countryLi.locations.map((loc, i) => `${loc} (${countryLi.contributors[i]})`).join(', ');
    }
    setProgress(cl.percentComplete());
  })

  function updateSummary(isRateLimited) {
    const numLocations = locations.childNodes.length;
    const numCountries = countries.childNodes.length;
    const numUnmappableLocations = locations.querySelectorAll('#locations>li[data-unknown-country]').length;
    const {numWithLocation, numContributors, numBots, numNoLocation, numContributorsLoaded, rateLimitRemaining } = cl;
    // todo: make this a bulleted list
    $('#summary').textContent = `${numContributors} contributor${plural(numContributors)}. 
      ${isRateLimited ? `Rate limiting prevented loading data for all, but of the ${numContributorsLoaded} loaded, ` : ''}
      ${numWithLocation} ${plural(numWithLocation, 'is', 'are')} from ${numLocations} specified location${plural(numLocations)}
      which were mapped to ${numCountries} countrie${plural(numCountries)}
      (${numUnmappableLocations ? '⚠️ ': ''}${numUnmappableLocations} location${plural(numUnmappableLocations)} ${plural(numUnmappableLocations, 'was', 'were')} unable to be mapped to a country), 
      ${numNoLocation} ${plural(numBots, 'has', 'have')} no location set, 
      and ${numBots} ${plural(numBots, 'is a bot', 'are bots')}.
      (${rateLimitRemaining} requests remaining.)`;
    isRateLimited ? progressStalled() : progressComplete();
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
