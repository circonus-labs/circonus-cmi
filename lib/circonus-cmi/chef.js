var async = require('async'),
    util = require('util'),
    events = require('events'),
    fs = require('fs'),
    net = require('net'),
    ChefNode = require('./chef/node');

var list = function(options) {
    this.options = options;
    this.nodes = {};
    this.api = new (require('chef-api'))();
    this.api.config(this.options);
};

util.inherits(list, events.EventEmitter);

function restructure_by_ip(nodes) {
    var nodesByIP = {};
    for(var name in nodes) {
        var node = nodes[name];
        var ips = node.ips;
        for(var i=0 , len = ips.length; i < len; i++){
            nodesByIP[ ips[i] ] = node;
        }
    }

    return nodesByIP;
}

list.prototype.find_nodes = function() {
    var self = this;
    this.api.getNodes(function(err, res){
        if(err) {
            self.emit('error', err);
            return;
        }
        for(var name in res) {
            res[name] = (function (_n) {
                return function(cb) {
                    self.api.getNode(_n, function(err, res) {
                        if(err) return cb(err,res);
                        if(res.name === 'test_node') console.log(res);
                        return cb(null, new ChefNode(res));
                    });
                };
            })(name);
        }
        async.parallelLimit(res, 8, function(err, nodes) {
            if(err) {
                self.emit('error', err);
                return;
            }
            else if(self.options.environment) {
                for(var node in nodes)
                    if(nodes[node].environment != self.options.environment)
                        delete nodes[node];
            }
            self.nodes = nodes;
            //console.log(nodes);
            self.emit('nodes', nodes, restructure_by_ip(nodes));
        });
    });
};

list.prototype.extractChecks = function(){
    var checks = {};
    var nodes = this.nodes;
    for(var nodeName in nodes){
        var node = JSON.parse(JSON.stringify(nodes[nodeName]));
        if(!node.circonusAttributes || !node.circonusAttributes.checks){
            continue;
        }
        var baseTags = node.circonusAttributes.tags || [];
        var defaultBrokers = node.circonusAttributes.default_brokers || []
        var checkDefs = node.circonusAttributes.checks;
        for(var checkName in checkDefs){
            var check = checkDefs[checkName];
            var id = node.name+'-'+checkName;
            if(!check.display_name) check.display_name= node.name+' '+checkName;
            check.tags = (check.tags || []).concat(
                baseTags,
                'cmi-id:'+node.name+'-'+checkName,
                'cmi-source:'+this.options.source
            );
            if(!check.brokers || !check.brokers.length){
                check.brokers = defaultBrokers;
            }
            checks[id] = check;
        }
    }

    return checks;
};

module.exports = list;
