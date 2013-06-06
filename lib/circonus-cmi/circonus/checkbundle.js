var util = require('../../util');
var assert = require('assert');

function CheckBundle (data){
    data = data || {};
    this._checks = data._checks;
    this._cid = data._cid;
    this._created = data._created;
    this._last_modified = data._last_modified;
    this._last_modified_by = data._last_modified_by;
    this.brokers = data.brokers || [];
    this.config = data.config || {};
    this.display_name = data.display_name;
    this.metrics = data.metrics || [];
    this.notes = data.notes;
    this.period = data.period;
    this.status = data.status;
    this.tags = data.tags || [];
    this.target = data.target;
    this.timeout = data.timeout;
    this.type = data.type;
}

CheckBundle.prototype.updateTags = function(tags){
    var newTags = updateArray('tag',this.tags, tags);
    if(newTags) this.tags = newTags;
    return this.tags;
};

CheckBundle.prototype.updateMetrics = function(metrics){
    var newMetrics = updateArray('metric',this.metrics,metrics);
    var uniqueMetrics = [];
    if(newMetrics){
        var metricNames = {};
        for(var i = newMetrics.length - 1; i >= 0; i--){
            var metric = newMetrics[i];
            if(metricNames[metric.name]) continue;
            metricNames[metric.name] = true;
            uniqueMetrics.push(metric);
        }
    }
    return this.metrics = uniqueMetrics.reverse();
};

CheckBundle.prototype.merge = function(checkBundle){
    var origCheck = JSON.stringify(this);

    // Tags and metrics update separately due to the regex removals
    this.updateTags(checkBundle.tags);
    this.updateMetrics(checkBundle.metrics);
    checkBundle.tags = [];
    checkBundle.metrics = [];

    util.mergeDeep(this, checkBundle);

    var newCheck = JSON.stringify(this);

    if(origCheck !== newCheck) return true;

    return false;
};

var removalRegExp = /^!\/.+\/(i)?/;

CheckBundle.prototype.export = function(){
    var data = JSON.parse(JSON.stringify(this));
    data.tags = removeRegExpFromArray(data.tags);
    data.metrics = removeRegExpFromArray(data.metrics);
    console.log(data);
    return data;
}

function removeRegExpFromArray(arr){
    return arr.filter(function(element){
        return !removalRegExp.test(element);
    });
}

function updateArray(type, orig, updates){
    if(!(orig instanceof Array) || !(updates instanceof Array)) return;

    var add = [];
    // Process removals first, then union in the rest
    for(var i in updates){
        var value = updates[i];
        // Removals are regex prefixed with !
        if(removalRegExp.test(value)){
            var tmp = value.split('/');
            tmp.shift(); // Get rid of !
            var flag = tmp.pop(); // Pull off i flag if present
            var regexp = new RegExp(tmp.join('/'),flag);
            orig = orig.filter(function(element){
                var testElement = (type === 'metric') ? element.name : element;
                return !regexp.test(testElement);
            });
        } else {
            add.push(value);
        }
    }

    return util.unionArray(orig, add);
}

module.exports = CheckBundle;
