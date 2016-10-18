var express = require('express');
var _ = require('underscore')._;
var request = require('request');
var router = express.Router();
var fs = require('fs');
var glossary = JSON.parse(fs.readFileSync('glossary.json', 'utf-8'));
var drugCache = {};
var catCache = {};
var aliasCache = {};
var erowidCache = {};
var pwCache = {};
var pwEffects = {};
var combos = {};
var pCats = { 
  "dox": {
    "pname": "DOx",
    "wiki": "https://wiki.tripsit.me/wiki/DOx"
  },
  "nbomes": {
    "pname": "NBOMes",
    "wiki": "https://wiki.tripsit.me/wiki/NBOMes"
  },
  "2c-x": {
    "pname": "2C-x",
    "wiki": "https://wiki.tripsit.me/wiki/2C-X"
  },
  "2c-t-x": {
    "pname": "2C-T-x",
    "wiki": "https://wiki.tripsit.me/wiki/2C-X"
  },
  "5-meo-xxt": {
    "pname": "5-MeO-xxT",
    "wiki": "https://wiki.tripsit.me/wiki/5-MeO-DMT"
  },
  "amphetamines": {
    "pname": "Amphetamines",
    "wiki": "https://wiki.tripsit.me/wiki/Amphetamine"
  },
  "benzodiazepines": {
    "pname": "Benzodiazepines",
    "wiki": "https://wiki.tripsit.me/wiki/Benzodiazepines"
  },
  "maois": {
    "pname": "MAOIs",
    "wiki": "https://wiki.tripsit.me/wiki/Antidepressants#MAOIs"
  },
  "ssris": {
    "pname": "SSRIs",
    "wiki": "https://wiki.tripsit.me/wiki/Antidepressants#SSRIs"
  },
  "opioids": {
    "pname": "Opioids",
    "wiki": "https://wiki.tripsit.me/wiki/Opioids"
  },
  "ghb/gbl": {
    "pname": "GHB/GBL",
    "wiki": "https://wiki.tripsit.me/wiki/GHB"
  }
}; 
var wikiCache = {};

var updateCache = function() {
  try {
    // Get the drugs
    request.get('http://tripbot.tripsit.me/api/tripsit/getAllDrugs', {
      'json': true
    }, function(request, response, body) {
      try {
        drugCache = body.data[0]; // update the cache of drugs
     
        // Here we annotate the data with links to other drugs etc. There is likely a better way to do this.
        _.each(drugCache, function(drug) {
          if(drug.properties.summary && drug.properties.summary.match(/a href/)) return; // sorry jesus

          var matches = [];
          _.each(_.keys(drugCache), function(item) {
            var pattern = new RegExp('\\b' + item + '\\b', 'gi');
            if(_.has(drug.properties, 'summary')) {
              if(drug.properties.summary.match(pattern)) {
                matches.push(item);
              }
            }
          });

          // Remove duplicates
          var goodMatches = _.clone(matches);
          for(var i=0;i<matches.length;i++) {
            for(var y=i+1;y<matches.length;y++) {
              if(matches[i].match(matches[y]) || matches[y].match(matches[i])) {
                if(matches[i].length > matches[y].length) {
                  goodMatches = _.without(goodMatches, matches[y]);
                } else {
                  goodMatches = _.without(goodMatches, matches[i]);
                }
              }
            }
          }

          // Add drug links
          _.each(goodMatches, function(item) {
            var pattern = new RegExp('\\b' + item + '\\b', 'gi');
            drug.properties.summary = drug.properties.summary.replace(pattern, '<a href="/'+item+'">'+drugCache[item].pretty_name+'</a>');
          });

          // Add glossary links
          _.each(_.keys(glossary), function(item) {
            if(_.has(drug.properties, 'summary')) {
              drug.properties.summary = drug.properties.summary.replace(new RegExp('\\b('+item+')\\b', 'gi'), '[$1]');
            }
          });

          var terms = /\[([^\]]+)\]/gi;
          var item = terms.exec(drug.properties.summary);
          while(item != null) {
            drug.properties.summary = drug.properties.summary.replace(item[0], '<span class="glossary" data-toggle="tooltip" title="'+glossary[item[1].toLowerCase()]+'">'+item[1]+'</span>');
            item = terms.exec(drug.properties.summary);
          }
        });

        // update alias cache
        aliasCache = {};
        _.each(drugCache, function(d) {
          _.each(d.aliases, function(a) {
            aliasCache[a] = d.name; 
          }); 
        });
      } catch(err) {}
    });
    
    // Update category cache
    request.get('http://tripbot.tripsit.me/api/tripsit/getAllCategories', {
      'json': true
    }, function(request, response, body) {
      try {
        catCache = body.data[0];
      } catch(err) {}
    });
  } catch(err) {}
};

// Update cache from erowid
var updateErowidCache = function() {
  try {
    request.get('https://api.erowid.org/0.1/_index.json?depth=3', {
      'json': true
    }, function(request, response, body) {
      try {
        _.each(body, function(c) {
          _.each(c, function(a) {
            erowidCache[a.id] = a;
          });
        });
      } catch(err) {}
    });
  } catch(err) {}
}

// Update from our cache every minute, update from erowid's api every 60 minutes
setInterval(updateCache, 60000);
updateCache();
setInterval(updateErowidCache, 3600000);
updateErowidCache();

// Grab the combos (note: this is not auto updated)
request.get('http://tripsit.me/combo_beta.json', {
  'json': true
}, function(request, response, body) {
  combos = body;
});

/* GET home page. */
router.get('/', function(req, res) {
  var drugs = _.sortBy(drugCache, 'name');
    res.render('index', { title: 'TripSit Factsheets', 'drugs': drugs });
});

/* Get status page */
router.get('/status', function(req, res) {
    drugs = _.sortBy(drugCache, 'name');

    var brokenDose = _.filter(drugs, function(drug) { return !_.has(drug, 'formatted_dose'); });
    var brokenOnset = _.filter(drugs, function(drug) { return !_.has(drug, 'formatted_onset'); });
    var brokenDuration = _.filter(drugs, function(drug) { return !_.has(drug, 'formatted_duration'); });
    var brokenAfter = _.filter(drugs, function(drug) { return !_.has(drug, 'formatted_aftereffects'); });

    res.render('status', { title: 'TripSit Factsheets', 'brokenDose': brokenDose, 'brokenOnset': brokenOnset, 'brokenDuration': brokenDuration, 'brokenAfter': brokenAfter });
});

// common drugs withsout 
router.get('/cdwr', function(req, res) {
  var drugs = _.filter(drugCache, function(drug) { 
    return _.include(drug.categories, 'common') && (!_.has(drug, 'sources') || (_.has(drug, 'sources') && _.difference(['dose', 'duration', 'effects', '_general'], _.keys(drug.sources)).length > 0)); 
  });
  _.each(drugs, function(drug) {
    console.log(drug.sources);
    if(!drug.sources) {
      drug.sources = {};
    }
    drug.missingSources = _.difference(['dose', 'duration', 'effects', '_general'], _.keys(drug.sources));
    if(_.include(drug.missingSources, '_general')) {
      drug.missingSources.splice(drug.missingSources.indexOf('_general'), 1, 'general');
    }
  });

  res.render('cdwr', { title: 'TripSit Factsheets', 'drugs': drugs });
});

/* Category index */
router.get('/category/:name', function(req, res) {
  var drugs = _.filter(drugCache, function(drug) {
    return _.include(drug.categories, req.params.name.toLowerCase());
  });
  drugs = _.sortBy(drugs, 'name');

  res.render('category', { title: 'TripSit Factsheets', 'category': catCache[req.params.name.toLowerCase()], 'drugs': drugs });
});

router.get('/factsheet/:name', function(req, res) {
    res.redirect('/' + req.params.name);
});

/* Load a drug factsheet */
router.get('/:name', function(req, res) {
  if(!_.has(drugCache, req.params.name.toLowerCase())) {
    if(_.has(aliasCache, req.params.name)) {
      return res.redirect('/'+aliasCache[req.params.name]);
    } else {
      return res.status(404).render('error', {
          message: 'Drug not found.',
          'status': 404
      });
    }
  }
  var drug = _.clone(drugCache[req.params.name.toLowerCase()]);
  var order = _.union(['summary', 'categories', 'dose', 'onset', 'duration', 'pweffects', 'after-effects' ], _.keys(drug.properties));

  // TODO: This should be on the API side
  var safetyKey = null,
      safety = null;
  if(_.has(combos, drug.name)) {
    safetyKey = drug.name;
  } else if(drug.name.match(/^do.$/i)) {
    safetyKey = 'dox';
  } else if(drug.name.match(/^2c-.$/i)) {
    safetyKey = '2c-x';
  } else if(drug.name.match(/^5-meo-..t$/i)) {
    safetyKey = '5-meo-xxt';
  } else if(_.include(drug.categories, 'benzodiazepine')) {
    safetyKey = 'benzodiazepines';
  } else if(_.include(drug.categories, 'opioid')) {
    safetyKey = 'opioids';
  } else if(_.include(drug.categories, 'stimulant')) {
    safetyKey = 'amphetamines';
  }

  // TODO: Find out why combos is undefined when requesting a stimulant
  if (typeof combos == 'undefined') {
    combos = {};
    combos[safetyKey] = [];
  }

  if(safetyKey) {
    safety = {
      'dangerous': [],
      'caution': [],
      'unsafe': [],
      'lowinc': [],
      'ss': [],
      'lowno': [],
      'lowdec': []
    };

    _.each(combos[safetyKey], function(d,k) {
      k = {
        'pname': k,
        'name': k,
        'note': d.note
      };
      if(_.has(drugCache, k.name)) {
        k.pname = drugCache[k.name].pretty_name;
      }
      if(_.has(pCats, k.name)) {
        k.pname = pCats[k.name].pname;
        k.wiki = pCats[k.name].wiki;
      }

      if(d.status == 'Low Risk & Synergy') {
          safety.lowinc.push(k); 
      } else if(d.status == 'Low Risk & Decrease') {
          safety.lowdec.push(k);
      } else if(d.status == 'Low Risk & No Synergy') {
          safety.lowno.push(k);
      } else if(d.status == 'Dangerous') {
          safety.dangerous.push(k);
      } else if(d.status == 'Caution') {
          safety.caution.push(k);
      } else if(d.status == 'Unsafe') {
          safety.unsafe.push(k);
      } else if(d.status == 'Serotonin Syndrome') {
          safety.ss.push(k);
      }
    }); 
  }
  
  // urlify sources
  if(_.has(drug, 'sources')) {
    var newSources = {};
    _.each(drug.sources, function(refs, prop) {
      newSources[prop] = [];
      _.each(refs, function(ref) {
        newSources[prop].push(urlify(ref));
      });
    });
    drug.sources = newSources;
  }

  // This is a little bit grea-hea-heasy, but y'know. Another thing that can be fixed on the side of the ah api
  if((drug.formatted_duration || drug.formatted_onset || drug.formatted_aftereffects) &&
    (_.size(drug.formatted_duration) > 1 || _.size(drug.formatted_onset) > 1 || _.size(drug.formatted_aftereffects) > 1)) {
    var roas = [];
    _.each(['onset', 'duration', 'aftereffects'], function(a, c) {
      var s = drug['formatted_'+a];
      if(s) {
        roas = _.union(roas, _.without(_.keys(s), '_unit', 'value'));
      }
    });

    _.each(['onset', 'duration', 'aftereffects'], function(a, c) {
      var s = drug['formatted_'+a];
      _.each(roas, function(roa) {
        if(s && !_.has(s, roa)) {
          s[roa] = s.value;
        }
      });
    });
  }

  var getPWiki = function(name, callback) {
    if(_.has(pwCache, name)) {
      callback(pwCache[name]);
    } else {
      var wiki = null;
      request.get('http://psychonautwiki.org/w/api.php', {
        'qs': {
          'action': 'opensearch',
          'search': name,
          'limit': 1,
          'namespace': 0,
          'format': 'json'
        },
        'json': true
      }, function(err, resp, body) {
        if(!err && body && body[1].length !== 0) {
          wiki = 'https://psychonautwiki.org/wiki/'+body[1][0].replace(/\s/g, '_');
        }
        pwCache[name] = wiki;
        callback(wiki);
      });

    }
  };

  getPWEffects = function(drug, callback) {
    if(_.has(pwEffects, drug.name)) {
      drug.properties.pweffects = pwEffects[drug.name];
      callback(true);
    } else {
      var effects = null;
      request.get('https://psychonautwiki.org/w/api.php', {
        'qs': {
          'action': 'ask',
          'query': '[[-Effect::'+drug.pretty_name+']]',
          'format': 'json'
        },
        'json': true
      }, function(err, res, body) {
        if(!err) {
          var effects = {};
          _.each(body.query.results, function(effect, name) {
            effects[name] = effect.fullurl;
          });
          pwEffects[drug.name] = effects;
          drug.properties.pweffects = effects;
          return callback(true);
        }
      });
    }
  };

  var getWiki = function(name, callback) {
    if(_.has(wikiCache, name)) {
      callback(wikiCache[name]);
    } else {
      var wiki = null;
      request.get('http://wiki.tripsit.me/api.php', {
        'qs': {
          'action': 'opensearch',
          'search': name,
          'limit': 1,
          'namespace': 0,
          'format': 'json'
        },
        'json': true
      }, function(err, resp, body) {
        if(!err && body && body[1].length !== 0) {
          wiki = 'https://wiki.tripsit.me/wiki/'+body[1][0].replace(/\s/g, '_');
        }
        wikiCache[name] = wiki;
        callback(wiki);
      });
    }
  }

  var getErowid = function(name, callback) {
    name = name.replace(/\-/g,'');
    if(_.has(erowidCache, name)) {
      callback(erowidCache[name]);
    } else {
      callback(null);
    }
  };

  getWiki(drug.name, function(wiki) {
    getErowid(drug.name, function(erowid) {
      getPWiki(drug.name, function(pw) {
        getPWEffects(drug, function() {
        console.log(drug.properties);
          res.render('factsheet', { 
            'title': 'TripSit Factsheets - ' + drug.pretty_name, 
            'drug': drug, 
            'order': order, 
            'glossary': glossary, 
            'interactions': safety, 
            'wiki': wiki, 
            'categories': catCache, 
            'erowid': erowid,
            'pw': pw
          });
        });
      });
    });
  });
});

router.get('/raw/:name', function(req, res) {
  request.get('http://tripbot.tripsit.me/api/tripsit/getDrug?name=' + req.params.name, {
    'json': true
  }, function(request, response, body) {
      res.json(body.data[0]);
  });
});

module.exports = router;

function escapeRegExp(string){
  return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}

// from http://stackoverflow.com/questions/1500260/detect-urls-in-text-with-javascript
function urlify(text) {
  var urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, '<a href="$1">$1</a>')
}
