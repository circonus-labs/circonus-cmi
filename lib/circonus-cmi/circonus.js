var async = require('async'),
    util = require('util'),
    events = require('events'),
    fs = require('fs'),
    net = require('net'),
    dns = require('dns');

var list = function(options) {
	this.options = options;
	this.nodes = {};
  this.resolve_map = {};
	this.circonus = require('circonusapi2');
	this.circonus.setup(this.options['api-token'], 'cmi-tool',
	                    this.options['api-host']);
};

util.inherits(list, events.EventEmitter);

function non_ec2_tags(a) {
  if(!/:/.test(a)) return false;
	return !/^ec2-/.test(a);
}

list.prototype.find_nodes = function() {
  var self = this;
	this.circonus.get("/check_bundle", null, function(code, error, body) {
 		if (error) return self.emit('error', error);
		body.forEach(function(key) {
			if(!self.nodes[key.target]) self.nodes[key.target] = []
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
			}
		}), 4, function(err, data) {
			self.emit('nodes', self.nodes);
		});
	});
}

list.prototype.ec2_updates = function(o, alt_cb) {
	var ips = o.ips, instances = o.instances,
	    nodes = this.nodes, resolve_map = this.resolve_map;
  var self = this;

  var ip_count = 0;
  for(var k in o.ips)
    if(o.ips.hasOwnProperty(k)) ip_count++;
  var inst_count = 0;
  for(var k in o.instances)
    if(o.instances.hasOwnProperty(k)) inst_count++;
  var node_count = 0;
  for(var k in results.circonus.nodes)
    if(results.circonus.nodes.hasOwnProperty(k)) node_count++;
  console.log("Amazon EC2 Instances:", inst_count);
  console.log("Amazon EC2 w/ IPs:", ip_count);
  console.log("Circonus Nodes:", node_count);

  updates = { addTagsMap: [] };
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
						if(etags.filter(function(a) { return (a==tag); }).length == 0)
							newtags++;
					});
					if(newtags) {
						updates.addTagsMap[check_bundle["_cid"]] = {
						  _cid: check_bundle["_cid"],
						  tags: etags.filter(non_ec2_tags).concat(tags)
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
            return cb(null, payload["_cid"]);
          }
					self.circonus.put(payload["_cid"], payload,
					function(code, error, body) {
					  if(code == 200) cb(null, payload["_cid"]);
					  else cb(code, null);
					});
				}
			})(updates.addTagsMap[cid]));
		}
	}
  return updates;
}

module.exports = list;
