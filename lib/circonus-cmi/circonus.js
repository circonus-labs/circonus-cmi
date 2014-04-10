/*
 * Copyright (c) 2014, Circonus, Inc.
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

var async = require('async'),
    util = require('util'),
    events = require('events'),
    fs = require('fs'),
    net = require('net'),
    dns = require('dns'),
    CheckBundle = require('./circonus/checkbundle');

var list = function(options, aws_options) {
    this.options = options;
    this.aws_options = aws_options;
    this.nodes = {};
    this.resolve_map = {};
    this.brokers = {};
    this.checks = {};
    this.check_bundles = {};
    this.counts = {};
    this.circonus = require('circonusapi2');
    this.circonus.setup(
        this.options['auth_token'],
        this.options['app_name'],
        this.options);
};

util.inherits(list, events.EventEmitter);

function non_aws_tags(a) {
    if(!/:/.test(a)) return false;
    return !/^(?:ec2|aws)-/.test(a);
}

list.prototype.get_counts = function() {
    var self = this;
    return self.counts;
}
list.prototype.create_check_params = function (target, region, namespace, metrics, tags) {
    var self = this;
    var metric_string = "";
    var toReturn = {
        "config": {
            "api_key": self.aws_options.accessKeyId,
            "api_secret": self.aws_options.secretAccessKey,
            "statistics": "Average",
            "version": "2010-08-01",
            "url":self.aws_options.regions[region],
            "granularity": self.aws_options.granularity,
            "namespace": namespace
        },
        "display_name": target,
        "metrics": [],
        "tags": tags,
        "timeout": 30,
        "type": "cloudwatch"
    };
    for (var i=0; i < metrics.length; i++) {
        toReturn.metrics.push( {
            "name": metrics[i].MetricName,
            "status": "active",
            "type": "numeric"
        });
        metric_string = metric_string + metrics[i].MetricName + ","
    }
    metric_string = metric_string.substring(0, metric_string.length - 1);
    toReturn.config.cloudwatch_metrics = metric_string;
    if (self.aws_options.granularity == "1") {
        toReturn.period = 60;
    }
    else {
        toReturn.period = 300;
    }
    toReturn.brokers = [];
    if (self.options.cloudwatch) {
        if (self.options.cloudwatch.brokers[region]) {
            if (self.brokers[self.options.cloudwatch.brokers[region]]) {
                toReturn.brokers.push(self.brokers[self.options.cloudwatch.brokers[region]].cid);
            }
            else {
                console.log("ERROR: Broker " + self.options.cloudwatch.brokers[region] + " does not exist");
            }
        }
        else if (self.options.cloudwatch.brokers.default) {
            if (self.brokers[self.options.cloudwatch.brokers.default]) {
                toReturn.brokers.push(self.brokers[self.options.cloudwatch.brokers.default].cid);
            }
            else {
                console.log("ERROR: Broker " + self.options.cloudwatch.brokers.default + " does not exist");
            }
        }
        else {
            console.log("ERROR: No broker specified");
        }
    }
    else {
        console.log("ERROR: No Cloudwatch section defined");
    }
    if (target) {
        toReturn.target = target;
    }
    return toReturn;
};
list.prototype.remove_missing_checks = function(namespace, region, to_call) {
    var self = this;
    for (var targ in self.check_bundles[namespace]) {
        for(var bundle in self.check_bundles[namespace][targ]) {
            if (!self.check_bundles[namespace][targ][bundle].exists) {
                var bund = self.check_bundles[namespace][targ][bundle];
                var metrics = bund.metrics;
                var tags = bund.tags;
                var to_post = self.create_check_params(null, region, namespace, metrics, tags);
                delete to_post.metrics;
                to_post.brokers = [];
                self.counts[namespace].to_remove++;
                to_call.push(
                    self.do_bundle("PUT", bundle, "remove", namespace, to_post)
                );
            }
        }
    }
};

list.prototype.get_brokers = function() {
    var self = this;
    self.circonus.get("/broker", null, function(code, error, body) {
        if (body) {
            body.forEach(function(key) {
                self.brokers[key._name] = {
                    cid: key._cid,
                    tags: key._tags
                };
            });
            self.emit('brokers', self.brokers);
            return;
        }
    });
    return;
};

list.prototype.get_checks = function() {
    var self = this;
    self.circonus.get("/check", null, function(code, error, body) {
        body.forEach(function(key) {
            self.checks[key._cid] = {};
            self.checks[key._cid].active = key._active;
            self.checks[key._cid].broker = key._broker;
            self.checks[key._cid].check_bundle = key._check_bundle;
            self.checks[key._cid].details = key._details;
        });
        self.emit('checks', self.checks);
    });
};

list.prototype.find_nodes = function() {
    var self = this;
    this.circonus.get("/check_bundle", null, function(code, error, body) {
        if (error) return self.emit('error', error);
        body.forEach(function(key) {
            key = new CheckBundle(key);
            var tags = key.tags;
            for (var i = 0; i < tags.length; i++) {
                var tag = tags[i].split(':');
                if ((tag[0] === 'aws-id') && (tag[1] === self.aws_options.id)) {
                    var ns = key.config.namespace;
                    if (!self.check_bundles[ns]) {
                        self.check_bundles[ns] = {};
                    }
                    if (!self.check_bundles[ns][key.target]) {
                        self.check_bundles[ns][key.target] = {};
                    }
                    self.check_bundles[ns][key.target][key._cid] = key;
                }
            }
            if(!self.nodes[key.target]) self.nodes[key.target] = [];
            self.nodes[key.target].push(key);
        });
        var nodekeys = [];
        for (var key in self.nodes) {
            if(self.nodes.hasOwnProperty(key) && !net.isIP(key))
                nodekeys.push(key);
        }
        async.parallelLimit(nodekeys.map(function(n) {
            return function(cb) {
                if(self.resolve_map[n]) return cb(null, true);
                dns.resolve(n, function(err,d) {
                    if(d) {
                        self.resolve_map[n] = d;
                        d.forEach(function (ip) {
                            if(!self.resolve_map[ip]) self.resolve_map[ip] = [];
                            self.resolve_map[ip].push(n);
                        });
                    }
                    cb(null, true);
                });
            };
        }), 4, function(err, data) {
            self.emit('nodes', self.nodes, self.check_bundles);
        });
    });
};

list.prototype.do_bundle = function(method, path, action, namespace, param_hash) {
    var self = this;
    return function(cb) {
        if (method === 'POST') {
            self.circonus.post(path, param_hash, function(code, error, body) {
                if (code != 200) {
                    console.log("POST ERROR: " + code + ", " + error);
                }
                else {
                    self.counts[namespace][action]++;
                }
                return cb(error, {code:code, body:body, action:action});
            });
        }
        else if (method === 'PUT') {
            self.circonus.put(path, param_hash, function(code, error, body) {
                if (code != 200) {
                    console.log("PUT ERROR: " + code + ", " + error);
                }
                else {
                    self.counts[namespace][action]++;
                }
                return cb(error, {code:code, body:body, action:action});
            });
        }
    };
};

list.prototype.ec2_updates_tagging = function(o, alt_cb) {
    var ips = o.ips, instances = o.instances,
        nodes = this.nodes, resolve_map = this.resolve_map;
    var self = this;

    var ip_count = 0;
    for(var k in o.ips)
        if(o.ips.hasOwnProperty(k)) ip_count++;
    var inst_count = 0;
    for(var i in o.instances)
        if(o.instances.hasOwnProperty(i)) inst_count++;
    var node_count = 0;
    for(var n in nodes)
        if(nodes.hasOwnProperty(n)) node_count++;
    console.log("Amazon EC2 Instances:", inst_count);
    console.log("Amazon EC2 w/ IPs:", ip_count);
    console.log("Circonus Nodes:", node_count);

    var updates = { addTagsMap: [] };
    for (var key in ips) {
        if(ips.hasOwnProperty(key)) {
            var tags = ips[key].tags;
            var nlist = [];
            if(nodes[key]) nlist.push(nodes[key]);
            if(resolve_map[key])
                resolve_map[key].forEach(function(ip) {
                    if(nodes[ip]) nlist.push(nodes[ip]);
                });
            nlist.forEach(function(node) {
                node.forEach(function (check_bundle) {
                    var etags = check_bundle.tags;
                    var newtags = 0;
                    tags.forEach(function(tag) {
                        var etagsm = etags.filter(function(a){
                            return (a===tag);
                        });
                        if(etagsm.length === 0)
                            newtags++;
                    });
                    if(newtags) {
                        updates.addTagsMap[check_bundle._cid] = {
                            _cid: check_bundle._cid,
                            tags: etags.filter(non_aws_tags).concat(tags)
                        };
                    }
                });
            });
        }
    }
    updates.addTags = [];
    for (var cid in updates.addTagsMap) {
        if(updates.addTagsMap.hasOwnProperty(cid)) {
            updates.addTags.push((function(payload) {
                return function(cb) {
                    if(typeof(alt_cb) === "function") {
                        alt_cb(payload);
                        return cb(null, payload._cid);
                    }
                    self.circonus.put(payload._cid, payload,
                    function(code, error, body) {
                        if(code == 200) cb(null, payload._cid);
                        else cb(code, null);
                    });
                };
            })(updates.addTagsMap[cid]));
        }
    }
    return updates;
};
list.prototype.do_update = function (params, cb) {
    var self = this;
    var o = params.o;
    var namespace = params.namespace;
    var short_namespace = params.short_namespace;
    var to_call = [];
    self.counts[namespace] = {
        "add": 0,
        "update": 0,
        "remove": 0,
        "to_add": 0,
        "to_update": 0,
        "to_remove": 0
    };
    for (var region in o.data) {
        for (var dimension in o.data[region][short_namespace]) {
            for (var dim in o.data[region][short_namespace][dimension]) {
                var target = dim + "." + dimension + "." + region + "." + short_namespace + "._aws";
                var bundles = self.check_bundles[namespace];
                var done = false;
                var to_post = self.create_check_params(target, region, namespace, o.data[region][short_namespace][dimension][dim].metrics, o.data[region][short_namespace][dimension][dim].tags);
                var dim_name = "dim_" + dimension;
                to_post.config[dim_name] = dim;
                if (bundles) {
                    var existing = bundles[target];
                    if (existing) {
                        for(var bundle in existing) {
                            existing[bundle].exists = true;
                            self.counts[namespace].to_update++;
                            to_call.push(
                                self.do_bundle("PUT", bundle, "update", namespace, to_post)
                            );
                            done = true;
                        }
                    }
                }
                /* If we didn't edit an existing check, create a new one */
                if (!done) {
                    self.counts[namespace].to_add++;
                    to_call.push(
                        self.do_bundle("POST", "/check_bundle", "add", namespace, to_post)
                    );
                }
            }
        }
    }
    self.remove_missing_checks(namespace, region, to_call);
    async.series(to_call, function(err, results, action) {
        if (err) {
            console.log("error: " + err);
        }
        cb(err);
    });
    return;
};

list.prototype.chef_updates = function(chefList){
    var self = this;
    var stats = {
        chefChecks: 0,
        circonusChecks: 0,
        toBeUpdated: 0,
        toBeAdded: 0
    };
    // Create a list of existing Circonus checks managed by chef
    // 1. Filter by cmi-source tag
    // 2. Key on cmi-id tag
    var source = chefList.options.source;
    var sourceTag = 'cmi-source:'+source;
    var circonusNodes = this.nodes;
    var existingChecks = {};
    for(var circonusNodeName in circonusNodes){
        var circonusNode = circonusNodes[circonusNodeName];
        for(var i = 0, nlen = circonusNode.length; i < nlen; i++){
            var checkBundle = circonusNode[i];
            var tags = checkBundle.tags;
            if(tags.indexOf(sourceTag) === -1) continue;
            for(var j = 0, tlen = tags.length; j < tlen; j++){
                var tag = tags[j].split(':');
                if(tag[0] === 'cmi-id'){
                    existingChecks[tag[1]] = checkBundle;
                    stats.circonusChecks++;
                    continue;
                }
            }
        }
    }

    // Create set of additions and updates
    var chefChecks = chefList.extractChecks();

    var updateChecks = [];
    for(var cmiID in chefChecks){
        stats.chefChecks++;
        var chefCheck = new CheckBundle(chefChecks[cmiID]);
        var existingCheck = existingChecks[cmiID];
        if(existingCheck){
            var updateNecessary = existingCheck.merge(chefCheck);
            if(!updateNecessary) continue;
            stats.toBeUpdated++;
            updateChecks.push((function(payload, cmiID) {
                return function(cb) {
                    self.circonus.put(payload._cid, payload,
                    function(code, error, body) {
                        var result = {
                            cid: payload._cid,
                            cmiID: cmiID,
                            code: code,
                            action: 'update'
                        };
                        cb(null, result);
                    });
                };
            })(existingCheck.export(), cmiID));
        } else {
            stats.toBeAdded++;
            updateChecks.push((function(payload,cmiID) {
                return function(cb) {
                    self.circonus.post('/check_bundle', payload,
                    function(code, error, body) {
                        var result = {
                            cid: payload._cid,
                            cmiID: cmiID,
                            code: code,
                            error: error,
                            action: 'create'
                        };
                        cb(null, result);
                    });
                };
            })(chefCheck.export(),cmiID));
        }
    }

    return {updates: updateChecks, stats: stats};
};

module.exports = list;
