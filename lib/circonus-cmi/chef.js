var async = require('async'),
    util = require('util'),
    events = require('events'),
    fs = require('fs'),
    net = require('net');

var list = function(options) {
  this.options = options;
  this.nodes = {};
  this.roles = {};
  this.api = new (require('chef-api'))();
  this.api.config(this.options);
};

util.inherits(list, events.EventEmitter);

function restructure_by_ip(b) {
  var ips = {}
  for(var name in b) {
    if(!b[name] || !b[name].automatic.network ||
       !b[name].automatic.network.interfaces)
      continue;
    var ifaces = b[name].automatic.network.interfaces;
    if(ifaces) {
      for(iface in ifaces) {
        var alist = ifaces[iface].addresses;
        for(ip in alist) {
          if(alist[ip].family != 'inet' && alist[ip].family != 'inet6')
            continue;
          if(/^(?:127\.0\.0\.\d+|::1?)$/.test(ip)) continue;
          ips[ip] = b[name];
        }
      }
    }
  }
  return ips;
}

list.prototype.find_nodes = function() {
  var self = this;
  this.api.getNodes(function(err, res){
    if(err) {
      self.emit('error', err);
      return;
    }
    for (name in res) {
      res[name] = (function (_n) {
        return function(cb) {
          self.api.getNode(_n, function(err, res) { cb(err,res); });
        }
      })(name);
    }
    async.parallelLimit(res, 8, function(err, body) {
      if(err) {
        self.emit('error', err);
        return;
      }
      else {
        if(self.options.environment) {
          for(var node in body)
            if(body[node].environment != self.options.environment)
              delete body[node];
        }
        self.emit('nodes', body, restructure_by_ip(body));
      }
    });
  });
}

module.exports = list;
