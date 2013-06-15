/*
 * Copyright (c) 2013, Circonus, Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 *       copyright notice, this list of conditions and the following
 *       disclaimer in the documentation and/or other materials provided
 *       with the distribution.
 *     * Neither the name Circonus, Inc. nor the names of its contributors
 *       may be used to endorse or promote products derived from this
 *       software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

var cmiUtil = require('../../cmiUtil');
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

    cmiUtil.mergeDeep(this, checkBundle);

    var newCheck = JSON.stringify(this);

    if(origCheck !== newCheck) return true;

    return false;
};

var removalRegExp = /^!\/.+\/(i)?/;

CheckBundle.prototype.export = function(){
    var data = JSON.parse(JSON.stringify(this));
    data.tags = removeRegExpFromArray(data.tags);
    data.metrics = removeRegExpFromArray(data.metrics);
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

    return cmiUtil.unionArray(orig, add);
}

module.exports = CheckBundle;
